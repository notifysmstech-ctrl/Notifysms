import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Plug,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  Signal,
  Smartphone,
  Trash2,
  Usb,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import type { Account, MessageLog, SmsDevice } from '../types/sms';
import {
  isWebSerialSupported,
  probeGsmModem,
  requestGsmSerialPort,
  sendSmsViaGsmModem,
  type GsmProbeResult,
  type SerialPortLike,
} from '../utils/gsmSerial';
import { detectCountryFromPhone } from '../utils/countryNetworks';
import { DeliveryStatusText } from './StatusText';

interface RealDeviceViewProps {
  devices: SmsDevice[];
  messages: MessageLog[];
  accounts: Account[];
  activeAccountId: string;
  onRefresh: () => Promise<void>;
  onOpenReports: (campaignId?: string) => void;
}

export const RealDeviceView: React.FC<RealDeviceViewProps> = ({
  devices,
  messages,
  accounts,
  activeAccountId,
  onRefresh,
  onOpenReports,
}) => {
  // Phone pairing state
  const [deviceName, setDeviceName] = useState('Android Test Phone');
  const [simPhone, setSimPhone] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [creating, setCreating] = useState(false);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Send real test SMS via paired phone device
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(devices[0]?.id || '');
  const [testRecipient, setTestRecipient] = useState('+15550104101');
  const [testMessage, setTestMessage] = useState(
    'Hello from RelaySMS! This is a real physical device SMS test.'
  );
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);

  // Web Serial USB GSM Modem state
  const serialSupported = isWebSerialSupported();
  const [baudRate, setBaudRate] = useState(9600);
  const [serialPort, setSerialPort] = useState<SerialPortLike | null>(null);
  const [usbBusy, setUsbBusy] = useState(false);
  const [usbProbe, setUsbProbe] = useState<GsmProbeResult | null>(null);
  const [usbError, setUsbError] = useState<string | null>(null);
  const [usbPhone, setUsbPhone] = useState('+15550104101');
  const [usbText, setUsbText] = useState('RelaySMS USB GSM hardware test message.');
  const [usbSendResult, setUsbSendResult] = useState<{
    ok: boolean;
    message: string;
    trace?: string[];
  } | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    if (!selectedDeviceId && devices[0]?.id) {
      setSelectedDeviceId(devices[0].id);
    }
  }, [devices, selectedDeviceId]);

  useEffect(() => {
    let active = true;
    const buildQrs = async () => {
      const next: Record<string, string> = {};
      for (const dev of devices) {
        const url = `${origin}/?devicePair=${encodeURIComponent(dev.pairingCode)}`;
        try {
          next[dev.id] = await QRCode.toDataURL(url, { width: 176, margin: 1 });
        } catch {
          // ignore QR errors
        }
      }
      if (active) setQrMap(next);
    };
    if (devices.length > 0) void buildQrs();
    return () => {
      active = false;
    };
  }, [devices, origin]);

  const handleAttachPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setQueueError(null);
    try {
      const resp = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: deviceName,
          kind: 'android_bridge',
          phoneNumber: simPhone,
          carrierName,
        }),
      });
      const data = (await resp.json()) as { device?: SmsDevice; error?: string };
      if (!resp.ok || !data.device) {
        throw new Error(data.error || 'Could not attach device.');
      }
      setSelectedDeviceId(data.device.id);
      setSimPhone('');
      setCarrierName('');
      await onRefresh();
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Could not attach device.');
    } finally {
      setCreating(false);
    }
  };

  const handleRemoveDevice = async (id: string) => {
    await fetch(`/api/devices/${id}`, { method: 'DELETE' });
    await onRefresh();
  };

  const handleQueueDeviceTest = async (e: React.FormEvent) => {
    e.preventDefault();
    const dev = devices.find((d) => d.id === selectedDeviceId) || devices[0];
    if (!dev) {
      setQueueError('Attach a phone or GSM device first.');
      return;
    }
    setQueueBusy(true);
    setQueueError(null);
    setQueueNotice(null);
    try {
      const resp = await fetch('/api/testing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gatewayId: dev.gatewayId,
          accountId: activeAccountId || accounts[0]?.id,
          phones: [testRecipient],
          message: testMessage,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to queue test SMS.');
      setQueueNotice(
        `Test SMS queued for "${dev.name}". Check your paired phone bridge screen to send it through your real SIM card.`
      );
      await onRefresh();
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Failed to queue SMS.');
    } finally {
      setQueueBusy(false);
    }
  };

  const handleConnectUsbModem = async () => {
    setUsbError(null);
    setUsbBusy(true);
    try {
      const port = await requestGsmSerialPort(baudRate);
      setSerialPort(port);
      const probe = await probeGsmModem(port);
      setUsbProbe(probe);
      if (!probe.ok && probe.error) setUsbError(probe.error);
    } catch (err) {
      setUsbError(err instanceof Error ? err.message : 'Unable to connect to USB serial port.');
    } finally {
      setUsbBusy(false);
    }
  };

  const handleDisconnectUsbModem = async () => {
    if (serialPort) {
      try {
        await serialPort.close();
      } catch {
        // ignore close error
      }
    }
    setSerialPort(null);
    setUsbProbe(null);
  };

  const handleSendViaUsbModem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serialPort) {
      setUsbError('Connect a USB GSM modem first.');
      return;
    }
    setUsbBusy(true);
    setUsbError(null);
    setUsbSendResult(null);
    try {
      const res = await sendSmsViaGsmModem(serialPort, usbPhone, usbText);
      // Ensure we have a usb_gsm device entry to log against, or pick first device
      let usbDevice = devices.find((d) => d.kind === 'usb_gsm');
      if (!usbDevice) {
        const createResp = await fetch('/api/devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: usbProbe?.model || 'USB GSM Modem',
            kind: 'usb_gsm',
            carrierName: usbProbe?.registration || 'Cellular USB',
          }),
        });
        if (createResp.ok) {
          const created = (await createResp.json()) as { device: SmsDevice };
          usbDevice = created.device;
        }
      }

      if (usbDevice) {
        await fetch(`/api/devices/${usbDevice.id}/usb-log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: usbPhone,
            message: usbText,
            ok: res.ok,
            latencyMs: res.latencyMs,
            protocolTrace: res.rawTrace.join('\n'),
            errorMessage: res.error,
            accountId: activeAccountId || undefined,
          }),
        });
      }

      setUsbSendResult({
        ok: res.ok,
        message: res.ok
          ? `Sent via USB GSM Modem in ${res.latencyMs}ms${res.referenceId ? ` (${res.referenceId})` : ''}`
          : res.error || 'Modem returned an error.',
        trace: res.rawTrace,
      });
      await onRefresh();
    } catch (err) {
      setUsbError(err instanceof Error ? err.message : 'USB GSM send failed.');
    } finally {
      setUsbBusy(false);
    }
  };

  const deviceGatewayIds = new Set(devices.map((d) => d.gatewayId));
  const deviceMessages = messages.filter((m) => deviceGatewayIds.has(m.gatewayId)).slice(0, 8);

  const copyLink = (id: string, url: string) => {
    void navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Attach Real SMS Device for Testing
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Connect an actual mobile phone (via QR code) or a USB GSM / 4G LTE modem to test real SIM-card SMS delivery.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void onRefresh()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Device Status
        </button>
      </div>

      {/* How it works friendly 3-step banner */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700">
            <QrCode className="h-4 w-4" />
            Step 1 · Attach Phone or Modem
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Add your test phone below to generate a QR code, or plug in a USB GSM dongle via Chrome/Edge.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700">
            <Send className="h-4 w-4" />
            Step 2 · Queue a Real Test SMS
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Pick your attached device here, in SMS Test, or in Send Bulk SMS and dispatch a test message.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700">
            <CheckCircle2 className="h-4 w-4" />
            Step 3 · Live Delivery Tracking
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Your phone or modem transmits over the real cellular network and updates Delivery Reports automatically.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Option A: Pair Real Mobile Phone (Android / iOS QR Bridge) */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Option 1 · Pair Mobile Phone (SIM Bridge)
              </h2>
              <p className="text-xs text-slate-500">
                Works with any Android phone or iPhone browser — no cables needed.
              </p>
            </div>
          </div>

          <form onSubmit={handleAttachPhone} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Device Name</label>
              <input
                required
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Pixel 8 Lab Phone"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-700 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                SIM Phone (optional)
              </label>
              <input
                type="text"
                value={simPhone}
                onChange={(e) => setSimPhone(e.target.value)}
                placeholder="+15550109000"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-700 focus:outline-none"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={creating}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                {creating ? 'Pairing...' : 'Attach Phone'}
              </button>
            </div>
          </form>

          {/* Attached devices list */}
          {devices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
              No real phone attached yet. Click <strong>Attach Phone</strong> above to generate a scannable pairing QR code.
            </div>
          ) : (
            <div className="space-y-4">
              {devices.map((dev) => {
                const pairUrl = `${origin}/?devicePair=${encodeURIComponent(dev.pairingCode)}`;
                return (
                  <div
                    key={dev.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        {qrMap[dev.id] && (
                          <img
                            src={qrMap[dev.id]}
                            alt={`QR code for ${dev.name}`}
                            className="h-24 w-24 shrink-0 rounded-lg border border-slate-200 bg-white p-1"
                          />
                        )}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-display text-sm font-semibold text-slate-900">
                              {dev.name}
                            </span>
                            {dev.status === 'online' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                <Wifi className="h-3 w-3" />
                                Online
                              </span>
                            ) : dev.status === 'waiting' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                                <Signal className="h-3 w-3" />
                                Waiting for scan
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                                <WifiOff className="h-3 w-3" />
                                Offline
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-xs text-slate-600 tabular-nums">
                            Pair Code: <strong>{dev.pairingCode}</strong> · {dev.messagesRelayed} relayed
                          </div>
                          {dev.phoneNumber && (
                            <div className="font-mono text-xs text-slate-500">
                              SIM: {dev.phoneNumber} {dev.carrierName ? `(${dev.carrierName})` : ''}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <a
                              href={pairUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100"
                            >
                              <ExternalLink className="h-3 w-3 text-blue-700" />
                              Open Phone Bridge
                            </a>
                            <button
                              type="button"
                              onClick={() => copyLink(dev.id, pairUrl)}
                              className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              {copiedId === dev.id ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-700" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  Copy Link
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRemoveDevice(dev.id)}
                              aria-label="Detach device"
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 hover:text-red-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick Send Real Test SMS via Paired Phone */}
          {devices.length > 0 && (
            <form
              onSubmit={handleQueueDeviceTest}
              className="border-t border-slate-200 pt-4 space-y-3"
            >
              <div className="text-xs font-semibold text-slate-900">
                Send Test SMS Through Paired Phone
              </div>
              {queueError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {queueError}
                </div>
              )}
              {queueNotice && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  {queueNotice}
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Attached Device</label>
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  >
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.status})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Test Destination Number
                  </label>
                  <input
                    required
                    type="text"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    placeholder="+15550104101"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-700 focus:outline-none"
                  />
                  {(() => {
                    const net = detectCountryFromPhone(testRecipient);
                    return net ? (
                      <div className="mt-1 text-[11px] text-slate-500">
                        {net.iso2} · {net.name} ({net.carriers.slice(0, 2).join(', ')})
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Test SMS Message</label>
                <textarea
                  rows={2}
                  required
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-blue-700 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={queueBusy}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {queueBusy ? 'Sending to Device Queue...' : 'Send Test SMS to Phone'}
              </button>
            </form>
          )}
        </section>

        {/* Option B: Direct USB GSM / 4G LTE Modem (Web Serial AT Commands) */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Usb className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Option 2 · USB GSM / 4G LTE Modem (PC Port)
              </h2>
              <p className="text-xs text-slate-500">
                Connect a SIM800, Huawei, or Quectel USB modem directly using Chrome or Edge.
              </p>
            </div>
          </div>

          {!serialSupported && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              Your current browser does not support Web Serial USB ports. Open RelaySMS in Chrome or Edge on Windows/macOS/Linux to attach a USB GSM modem, or use Option 1 QR Phone Pairing.
            </div>
          )}

          {usbError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {usbError}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Baud Rate</label>
              <select
                value={baudRate}
                onChange={(e) => setBaudRate(Number(e.target.value))}
                disabled={Boolean(serialPort)}
                className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs"
              >
                <option value={9600}>9600 bps (Standard GSM)</option>
                <option value={115200}>115200 bps (4G LTE Modem)</option>
              </select>
            </div>

            {!serialPort ? (
              <button
                type="button"
                disabled={!serialSupported || usbBusy}
                onClick={() => void handleConnectUsbModem()}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
              >
                <Plug className="h-3.5 w-3.5" />
                {usbBusy ? 'Connecting COM Port...' : 'Connect USB GSM Modem'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleDisconnectUsbModem()}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                Disconnect Modem
              </button>
            )}
          </div>

          {usbProbe && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">
                  {usbProbe.model} · {usbProbe.registration}
                </span>
                <span className="font-mono text-emerald-700">{usbProbe.signal}</span>
              </div>
              <pre className="max-h-32 overflow-y-auto rounded border border-slate-200 bg-slate-900 p-2.5 font-mono text-[11px] text-slate-100 whitespace-pre-wrap">
                {usbProbe.rawTrace.join('\n\n')}
              </pre>
            </div>
          )}

          <form onSubmit={handleSendViaUsbModem} className="space-y-3 border-t border-slate-200 pt-4">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Recipient Phone Number (E.164)
              </label>
              <input
                required
                type="text"
                value={usbPhone}
                onChange={(e) => setUsbPhone(e.target.value)}
                placeholder="+15550104101"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-700 focus:outline-none"
              />
              {(() => {
                const net = detectCountryFromPhone(usbPhone);
                return net ? (
                  <div className="mt-1 text-[11px] text-slate-500">
                    {net.iso2} · {net.name} (MCC {net.mcc} · {net.carriers.slice(0, 2).join(', ')})
                  </div>
                ) : null;
              })()}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                AT+CMGS Hardware Test SMS
              </label>
              <textarea
                rows={3}
                required
                value={usbText}
                onChange={(e) => setUsbText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-blue-700 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={!serialPort || usbBusy}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {usbBusy ? 'Transmitting AT+CMGS...' : 'Send Real Hardware SMS'}
            </button>

            {usbSendResult && (
              <div
                className={`rounded-lg border p-3 text-xs space-y-2 ${
                  usbSendResult.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                <div className="flex items-center gap-1.5 font-medium">
                  {usbSendResult.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  <span>{usbSendResult.message}</span>
                </div>
                {usbSendResult.trace && (
                  <pre className="max-h-28 overflow-y-auto rounded bg-slate-900 p-2 font-mono text-[11px] text-slate-100 whitespace-pre-wrap">
                    {usbSendResult.trace.join('\n\n')}
                  </pre>
                )}
              </div>
            )}
          </form>
        </section>
      </div>

      {/* Live Real-Device Test Feed */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Recent Real-Device Test Logs
            </h2>
            <p className="text-xs text-slate-500">
              Live status updates as paired phones and USB modems confirm each SMS.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenReports()}
            className="text-xs font-medium text-blue-700 hover:text-blue-800"
          >
            Open Full Delivery Reports
          </button>
        </div>

        {deviceMessages.length === 0 ? (
          <div className="px-6 py-8 text-center text-xs text-slate-500">
            No SMS dispatched to physical devices yet. Send a test message above to watch live device status updates.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-medium text-slate-500">
                  <th className="px-5 py-3">Recipient</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Trace</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {deviceMessages.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => onOpenReports(m.campaignId)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-5 py-3 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {m.phone}
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-xs truncate">
                      {m.renderedBody}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500 max-w-xs truncate">
                      {m.protocolTrace || 'Queued for device pickup'}
                    </td>
                    <td className="px-5 py-3">
                      <DeliveryStatusText status={m.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
