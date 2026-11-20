export interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
}

interface NavigatorSerialAPI {
  requestPort: () => Promise<SerialPortLike>;
  getPorts?: () => Promise<SerialPortLike[]>;
}

export interface GsmProbeResult {
  ok: boolean;
  model: string;
  signal: string;
  registration: string;
  rawTrace: string[];
  error?: string;
}

export interface GsmSmsResult {
  ok: boolean;
  referenceId?: string;
  latencyMs: number;
  rawTrace: string[];
  error?: string;
}

export function isWebSerialSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'serial' in navigator;
}

export async function requestGsmSerialPort(baudRate = 9600): Promise<SerialPortLike> {
  const nav = navigator as Navigator & { serial?: NavigatorSerialAPI };
  if (!nav.serial) {
    throw new Error(
      'Web Serial API is not supported in this browser. Open RelaySMS in Chrome or Microsoft Edge on desktop, or use Android Phone QR Pairing.'
    );
  }
  const port = await nav.serial.requestPort();
  await port.open({ baudRate });
  return port;
}

export async function sendAtCommand(
  port: SerialPortLike,
  command: string,
  expectedTokens: string[] = ['OK', 'ERROR'],
  timeoutMs = 5000
): Promise<string> {
  if (!port.writable || !port.readable) {
    throw new Error('Serial port stream is not open.');
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const writer = port.writable.getWriter();
  try {
    await writer.write(encoder.encode(command));
  } finally {
    writer.releaseLock();
  }

  const reader = port.readable.getReader();
  let buffer = '';
  const deadline = Date.now() + timeoutMs;

  try {
    while (Date.now() < deadline) {
      const remaining = Math.max(50, deadline - Date.now());
      const readPromise = reader.read();
      const timeoutPromise = new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), remaining)
      );

      const result = await Promise.race([readPromise, timeoutPromise]);
      if (result.value) {
        buffer += decoder.decode(result.value, { stream: true });
        if (expectedTokens.some((tok) => buffer.includes(tok))) {
          break;
        }
      }
      if (result.done) {
        break;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore cancel errors
    }
    reader.releaseLock();
  }

  return buffer.trim();
}

export async function probeGsmModem(port: SerialPortLike): Promise<GsmProbeResult> {
  const trace: string[] = [];
  try {
    const atResp = await sendAtCommand(port, 'AT\r', ['OK', 'ERROR'], 2500);
    trace.push(`> AT\n${atResp || '(no response)'}`);
    if (!atResp.includes('OK')) {
      return {
        ok: false,
        model: 'Unknown',
        signal: 'Unknown',
        registration: 'No AT OK',
        rawTrace: trace,
        error: 'Modem did not respond with OK to AT command. Check baud rate (9600 or 115200).',
      };
    }

    const modelResp = await sendAtCommand(port, 'AT+CGMM\r', ['OK', 'ERROR'], 2500);
    trace.push(`> AT+CGMM\n${modelResp}`);
    const modelLines = modelResp
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && s !== 'AT+CGMM' && s !== 'OK');
    const model = modelLines[0] || 'GSM/LTE USB Modem';

    const csqResp = await sendAtCommand(port, 'AT+CSQ\r', ['OK', 'ERROR'], 2500);
    trace.push(`> AT+CSQ\n${csqResp}`);
    const csqMatch = csqResp.match(/\+CSQ:\s*(\d+),(\d+)/);
    const signal = csqMatch
      ? csqMatch[1] === '99'
        ? 'No signal (99)'
        : `RSSI ${csqMatch[1]}/31`
      : 'Checked';

    const cregResp = await sendAtCommand(port, 'AT+CREG?\r', ['OK', 'ERROR'], 2500);
    trace.push(`> AT+CREG?\n${cregResp}`);
    let registration = 'Checking network';
    if (/\+CREG:\s*\d,1/.test(cregResp)) registration = 'Registered (Home)';
    else if (/\+CREG:\s*\d,5/.test(cregResp)) registration = 'Registered (Roaming)';
    else if (/\+CREG:\s*\d,2/.test(cregResp)) registration = 'Searching carrier';

    return {
      ok: true,
      model,
      signal,
      registration,
      rawTrace: trace,
    };
  } catch (err) {
    return {
      ok: false,
      model: 'Unknown',
      signal: 'Unknown',
      registration: 'Error',
      rawTrace: trace,
      error: err instanceof Error ? err.message : 'Failed to probe serial modem.',
    };
  }
}

export async function sendSmsViaGsmModem(
  port: SerialPortLike,
  phone: string,
  body: string
): Promise<GsmSmsResult> {
  const start = Date.now();
  const trace: string[] = [];

  try {
    const modeResp = await sendAtCommand(port, 'AT+CMGF=1\r', ['OK', 'ERROR'], 3000);
    trace.push(`> AT+CMGF=1\n${modeResp}`);
    if (!modeResp.includes('OK')) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        rawTrace: trace,
        error: 'Modem failed to enter SMS text mode (AT+CMGF=1).',
      };
    }

    const promptResp = await sendAtCommand(
      port,
      `AT+CMGS="${phone}"\r`,
      ['>', 'ERROR', '+CMS ERROR'],
      5000
    );
    trace.push(`> AT+CMGS="${phone}"\n${promptResp}`);
    if (!promptResp.includes('>')) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        rawTrace: trace,
        error: 'Modem did not return ">" SMS prompt. Verify SIM PIN & carrier signal.',
      };
    }

    const finalResp = await sendAtCommand(
      port,
      `${body}\x1A`,
      ['+CMGS:', 'OK', 'ERROR', '+CMS ERROR'],
      15000
    );
    trace.push(`> <message body + Ctrl-Z>\n${finalResp}`);

    const cmgsMatch = finalResp.match(/\+CMGS:\s*(\d+)/);
    const ok = finalResp.includes('+CMGS:') || (finalResp.includes('OK') && !finalResp.includes('ERROR'));

    return {
      ok,
      referenceId: cmgsMatch ? `cmgs_${cmgsMatch[1]}` : undefined,
      latencyMs: Date.now() - start,
      rawTrace: trace,
      error: ok ? undefined : finalResp || 'Modem reported SMS transmission failure.',
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      rawTrace: trace,
      error: err instanceof Error ? err.message : 'USB serial SMS send failed.',
    };
  }
}
