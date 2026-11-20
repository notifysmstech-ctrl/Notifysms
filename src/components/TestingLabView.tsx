import React, { useMemo, useState } from 'react';
import { Activity, CheckCircle2, FlaskConical, Globe2, Send, Smartphone, XCircle } from 'lucide-react';
import type { Account, MessageLog, SmsDevice } from '../types/sms';
import { calculateSmsSegments, normalizePhone } from '../types/sms';
import { COUNTRY_NETWORKS, detectCountryFromPhone } from '../utils/countryNetworks';
import type { MaskedGateway } from './GatewaysView';

interface TestingLabViewProps {
  gateways: MaskedGateway[];
  devices: SmsDevice[];
  accounts: Account[];
  activeAccountId: string;
  onRefresh: () => Promise<void>;
  onOpenRealDevice: () => void;
}

const TEST_PRESETS = [
  {
    label: 'OTP Verification',
    text: 'Your RelaySMS verification code is 482910. Valid for 10 minutes.',
  },
  {
    label: 'Arabic / MENA (UCS-2)',
    text: 'رمز التحقق الخاص بك في RelaySMS هو 482910. صالح لمدة 10 دقائق.',
  },
  {
    label: 'Hindi / India DLT (UCS-2)',
    text: 'RelaySMS अपडेट: आपका ऑर्डर #8841 डिस्पैच हो गया है। सहायता के लिए संपर्क करें।',
  },
  {
    label: 'Unicode / Emoji (UCS-2)',
    text: 'RelaySMS global route check: Order #8841 confirmed ✅ — München Hub 📦',
  },
  {
    label: '3-Segment Multipart',
    text: 'RelaySMS multipart concatenation test: Dispatch manifest #4491 has cleared customs and is scheduled for Dock B unloading between 07:30 and 09:00 local time. Please confirm driver availability by replying CONFIRM or calling regional dispatch support at +1-555-010-9900. Thank you.',
  },
  {
    label: 'Carrier Rejection (0000)',
    text: 'Diagnostic failure-handling test routed to carrier unreachable test endpoint.',
    phone: '+15550100000',
  },
];

export const TestingLabView: React.FC<TestingLabViewProps> = ({
  gateways,
  devices,
  accounts,
  activeAccountId,
  onRefresh,
  onOpenRealDevice,
}) => {
  const defaultGw =
    gateways.find((g) => g.type === 'device') ||
    gateways.find((g) => g.type === 'smpp') ||
    gateways[0];
  const [gatewayId, setGatewayId] = useState(defaultGw?.id || '');
  const [accountId, setAccountId] = useState(activeAccountId || accounts[0]?.id || '');
  const [defaultCountryDialCode, setDefaultCountryDialCode] = useState('');
  const [phonesText, setPhonesText] = useState('+15550104101');
  const [message, setMessage] = useState(TEST_PRESETS[0].text);
  const [sending, setSending] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [results, setResults] = useState<Array<{ ok: boolean; log: MessageLog }>>([]);

  // SMPP Ad-hoc Probe State
  const [smppHost, setSmppHost] = useState('127.0.0.1');
  const [smppPort, setSmppPort] = useState(2775);
  const [smppSystemId, setSmppSystemId] = useState('relaysms_test');
  const [smppPassword, setSmppPassword] = useState('relaysms_pass');
  const [smppBindMode, setSmppBindMode] = useState<'transceiver' | 'transmitter'>('transceiver');
  const [smppUseTls, setSmppUseTls] = useState(false);
  const [probeBusy, setProbeBusy] = useState(false);
  const [probeResult, setProbeResult] = useState<{
    ok: boolean;
    latencyMs: number;
    statusText: string;
    remoteSystemId?: string;
    trace: string[];
  } | null>(null);

  const segInfo = useMemo(() => calculateSmsSegments(message), [message]);

  const detectedDestination = useMemo(() => {
    const firstPhone = phonesText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)[0];
    if (!firstPhone) return null;
    const norm = normalizePhone(firstPhone, defaultCountryDialCode || undefined);
    if (!norm.valid) return null;
    return {
      e164: norm.e164,
      info: detectCountryFromPhone(norm.e164),
    };
  }, [phonesText, defaultCountryDialCode]);

  const handleRunSmsTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestError(null);
    setSending(true);
    try {
      const phones = phonesText
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const resp = await fetch('/api/testing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gatewayId,
          accountId: accountId || undefined,
          phones,
          message,
          defaultCountryDialCode: defaultCountryDialCode || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Test dispatch failed.');
      setResults(data.results || []);
      await onRefresh();
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Test send failed.');
    } finally {
      setSending(false);
    }
  };

  const handleSmppProbe = async (e: React.FormEvent) => {
    e.preventDefault();
    setProbeBusy(true);
    setProbeResult(null);
    try {
      const resp = await fetch('/api/smpp/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: smppHost,
          port: smppPort,
          systemId: smppSystemId,
          password: smppPassword,
          bindMode: smppBindMode,
          useTls: smppUseTls,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setProbeResult({
          ok: false,
          latencyMs: 0,
          statusText: data.error || 'Probe failed',
          trace: [data.error || 'Probe failed'],
        });
      } else {
        setProbeResult(data);
      }
    } catch (err) {
      setProbeResult({
        ok: false,
        latencyMs: 0,
        statusText: err instanceof Error ? err.message : 'Network error',
        trace: ['Network error during SMPP probe'],
      });
    } finally {
      setProbeBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            SMS Testing &amp; Diagnostics Lab
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Test single SMS messages, check character segments (GSM-7 / UCS-2), verify SMPP binds, or route tests to a real paired phone.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenRealDevice}
          className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-medium text-blue-800 hover:bg-blue-100 whitespace-nowrap shrink-0"
        >
          <Smartphone className="h-3.5 w-3.5" />
          {devices.length > 0
            ? `Real Devices (${devices.filter((d) => d.status === 'online').length} online)`
            : 'Attach Real Phone / USB Modem'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Diagnostic SMS Sender */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-blue-700" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Diagnostic SMS Dispatch Tester
            </h2>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {TEST_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setMessage(p.text);
                  if (p.phone) setPhonesText(p.phone);
                }}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                {p.label}
              </button>
            ))}
          </div>

          {testError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {testError}
            </div>
          )}

          <form onSubmit={handleRunSmsTest} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700">Target Route</label>
                <select
                  value={gatewayId}
                  onChange={(e) => setGatewayId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                >
                  {gateways.map((gw) => (
                    <option key={gw.id} value={gw.id}>
                      {gw.name} ({gw.type.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Billing Account Context
                </label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                >
                  <option value="">No account billing (internal test)</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.role.toUpperCase()} · ${acc.creditsBalance.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Country Network</label>
                <select
                  value={defaultCountryDialCode}
                  onChange={(e) => setDefaultCountryDialCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
                >
                  <option value="">Auto-detect (+Code)</option>
                  {COUNTRY_NETWORKS.map((c) => (
                    <option key={c.iso2} value={c.dialCode}>
                      {c.name} ({c.dialCode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700">
                  Test Phone Number(s) (any country E.164 or local)
                </label>
                <input
                  required
                  type="text"
                  value={phonesText}
                  onChange={(e) => setPhonesText(e.target.value)}
                  placeholder="+447911123456, +919876543210, +2348031234567"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-700 focus:outline-none"
                />
              </div>
            </div>

            {detectedDestination?.info && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs space-y-0.5">
                <div className="flex items-center justify-between font-medium text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <Globe2 className="h-3.5 w-3.5 text-blue-700" />
                    {detectedDestination.info.name} ({detectedDestination.info.dialCode} · MCC {detectedDestination.info.mcc})
                  </span>
                  <span className="font-mono text-slate-600">{detectedDestination.e164}</span>
                </div>
                <div className="text-[11px] text-slate-600">
                  Networks: {detectedDestination.info.carriers.join(', ')} · {detectedDestination.info.senderIdPolicy}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700">Test Payload</label>
              <textarea
                rows={4}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-xs leading-relaxed focus:border-blue-700 focus:outline-none"
              />
              <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500 tabular-nums">
                <span>
                  Encoding: <strong className="font-mono text-slate-800">{segInfo.encoding}</strong> ·{' '}
                  {segInfo.characterCount} chars
                </span>
                <span className="font-mono">
                  {segInfo.segments} {segInfo.segments === 1 ? 'segment' : 'segments'}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {sending ? 'Running Diagnostic Test...' : 'Send Test SMS & Inspect Trace'}
            </button>
          </form>

          {results.length > 0 && (
            <div className="space-y-2.5 border-t border-slate-200 pt-4">
              <div className="text-xs font-semibold text-slate-800">Diagnostic Output</div>
              {results.map((r) => (
                <div
                  key={r.log.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-medium text-slate-900">
                      {r.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-700" />
                      )}
                      <span className="font-mono">{r.log.phone}</span>
                    </span>
                    <span className="font-mono text-slate-600 tabular-nums">
                      {r.log.status.toUpperCase()} · {r.log.latencyMs ?? 0}ms · {r.log.segments} seg
                      {r.log.cost ? ` · $${r.log.cost.toFixed(4)}` : ''}
                    </span>
                  </div>
                  {r.log.providerMessageId && (
                    <div className="font-mono text-slate-600">
                      Provider ID: {r.log.providerMessageId}
                    </div>
                  )}
                  {r.log.errorMessage && (
                    <div className="text-red-700">
                      {r.log.errorCode ? `${r.log.errorCode}: ` : ''}
                      {r.log.errorMessage}
                    </div>
                  )}
                  {r.log.protocolTrace && (
                    <div className="rounded border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-slate-700 break-all">
                      {r.log.protocolTrace}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right: SMPP v3.4 Connection & PDU Probe */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-700" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                SMPP v3.4 Connection &amp; PDU Probe
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setSmppHost('127.0.0.1');
                setSmppPort(2775);
                setSmppSystemId('relaysms_test');
                setSmppPassword('relaysms_pass');
                setSmppUseTls(false);
              }}
              className="text-xs font-medium text-blue-700 hover:text-blue-800"
            >
              Load Local Test SMSC
            </button>
          </div>

          <p className="text-xs text-slate-600">
            Executes a live TCP/TLS handshake, sends a binary SMPP v3.4 <span className="font-mono">BIND_TRANSCEIVER</span> or <span className="font-mono">BIND_TRANSMITTER</span> PDU, verifies <span className="font-mono">ENQUIRE_LINK</span>, and cleanly unbinds.
          </p>

          <form onSubmit={handleSmppProbe} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700">SMPP Host</label>
                <input
                  required
                  type="text"
                  value={smppHost}
                  onChange={(e) => setSmppHost(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs focus:border-blue-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Port</label>
                <input
                  required
                  type="number"
                  value={smppPort}
                  onChange={(e) => setSmppPort(Number(e.target.value) || 2775)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs focus:border-blue-700 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700">System ID</label>
                <input
                  required
                  type="text"
                  value={smppSystemId}
                  onChange={(e) => setSmppSystemId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs focus:border-blue-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  value={smppPassword}
                  onChange={(e) => setSmppPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs focus:border-blue-700 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <select
                value={smppBindMode}
                onChange={(e) =>
                  setSmppBindMode(e.target.value as 'transceiver' | 'transmitter')
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
              >
                <option value="transceiver">BIND_TRANSCEIVER (TRX)</option>
                <option value="transmitter">BIND_TRANSMITTER (TX)</option>
              </select>

              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={smppUseTls}
                  onChange={(e) => setSmppUseTls(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700"
                />
                Use TLS socket
              </label>
            </div>

            <button
              type="submit"
              disabled={probeBusy}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Activity className="h-3.5 w-3.5" />
              {probeBusy ? 'Probing SMPP SMSC...' : 'Run SMPP Handshake Probe'}
            </button>
          </form>

          {probeResult && (
            <div className="space-y-2 border-t border-slate-200 pt-4">
              <div
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium ${
                  probeResult.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                <span>
                  {probeResult.ok ? 'SMPP Handshake Verified' : 'SMPP Handshake Failed'}
                </span>
                <span className="font-mono tabular-nums">{probeResult.latencyMs}ms</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100 space-y-1">
                {probeResult.trace.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
