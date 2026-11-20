import React, { useMemo, useState } from 'react';
import { Download, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react';
import type { Campaign, DeliveryStatus, MessageLog } from '../types/sms';
import { detectCountryFromPhone } from '../utils/countryNetworks';
import { CampaignStatusText, DeliveryStatusText } from './StatusText';

interface DeliveryReportsViewProps {
  campaigns: Campaign[];
  messages: MessageLog[];
  initialCampaignId?: string;
  onRefresh: () => Promise<void>;
}

export const DeliveryReportsView: React.FC<DeliveryReportsViewProps> = ({
  campaigns,
  messages,
  initialCampaignId,
  onRefresh,
}) => {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(
    initialCampaignId || 'all'
  );
  const [statusFilter, setStatusFilter] = useState<'all' | DeliveryStatus>('all');
  const [search, setSearch] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const filteredMessages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return messages.filter((m) => {
      if (selectedCampaignId !== 'all' && m.campaignId !== selectedCampaignId) {
        return false;
      }
      if (statusFilter !== 'all' && m.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const detected = m.countryName || detectCountryFromPhone(m.phone)?.name || '';
      const iso = m.countryIso || detectCountryFromPhone(m.phone)?.iso2 || '';
      return (
        m.phone.toLowerCase().includes(q) ||
        m.recipientName.toLowerCase().includes(q) ||
        m.renderedBody.toLowerCase().includes(q) ||
        detected.toLowerCase().includes(q) ||
        iso.toLowerCase().includes(q) ||
        (m.carrierHint || '').toLowerCase().includes(q) ||
        (m.providerMessageId || '').toLowerCase().includes(q)
      );
    });
  }, [messages, selectedCampaignId, statusFilter, search]);

  const metrics = useMemo(() => {
    const scope =
      selectedCampaignId === 'all'
        ? messages
        : messages.filter((m) => m.campaignId === selectedCampaignId);

    const total = scope.length;
    const delivered = scope.filter((m) => m.status === 'delivered').length;
    const sent = scope.filter((m) => m.status === 'sent').length;
    const queued = scope.filter((m) => m.status === 'queued' || m.status === 'sending').length;
    const failed = scope.filter((m) => m.status === 'failed').length;
    const optedOut = scope.filter((m) => m.status === 'opted_out').length;
    const segments = scope.reduce((acc, m) => acc + m.segments, 0);

    return { total, delivered, sent, queued, failed, optedOut, segments };
  }, [messages, selectedCampaignId]);

  const activeCampaign = campaigns.find((c) => c.id === selectedCampaignId);

  const handleRefreshDlr = async () => {
    setActionBusy(true);
    setNotice(null);
    try {
      const resp = await fetch(`/api/campaigns/${selectedCampaignId}/refresh-status`, {
        method: 'POST',
      });
      const data = await resp.json();
      await onRefresh();
      setNotice(
        data.updated > 0
          ? `Updated ${data.updated} live delivery receipts from carrier.`
          : 'All tracked carrier receipts are up to date.'
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleRetryFailed = async () => {
    if (selectedCampaignId === 'all') return;
    setActionBusy(true);
    setNotice(null);
    try {
      const resp = await fetch(`/api/campaigns/${selectedCampaignId}/retry-failed`, {
        method: 'POST',
      });
      const data = await resp.json();
      if (!resp.ok) {
        setNotice(data.error || 'No retryable failed messages.');
      } else {
        setNotice(`Re-queued ${data.requeued} failed messages for dispatch.`);
        await onRefresh();
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
    if (selectedCampaignId === id) setSelectedCampaignId('all');
    await onRefresh();
  };

  const exportUrl = (format: 'csv' | 'json') =>
    `/api/reports/export?format=${format}&campaignId=${encodeURIComponent(
      selectedCampaignId
    )}&status=${encodeURIComponent(statusFilter)}`;

  const pct = (n: number) =>
    metrics.total > 0 ? `${((n / metrics.total) * 100).toFixed(1)}%` : '0.0%';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Delivery Status Reports
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Campaign performance metrics, carrier delivery receipts (DLR), error diagnostics, and CSV/JSON exports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => void handleRefreshDlr()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${actionBusy ? 'animate-spin' : ''}`} />
            Sync Carrier Status
          </button>

          {selectedCampaignId !== 'all' && metrics.failed > 0 && (
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => void handleRetryFailed()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry Failed ({metrics.failed})
            </button>
          )}

          <a
            href={exportUrl('csv')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </a>

          <a
            href={exportUrl('json')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            JSON
          </a>
        </div>
      </div>

      {notice && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-700">
          {notice}
        </div>
      )}

      {/* Delivery Summary Strip + Breakdown Bar */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">Reporting Scope</div>
            <div className="mt-0.5 font-display text-base font-semibold text-slate-900">
              {activeCampaign ? activeCampaign.name : 'All Dispatched Campaigns'}
            </div>
          </div>

          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            aria-label="Filter by campaign"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-700 focus:outline-none"
          >
            <option value="all">All Campaigns ({campaigns.length})</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.totalRecipients})
              </option>
            ))}
          </select>
        </div>

        {/* Stacked proportional bar */}
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 flex">
          {metrics.total > 0 && (
            <>
              <div
                style={{ width: `${(metrics.delivered / metrics.total) * 100}%` }}
                className="bg-emerald-600 transition-all"
                title={`Delivered: ${metrics.delivered}`}
              />
              <div
                style={{ width: `${(metrics.sent / metrics.total) * 100}%` }}
                className="bg-blue-600 transition-all"
                title={`Sent to carrier: ${metrics.sent}`}
              />
              <div
                style={{ width: `${(metrics.queued / metrics.total) * 100}%` }}
                className="bg-amber-500 transition-all"
                title={`Queued / Sending: ${metrics.queued}`}
              />
              <div
                style={{ width: `${(metrics.failed / metrics.total) * 100}%` }}
                className="bg-red-600 transition-all"
                title={`Failed: ${metrics.failed}`}
              />
              <div
                style={{ width: `${(metrics.optedOut / metrics.total) * 100}%` }}
                className="bg-slate-400 transition-all"
                title={`Opted out: ${metrics.optedOut}`}
              />
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 pt-1 sm:grid-cols-6">
          <div>
            <div className="text-xs text-slate-500">Total Messages</div>
            <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
              {metrics.total}
            </div>
          </div>
          <div>
            <div className="text-xs text-emerald-700">Delivered</div>
            <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
              {metrics.delivered} <span className="text-xs font-normal text-slate-500">({pct(metrics.delivered)})</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-blue-700">Sent to Carrier</div>
            <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
              {metrics.sent}
            </div>
          </div>
          <div>
            <div className="text-xs text-amber-700">Queued</div>
            <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
              {metrics.queued}
            </div>
          </div>
          <div>
            <div className="text-xs text-red-700">Failed</div>
            <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
              {metrics.failed}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total Segments</div>
            <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
              {metrics.segments}
            </div>
          </div>
        </div>
      </section>

      {/* Campaign History Overview Table */}
      {campaigns.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Campaign Summary Ledger
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-500">
                  <th className="px-5 py-2.5">Campaign</th>
                  <th className="px-4 py-2.5">Gateway</th>
                  <th className="px-4 py-2.5 text-right">Recipients</th>
                  <th className="px-4 py-2.5 text-right">Delivered</th>
                  <th className="px-4 py-2.5 text-right">Sent</th>
                  <th className="px-4 py-2.5 text-right">Failed</th>
                  <th className="px-4 py-2.5 text-right">Segments</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {campaigns.map((c) => (
                  <tr
                    key={c.id}
                    className={`hover:bg-slate-50 ${
                      selectedCampaignId === c.id ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedCampaignId(c.id)}
                        className="text-left font-medium text-slate-900 hover:text-blue-700"
                      >
                        {c.name}
                      </button>
                      <div className="text-slate-500 tabular-nums">
                        {new Date(c.createdAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.gatewayName}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{c.totalRecipients}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-700 tabular-nums">
                      {c.deliveredCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-blue-700 tabular-nums">
                      {c.sentCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-red-700 tabular-nums">
                      {c.failedCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{c.totalSegments}</td>
                    <td className="px-4 py-3">
                      <CampaignStatusText status={c.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void handleDeleteCampaign(c.id)}
                        aria-label="Delete campaign"
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Message-level DLR Log */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search phone, recipient, message, or DLR ID..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'delivered', label: 'Delivered' },
                { id: 'sent', label: 'Sent' },
                { id: 'queued', label: 'Queued' },
                { id: 'failed', label: 'Failed' },
                { id: 'opted_out', label: 'Opted out' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === f.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredMessages.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-900">No message logs match this filter</p>
            <p className="mt-1 text-xs text-slate-500">
              Adjust your status filter or dispatch a new SMS campaign to view live delivery records.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-500">
                  <th className="px-5 py-3">Recipient</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Message Content</th>
                  <th className="px-4 py-3 text-right">Segs</th>
                  <th className="px-4 py-3">Carrier / Provider ID</th>
                  <th className="px-5 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredMessages.map((m) => {
                  const fallbackNet = !m.countryIso ? detectCountryFromPhone(m.phone) : null;
                  const countryLabel = m.countryName || fallbackNet?.name;
                  const countryCode = m.countryIso || fallbackNet?.iso2;
                  const carrierLabel = m.carrierHint || (fallbackNet ? fallbackNet.carriers.slice(0, 2).join(', ') : '');
                  return (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">{m.recipientName}</div>
                      <div className="font-mono text-slate-600 tabular-nums">{m.phone}</div>
                      {countryLabel && (
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {countryCode} · {countryLabel}
                          {carrierLabel ? ` (${carrierLabel})` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <DeliveryStatusText status={m.status} />
                      {m.errorMessage && (
                        <div className="mt-0.5 max-w-[200px] truncate text-red-700" title={m.errorMessage}>
                          {m.errorCode ? `${m.errorCode}: ` : ''}
                          {m.errorMessage}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="truncate text-slate-800" title={m.renderedBody}>
                        {m.renderedBody}
                      </div>
                      <div className="mt-0.5 text-slate-500">{m.campaignName}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">
                      {m.segments} ({m.encoding})
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">
                      <div>{m.gatewayType.toUpperCase()}</div>
                      <div className="truncate max-w-[140px]" title={m.providerMessageId || ''}>
                        {m.providerMessageId || '—'}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                      {new Date(m.deliveredAt || m.sentAt || m.queuedAt).toLocaleString()}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
