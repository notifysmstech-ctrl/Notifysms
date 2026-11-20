import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  Account,
  Campaign,
  Contact,
  ContactGroup,
  CreditTransaction,
  GatewayConfig,
  MessageLog,
  SmsDevice,
} from '../src/types/sms.ts';

export interface DatabaseState {
  contacts: Contact[];
  groups: ContactGroup[];
  gateways: GatewayConfig[];
  devices: SmsDevice[];
  campaigns: Campaign[];
  messages: MessageLog[];
  accounts: Account[];
  transactions: CreditTransaction[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'relaysms-db.json');

export function generateApiKey(): string {
  return `rly_live_${crypto.randomBytes(16).toString('hex')}`;
}

function createSeedAccounts(): { accounts: Account[]; transactions: CreditTransaction[] } {
  const now = new Date().toISOString();
  const earlier = new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString();

  const accounts: Account[] = [
    {
      id: 'acc_admin',
      role: 'admin',
      name: 'Platform Administrator',
      email: 'admin@relaysms.local',
      company: 'RelaySMS Core',
      phone: '+15550100001',
      status: 'active',
      apiKey: 'rly_live_admin_9f24a108c47e12d390ab',
      creditsBalance: 10000,
      ratePerSegment: 0.01,
      totalMessagesSent: 3,
      totalSegmentsBilled: 3,
      createdAt: earlier,
      updatedAt: now,
    },
    {
      id: 'acc_sales_1',
      role: 'sales',
      name: 'Sarah Jenkins',
      email: 'sarah.jenkins@relaysms.local',
      company: 'RelaySMS Enterprise Sales',
      phone: '+15550100110',
      status: 'active',
      apiKey: 'rly_live_sales_4a8b1290e53d44c811f2',
      creditsBalance: 2500,
      ratePerSegment: 0.012,
      commissionRatePct: 12,
      totalMessagesSent: 0,
      totalSegmentsBilled: 0,
      createdAt: earlier,
      updatedAt: now,
    },
    {
      id: 'acc_sales_2',
      role: 'sales',
      name: 'Omar Farooq',
      email: 'omar.farooq@relaysms.local',
      company: 'RelaySMS Carrier Channels',
      phone: '+15550100115',
      status: 'active',
      apiKey: 'rly_live_sales_7c19f302b61a99e420c8',
      creditsBalance: 1500,
      ratePerSegment: 0.012,
      commissionRatePct: 10,
      totalMessagesSent: 0,
      totalSegmentsBilled: 0,
      createdAt: earlier,
      updatedAt: now,
    },
    {
      id: 'acc_cust_1',
      role: 'customer',
      name: 'Northwind Logistics Billing',
      email: 'dispatch@northwind.example.com',
      company: 'Northwind Logistics',
      phone: '+15550104101',
      status: 'active',
      apiKey: 'rly_live_cust_61d4e890a23f77b512e9',
      creditsBalance: 250.0,
      ratePerSegment: 0.018,
      assignedSalesId: 'acc_sales_1',
      defaultGatewayId: 'gw_sandbox',
      totalMessagesSent: 3,
      totalSegmentsBilled: 3,
      createdAt: earlier,
      updatedAt: now,
    },
    {
      id: 'acc_cust_2',
      role: 'customer',
      name: 'Harbor Medical Alerts',
      email: 'ops@harbormedical.example.com',
      company: 'Harbor Medical Supply',
      phone: '+15550104103',
      status: 'active',
      apiKey: 'rly_live_cust_88a3c114d90e31f245b7',
      creditsBalance: 120.0,
      ratePerSegment: 0.02,
      assignedSalesId: 'acc_sales_2',
      defaultGatewayId: 'gw_smpp_local',
      totalMessagesSent: 0,
      totalSegmentsBilled: 0,
      createdAt: earlier,
      updatedAt: now,
    },
  ];

  const transactions: CreditTransaction[] = [
    {
      id: 'txn_seed_1',
      accountId: 'acc_cust_1',
      accountName: 'Northwind Logistics Billing',
      type: 'topup',
      amount: 250.0,
      balanceAfter: 250.0,
      description: 'Initial prepaid SMS credit allocation',
      salesAccountId: 'acc_sales_1',
      commissionAmount: 30.0,
      createdAt: earlier,
    },
    {
      id: 'txn_seed_2',
      accountId: 'acc_cust_2',
      accountName: 'Harbor Medical Alerts',
      type: 'topup',
      amount: 120.0,
      balanceAfter: 120.0,
      description: 'Initial prepaid SMS credit allocation',
      salesAccountId: 'acc_sales_2',
      commissionAmount: 12.0,
      createdAt: earlier,
    },
  ];

  return { accounts, transactions };
}

function createSeedGateways(): GatewayConfig[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'gw_sandbox',
      name: 'Local Sandbox Loopback',
      type: 'sandbox',
      isDefault: true,
      senderId: 'RelaySMS',
      rateLimitPerSec: 15,
      updatedAt: now,
    },
    {
      id: 'gw_smpp_local',
      name: 'Local SMPP v3.4 Test SMSC',
      type: 'smpp',
      isDefault: false,
      senderId: 'RelaySMS',
      smppHost: '127.0.0.1',
      smppPort: 2775,
      smppSystemId: 'relaysms_test',
      smppPassword: 'relaysms_pass',
      smppSystemType: 'SMPP',
      smppBindMode: 'transceiver',
      smppSourceTon: 5,
      smppSourceNpi: 0,
      smppDestTon: 1,
      smppDestNpi: 1,
      smppUseTls: false,
      rateLimitPerSec: 20,
      updatedAt: now,
    },
  ];
}

function createSeedState(): DatabaseState {
  const earlier = new Date(Date.now() - 1000 * 60 * 42).toISOString();
  const earlierSent = new Date(Date.now() - 1000 * 60 * 41).toISOString();
  const earlierDelivered = new Date(Date.now() - 1000 * 60 * 40).toISOString();

  const groupOpsId = 'grp_operations';
  const groupVipId = 'grp_vip_clients';
  const groupDispatchId = 'grp_field_dispatch';

  const groups: ContactGroup[] = [
    {
      id: groupOpsId,
      name: 'Operations Alerts',
      description: 'On-call regional supervisors and fulfillment coordinators.',
      createdAt: earlier,
    },
    {
      id: groupVipId,
      name: 'Priority Accounts',
      description: 'Opted-in enterprise clients subscribed to order & SLA notices.',
      createdAt: earlier,
    },
    {
      id: groupDispatchId,
      name: 'Field Dispatch',
      description: 'Fleet drivers and regional route technicians.',
      createdAt: earlier,
    },
  ];

  const contacts: Contact[] = [
    {
      id: 'cnt_01',
      firstName: 'Elena',
      lastName: 'Vance',
      phone: '+15550104101',
      company: 'Northwind Logistics',
      email: 'elena.vance@example.com',
      notes: 'West hub lead',
      groupIds: [groupOpsId, groupVipId],
      optedOut: false,
      createdAt: earlier,
      updatedAt: earlier,
    },
    {
      id: 'cnt_02',
      firstName: 'Marcus',
      lastName: 'Chen',
      phone: '+15550104102',
      company: 'Kestrel Freight',
      email: 'm.chen@example.com',
      notes: 'Primary dispatch contact',
      groupIds: [groupOpsId, groupDispatchId],
      optedOut: false,
      createdAt: earlier,
      updatedAt: earlier,
    },
    {
      id: 'cnt_03',
      firstName: 'Priya',
      lastName: 'Nair',
      phone: '+15550104103',
      company: 'Harbor Medical Supply',
      email: 'pnair@example.com',
      notes: 'Cold-chain priority account',
      groupIds: [groupVipId],
      optedOut: false,
      createdAt: earlier,
      updatedAt: earlier,
    },
    {
      id: 'cnt_04',
      firstName: 'David',
      lastName: 'Kowalski',
      phone: '+15550104104',
      company: 'Summit Fleet',
      email: 'dkowalski@example.com',
      notes: 'Night shift route coordinator',
      groupIds: [groupDispatchId],
      optedOut: false,
      createdAt: earlier,
      updatedAt: earlier,
    },
    {
      id: 'cnt_05',
      firstName: 'Hannah',
      lastName: 'Alvarez',
      phone: '+15550104105',
      company: 'Beacon Retail Group',
      email: 'halvarez@example.com',
      notes: 'Requested SMS pause during Q4 audit',
      groupIds: [groupVipId],
      optedOut: true,
      createdAt: earlier,
      updatedAt: earlier,
    },
    {
      id: 'cnt_06',
      firstName: 'Samuel',
      lastName: 'Okafor',
      phone: '+15550104106',
      company: 'Metro Cold Storage',
      email: 's.okafor@example.com',
      notes: 'Dock 4 supervisor',
      groupIds: [groupOpsId, groupDispatchId],
      optedOut: false,
      createdAt: earlier,
      updatedAt: earlier,
    },
  ];

  const gateways = createSeedGateways();
  const { accounts, transactions } = createSeedAccounts();

  const campaignId = 'cmp_initial_sla';
  const campaigns: Campaign[] = [
    {
      id: campaignId,
      name: 'Morning Hub Readiness Notice',
      accountId: 'acc_cust_1',
      accountName: 'Northwind Logistics Billing',
      gatewayId: 'gw_sandbox',
      gatewayName: 'Local Sandbox Loopback',
      gatewayType: 'sandbox',
      senderId: 'RelaySMS',
      messageTemplate:
        'Hi {{firstName}}, Hub Dock A opens at 06:30 for {{company}} manifest check-in. Reply STOP to opt out.',
      targetGroupIds: [groupOpsId],
      totalRecipients: 3,
      queuedCount: 0,
      sentCount: 0,
      deliveredCount: 3,
      failedCount: 0,
      optedOutCount: 0,
      totalSegments: 3,
      totalCost: 0.054,
      rateLimitPerSec: 15,
      status: 'completed',
      createdAt: earlier,
      completedAt: earlierDelivered,
    },
  ];

  const messages: MessageLog[] = [
    {
      id: 'msg_init_1',
      campaignId,
      campaignName: 'Morning Hub Readiness Notice',
      accountId: 'acc_cust_1',
      accountName: 'Northwind Logistics Billing',
      contactId: 'cnt_01',
      recipientName: 'Elena Vance',
      phone: '+15550104101',
      renderedBody:
        'Hi Elena, Hub Dock A opens at 06:30 for Northwind Logistics manifest check-in. Reply STOP to opt out.',
      encoding: 'GSM-7',
      segments: 1,
      cost: 0.018,
      gatewayId: 'gw_sandbox',
      gatewayType: 'sandbox',
      providerMessageId: 'sbx_8f12c901',
      status: 'delivered',
      latencyMs: 62,
      queuedAt: earlier,
      sentAt: earlierSent,
      deliveredAt: earlierDelivered,
    },
    {
      id: 'msg_init_2',
      campaignId,
      campaignName: 'Morning Hub Readiness Notice',
      accountId: 'acc_cust_1',
      accountName: 'Northwind Logistics Billing',
      contactId: 'cnt_02',
      recipientName: 'Marcus Chen',
      phone: '+15550104102',
      renderedBody:
        'Hi Marcus, Hub Dock A opens at 06:30 for Kestrel Freight manifest check-in. Reply STOP to opt out.',
      encoding: 'GSM-7',
      segments: 1,
      cost: 0.018,
      gatewayId: 'gw_sandbox',
      gatewayType: 'sandbox',
      providerMessageId: 'sbx_8f12c902',
      status: 'delivered',
      latencyMs: 64,
      queuedAt: earlier,
      sentAt: earlierSent,
      deliveredAt: earlierDelivered,
    },
    {
      id: 'msg_init_3',
      campaignId,
      campaignName: 'Morning Hub Readiness Notice',
      accountId: 'acc_cust_1',
      accountName: 'Northwind Logistics Billing',
      contactId: 'cnt_06',
      recipientName: 'Samuel Okafor',
      phone: '+15550104106',
      renderedBody:
        'Hi Samuel, Hub Dock A opens at 06:30 for Metro Cold Storage manifest check-in. Reply STOP to opt out.',
      encoding: 'GSM-7',
      segments: 1,
      cost: 0.018,
      gatewayId: 'gw_sandbox',
      gatewayType: 'sandbox',
      providerMessageId: 'sbx_8f12c903',
      status: 'delivered',
      latencyMs: 61,
      queuedAt: earlier,
      sentAt: earlierSent,
      deliveredAt: earlierDelivered,
    },
  ];

  return {
    contacts,
    groups,
    gateways,
    devices: [],
    campaigns,
    messages,
    accounts,
    transactions,
  };
}

class Store {
  private state: DatabaseState;

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw) as Partial<DatabaseState>;
        const seedAccounts = createSeedAccounts();
        const seedGateways = createSeedGateways();

        const gateways =
          Array.isArray(parsed.gateways) && parsed.gateways.length > 0
            ? parsed.gateways
            : seedGateways;

        // Ensure local SMPP test SMSC exists when upgrading older DB state
        if (!gateways.some((g) => g.type === 'smpp')) {
          gateways.push(seedGateways[1]);
        }

        this.state = {
          contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
          groups: Array.isArray(parsed.groups) ? parsed.groups : [],
          gateways,
          devices: Array.isArray(parsed.devices) ? parsed.devices : [],
          campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
          messages: Array.isArray(parsed.messages) ? parsed.messages : [],
          accounts:
            Array.isArray(parsed.accounts) && parsed.accounts.length > 0
              ? parsed.accounts
              : seedAccounts.accounts,
          transactions: Array.isArray(parsed.transactions)
            ? parsed.transactions
            : seedAccounts.transactions,
        };
        this.persist();
      } catch {
        this.state = createSeedState();
        this.persist();
      }
    } else {
      this.state = createSeedState();
      this.persist();
    }
  }

  private persist(): void {
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
  }

  public generateId(prefix: string): string {
    return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
  }

  public getState(): DatabaseState {
    return this.state;
  }

  public update(mutator: (state: DatabaseState) => void): void {
    mutator(this.state);
    this.persist();
  }

  public maskGateways(): Array<
    Omit<GatewayConfig, 'authToken' | 'apiSecret' | 'apiKey' | 'smppPassword'> & {
      hasAuthToken: boolean;
      hasApiSecret: boolean;
      hasApiKey: boolean;
      hasSmppPassword: boolean;
      authTokenPreview?: string;
      apiKeyPreview?: string;
    }
  > {
    return this.state.gateways.map((gw) => ({
      id: gw.id,
      name: gw.name,
      type: gw.type,
      isDefault: gw.isDefault,
      senderId: gw.senderId,
      deviceId: gw.deviceId,
      accountSid: gw.accountSid,
      webhookUrl: gw.webhookUrl,
      customHeadersJson: gw.customHeadersJson,
      customBodyTemplate: gw.customBodyTemplate,
      smppHost: gw.smppHost,
      smppPort: gw.smppPort,
      smppSystemId: gw.smppSystemId,
      smppSystemType: gw.smppSystemType,
      smppBindMode: gw.smppBindMode,
      smppSourceTon: gw.smppSourceTon,
      smppSourceNpi: gw.smppSourceNpi,
      smppDestTon: gw.smppDestTon,
      smppDestNpi: gw.smppDestNpi,
      smppUseTls: gw.smppUseTls,
      rateLimitPerSec: gw.rateLimitPerSec,
      updatedAt: gw.updatedAt,
      hasAuthToken: Boolean(gw.authToken),
      hasApiSecret: Boolean(gw.apiSecret),
      hasApiKey: Boolean(gw.apiKey),
      hasSmppPassword: Boolean(gw.smppPassword),
      authTokenPreview: gw.authToken ? `••••${gw.authToken.slice(-4)}` : undefined,
      apiKeyPreview: gw.apiKey ? `••••${gw.apiKey.slice(-4)}` : undefined,
    }));
  }
}

export const db = new Store();
