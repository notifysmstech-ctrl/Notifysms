import { normalizeInternationalPhone } from '../utils/countryNetworks.ts';

export type GatewayType =
  | 'sandbox'
  | 'device'
  | 'smpp'
  | 'twilio'
  | 'vonage'
  | 'textbelt'
  | 'custom_http';

export type SmsDeviceKind = 'android_bridge' | 'usb_gsm';
export type SmsDeviceStatus = 'waiting' | 'online' | 'offline';

export interface SmsDevice {
  id: string;
  name: string;
  kind: SmsDeviceKind;
  pairingCode: string;
  phoneNumber: string;
  carrierName?: string;
  signalText?: string;
  status: SmsDeviceStatus;
  gatewayId: string;
  lastSeenAt?: string;
  messagesRelayed: number;
  createdAt: string;
}

export type DeliveryStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'opted_out';

export type AccountRole = 'admin' | 'sales' | 'customer';

export interface Account {
  id: string;
  role: AccountRole;
  name: string;
  email: string;
  company: string;
  phone: string;
  status: 'active' | 'suspended';
  apiKey: string;
  creditsBalance: number;
  ratePerSegment: number;
  commissionRatePct?: number; // For sales accounts
  assignedSalesId?: string; // For customer accounts linked to a sales rep
  defaultGatewayId?: string;
  totalMessagesSent: number;
  totalSegmentsBilled: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreditTransaction {
  id: string;
  accountId: string;
  accountName: string;
  type: 'topup' | 'sms_debit' | 'adjustment';
  amount: number;
  balanceAfter: number;
  description: string;
  salesAccountId?: string;
  commissionAmount?: number;
  createdAt: string;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  company: string;
  email: string;
  notes: string;
  groupIds: string[];
  optedOut: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContactGroup {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface GatewayConfig {
  id: string;
  name: string;
  type: GatewayType;
  isDefault: boolean;
  senderId: string;
  deviceId?: string;
  // Twilio
  accountSid?: string;
  authToken?: string;
  // Vonage / Textbelt
  apiKey?: string;
  apiSecret?: string;
  // Custom HTTP
  webhookUrl?: string;
  customHeadersJson?: string;
  customBodyTemplate?: string;
  // SMPP v3.4
  smppHost?: string;
  smppPort?: number;
  smppSystemId?: string;
  smppPassword?: string;
  smppSystemType?: string;
  smppBindMode?: 'transceiver' | 'transmitter';
  smppSourceTon?: number;
  smppSourceNpi?: number;
  smppDestTon?: number;
  smppDestNpi?: number;
  smppUseTls?: boolean;
  rateLimitPerSec: number;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  accountId?: string;
  accountName?: string;
  gatewayId: string;
  gatewayName: string;
  gatewayType: GatewayType;
  senderId: string;
  messageTemplate: string;
  targetGroupIds: string[];
  totalRecipients: number;
  queuedCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  optedOutCount: number;
  totalSegments: number;
  totalCost?: number;
  rateLimitPerSec: number;
  status: 'queued' | 'running' | 'completed' | 'partial_failure';
  createdAt: string;
  completedAt?: string;
}

export interface MessageLog {
  id: string;
  campaignId: string;
  campaignName: string;
  accountId?: string;
  accountName?: string;
  contactId?: string;
  recipientName: string;
  phone: string;
  countryIso?: string;
  countryName?: string;
  carrierHint?: string;
  renderedBody: string;
  encoding: 'GSM-7' | 'UCS-2';
  segments: number;
  cost?: number;
  gatewayId: string;
  gatewayType: GatewayType;
  providerMessageId?: string;
  status: DeliveryStatus;
  errorCode?: string;
  errorMessage?: string;
  latencyMs?: number;
  protocolTrace?: string;
  queuedAt: string;
  sentAt?: string;
  deliveredAt?: string;
}

export interface SmsSegmentInfo {
  encoding: 'GSM-7' | 'UCS-2';
  characterCount: number;
  septetsOrUnits: number;
  segments: number;
  perSegmentLimit: number;
  remainingInSegment: number;
}

const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1BÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENDED = '^{}\\[~]|€';

export function calculateSmsSegments(text: string): SmsSegmentInfo {
  if (!text) {
    return {
      encoding: 'GSM-7',
      characterCount: 0,
      septetsOrUnits: 0,
      segments: 1,
      perSegmentLimit: 160,
      remainingInSegment: 160,
    };
  }

  let isGsm7 = true;
  let septets = 0;

  for (const ch of text) {
    if (GSM7_BASIC.includes(ch)) {
      septets += 1;
    } else if (GSM7_EXTENDED.includes(ch)) {
      septets += 2;
    } else {
      isGsm7 = false;
      break;
    }
  }

  if (isGsm7) {
    if (septets <= 160) {
      return {
        encoding: 'GSM-7',
        characterCount: text.length,
        septetsOrUnits: septets,
        segments: 1,
        perSegmentLimit: 160,
        remainingInSegment: 160 - septets,
      };
    }
    const segments = Math.ceil(septets / 153);
    return {
      encoding: 'GSM-7',
      characterCount: text.length,
      septetsOrUnits: septets,
      segments,
      perSegmentLimit: 153,
      remainingInSegment: segments * 153 - septets,
    };
  }

  const units = text.length;
  if (units <= 70) {
    return {
      encoding: 'UCS-2',
      characterCount: text.length,
      septetsOrUnits: units,
      segments: 1,
      perSegmentLimit: 70,
      remainingInSegment: 70 - units,
    };
  }
  const segments = Math.ceil(units / 67);
  return {
    encoding: 'UCS-2',
    characterCount: text.length,
    septetsOrUnits: units,
    segments,
    perSegmentLimit: 67,
    remainingInSegment: segments * 67 - units,
  };
}

export function normalizePhone(
  raw: string,
  defaultDialCode?: string
): { valid: boolean; e164: string; reason?: string } {
  const res = normalizeInternationalPhone(raw, defaultDialCode);
  return { valid: res.valid, e164: res.e164, reason: res.reason };
}

export function interpolateMessage(
  template: string,
  contact: Partial<Pick<Contact, 'firstName' | 'lastName' | 'company' | 'phone' | 'email'>>
): string {
  const firstName = contact.firstName?.trim() || 'Customer';
  const lastName = contact.lastName?.trim() || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  return template
    .replace(/\{\{\s*firstName\s*\}\}/gi, firstName)
    .replace(/\{\{\s*lastName\s*\}\}/gi, lastName)
    .replace(/\{\{\s*name\s*\}\}/gi, fullName)
    .replace(/\{\{\s*company\s*\}\}/gi, contact.company?.trim() || '')
    .replace(/\{\{\s*phone\s*\}\}/gi, contact.phone?.trim() || '')
    .replace(/\{\{\s*email\s*\}\}/gi, contact.email?.trim() || '');
}
