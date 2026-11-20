import React from 'react';
import {
  BarChart3,
  FlaskConical,
  Laptop,
  LayoutDashboard,
  PlugZap,
  Radio,
  Send,
  Smartphone,
  Users,
  Wallet,
} from 'lucide-react';
import type { WorkspaceTab } from './OverviewView';

export interface FeatureTabMeta {
  id: WorkspaceTab;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeText?: string;
}

interface FeatureTabBarProps {
  activeTab: WorkspaceTab;
  onSelect: (tab: WorkspaceTab) => void;
  counts: {
    contacts: number;
    campaigns: number;
    devicesOnline: number;
    devicesTotal: number;
    gateways: number;
    accounts: number;
  };
}

export const FEATURE_CATALOG: Array<{
  id: WorkspaceTab;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'overview',
    label: 'Home Overview',
    shortLabel: 'Home',
    description: 'Live stats, quick shortcuts, and recent campaigns.',
    icon: LayoutDashboard,
  },
  {
    id: 'composer',
    label: 'Send Bulk SMS',
    shortLabel: 'Send SMS',
    description: 'Write personalized messages and send to whole groups.',
    icon: Send,
  },
  {
    id: 'contacts',
    label: 'Contacts & Groups',
    shortLabel: 'Contacts',
    description: 'Organize phone books, CSV imports, and subscriber lists.',
    icon: Users,
  },
  {
    id: 'reports',
    label: 'Delivery Reports',
    shortLabel: 'Reports',
    description: 'Track delivered, queued, and failed SMS with CSV export.',
    icon: BarChart3,
  },
  {
    id: 'device',
    label: 'Attach Real Device',
    shortLabel: 'Real Device',
    description: 'Pair your Android phone (QR) or USB GSM modem for live tests.',
    icon: Smartphone,
  },
  {
    id: 'testing',
    label: 'SMS Testing Lab',
    shortLabel: 'SMS Test',
    description: 'Check encoding, segment length, and SMPP handshake traces.',
    icon: FlaskConical,
  },
  {
    id: 'gateways',
    label: 'Gateways & SMPP',
    shortLabel: 'Gateways',
    description: 'Configure SMPP trunks, Twilio, Vonage, or HTTP endpoints.',
    icon: Radio,
  },
  {
    id: 'integrations',
    label: 'API & Webhooks',
    shortLabel: 'SMPP & API',
    description: 'Connect external bulk SMS software via REST API or SMPP.',
    icon: PlugZap,
  },
  {
    id: 'accounts',
    label: 'Sales & Customers',
    shortLabel: 'Accounts',
    description: 'Manage reseller commissions, customer balances, and rates.',
    icon: Wallet,
  },
  {
    id: 'deploy',
    label: 'Install App (.exe/.apk)',
    shortLabel: 'Install App',
    description: 'Download Windows desktop (.exe) and Android (.apk) kits.',
    icon: Laptop,
  },
];

export const FeatureTabBar: React.FC<FeatureTabBarProps> = ({
  activeTab,
  onSelect,
  counts,
}) => {
  const getStatText = (id: WorkspaceTab): string => {
    switch (id) {
      case 'contacts':
        return `${counts.contacts} saved`;
      case 'reports':
        return `${counts.campaigns} runs`;
      case 'device':
        return counts.devicesOnline > 0
          ? `${counts.devicesOnline} online`
          : counts.devicesTotal > 0
          ? `${counts.devicesTotal} paired`
          : 'Attach SIM';
      case 'gateways':
        return `${counts.gateways} routes`;
      case 'accounts':
        return `${counts.accounts} users`;
      default:
        return '';
    }
  };

  return (
    <div className="border-b border-slate-200 bg-white">
      <div
        role="tablist"
        aria-label="Feature navigation tabs"
        className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-slate-200 sm:grid-cols-5 lg:grid-cols-10 lg:divide-y-0"
      >
        {FEATURE_CATALOG.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          const stat = getStatText(item.id);
          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => onSelect(item.id)}
              title={item.description}
              className={`group relative flex flex-col items-center justify-center gap-1.5 px-2 py-2.5 text-center transition-colors focus:outline-none ${
                active
                  ? 'bg-blue-50/70 text-blue-800'
                  : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-700"
                />
              )}
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                  active
                    ? 'border-blue-200 bg-blue-700 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-600 group-hover:border-slate-300 group-hover:bg-white group-hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-[11px] font-semibold leading-tight tracking-tight whitespace-nowrap">
                {item.shortLabel}
              </span>
              {stat ? (
                <span
                  className={`font-mono text-[10px] leading-none tabular-nums ${
                    item.id === 'device' && counts.devicesOnline > 0
                      ? 'text-emerald-700 font-medium'
                      : active
                      ? 'text-blue-700'
                      : 'text-slate-400'
                  }`}
                >
                  {stat}
                </span>
              ) : (
                <span className="text-[10px] leading-none text-transparent select-none">·</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
