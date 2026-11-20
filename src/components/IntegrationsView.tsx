import React, { useState } from 'react';
import { Check, Code2, Copy, Play, Server } from 'lucide-react';
import type { Account } from '../types/sms';

interface IntegrationsViewProps {
  accounts: Account[];
  onRefresh: () => Promise<void>;
}

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({
  accounts,
  onRefresh,
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState(
    accounts.find((a) => a.role === 'customer')?.id || accounts[0]?.id || ''
  );
  const [snippetLang, setSnippetLang] = useState<'curl' | 'node' | 'python' | 'php'>('curl');
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null);

  // Live API v1 Test Console
  const [apiPhone, setApiPhone] = useState('+15550104101');
  const [apiMessage, setApiMessage] = useState('External software API v1 integration test.');
  const [apiBusy, setApiBusy] = useState(false);
  const [apiResponseJson, setApiResponseJson] = useState<string | null>(null);

  const selectedAccount =
    accounts.find((a) => a.id === selectedAccountId) || accounts[0];
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const apiKey = selectedAccount?.apiKey || 'YOUR_API_KEY';

  const copyText = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedBlock(id);
    setTimeout(() => setCopiedBlock(null), 1500);
  };

  const codeSnippets: Record<'curl' | 'node' | 'python' | 'php', string> = {
    curl: `curl -X POST "${baseUrl}/api/v1/sms/bulk" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${apiKey}" \\
  -d '{
    "name": "External CRM Sync Batch",
    "recipients": ["+15550104101", "+15550104102"],
    "message": "Order dispatch alert from external bulk SMS software.",
    "rateLimitPerSec": 20
  }'`,
    node: `const res = await fetch("${baseUrl}/api/v1/sms/bulk", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "${apiKey}",
  },
  body: JSON.stringify({
    name: "External Node Integration",
    recipients: ["+15550104101", "+15550104102"],
    message: "Order dispatch alert from Node.js",
  }),
});
console.log(await res.json());`,
    python: `import requests

resp = requests.post(
    "${baseUrl}/api/v1/sms/bulk",
    headers={"X-API-Key": "${apiKey}"},
    json={
        "name": "External Python Integration",
        "recipients": ["+15550104101", "+15550104102"],
        "message": "Order dispatch alert from Python",
    },
)
print(resp.json())`,
    php: `<?php
$ch = curl_init("${baseUrl}/api/v1/sms/bulk");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Content-Type: application/json",
    "X-API-Key: ${apiKey}"
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "recipients" => ["+15550104101"],
    "message" => "Dispatch alert from PHP"
  ])
]);
echo curl_exec($ch);`,
  };

  const runLiveApiCall = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiBusy(true);
    setApiResponseJson(null);
    try {
      const resp = await fetch('/api/v1/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          to: apiPhone,
          message: apiMessage,
        }),
      });
      const json = await resp.json();
      setApiResponseJson(JSON.stringify({ httpStatus: resp.status, ...json }, null, 2));
      await onRefresh();
    } catch (err) {
      setApiResponseJson(
        JSON.stringify(
          { error: err instanceof Error ? err.message : 'Request failed' },
          null,
          2
        )
      );
    } finally {
      setApiBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
          External Bulk SMS Software &amp; API Integration
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Integrate RelaySMS with Jasmin, Kannel, Ozeki, PlaySMS, CRM platforms, or custom applications via REST API v1 and SMPP v3.4 trunks.
        </p>
      </div>

      {/* Account Key Selector + Endpoints */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              REST API v1 Authentication &amp; Endpoints
            </h2>
            <p className="text-xs text-slate-500">
              Authenticate external software using <span className="font-mono">X-API-Key</span> or{' '}
              <span className="font-mono">Authorization: Bearer</span> tied to any Sales or Customer account.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedAccount?.id || ''}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              aria-label="Select account for API key"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role.toUpperCase()})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => copyText('apikey', apiKey)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              {copiedBlock === 'apikey' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-700" />
                  Copied Key
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy Key
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[
            {
              method: 'POST',
              path: '/api/v1/sms/send',
              desc: 'Send single SMS with immediate carrier/SMPP status & credit billing.',
            },
            {
              method: 'POST',
              path: '/api/v1/sms/bulk',
              desc: 'Queue bulk recipient array or contact group IDs with rate throttling.',
            },
            {
              method: 'GET',
              path: '/api/v1/sms/status/:id',
              desc: 'Retrieve real-time message or campaign delivery report status.',
            },
            {
              method: 'GET',
              path: '/api/v1/account/balance',
              desc: 'Query remaining account SMS credits, rate per segment, and usage.',
            },
          ].map((ep) => (
            <div
              key={ep.path}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="font-semibold text-blue-700">{ep.method}</span>
                <span className="text-slate-900">{ep.path}</span>
              </div>
              <div className="mt-1 text-xs text-slate-600">{ep.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Code Examples + Live API Test */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-blue-700" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Integration Code Examples
              </h2>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(['curl', 'node', 'python', 'php'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setSnippetLang(lang)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium uppercase ${
                    snippetLang === lang
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100">
              {codeSnippets[snippetLang]}
            </pre>
            <button
              type="button"
              onClick={() => copyText('snippet', codeSnippets[snippetLang])}
              className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700"
            >
              {copiedBlock === 'snippet' ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
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
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 text-blue-700" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Live REST API v1 Call Simulator
            </h2>
          </div>

          <form onSubmit={runLiveApiCall} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Recipient Phone (E.164)
              </label>
              <input
                required
                type="text"
                value={apiPhone}
                onChange={(e) => setApiPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Message</label>
              <input
                required
                type="text"
                value={apiMessage}
                onChange={(e) => setApiMessage(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={apiBusy}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              {apiBusy ? 'Executing POST /api/v1/sms/send...' : 'Execute Live API Request'}
            </button>
          </form>

          {apiResponseJson && (
            <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3.5 font-mono text-xs text-slate-800">
              {apiResponseJson}
            </pre>
          )}
        </section>
      </div>

      {/* SMPP Interoperability Reference */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-blue-700" />
          <h2 className="font-display text-base font-semibold text-slate-900">
            SMPP v3.4 External SMS Software Compatibility
          </h2>
        </div>
        <p className="text-xs leading-relaxed text-slate-600">
          RelaySMS connects directly as an SMPP v3.4 ESME (<span className="font-mono">BIND_TRANSCEIVER</span> / <span className="font-mono">BIND_TRANSMITTER</span>, <span className="font-mono">SUBMIT_SM</span>, <span className="font-mono">ENQUIRE_LINK</span>, GSM-7 &amp; UCS-2) to third-party SMS servers including <strong>Jasmin SMS Gateway</strong>, <strong>Kannel</strong>, <strong>Ozeki SMS Gateway</strong>, <strong>PlaySMS</strong>, and upstream telecom aggregators. Add your remote SMPP host under <strong>SMS Gateways</strong> or test handshakes in <strong>SMS Testing</strong>.
        </p>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700">
          Built-in Loopback SMPP v3.4 Test SMSC: host=127.0.0.1 · port=2775 · system_id=relaysms_test · password=relaysms_pass
        </div>
      </section>
    </div>
  );
};
