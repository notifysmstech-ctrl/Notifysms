import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  FlaskConical,
  Laptop,
  LayoutDashboard,
  Menu,
  PlugZap,
  Radio,
  Send,
  Smartphone,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { AccountsView } from './components/AccountsView';
import { BulkComposerView } from './components/BulkComposerView';
import { ContactsGroupsView } from './components/ContactsGroupsView';
import { DeliveryReportsView } from './components/DeliveryReportsView';
import { DeployView } from './components/DeployView';
import { FeatureTabBar } from './components/FeatureTabBar';
import { GatewaysView, type MaskedGateway } from './components/GatewaysView';
import { IntegrationsView } from './components/IntegrationsView';
import { MobileDeviceCompanion } from './components/MobileDeviceCompanion';
import { OfflineIndicator } from './components/OfflineIndicator';
import { OverviewView, type WorkspaceTab } from './components/OverviewView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { RealDeviceView } from './components/RealDeviceView';
import { TestingLabView } from './components/TestingLabView';
import type {
  Account,
  Campaign,
  Contact,
  ContactGroup,
  CreditTransaction,
  MessageLog,
  SmsDevice,
} from './types/sms';

interface DashboardData {
  contacts: Contact[];
  groups: ContactGroup[];
  gateways: MaskedGateway[];
  devices: SmsDevice[];
  campaigns: Campaign[];
  messages: MessageLog[];
  accounts: Account[];
  transactions: CreditTransaction[];
}

const NAV_ITEMS: Array<{
  id: WorkspaceTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Home Overview', icon: LayoutDashboard },
  { id: 'composer', label: 'Send Bulk SMS', icon: Send },
  { id: 'contacts', label: 'Contacts & Groups', icon: Users },
  { id: 'reports', label: 'Delivery Reports', icon: BarChart3 },
  { id: 'device', label: 'Real SMS Device', icon: Smartphone },
  { id: 'testing', label: 'SMS Testing Lab', icon: FlaskConical },
  { id: 'gateways', label: 'Gateways & SMPP', icon: Radio },
  { id: 'integrations', label: 'API & Webhooks', icon: PlugZap },
  { id: 'accounts', label: 'Sales & Customers', icon: Wallet },
  { id: 'deploy', label: 'Install (.exe / .apk)', icon: Laptop },
];

export default function App() {
  const [pairCode, setPairCode] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('devicePair');
  });

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [focusedGroupId, setFocusedGroupId] = useState<string | undefined>(undefined);
  const [focusedCampaignId, setFocusedCampaignId] = useState<string | undefined>(undefined);
  const [activeAccountId, setActiveAccountId] = useState<string>('acc_admin');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [data, setData] = useState<DashboardData>({
    contacts: [],
    groups: [],
    gateways: [],
    devices: [],
    campaigns: [],
    messages: [],
    accounts: [],
    transactions: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const resp = await fetch('/api/dashboard');
      if (!resp.ok) throw new Error(`Server returned HTTP ${resp.status}`);
      const json = (await resp.json()) as DashboardData;
      setData({
        ...json,
        devices: Array.isArray(json.devices) ? json.devices : [],
      });
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to reach RelaySMS server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pairCode) return;
    void fetchDashboard();
  }, [fetchDashboard, pairCode]);

  useEffect(() => {
    if (pairCode) return;
    const hasActiveQueue = data.campaigns.some(
      (c) => c.status === 'running' || c.status === 'queued'
    );
    const shouldPollDevices = activeTab === 'device' || data.devices.length > 0;
    if (!hasActiveQueue && !shouldPollDevices) return;

    const intervalMs = hasActiveQueue || activeTab === 'device' ? 2000 : 6000;
    const timer = setInterval(() => {
      void fetchDashboard();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [data.campaigns, data.devices.length, activeTab, fetchDashboard, pairCode]);

  if (pairCode) {
    return (
      <MobileDeviceCompanion
        pairCode={pairCode}
        onExitBridge={() => {
          const url = new URL(window.location.href);
          url.searchParams.delete('devicePair');
          window.history.replaceState({}, '', url.pathname + url.search);
          setPairCode(null);
          void fetchDashboard();
        }}
      />
    );
  }

  const handleNavigate = (
    tab: WorkspaceTab,
    options?: { campaignId?: string; groupId?: string }
  ) => {
    setFocusedGroupId(options?.groupId);
    setFocusedCampaignId(options?.campaignId);
    setActiveTab(tab);
    setMobileNavOpen(false);
  };

  const currentNav = NAV_ITEMS.find((n) => n.id === activeTab);
  const activeAccount =
    data.accounts.find((a) => a.id === activeAccountId) || data.accounts[0];
  const devicesOnline = data.devices.filter((d) => d.status === 'online').length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar (240px) */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5">
          <img src="/icon.svg" alt="RelaySMS" className="h-7 w-7 rounded-md shrink-0" />
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            RelaySMS
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="Workspace navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${active ? 'text-blue-700' : 'text-slate-400'}`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.id === 'device' && devicesOnline > 0 && (
                  <span className="font-mono text-[11px] font-medium text-emerald-700 tabular-nums">
                    {devicesOnline}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Active Account Context Switcher */}
        <div className="border-t border-slate-200 p-3.5 space-y-2">
          <div className="text-xs font-medium text-slate-500">Sending As Account</div>
          <select
            value={activeAccount?.id || ''}
            onChange={(e) => setActiveAccountId(e.target.value)}
            aria-label="Active account context"
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-700 focus:outline-none"
          >
            {data.accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({acc.role.toUpperCase()})
              </option>
            ))}
          </select>
          {activeAccount && (
            <div className="flex items-center justify-between text-xs text-slate-500 tabular-nums">
              <span className="uppercase font-mono">{activeAccount.role}</span>
              <span className="font-mono font-medium text-slate-800">
                ${activeAccount.creditsBalance.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Drawer Navigation */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative flex w-64 max-w-[80vw] flex-col border-r border-slate-200 bg-white">
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
              <div className="flex items-center gap-2.5">
                <img src="/icon.svg" alt="RelaySMS" className="h-7 w-7 rounded-md" />
                <span className="font-display text-base font-bold text-slate-900">RelaySMS</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation menu"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigate(item.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      active
                        ? 'bg-blue-50 text-blue-800'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex flex-1 flex-col lg:pl-60 min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-500 truncate">
              <span className="font-medium text-slate-900 lg:hidden">RelaySMS</span>
              <span className="hidden lg:inline">RelaySMS</span>
              <span aria-hidden="true">/</span>
              <span className="font-medium text-slate-900 truncate">
                {currentNav?.label || 'Home Overview'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton onOpenDeploy={() => handleNavigate('deploy')} />
            {activeTab !== 'composer' && (
              <button
                type="button"
                onClick={() => handleNavigate('composer')}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
                Send Bulk SMS
              </button>
            )}
          </div>
        </header>

        {/* Tabular Icon Feature Bar for One-Click Navigation */}
        <FeatureTabBar
          activeTab={activeTab}
          onSelect={(tab) => handleNavigate(tab)}
          counts={{
            contacts: data.contacts.length,
            campaigns: data.campaigns.length,
            devicesOnline,
            devicesTotal: data.devices.length,
            gateways: data.gateways.length,
            accounts: data.accounts.length,
          }}
        />

        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8 max-w-7xl w-full mx-auto">
          {loading ? (
            <div className="space-y-4">
              <div className="h-8 w-64 animate-pulse rounded-md bg-slate-200" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white"
                  />
                ))}
              </div>
              <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-red-200 bg-white p-6 text-center">
              <p className="text-sm font-medium text-red-800">{loadError}</p>
              <button
                type="button"
                onClick={() => void fetchDashboard()}
                className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                Retry Connection
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewView
                  contacts={data.contacts}
                  groups={data.groups}
                  gateways={data.gateways}
                  devices={data.devices}
                  campaigns={data.campaigns}
                  messages={data.messages}
                  accounts={data.accounts}
                  onNavigate={handleNavigate}
                />
              )}

              {activeTab === 'composer' && (
                <BulkComposerView
                  contacts={data.contacts}
                  groups={data.groups}
                  gateways={data.gateways}
                  accounts={data.accounts}
                  activeAccountId={activeAccountId}
                  initialGroupId={focusedGroupId}
                  onDispatched={async (cmp) => {
                    await fetchDashboard();
                    handleNavigate('reports', { campaignId: cmp.id });
                  }}
                  onOpenGateways={() => handleNavigate('gateways')}
                  onOpenRealDevice={() => handleNavigate('device')}
                />
              )}

              {activeTab === 'contacts' && (
                <ContactsGroupsView
                  contacts={data.contacts}
                  groups={data.groups}
                  onRefresh={fetchDashboard}
                  onComposeToGroup={(gid) => handleNavigate('composer', { groupId: gid })}
                />
              )}

              {activeTab === 'reports' && (
                <DeliveryReportsView
                  campaigns={data.campaigns}
                  messages={data.messages}
                  initialCampaignId={focusedCampaignId}
                  onRefresh={fetchDashboard}
                />
              )}

              {activeTab === 'device' && (
                <RealDeviceView
                  devices={data.devices}
                  messages={data.messages}
                  accounts={data.accounts}
                  activeAccountId={activeAccountId}
                  onRefresh={fetchDashboard}
                  onOpenReports={(cid) => handleNavigate('reports', { campaignId: cid })}
                />
              )}

              {activeTab === 'gateways' && (
                <GatewaysView gateways={data.gateways} onRefresh={fetchDashboard} />
              )}

              {activeTab === 'testing' && (
                <TestingLabView
                  gateways={data.gateways}
                  devices={data.devices}
                  accounts={data.accounts}
                  activeAccountId={activeAccountId}
                  onRefresh={fetchDashboard}
                  onOpenRealDevice={() => handleNavigate('device')}
                />
              )}

              {activeTab === 'integrations' && (
                <IntegrationsView accounts={data.accounts} onRefresh={fetchDashboard} />
              )}

              {activeTab === 'accounts' && (
                <AccountsView
                  accounts={data.accounts}
                  transactions={data.transactions}
                  gateways={data.gateways}
                  activeAccountId={activeAccountId}
                  onSelectActiveAccount={setActiveAccountId}
                  onRefresh={fetchDashboard}
                />
              )}

              {activeTab === 'deploy' && <DeployView />}
            </>
          )}
        </main>
      </div>

      <OfflineIndicator />
    </div>
  );
}
