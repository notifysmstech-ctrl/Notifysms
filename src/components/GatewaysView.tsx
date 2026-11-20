import React, { useState } from 'react';
import { Activity, Check, Copy, Plus, Send, Trash2 } from 'lucide-react';
import type { GatewayConfig, GatewayType, MessageLog } from '../types/sms';

export interface MaskedGateway extends GatewayConfig {
  hasAuthToken?: boolean;
  hasApiSecret?: boolean;
  hasApiKey?: boolean;
  hasSmppPassword?: boolean;
  authTokenPreview?: string;
  apiKeyPreview?: string;
}

interface GatewaysViewProps {
  gateways: MaskedGateway[];
  onRefresh: () => Promise<void>;
}

const PROVIDER_LABELS: Record<GatewayType, string> = {
  sandbox: 'Local Sandbox Loopback',
  device: 'Real Physical SMS Device (Phone / USB GSM)',
  smpp: 'SMPP v3.4 Carrier / Bulk SMS Trunk',
  twilio: 'Twilio Programmable SMS',
  vonage: 'Vonage (Nexmo) SMS API',
  textbelt: 'Textbelt REST SMS',
  custom_http: 'Custom HTTP / GSM Modem / Android Bridge',
};

export const GatewaysView: React.FC<GatewaysViewProps> = ({ gateways, onRefresh }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<GatewayType>('smpp');
  const [senderId, setSenderId] = useState('RelaySMS');
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [customHeadersJson, setCustomHeadersJson] = useState('');
  const [customBodyTemplate, setCustomBodyTemplate] = useState(
    '{"to": "{{to}}", "message": "{{body}}", "sender": "{{sender}}"}'
  );

  // SMPP fields
  const [smppHost, setSmppHost] = useState('');
  const [smppPort, setSmppPort] = useState(2775);
  const [smppSystemId, setSmppSystemId] = useState('');
  const [smppPassword, setSmppPassword] = useState('');
  const [smppSystemType, setSmppSystemType] = useState('SMPP');
  const [smppBindMode, setSmppBindMode] = useState<'transceiver' | 'transmitter'>('transceiver');
  const [smppSourceTon, setSmppSourceTon] = useState(5);
  const [smppSourceNpi, setSmppSourceNpi] = useState(0);
  const [smppDestTon, setSmppDestTon] = useState(1);
  const [smppDestNpi, setSmppDestNpi] = useState(1);
  const [smppUseTls, setSmppUseTls] = useState(false);

  const [rateLimitPerSec, setRateLimitPerSec] = useState(20);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Test dispatch state
  const [testGatewayId, setTestGatewayId] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('+15550104101');
  const [testBody, setTestBody] = useState('RelaySMS live gateway test message.');
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    log?: MessageLog;
    error?: string;
  } | null>(null);

  // SMPP Bind test state per gateway
  const [smppProbeMap, setSmppProbeMap] = useState<
    Record<
      string,
      {
        busy: boolean;
        ok?: boolean;
        latencyMs?: number;
        statusText?: string;
        remoteSystemId?: string;
      }
    >
  >({});

  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const handleCopy = (url: string) => {
    void navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 1500);
  };

  const resetForm = () => {
    setName('');
    setType('smpp');
    setSenderId('RelaySMS');
    setAccountSid('');
    setAuthToken('');
    setApiKey('');
    setApiSecret('');
    setWebhookUrl('');
    setCustomHeadersJson('');
    setCustomBodyTemplate('{"to": "{{to}}", "message": "{{body}}", "sender": "{{sender}}"}');
    setSmppHost('');
    setSmppPort(2775);
    setSmppSystemId('');
    setSmppPassword('');
    setSmppSystemType('SMPP');
    setSmppBindMode('transceiver');
    setSmppSourceTon(5);
    setSmppSourceNpi(0);
    setSmppDestTon(1);
    setSmppDestNpi(1);
    setSmppUseTls(false);
    setRateLimitPerSec(20);
    setIsDefault(false);
    setError(null);
  };

  const handleCreateGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const resp = await fetch('/api/gateways', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          type,
          senderId: senderId || 'RelaySMS',
          accountSid,
          authToken,
          apiKey,
          apiSecret,
          webhookUrl,
          customHeadersJson,
          customBodyTemplate,
          smppHost,
          smppPort,
          smppSystemId,
          smppPassword,
          smppSystemType,
          smppBindMode,
          smppSourceTon,
          smppSourceNpi,
          smppDestTon,
          smppDestNpi,
          smppUseTls,
          rateLimitPerSec,
          isDefault,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to save gateway.');
      setShowAddModal(false);
      resetForm();
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save gateway.');
    } finally {
      setSaving(false);
    }
  };

  const setDefaultGateway = async (id: string) => {
    await fetch(`/api/gateways/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    });
    await onRefresh();
  };

  const deleteGateway = async (id: string) => {
    await fetch(`/api/gateways/${id}`, { method: 'DELETE' });
    await onRefresh();
  };

  const runSmppBindTest = async (id: string) => {
    setSmppProbeMap((prev) => ({ ...prev, [id]: { busy: true } }));
    try {
      const resp = await fetch(`/api/gateways/${id}/test-smpp`, { method: 'POST' });
      const data = (await resp.json()) as {
        ok: boolean;
        latencyMs: number;
        statusText: string;
        remoteSystemId?: string;
      };
      setSmppProbeMap((prev) => ({
        ...prev,
        [id]: {
          busy: false,
          ok: data.ok,
          latencyMs: data.latencyMs,
          statusText: data.statusText,
          remoteSystemId: data.remoteSystemId,
        },
      }));
    } catch {
      setSmppProbeMap((prev) => ({
        ...prev,
        [id]: { busy: false, ok: false, statusText: 'Network error testing SMPP bind' },
      }));
    }
  };

  const runTestDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testGatewayId) return;
    setTestBusy(true);
    setTestResult(null);
    try {
      const resp = await fetch(`/api/gateways/${testGatewayId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone, message: testBody }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setTestResult({ ok: false, error: data.error || 'Test dispatch failed.' });
      } else {
        setTestResult({ ok: Boolean(data.ok), log: data.log as MessageLog });
        await onRefresh();
      }
    } catch (err) {
      setTestResult({
        ok: false,
        error: err instanceof Error ? err.message : 'Network error during test.',
      });
    } finally {
      setTestBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            SMS Gateways &amp; SMPP Trunks
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Connect SMPP v3.4 bulk SMS gateways (Jasmin, Kannel, Ozeki, carrier SMSCs), Twilio, Vonage, Textbelt, or HTTP bridges.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Gateway / SMPP Trunk
        </button>
      </div>

      {/* Configured Gateways List */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {gateways.map((gw) => {
          const probe = smppProbeMap[gw.id];
          return (
            <div key={gw.id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      {gw.name}
                    </h2>
                    {gw.isDefault && (
                      <span className="text-xs font-medium text-blue-700">· Default Route</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {PROVIDER_LABELS[gw.type]} · Sender:{' '}
                    <span className="font-mono text-slate-700">{gw.senderId}</span> ·{' '}
                    <span className="font-mono tabular-nums">{gw.rateLimitPerSec} msg/s</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {!gw.isDefault && (
                    <button
                      type="button"
                      onClick={() => void setDefaultGateway(gw.id)}
                      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      Set Default
                    </button>
                  )}
                  {gateways.length > 1 && (
                    <button
                      type="button"
                      onClick={() => void deleteGateway(gw.id)}
                      aria-label="Delete gateway"
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 text-xs text-slate-600 space-y-1">
                {gw.type === 'sandbox' && (
                  <p>
                    Built-in deterministic loopback queue. Safely validates bulk campaigns, GSM-7/UCS-2 segments, and delivery report transitions without carrier charges.
                  </p>
                )}
                {gw.type === 'device' && (
                  <p>
                    Routes SMS directly to your attached real phone or USB GSM modem for physical SIM testing. Manage pairing and queue status in the Real Device tab.
                  </p>
                )}
                {gw.type === 'smpp' && (
                  <div className="font-mono space-y-0.5">
                    <div>
                      SMSC: {gw.smppUseTls ? 'smpp+tls://' : 'smpp://'}
                      {gw.smppHost}:{gw.smppPort} ({gw.smppBindMode || 'transceiver'})
                    </div>
                    <div>
                      System ID: {gw.smppSystemId} · Password:{' '}
                      {gw.hasSmppPassword ? '••••••••' : 'None'} · TON/NPI: {gw.smppSourceTon}/
                      {gw.smppSourceNpi} → {gw.smppDestTon}/{gw.smppDestNpi}
                    </div>
                  </div>
                )}
                {gw.type === 'twilio' && (
                  <div className="font-mono space-y-0.5">
                    <div>Account SID: {gw.accountSid || '—'}</div>
                    <div>Auth Token: {gw.authTokenPreview || 'Configured'}</div>
                  </div>
                )}
                {gw.type === 'vonage' && (
                  <div className="font-mono space-y-0.5">
                    <div>API Key: {gw.apiKeyPreview || 'Configured'}</div>
                    <div>API Secret: {gw.hasApiSecret ? '••••••••' : 'Missing'}</div>
                  </div>
                )}
                {gw.type === 'textbelt' && (
                  <div className="font-mono">
                    API Key: {gw.apiKeyPreview || 'textbelt (free test key)'}
                  </div>
                )}
                {gw.type === 'custom_http' && (
                  <div className="font-mono truncate" title={gw.webhookUrl}>
                    Endpoint: {gw.webhookUrl || '—'}
                  </div>
                )}
              </div>

              {probe && !probe.busy && (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    probe.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-800'
                  }`}
                >
                  {probe.ok
                    ? `SMPP Bind OK (${probe.latencyMs}ms) · Remote SMSC: ${probe.remoteSystemId || 'Connected'} · ${probe.statusText}`
                    : `SMPP Bind Failed: ${probe.statusText}`}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setTestGatewayId(testGatewayId === gw.id ? null : gw.id);
                      setTestResult(null);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {testGatewayId === gw.id ? 'Hide Test SMS' : 'Send Test SMS'}
                  </button>

                  {gw.type === 'smpp' && (
                    <button
                      type="button"
                      disabled={probe?.busy}
                      onClick={() => void runSmppBindTest(gw.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 disabled:opacity-50"
                    >
                      <Activity className="h-3.5 w-3.5" />
                      {probe?.busy ? 'Testing Bind...' : 'Test SMPP Bind'}
                    </button>
                  )}
                </div>

                <span className="font-mono text-xs text-slate-400">
                  Updated {new Date(gw.updatedAt).toLocaleDateString()}
                </span>
              </div>

              {testGatewayId === gw.id && (
                <form
                  onSubmit={runTestDispatch}
                  className="space-y-3 border-t border-slate-200 pt-4"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Test Recipient (E.164)
                      </label>
                      <input
                        required
                        type="text"
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                        placeholder="+15550104101"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs focus:border-blue-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Test Message
                      </label>
                      <input
                        required
                        type="text"
                        value={testBody}
                        onChange={(e) => setTestBody(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-700 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="submit"
                      disabled={testBusy}
                      className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {testBusy ? 'Dispatching...' : 'Run Live Test'}
                    </button>
                    {testResult && (
                      <span
                        className={`text-xs font-medium ${
                          testResult.ok ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {testResult.ok
                          ? `Accepted (${testResult.log?.status}) · ${testResult.log?.latencyMs || 0}ms · ID: ${testResult.log?.providerMessageId || 'ok'}`
                          : testResult.error || testResult.log?.errorMessage || 'Failed'}
                      </span>
                    )}
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>

      {/* Carrier DLR Callback Webhooks */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="font-display text-base font-semibold text-slate-900">
          Delivery Receipt (DLR) Callback Endpoints
        </h2>
        <p className="text-xs text-slate-600">
          Configure these webhook endpoints in your carrier dashboard or external bulk SMS server to stream real-time handset delivery confirmations into Delivery Reports.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { label: 'Twilio StatusCallback URL', url: `${origin}/api/webhooks/twilio/status` },
            { label: 'Generic JSON DLR Webhook', url: `${origin}/api/webhooks/dlr` },
          ].map((item) => (
            <div
              key={item.url}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-700">{item.label}</div>
                <div className="truncate font-mono text-xs text-slate-500">{item.url}</div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(item.url)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 shrink-0"
              >
                {copiedUrl === item.url ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-700" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Add Gateway Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Configure SMS Gateway / SMPP Trunk
            </h2>
            {error && (
              <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
            )}

            <form onSubmit={handleCreateGateway} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Provider Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as GatewayType)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-700 focus:outline-none"
                  >
                    <option value="smpp">SMPP v3.4 Trunk (Bulk SMS / SMSC)</option>
                    <option value="twilio">Twilio Programmable SMS</option>
                    <option value="vonage">Vonage (Nexmo)</option>
                    <option value="textbelt">Textbelt REST API</option>
                    <option value="custom_http">Custom HTTP / GSM Bridge</option>
                    <option value="sandbox">Local Sandbox Loopback</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">Display Name</label>
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Jasmin SMPP Carrier Trunk"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Sender ID / Source Address
                  </label>
                  <input
                    required
                    type="text"
                    value={senderId}
                    onChange={(e) => setSenderId(e.target.value)}
                    placeholder="+15551234567 or RelaySMS"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Max Rate (msg / sec)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={rateLimitPerSec}
                    onChange={(e) => setRateLimitPerSec(Number(e.target.value) || 20)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-700 focus:outline-none"
                  />
                </div>
              </div>

              {type === 'smpp' && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold text-slate-800">
                    SMPP v3.4 Connection Parameters
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700">
                        SMPP Host / IP
                      </label>
                      <input
                        required
                        type="text"
                        value={smppHost}
                        onChange={(e) => setSmppHost(e.target.value)}
                        placeholder="smpp.carrier.com or 127.0.0.1"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs focus:border-blue-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Port</label>
                      <input
                        required
                        type="number"
                        value={smppPort}
                        onChange={(e) => setSmppPort(Number(e.target.value) || 2775)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs focus:border-blue-700 focus:outline-none"
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
                        placeholder="relaysms_test"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs focus:border-blue-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Password</label>
                      <input
                        type="password"
                        value={smppPassword}
                        onChange={(e) => setSmppPassword(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs focus:border-blue-700 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-slate-700">Bind Mode</label>
                      <select
                        value={smppBindMode}
                        onChange={(e) =>
                          setSmppBindMode(e.target.value as 'transceiver' | 'transmitter')
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      >
                        <option value="transceiver">Transceiver (TRX)</option>
                        <option value="transmitter">Transmitter (TX)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Src TON/NPI</label>
                      <div className="mt-1 flex gap-1">
                        <input
                          type="number"
                          value={smppSourceTon}
                          onChange={(e) => setSmppSourceTon(Number(e.target.value))}
                          className="w-1/2 rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs"
                        />
                        <input
                          type="number"
                          value={smppSourceNpi}
                          onChange={(e) => setSmppSourceNpi(Number(e.target.value))}
                          className="w-1/2 rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">Dst TON/NPI</label>
                      <div className="mt-1 flex gap-1">
                        <input
                          type="number"
                          value={smppDestTon}
                          onChange={(e) => setSmppDestTon(Number(e.target.value))}
                          className="w-1/2 rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs"
                        />
                        <input
                          type="number"
                          value={smppDestNpi}
                          onChange={(e) => setSmppDestNpi(Number(e.target.value))}
                          className="w-1/2 rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={smppUseTls}
                        onChange={(e) => setSmppUseTls(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700"
                      />
                      Enable TLS / SSL socket encryption
                    </label>
                    <input
                      type="text"
                      value={smppSystemType}
                      onChange={(e) => setSmppSystemType(e.target.value)}
                      placeholder="System Type (e.g. SMPP)"
                      className="w-40 rounded border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              {type === 'twilio' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Account SID</label>
                    <input
                      required
                      type="text"
                      value={accountSid}
                      onChange={(e) => setAccountSid(e.target.value)}
                      placeholder="ACxxxxxxxxxxxxxxxx"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Auth Token</label>
                    <input
                      required
                      type="password"
                      value={authToken}
                      onChange={(e) => setAuthToken(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-700 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {type === 'vonage' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">API Key</label>
                    <input
                      required
                      type="text"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">API Secret</label>
                    <input
                      required
                      type="password"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-700 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {type === 'textbelt' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Textbelt API Key (leave "textbelt" for 1 free test SMS/day)
                  </label>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="textbelt"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-700 focus:outline-none"
                  />
                </div>
              )}

              {type === 'custom_http' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      HTTP POST Endpoint URL
                    </label>
                    <input
                      required
                      type="url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://192.168.1.50:8082/send-sms"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Custom Headers (JSON, optional)
                    </label>
                    <input
                      type="text"
                      value={customHeadersJson}
                      onChange={(e) => setCustomHeadersJson(e.target.value)}
                      placeholder='{"Authorization": "Bearer token"}'
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      JSON Body Template (supports {'{{to}}'}, {'{{body}}'}, {'{{sender}}'})
                    </label>
                    <textarea
                      rows={3}
                      value={customBodyTemplate}
                      onChange={(e) => setCustomBodyTemplate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-mono text-xs focus:border-blue-700 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700"
                />
                Set as default SMS route
              </label>

              <div className="flex justify-end gap-2.5 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Gateway'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
