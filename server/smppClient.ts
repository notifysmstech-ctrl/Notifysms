import crypto from 'crypto';
import net from 'net';
import tls from 'tls';

// SMPP v3.4 Command IDs
const CMD_BIND_TRANSMITTER = 0x00000002;
const CMD_BIND_TRANSMITTER_RESP = 0x80000002;
const CMD_BIND_TRANSCEIVER = 0x00000009;
const CMD_BIND_TRANSCEIVER_RESP = 0x80000009;
const CMD_SUBMIT_SM = 0x00000004;
const CMD_SUBMIT_SM_RESP = 0x80000004;
const CMD_UNBIND = 0x00000006;
const CMD_UNBIND_RESP = 0x80000006;
const CMD_ENQUIRE_LINK = 0x00000015;
const CMD_ENQUIRE_LINK_RESP = 0x80000015;
const CMD_GENERIC_NACK = 0x80000000;

export const SMPP_STATUS_CODES: Record<number, string> = {
  0x00000000: 'ESME_ROK (No Error)',
  0x00000001: 'ESME_RINVMSGLEN (Invalid Message Length)',
  0x00000002: 'ESME_RINVCMDLEN (Invalid Command Length)',
  0x00000003: 'ESME_RINVCMDID (Invalid Command ID)',
  0x00000004: 'ESME_RINVBNDSTS (Incorrect Bind Status)',
  0x00000005: 'ESME_RALYBND (ESME Already in Bound State)',
  0x0000000d: 'ESME_RBINDFAIL (Bind Failed)',
  0x0000000e: 'ESME_RINVPASWD (Invalid Password)',
  0x0000000f: 'ESME_RINVSYSID (Invalid System ID)',
  0x00000014: 'ESME_RMSGQFUL (Message Queue Full)',
  0x00000058: 'ESME_RTHROTTLED (Throttling Error)',
};

export interface SmppConnectionOptions {
  host: string;
  port: number;
  systemId: string;
  password: string;
  systemType?: string;
  bindMode?: 'transceiver' | 'transmitter';
  sourceTon?: number;
  sourceNpi?: number;
  destTon?: number;
  destNpi?: number;
  useTls?: boolean;
  timeoutMs?: number;
}

interface SmppPdu {
  commandLength: number;
  commandId: number;
  commandStatus: number;
  sequenceNumber: number;
  body: Buffer;
}

function encodeCString(value: string): Buffer {
  return Buffer.concat([Buffer.from(value, 'ascii'), Buffer.from([0x00])]);
}

function readCString(buf: Buffer, offset: number): { value: string; nextOffset: number } {
  let end = offset;
  while (end < buf.length && buf[end] !== 0x00) {
    end += 1;
  }
  const value = buf.subarray(offset, end).toString('ascii');
  return { value, nextOffset: Math.min(buf.length, end + 1) };
}

function buildPdu(
  commandId: number,
  commandStatus: number,
  sequenceNumber: number,
  body: Buffer
): Buffer {
  const totalLen = 16 + body.length;
  const header = Buffer.alloc(16);
  header.writeUInt32BE(totalLen, 0);
  header.writeUInt32BE(commandId >>> 0, 4);
  header.writeUInt32BE(commandStatus >>> 0, 8);
  header.writeUInt32BE(sequenceNumber >>> 0, 12);
  return Buffer.concat([header, body]);
}

function buildBindBody(opts: SmppConnectionOptions): Buffer {
  return Buffer.concat([
    encodeCString(opts.systemId || ''),
    encodeCString(opts.password || ''),
    encodeCString(opts.systemType || ''),
    Buffer.from([
      0x34, // interface_version 3.4
      opts.sourceTon ?? 0x00,
      opts.sourceNpi ?? 0x00,
    ]),
    encodeCString(''), // address_range
  ]);
}

function buildSubmitSmBody(
  opts: SmppConnectionOptions,
  sourceAddr: string,
  destAddr: string,
  message: string,
  isUcs2: boolean
): Buffer {
  const textBytes = isUcs2
    ? Buffer.from(message, 'utf16le').swap16() // UTF-16BE for UCS-2
    : Buffer.from(message, 'latin1');
  const dataCoding = isUcs2 ? 0x08 : 0x00;

  return Buffer.concat([
    encodeCString(''), // service_type
    Buffer.from([opts.sourceTon ?? 0x05, opts.sourceNpi ?? 0x00]),
    encodeCString(sourceAddr.slice(0, 20)),
    Buffer.from([opts.destTon ?? 0x01, opts.destNpi ?? 0x01]),
    encodeCString(destAddr.replace(/^\+/, '').slice(0, 20)),
    Buffer.from([
      0x00, // esm_class
      0x00, // protocol_id
      0x00, // priority_flag
    ]),
    encodeCString(''), // schedule_delivery_time
    encodeCString(''), // validity_period
    Buffer.from([
      0x01, // registered_delivery (request SMSC DLR)
      0x00, // replace_if_present_flag
      dataCoding,
      0x00, // sm_default_msg_id
      Math.min(254, textBytes.length),
    ]),
    textBytes.subarray(0, 254),
  ]);
}

class PduStreamReader {
  private buffer = Buffer.alloc(0);
  private waiters: Array<{
    resolve: (pdu: SmppPdu) => void;
    reject: (err: Error) => void;
  }> = [];

  public push(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const cmdLen = this.buffer.readUInt32BE(0);
      if (cmdLen < 16 || cmdLen > 65536) {
        const err = new Error(`Malformed SMPP PDU length: ${cmdLen}`);
        while (this.waiters.length) this.waiters.shift()?.reject(err);
        return;
      }
      if (this.buffer.length < cmdLen) break;

      const frame = this.buffer.subarray(0, cmdLen);
      this.buffer = this.buffer.subarray(cmdLen);

      const pdu: SmppPdu = {
        commandLength: cmdLen,
        commandId: frame.readUInt32BE(4),
        commandStatus: frame.readUInt32BE(8),
        sequenceNumber: frame.readUInt32BE(12),
        body: frame.subarray(16),
      };
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(pdu);
    }
  }

  public nextPdu(timeoutMs = 6000): Promise<SmppPdu> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === wrappedResolve);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new Error(`SMPP response timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const wrappedResolve = (pdu: SmppPdu) => {
        clearTimeout(timer);
        resolve(pdu);
      };
      const wrappedReject = (err: Error) => {
        clearTimeout(timer);
        reject(err);
      };
      this.waiters.push({ resolve: wrappedResolve, reject: wrappedReject });
    });
  }

  public failAll(err: Error): void {
    while (this.waiters.length) {
      this.waiters.shift()?.reject(err);
    }
  }
}

function openSmppSocket(opts: SmppConnectionOptions): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const timeout = opts.timeoutMs ?? 6000;
    const onErr = (err: Error) => reject(err);
    const socket: net.Socket = opts.useTls
      ? tls.connect({ host: opts.host, port: opts.port, rejectUnauthorized: false })
      : net.connect({ host: opts.host, port: opts.port });

    socket.setTimeout(timeout);
    socket.once('error', onErr);
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error(`TCP connection to ${opts.host}:${opts.port} timed out`));
    });
    socket.once(opts.useTls ? 'secureConnect' : 'connect', () => {
      socket.removeListener('error', onErr);
      resolve(socket);
    });
  });
}

export async function testSmppBind(opts: SmppConnectionOptions): Promise<{
  ok: boolean;
  latencyMs: number;
  remoteSystemId?: string;
  commandStatus: number;
  statusText: string;
  trace: string[];
}> {
  const start = Date.now();
  const trace: string[] = [];
  let socket: net.Socket | null = null;

  try {
    trace.push(`TCP ${opts.useTls ? 'TLS ' : ''}connecting to ${opts.host}:${opts.port}...`);
    socket = await openSmppSocket(opts);
    const reader = new PduStreamReader();
    socket.on('data', (chunk: Buffer) => reader.push(chunk));
    socket.on('error', (err: Error) => reader.failAll(err));

    const cmdId =
      opts.bindMode === 'transmitter' ? CMD_BIND_TRANSMITTER : CMD_BIND_TRANSCEIVER;
    const bindPdu = buildPdu(cmdId, 0, 1, buildBindBody(opts));
    trace.push(
      `-> ${opts.bindMode === 'transmitter' ? 'BIND_TRANSMITTER' : 'BIND_TRANSCEIVER'} (seq=1, system_id=${opts.systemId}, ver=3.4)`
    );
    socket.write(bindPdu);

    const bindResp = await reader.nextPdu(opts.timeoutMs ?? 6000);
    const statusText =
      SMPP_STATUS_CODES[bindResp.commandStatus] ||
      `0x${bindResp.commandStatus.toString(16).padStart(8, '0')}`;
    const remoteSystemId =
      bindResp.body.length > 0 ? readCString(bindResp.body, 0).value : undefined;
    trace.push(
      `<- BIND_RESP (status=${statusText}${remoteSystemId ? `, smsc=${remoteSystemId}` : ''})`
    );

    if (bindResp.commandStatus !== 0) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        remoteSystemId,
        commandStatus: bindResp.commandStatus,
        statusText,
        trace,
      };
    }

    // Send enquire_link to verify bidirectional PDU exchange
    socket.write(buildPdu(CMD_ENQUIRE_LINK, 0, 2, Buffer.alloc(0)));
    trace.push('-> ENQUIRE_LINK (seq=2)');
    const enqResp = await reader.nextPdu(opts.timeoutMs ?? 5000);
    trace.push(
      `<- ENQUIRE_LINK_RESP (cmd=0x${enqResp.commandId.toString(16)}, status=${SMPP_STATUS_CODES[enqResp.commandStatus] || enqResp.commandStatus})`
    );

    // Cleanly unbind
    socket.write(buildPdu(CMD_UNBIND, 0, 3, Buffer.alloc(0)));
    trace.push('-> UNBIND (seq=3)');
    await reader.nextPdu(2000).catch(() => null);
    trace.push('<- UNBIND_RESP');

    return {
      ok: true,
      latencyMs: Date.now() - start,
      remoteSystemId,
      commandStatus: 0,
      statusText,
      trace,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SMPP connection error';
    trace.push(`! Error: ${message}`);
    return {
      ok: false,
      latencyMs: Date.now() - start,
      commandStatus: -1,
      statusText: message,
      trace,
    };
  } finally {
    if (socket && !socket.destroyed) socket.destroy();
  }
}

export async function sendSmppSubmitSm(
  opts: SmppConnectionOptions,
  sourceAddr: string,
  destAddr: string,
  message: string,
  isUcs2: boolean
): Promise<{
  ok: boolean;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  latencyMs: number;
  trace: string[];
}> {
  const start = Date.now();
  const trace: string[] = [];
  let socket: net.Socket | null = null;

  try {
    socket = await openSmppSocket(opts);
    const reader = new PduStreamReader();
    socket.on('data', (chunk: Buffer) => reader.push(chunk));
    socket.on('error', (err: Error) => reader.failAll(err));

    const bindCmd =
      opts.bindMode === 'transmitter' ? CMD_BIND_TRANSMITTER : CMD_BIND_TRANSCEIVER;
    socket.write(buildPdu(bindCmd, 0, 1, buildBindBody(opts)));
    trace.push(`-> BIND (${opts.systemId}@${opts.host}:${opts.port})`);

    const bindResp = await reader.nextPdu(opts.timeoutMs ?? 6000);
    if (bindResp.commandStatus !== 0) {
      const errText =
        SMPP_STATUS_CODES[bindResp.commandStatus] ||
        `0x${bindResp.commandStatus.toString(16)}`;
      trace.push(`<- BIND_FAILED (${errText})`);
      return {
        ok: false,
        errorCode: `SMPP_${bindResp.commandStatus.toString(16)}`,
        errorMessage: `SMPP bind rejected: ${errText}`,
        latencyMs: Date.now() - start,
        trace,
      };
    }
    trace.push('<- BIND_RESP (ESME_ROK)');

    const submitBody = buildSubmitSmBody(opts, sourceAddr, destAddr, message, isUcs2);
    socket.write(buildPdu(CMD_SUBMIT_SM, 0, 2, submitBody));
    trace.push(
      `-> SUBMIT_SM (src=${sourceAddr}, dst=${destAddr}, coding=${isUcs2 ? 'UCS-2(0x08)' : 'GSM-7(0x00)'}, bytes=${submitBody.length})`
    );

    const submitResp = await reader.nextPdu(opts.timeoutMs ?? 6000);
    const statusText =
      SMPP_STATUS_CODES[submitResp.commandStatus] ||
      `0x${submitResp.commandStatus.toString(16)}`;

    if (submitResp.commandStatus !== 0) {
      trace.push(`<- SUBMIT_SM_RESP ERROR (${statusText})`);
      return {
        ok: false,
        errorCode: `SMPP_${submitResp.commandStatus.toString(16)}`,
        errorMessage: `SMSC rejected SUBMIT_SM: ${statusText}`,
        latencyMs: Date.now() - start,
        trace,
      };
    }

    const messageId =
      submitResp.body.length > 0 ? readCString(submitResp.body, 0).value : undefined;
    trace.push(`<- SUBMIT_SM_RESP (ESME_ROK, message_id=${messageId || 'n/a'})`);

    socket.write(buildPdu(CMD_UNBIND, 0, 3, Buffer.alloc(0)));
    await reader.nextPdu(1500).catch(() => null);

    return {
      ok: true,
      messageId: messageId || `smpp_${crypto.randomBytes(4).toString('hex')}`,
      latencyMs: Date.now() - start,
      trace,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'SMPP transport failure';
    trace.push(`! Transport Error: ${msg}`);
    return {
      ok: false,
      errorCode: 'SMPP_TRANSPORT',
      errorMessage: msg,
      latencyMs: Date.now() - start,
      trace,
    };
  } finally {
    if (socket && !socket.destroyed) socket.destroy();
  }
}

// Built-in Local SMPP v3.4 Test SMSC Server (127.0.0.1:2775)
// Allows full binary SMPP PDU testing without requiring an external carrier SMSC
let localSmppServer: net.Server | null = null;
export const LOCAL_SMPP_PORT = 2775;

export function ensureLocalSmppTestServer(): void {
  if (localSmppServer) return;

  localSmppServer = net.createServer((socket) => {
    const reader = new PduStreamReader();
    let isBound = false;

    socket.on('data', (chunk: Buffer) => {
      reader.push(chunk);
    });

    const handleNext = async () => {
      try {
        while (!socket.destroyed) {
          const pdu = await reader.nextPdu(60000);
          if (
            pdu.commandId === CMD_BIND_TRANSCEIVER ||
            pdu.commandId === CMD_BIND_TRANSMITTER
          ) {
            const sysId = readCString(pdu.body, 0);
            const pwd = readCString(pdu.body, sysId.nextOffset);
            const validCreds =
              sysId.value === 'relaysms_test' && pwd.value === 'relaysms_pass';
            const respId =
              pdu.commandId === CMD_BIND_TRANSMITTER
                ? CMD_BIND_TRANSMITTER_RESP
                : CMD_BIND_TRANSCEIVER_RESP;

            if (!validCreds) {
              socket.write(
                buildPdu(respId, 0x0000000d, pdu.sequenceNumber, Buffer.alloc(0))
              );
            } else {
              isBound = true;
              socket.write(
                buildPdu(
                  respId,
                  0x00000000,
                  pdu.sequenceNumber,
                  encodeCString('RelaySMS-Loopback-SMSC')
                )
              );
            }
          } else if (pdu.commandId === CMD_ENQUIRE_LINK) {
            socket.write(
              buildPdu(CMD_ENQUIRE_LINK_RESP, 0x00000000, pdu.sequenceNumber, Buffer.alloc(0))
            );
          } else if (pdu.commandId === CMD_SUBMIT_SM) {
            if (!isBound) {
              socket.write(
                buildPdu(CMD_SUBMIT_SM_RESP, 0x00000004, pdu.sequenceNumber, Buffer.alloc(0))
              );
              continue;
            }
            // Extract destination address to allow deterministic test failure on 0000
            const svc = readCString(pdu.body, 0);
            const srcAddr = readCString(pdu.body, svc.nextOffset + 2);
            const dstAddr = readCString(pdu.body, srcAddr.nextOffset + 2);
            if (dstAddr.value.endsWith('0000')) {
              socket.write(
                buildPdu(CMD_SUBMIT_SM_RESP, 0x00000014, pdu.sequenceNumber, Buffer.alloc(0))
              );
            } else {
              const msgId = `smsc_${crypto.randomBytes(5).toString('hex')}`;
              socket.write(
                buildPdu(CMD_SUBMIT_SM_RESP, 0x00000000, pdu.sequenceNumber, encodeCString(msgId))
              );
            }
          } else if (pdu.commandId === CMD_UNBIND) {
            socket.write(
              buildPdu(CMD_UNBIND_RESP, 0x00000000, pdu.sequenceNumber, Buffer.alloc(0))
            );
            socket.end();
            break;
          } else {
            socket.write(
              buildPdu(CMD_GENERIC_NACK, 0x00000003, pdu.sequenceNumber, Buffer.alloc(0))
            );
          }
        }
      } catch {
        if (!socket.destroyed) socket.destroy();
      }
    };

    void handleNext();
  });

  localSmppServer.on('error', () => {
    // Port may already be bound in dev reload; keep non-fatal
  });
  localSmppServer.listen(LOCAL_SMPP_PORT, '127.0.0.1');
}
