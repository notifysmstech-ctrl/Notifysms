import React, { useMemo, useState } from 'react';
import { AlertCircle, Check, Globe2, Send, Users } from 'lucide-react';
import type { Account, Campaign, Contact, ContactGroup, GatewayConfig } from '../types/sms';
import {
  calculateSmsSegments,
  interpolateMessage,
  normalizePhone,
} from '../types/sms';
import {
  COUNTRY_NETWORKS,
  detectCountryFromPhone,
  type CountryNetworkInfo,
} from '../utils/countryNetworks';

interface BulkComposerViewProps {
  contacts: Contact[];
  groups: ContactGroup[];
  gateways: GatewayConfig[];
  accounts: Account[];
  activeAccountId: string;
  initialGroupId?: string;
  onDispatched: (campaign: Campaign) => void;
  onOpenGateways: () => void;
  onOpenRealDevice: () => void;
}

const VARIABLES = [
  { label: 'First Name', token: '{{firstName}}' },
  { label: 'Last Name', token: '{{lastName}}' },
  { label: 'Company', token: '{{company}}' },
  { label: 'Phone', token: '{{phone}}' },
];

export const BulkComposerView: React.FC<BulkComposerViewProps> = ({
  contacts,
  groups,
  gateways,
  accounts,
  activeAccountId,
  initialGroupId,
  onDispatched,
  onOpenGateways,
  onOpenRealDevice,
}) => {
  const defaultGw = gateways.find((g) => g.isDefault) || gateways[0];

  const [campaignName, setCampaignName] = useState('');
  const [accountId, setAccountId] = useState(activeAccountId || accounts[0]?.id || '');
  const [gatewayId, setGatewayId] = useState(defaultGw?.id || '');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    initialGroupId ? [initialGroupId] : []
  );
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [manualText, setManualText] = useState('');
  const [messageTemplate, setMessageTemplate] = useState(
    'Hi {{firstName}}, your scheduled dispatch from {{company}} is confirmed. Reply STOP to opt out.'
  );
  const [rateLimitPerSec, setRateLimitPerSec] = useState<number>(
    defaultGw?.rateLimitPerSec || 10
  );
  const [contactSearch, setContactSearch] = useState('');
  const [defaultCountryDialCode, setDefaultCountryDialCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manualNumbers = useMemo(() => {
    return manualText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [manualText]);

  const audienceSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        phone: string;
        optedOut: boolean;
        valid: boolean;
        contact?: Contact;
        country?: CountryNetworkInfo | null;
      }
    >();

    for (const c of contacts) {
      const inGroup = selectedGroupIds.some((gid) => c.groupIds.includes(gid));
      const picked = selectedContactIds.includes(c.id);
      if (inGroup || picked) {
        const norm = normalizePhone(c.phone, defaultCountryDialCode || undefined);
        const key = norm.e164 || c.phone;
        if (!map.has(key)) {
          map.set(key, {
            name: `${c.firstName} ${c.lastName}`.trim() || key,
            phone: key,
            optedOut: c.optedOut,
            valid: norm.valid,
            contact: c,
            country: norm.valid ? detectCountryFromPhone(key) : null,
          });
        }
      }
    }

    for (const raw of manualNumbers) {
      const norm = normalizePhone(raw, defaultCountryDialCode || undefined);
      const key = norm.e164 || raw;
      if (!map.has(key)) {
        const existing = contacts.find((c) => normalizePhone(c.phone).e164 === key);
        map.set(key, {
          name: existing ? `${existing.firstName} ${existing.lastName}`.trim() : key,
          phone: key,
          optedOut: existing?.optedOut ?? false,
          valid: norm.valid,
          contact: existing,
          country: norm.valid ? detectCountryFromPhone(key) : null,
        });
      }
    }

    const entries = Array.from(map.values());
    const validReachable = entries.filter((e) => e.valid && !e.optedOut);
    const optedOut = entries.filter((e) => e.optedOut);
    const invalid = entries.filter((e) => !e.valid);

    const countryCounts = new Map<string, { info: CountryNetworkInfo; count: number }>();
    for (const entry of validReachable) {
      if (entry.country) {
        const prev = countryCounts.get(entry.country.iso2);
        if (prev) prev.count += 1;
        else countryCounts.set(entry.country.iso2, { info: entry.country, count: 1 });
      }
    }

    return {
      total: entries.length,
      validReachable,
      optedOutCount: optedOut.length,
      invalidCount: invalid.length,
      sampleContact: validReachable[0]?.contact || entries[0]?.contact || contacts[0],
      countries: Array.from(countryCounts.values()),
    };
  }, [contacts, selectedGroupIds, selectedContactIds, manualNumbers, defaultCountryDialCode]);

  const previewText = useMemo(() => {
    const sample = audienceSummary.sampleContact || {
      firstName: 'Elena',
      lastName: 'Vance',
      company: 'Northwind Logistics',
      phone: '+15550104101',
    };
    return interpolateMessage(messageTemplate, sample);
  }, [messageTemplate, audienceSummary.sampleContact]);

  const segInfo = useMemo(() => calculateSmsSegments(previewText), [previewText]);
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const estSegments = audienceSummary.validReachable.length * segInfo.segments;
  const estCost = selectedAccount ? estSegments * selectedAccount.ratePerSegment : 0;

  const toggleGroup = (id: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const toggleContact = (id: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const insertToken = (token: string) => {
    setMessageTemplate((prev) =>
      prev.endsWith(' ') || prev === '' ? `${prev}${token}` : `${prev} ${token}`
    );
  };

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return contacts.slice(0, 12);
    return contacts
      .filter(
        (c) =>
          `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [contacts, contactSearch]);

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!gatewayId) {
      setError('Select a configured SMS gateway before dispatching.');
      return;
    }
    if (audienceSummary.total === 0) {
      setError('Select at least one group, contact, or enter phone numbers.');
      return;
    }
    if (!messageTemplate.trim()) {
      setError('Enter the SMS message content.');
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch('/api/campaigns/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          accountId: accountId || undefined,
          gatewayId,
          messageTemplate,
          groupIds: selectedGroupIds,
          contactIds: selectedContactIds,
          manualNumbers,
          defaultCountryDialCode: defaultCountryDialCode || undefined,
          rateLimitPerSec,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to launch bulk campaign.');
      }
      onDispatched(data as Campaign);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch SMS campaign.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedGateway = gateways.find((g) => g.id === gatewayId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Bulk SMS Composer
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Target contact groups, individual contacts, or pasted number lists with SMPP/API routing and account billing.
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleDispatch} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Campaign metadata, account & gateway */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              1. Campaign, Account &amp; Carrier Route
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="cmp-name" className="block text-xs font-medium text-slate-700">
                  Campaign Name
                </label>
                <input
                  id="cmp-name"
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. Friday Route Dispatch"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="cmp-account" className="block text-xs font-medium text-slate-700">
                  Billing Account
                </label>
                <select
                  id="cmp-account"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.role.toUpperCase()} · ${acc.creditsBalance.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="cmp-gateway" className="block text-xs font-medium text-slate-700">
                    SMS / SMPP Route
                  </label>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={onOpenRealDevice}
                      className="text-xs font-medium text-blue-700 hover:text-blue-800"
                    >
                      Real Phone
                    </button>
                    <button
                      type="button"
                      onClick={onOpenGateways}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Manage
                    </button>
                  </div>
                </div>
                <select
                  id="cmp-gateway"
                  value={gatewayId}
                  onChange={(e) => {
                    setGatewayId(e.target.value);
                    const gw = gateways.find((g) => g.id === e.target.value);
                    if (gw) setRateLimitPerSec(gw.rateLimitPerSec);
                  }}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                >
                  {gateways.map((gw) => (
                    <option key={gw.id} value={gw.id}>
                      {gw.name} ({gw.type.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Audience selection */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-slate-900">
                2. Target Recipients
              </h2>
              <span className="font-mono text-xs text-slate-600 tabular-nums">
                {audienceSummary.validReachable.length} reachable · {audienceSummary.optedOutCount} opted out · {audienceSummary.invalidCount} invalid
              </span>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-700">Contact Groups</div>
              {groups.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No contact groups available yet.</p>
              ) : (
                <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {groups.map((grp) => {
                    const checked = selectedGroupIds.includes(grp.id);
                    const count = contacts.filter(
                      (c) => c.groupIds.includes(grp.id) && !c.optedOut
                    ).length;
                    return (
                      <button
                        key={grp.id}
                        type="button"
                        onClick={() => toggleGroup(grp.id)}
                        className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                          checked
                            ? 'border-blue-700 bg-blue-50/60 text-slate-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Users className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                            <span className="truncate">{grp.name}</span>
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
                            {count} active members
                          </div>
                        </div>
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            checked
                              ? 'border-blue-700 bg-blue-700 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="cmp-contact-search" className="text-xs font-medium text-slate-700">
                  Individual Contacts (optional)
                </label>
                {selectedContactIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedContactIds([])}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Clear ({selectedContactIds.length})
                  </button>
                )}
              </div>
              <input
                id="cmp-contact-search"
                type="text"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Search contacts by name, phone, or company..."
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
              />
              <div className="mt-2 max-h-40 overflow-y-auto divide-y divide-slate-200 rounded-lg border border-slate-200">
                {filteredContacts.map((c) => {
                  const checked = selectedContactIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center justify-between px-3 py-2 text-xs hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleContact(c.id)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
                        />
                        <span className="truncate font-medium text-slate-800">
                          {c.firstName} {c.lastName}
                        </span>
                        {c.company && (
                          <span className="hidden truncate text-slate-500 sm:inline">
                            · {c.company}
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-slate-600 tabular-nums shrink-0 pl-2">
                        {c.phone}
                        {c.optedOut ? ' (opted out)' : ''}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor="cmp-manual" className="block text-xs font-medium text-slate-700">
                  Direct or Pasted Phone Numbers (any international format, comma or newline)
                </label>
                <textarea
                  id="cmp-manual"
                  rows={3}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="+447911123456, +919876543210, +971501234567"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="cmp-country" className="block text-xs font-medium text-slate-700">
                  Default Country (for local numbers)
                </label>
                <select
                  id="cmp-country"
                  value={defaultCountryDialCode}
                  onChange={(e) => setDefaultCountryDialCode(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                >
                  <option value="">Global (numbers already have +Code)</option>
                  {COUNTRY_NETWORKS.map((c) => (
                    <option key={c.iso2} value={c.dialCode}>
                      {c.name} ({c.dialCode})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Converts local numbers (e.g. 07911...) to international +E.164 format.
                </p>
              </div>
            </div>
          </section>

          {/* Message Editor */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-slate-900">
                3. Message Content &amp; Pacing
              </h2>
              <div className="flex flex-wrap items-center gap-1.5">
                {VARIABLES.map((v) => (
                  <button
                    key={v.token}
                    type="button"
                    onClick={() => insertToken(v.token)}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                  >
                    + {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <textarea
                rows={5}
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                placeholder="Write your SMS message..."
                className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 tabular-nums">
                <span>
                  Encoding: <strong className="font-mono text-slate-800">{segInfo.encoding}</strong> ·{' '}
                  {segInfo.characterCount} chars ·{' '}
                  <strong className="font-mono text-slate-800">{segInfo.segments}</strong>{' '}
                  {segInfo.segments === 1 ? 'segment' : 'segments'} per recipient
                </span>
                <span className="font-mono">
                  Est. batch: {estSegments} segs (${estCost.toFixed(3)})
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-4 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <label htmlFor="cmp-rate" className="text-xs font-medium text-slate-700 whitespace-nowrap">
                  Dispatch Throttle
                </label>
                <input
                  id="cmp-rate"
                  type="number"
                  min={1}
                  max={100}
                  value={rateLimitPerSec}
                  onChange={(e) =>
                    setRateLimitPerSec(Math.max(1, Math.min(100, Number(e.target.value) || 1)))
                  }
                  className="w-20 rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-700 focus:outline-none"
                />
                <span className="text-xs text-slate-500">msg / sec</span>
              </div>

              <button
                type="submit"
                disabled={submitting || audienceSummary.total === 0}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Send className="h-4 w-4" />
                {submitting
                  ? 'Queueing Batch...'
                  : `Send Bulk SMS (${audienceSummary.validReachable.length})`}
              </button>
            </div>
          </section>
        </div>

        {/* Right column: Live handset preview & billing summary */}
        <aside className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Live Recipient Preview
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Rendered with{' '}
              {audienceSummary.sampleContact
                ? `${audienceSummary.sampleContact.firstName} ${audienceSummary.sampleContact.lastName}`
                : 'sample contact'}
              .
            </p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 text-xs text-slate-500">
                <span className="font-medium text-slate-800">
                  From: {selectedGateway?.senderId || 'RelaySMS'}
                </span>
                <span className="font-mono tabular-nums">{segInfo.encoding}</span>
              </div>
              <div className="mt-3 rounded-lg bg-white p-3.5 text-sm leading-relaxed text-slate-900 border border-slate-200 whitespace-pre-wrap break-words">
                {previewText || 'Message preview will appear here.'}
              </div>
            </div>

            <div className="mt-5 space-y-2.5 border-t border-slate-200 pt-4 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Reachable recipients</span>
                <span className="font-mono font-medium text-emerald-700 tabular-nums">
                  {audienceSummary.validReachable.length}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Opted-out suppressed</span>
                <span className="font-mono font-medium text-slate-700 tabular-nums">
                  {audienceSummary.optedOutCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Estimated batch cost</span>
                <span className="font-mono font-medium text-slate-900 tabular-nums">
                  ${estCost.toFixed(4)}
                </span>
              </div>
              {selectedAccount && (
                <div className="flex items-center justify-between text-slate-600">
                  <span>Account balance</span>
                  <span className="font-mono font-medium text-slate-900 tabular-nums">
                    ${selectedAccount.creditsBalance.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {audienceSummary.countries.length > 0 && (
              <div className="mt-4 border-t border-slate-200 pt-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <Globe2 className="h-3.5 w-3.5 text-blue-700" />
                  Destination Country Networks
                </div>
                <div className="space-y-1.5">
                  {audienceSummary.countries.slice(0, 5).map(({ info, count }) => (
                    <div
                      key={info.iso2}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px]"
                    >
                      <div className="flex items-center justify-between font-medium text-slate-800">
                        <span>
                          {info.name} ({info.dialCode} · MCC {info.mcc})
                        </span>
                        <span className="font-mono tabular-nums">{count}</span>
                      </div>
                      <div className="mt-0.5 text-slate-500">
                        Carriers: {info.carriers.slice(0, 3).join(', ')}
                      </div>
                      <div className="mt-0.5 text-slate-500">{info.senderIdPolicy}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </form>
    </div>
  );
};
