import React from 'react';
import {
  ArrowRight,
  FlaskConical,
  Send,
  Smartphone,
  Users,
  Wifi,
} from 'lucide-react';
import type {
  Account,
  Campaign,
  Contact,
  ContactGroup,
  GatewayConfig,
  MessageLog,
  SmsDevice,
} from '../types/sms';
import { FEATURE_CATALOG } from './FeatureTabBar';
import { CampaignStatusText } from './StatusText';

export type WorkspaceTab =
  | 'overview'
  | 'composer'
  | 'contacts'
  | 'reports'
  | 'device'
  | 'gateways'
  | 'testing'
  | 'integrations'
  | 'accounts'
  | 'deploy';

interface OverviewViewProps {
  contacts: Contact[];
  groups: ContactGroup[];
  gateways: Array<GatewayConfig & { hasAuthToken?: boolean; hasApiKey?: boolean }>;
  devices: SmsDevice[];
  campaigns: Campaign[];
  messages: MessageLog[];
  accounts: Account[];
  onNavigate: (tab: WorkspaceTab, options?: { campaignId?: string; groupId?: string }) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  contacts,
  groups,
  gateways,
  devices,
  campaigns,
  messages,
  accounts,
  onNavigate,
}) => {
  const totalMessages = messages.length;
  const deliveredCount = messages.filter((m) => m.status === 'delivered').length;
  const sentOrDelivered = messages.filter(
    (m) => m.status === 'delivered' || m.status === 'sent'
  ).length;
  const failedCount = messages.filter((m) => m.status === 'failed').length;
  const deliveryRate =
    totalMessages > 0 ? ((sentOrDelivered / totalMessages) * 100).toFixed(1) : '0.0';
  const activeContacts = contacts.filter((c) => !c.optedOut).length;
  const defaultGateway = gateways.find((g) => g.isDefault) || gateways[0];
  const customerCount = accounts.filter((a) => a.role === 'customer').length;
  const salesCount = accounts.filter((a) => a.role === 'sales').length;
  const onlineDevices = devices.filter((d) => d.status === 'online').length;

  const getFeatureStat = (id: WorkspaceTab): string => {
    switch (id) {
      case 'overview':
        return 'Live summary';
      case 'composer':
        return `${groups.length} groups ready`;
      case 'contacts':
        return `${contacts.length} contacts`;
      case 'reports':
        return `${campaigns.length} campaigns`;
      case 'device':
        return onlineDevices > 0
          ? `${onlineDevices} phone online`
          : devices.length > 0
          ? `${devices.length} paired`
          : 'Pair phone or USB';
      case 'testing':
        return 'SMPP & GSM-7 check';
      case 'gateways':
        return `${gateways.length} active routes`;
      case 'integrations':
        return 'SMPP v3.4 + API';
      case 'accounts':
        return `${salesCount} sales · ${customerCount} clients`;
      case 'deploy':
        return '.exe & .apk kits';
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Welcome to RelaySMS
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Choose any tool below to send bulk text messages, organize contacts, pair a real phone for testing, or check delivery reports.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('device')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Smartphone className="h-3.5 w-3.5 text-blue-700" />
            Attach Real Device
          </button>
          <button
            type="button"
            onClick={() => onNavigate('testing')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <FlaskConical className="h-3.5 w-3.5 text-blue-700" />
            Quick Test SMS
          </button>
          <button
            type="button"
            onClick={() => onNavigate('composer')}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0"
          >
            <Send className="h-4 w-4" />
            Send Bulk SMS
          </button>
        </div>
      </div>

      {/* 4-column KPI strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Messages Dispatched</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {totalMessages.toLocaleString()}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {campaigns.length} campaigns · {failedCount} failed
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Delivery Success Rate</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {deliveryRate}%
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {deliveredCount.toLocaleString()} confirmed delivered
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Contacts &amp; Real Devices</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {activeContacts.toLocaleString()}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {groups.length} groups · {onlineDevices}/{devices.length} devices online
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Default Sending Route</div>
          <div className="mt-2 truncate font-display text-lg font-semibold text-slate-900">
            {defaultGateway ? defaultGateway.name : 'Unconfigured'}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {defaultGateway
              ? `${defaultGateway.type.toUpperCase()} · ${gateways.length} routes ready`
              : 'Add a provider'}
          </div>
        </div>
      </div>

      {/* Tabular Feature Icon Hub */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-1 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              All Features Directory
            </h2>
            <p className="text-xs text-slate-500">
              Click any feature tile to open it right away.
            </p>
          </div>
          <span className="font-mono text-xs text-slate-400">
            {FEATURE_CATALOG.length} tools included
          </span>
        </div>

        <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x lg:grid-cols-5">
          {FEATURE_CATALOG.map((feat) => {
            const Icon = feat.icon;
            return (
              <button
                key={feat.id}
                type="button"
                onClick={() => onNavigate(feat.id)}
                className="group flex flex-col justify-between p-4 text-left transition-colors hover:bg-blue-50/40"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-blue-700 transition-colors group-hover:border-blue-200 group-hover:bg-blue-700 group-hover:text-white">
                      <Icon className="h-4 w-4" />
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-700" />
                  </div>
                  <div className="mt-3 font-display text-sm font-semibold text-slate-900 group-hover:text-blue-800">
                    {feat.label}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {feat.description}
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-100 font-mono text-[11px] font-medium text-slate-600 tabular-nums">
                  {getFeatureStat(feat.id)}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Main split: Recent Campaigns + Groups & Real Device Quick Card */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Recent SMS Activity
              </h2>
              <p className="text-xs text-slate-500">
                Click any row to open detailed delivery status reports.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap"
            >
              All reports
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {campaigns.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-900">No messages sent yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Send your first bulk message or run a test on a real phone.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('composer')}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800"
              >
                Send First Bulk SMS
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="px-5 py-3">Campaign</th>
                    <th className="px-4 py-3">Route</th>
                    <th className="px-4 py-3 text-right">Recipients</th>
                    <th className="px-4 py-3 text-right">Delivered</th>
                    <th className="px-4 py-3 text-right">Failed</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {campaigns.slice(0, 6).map((cmp) => (
                    <tr
                      key={cmp.id}
                      onClick={() => onNavigate('reports', { campaignId: cmp.id })}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-900">{cmp.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
                          {new Date(cmp.createdAt).toLocaleString()} · {cmp.totalSegments} segs
                          {cmp.accountName ? ` · ${cmp.accountName}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">{cmp.gatewayName}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-slate-800 tabular-nums">
                        {cmp.totalRecipients}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-emerald-700 tabular-nums">
                        {cmp.deliveredCount + cmp.sentCount}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-red-700 tabular-nums">
                        {cmp.failedCount}
                      </td>
                      <td className="px-5 py-3.5">
                        <CampaignStatusText status={cmp.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right column: Groups & Real Device Quick Card */}
        <aside className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Real SMS Devices
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('device')}
                className="text-xs font-medium text-blue-700 hover:text-blue-800"
              >
                Pair Device
              </button>
            </div>
            {devices.length === 0 ? (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-slate-600">
                  No phone or USB GSM modem attached yet. Pair your phone with a QR code to send real SIM test messages.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('device')}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800 hover:bg-blue-100"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Attach Real Phone Now
                </button>
              </div>
            ) : (
              <div className="mt-3 divide-y divide-slate-200">
                {devices.slice(0, 3).map((dev) => (
                  <div key={dev.id} className="flex items-center justify-between py-2.5 text-xs">
                    <div className="min-w-0 pr-2">
                      <div className="truncate font-medium text-slate-900">{dev.name}</div>
                      <div className="font-mono text-slate-500">
                        Code {dev.pairingCode} · {dev.messagesRelayed} sent
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 font-medium ${
                        dev.status === 'online'
                          ? 'text-emerald-700'
                          : dev.status === 'waiting'
                          ? 'text-amber-700'
                          : 'text-slate-500'
                      }`}
                    >
                      <Wifi className="h-3 w-3" />
                      {dev.status === 'online'
                        ? 'Online'
                        : dev.status === 'waiting'
                        ? 'Waiting'
                        : 'Offline'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Quick Send to Group
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('contacts')}
                className="text-xs font-medium text-blue-700 hover:text-blue-800"
              >
                All Contacts
              </button>
            </div>
            <div className="mt-4 divide-y divide-slate-200">
              {groups.slice(0, 3).map((grp) => {
                const memberCount = contacts.filter(
                  (c) => c.groupIds.includes(grp.id) && !c.optedOut
                ).length;
                return (
                  <div key={grp.id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0 pr-3">
                      <div className="truncate text-sm font-medium text-slate-900">{grp.name}</div>
                      <div className="truncate text-xs text-slate-500 tabular-nums">
                        {memberCount} active people
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('composer', { groupId: grp.id })}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      <Users className="h-3 w-3" />
                      Send
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
