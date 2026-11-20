import type {
  Account,
  Campaign,
  Contact,
  DeliveryStatus,
  GatewayConfig,
  MessageLog,
} from '../src/types/sms.ts';
import {
  calculateSmsSegments,
  interpolateMessage,
  normalizePhone,
} from '../src/types/sms.ts';
import { detectCountryFromPhone } from '../src/utils/countryNetworks.ts';
import { sendSmppSubmitSm } from './smppClient.ts';
import { db } from './store.ts';

interface DispatchResult {
  ok: boolean;
  status: DeliveryStatus;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  latencyMs: number;
  protocolTrace?: string;
}

const activeQueues = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function recalculateCampaignStats(campaignId: string): void {
  db.update((state) => {
    const campaign = state.campaigns.find((c) => c.id === campaignId);
    if (!campaign) return;
    const logs = state.messages.filter((m) => m.campaignId === campaignId);
    let queued = 0;
    let sent = 0;
    let delivered = 0;
    let failed = 0;
    let optedOut = 0;
    let totalSegments = 0;
    let totalCost = 0;

    for (const m of logs) {
      totalSegments += m.segments;
      totalCost += m.cost || 0;
      if (m.status === 'queued' || m.status === 'sending') queued += 1;
      else if (m.status === 'sent') sent += 1;
      else if (m.status === 'delivered') delivered += 1;
      else if (m.status === 'failed') failed += 1;
      else if (m.status === 'opted_out') optedOut += 1;
    }

    campaign.totalRecipients = logs.length;
    campaign.queuedCount = queued;
    campaign.sentCount = sent;
    campaign.deliveredCount = delivered;
    campaign.failedCount = failed;
    campaign.optedOutCount = optedOut;
    campaign.totalSegments = totalSegments;
    campaign.totalCost = Number(totalCost.toFixed(4));

    if (queued > 0) {
      campaign.status = 'running';
    } else if (failed > 0 && delivered + sent > 0) {
      campaign.status = 'partial_failure';
      campaign.completedAt = campaign.completedAt || new Date().toISOString();
    } else if (failed === logs.length && logs.length > 0) {
      campaign.status = 'partial_failure';
      campaign.completedAt = campaign.completedAt || new Date().toISOString();
    } else {
      campaign.status = 'completed';
      campaign.completedAt = campaign.completedAt || new Date().toISOString();
    }
  });
}

export function debitAccountForMessage(
  accountId: string | undefined,
  segments: number,
  description: string
): number {
  if (!accountId) return 0;
  let cost = 0;
  db.update((st) => {
    const acc = st.accounts.find((a) => a.id === accountId);
    if (!acc) return;
    cost = Number((segments * (acc.ratePerSegment || 0.015)).toFixed(4));
    acc.totalMessagesSent += 1;
    acc.totalSegmentsBilled += segments;
    acc.creditsBalance = Number(Math.max(0, acc.creditsBalance - cost).toFixed(4));
    acc.updatedAt = new Date().toISOString();

    const salesAcc = acc.assignedSalesId
      ? st.accounts.find((s) => s.id === acc.assignedSalesId)
      : undefined;
    const commissionAmount =
      salesAcc && salesAcc.commissionRatePct
        ? Number(((cost * salesAcc.commissionRatePct) / 100).toFixed(4))
        : undefined;

    st.transactions.unshift({
      id: db.generateId('txn'),
      accountId: acc.id,
      accountName: acc.name,
      type: 'sms_debit',
      amount: -cost,
      balanceAfter: acc.creditsBalance,
      description,
      salesAccountId: salesAcc?.id,
      commissionAmount,
      createdAt: new Date().toISOString(),
    });
  });
  return cost;
}

function assertAccountCanDispatch(accountId: string | undefined, estimatedSegments: number): Account | undefined {
  if (!accountId) return undefined;
  const acc = db.getState().accounts.find((a) => a.id === accountId);
  if (!acc) {
    throw new Error('Selected account was not found.');
  }
  if (acc.status !== 'active') {
    throw new Error(`Account "${acc.name}" is currently suspended.`);
  }
  if (acc.role === 'customer') {
    const needed = estimatedSegments * (acc.ratePerSegment || 0.015);
    if (acc.creditsBalance < needed) {
      throw new Error(
        `Insufficient SMS credits for "${acc.name}". Required ~$${needed.toFixed(2)}, available $${acc.creditsBalance.toFixed(2)}.`
      );
    }
  }
  return acc;
}

export async function sendViaGateway(
  gateway: GatewayConfig,
  to: string,
  body: string,
  callbackBaseUrl?: string
): Promise<DispatchResult> {
  const start = Date.now();
  const segInfo = calculateSmsSegments(body);

  if (gateway.type === 'sandbox') {
    await sleep(55);
    const latencyMs = Date.now() - start;
    if (to.endsWith('0000')) {
      return {
        ok: false,
        status: 'failed',
        errorCode: 'SBX_UNREACHABLE',
        errorMessage: 'Simulated carrier rejection for test number ending in 0000',
        latencyMs,
        protocolTrace: `LOOPBACK -> TO:${to} -> REJECTED (0000 test rule)`,
      };
    }
    const id = db.generateId('sbx');
    const net = detectCountryFromPhone(to);
    const netTag = net ? `${net.iso2} MCC:${net.mcc}` : 'INTL';
    return {
      ok: true,
      status: 'delivered',
      providerMessageId: id,
      latencyMs,
      protocolTrace: `LOOPBACK -> TO:${to} (${netTag}) -> DELIVERED (${segInfo.encoding}, ${segInfo.segments} seg, id=${id})`,
    };
  }

  if (gateway.type === 'device') {
    const devId = db.generateId('devq');
    return {
      ok: true,
      status: 'queued',
      providerMessageId: devId,
      latencyMs: Date.now() - start,
      protocolTrace: `DEVICE_QUEUE -> Waiting for physical SMS device (${gateway.name})`,
    };
  }

  if (gateway.type === 'smpp') {
    if (!gateway.smppHost?.trim() || !gateway.smppPort || !gateway.smppSystemId?.trim()) {
      return {
        ok: false,
        status: 'failed',
        errorCode: 'SMPP_CONFIG_MISSING',
        errorMessage: 'SMPP Host, Port, and System ID are required.',
        latencyMs: Date.now() - start,
        protocolTrace: 'SMPP config validation failed',
      };
    }

    const res = await sendSmppSubmitSm(
      {
        host: gateway.smppHost.trim(),
        port: Number(gateway.smppPort),
        systemId: gateway.smppSystemId.trim(),
        password: gateway.smppPassword || '',
        systemType: gateway.smppSystemType || '',
        bindMode: gateway.smppBindMode || 'transceiver',
        sourceTon: gateway.smppSourceTon ?? 5,
        sourceNpi: gateway.smppSourceNpi ?? 0,
        destTon: gateway.smppDestTon ?? 1,
        destNpi: gateway.smppDestNpi ?? 1,
        useTls: Boolean(gateway.smppUseTls),
      },
      gateway.senderId || 'RelaySMS',
      to,
      body,
      segInfo.encoding === 'UCS-2'
    );

    return {
      ok: res.ok,
      status: res.ok ? 'sent' : 'failed',
      providerMessageId: res.messageId,
      errorCode: res.errorCode,
      errorMessage: res.errorMessage,
      latencyMs: res.latencyMs,
      protocolTrace: res.trace.join(' | '),
    };
  }

  if (gateway.type === 'twilio') {
    const sid = gateway.accountSid?.trim();
    const token = gateway.authToken?.trim();
    if (!sid || !token || !gateway.senderId?.trim()) {
      return {
        ok: false,
        status: 'failed',
        errorCode: 'CONFIG_MISSING',
        errorMessage: 'Twilio Account SID, Auth Token, and From Number are required.',
        latencyMs: Date.now() - start,
      };
    }

    const params = new URLSearchParams();
    params.set('To', to);
    params.set('From', gateway.senderId.trim());
    params.set('Body', body);
    if (callbackBaseUrl) {
      params.set('StatusCallback', `${callbackBaseUrl}/api/webhooks/twilio/status`);
    }

    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    );
    const data = (await resp.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
      code?: number | string;
      message?: string;
    };
    const latencyMs = Date.now() - start;
    if (!resp.ok) {
      return {
        ok: false,
        status: 'failed',
        errorCode: data.code ? String(data.code) : `HTTP_${resp.status}`,
        errorMessage: data.message || `Twilio HTTP ${resp.status}`,
        latencyMs,
        protocolTrace: `POST api.twilio.com -> HTTP ${resp.status} (${data.message || 'error'})`,
      };
    }
    const mappedStatus: DeliveryStatus =
      data.status === 'delivered' ? 'delivered' : 'sent';
    return {
      ok: true,
      status: mappedStatus,
      providerMessageId: data.sid,
      latencyMs,
      protocolTrace: `POST api.twilio.com -> HTTP ${resp.status} (sid=${data.sid}, status=${data.status})`,
    };
  }

  if (gateway.type === 'vonage') {
    const apiKey = gateway.apiKey?.trim();
    const apiSecret = gateway.apiSecret?.trim();
    if (!apiKey || !apiSecret || !gateway.senderId?.trim()) {
      return {
        ok: false,
        status: 'failed',
        errorCode: 'CONFIG_MISSING',
        errorMessage: 'Vonage API Key, API Secret, and Sender ID are required.',
        latencyMs: Date.now() - start,
      };
    }

    const resp = await fetch('https://rest.nexmo.com/sms/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        api_secret: apiSecret,
        to: to.replace(/^\+/, ''),
        from: gateway.senderId.trim(),
        text: body,
      }),
    });
    const data = (await resp.json().catch(() => ({}))) as {
      messages?: Array<{
        status?: string;
        'message-id'?: string;
        'error-text'?: string;
      }>;
    };
    const msg = data.messages?.[0];
    const latencyMs = Date.now() - start;
    if (!resp.ok || !msg || msg.status !== '0') {
      return {
        ok: false,
        status: 'failed',
        errorCode: msg?.status || `HTTP_${resp.status}`,
        errorMessage: msg?.['error-text'] || `Vonage dispatch failed (${resp.status})`,
        latencyMs,
        protocolTrace: `POST rest.nexmo.com/sms/json -> status=${msg?.status || resp.status}`,
      };
    }
    return {
      ok: true,
      status: 'sent',
      providerMessageId: msg['message-id'],
      latencyMs,
      protocolTrace: `POST rest.nexmo.com/sms/json -> OK (message-id=${msg['message-id']})`,
    };
  }

  if (gateway.type === 'textbelt') {
    const key = gateway.apiKey?.trim() || 'textbelt';
    const resp = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: to,
        message: body,
        key,
        replyWebhookUrl: callbackBaseUrl ? `${callbackBaseUrl}/api/webhooks/dlr` : undefined,
      }),
    });
    const data = (await resp.json().catch(() => ({}))) as {
      success?: boolean;
      textId?: string;
      error?: string;
    };
    const latencyMs = Date.now() - start;
    if (!resp.ok || !data.success) {
      return {
        ok: false,
        status: 'failed',
        errorCode: 'TEXTBELT_ERROR',
        errorMessage: data.error || `Textbelt returned HTTP ${resp.status}`,
        latencyMs,
        protocolTrace: `POST textbelt.com/text -> ${data.error || resp.status}`,
      };
    }
    return {
      ok: true,
      status: 'sent',
      providerMessageId: data.textId ? String(data.textId) : undefined,
      latencyMs,
      protocolTrace: `POST textbelt.com/text -> OK (textId=${data.textId})`,
    };
  }

  if (gateway.type === 'custom_http') {
    const targetUrl = gateway.webhookUrl?.trim();
    if (!targetUrl) {
      return {
        ok: false,
        status: 'failed',
        errorCode: 'CONFIG_MISSING',
        errorMessage: 'Custom HTTP gateway URL is required.',
        latencyMs: Date.now() - start,
      };
    }
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (gateway.customHeadersJson?.trim()) {
      try {
        const parsed = JSON.parse(gateway.customHeadersJson) as Record<string, string>;
        headers = { ...headers, ...parsed };
      } catch {
        return {
          ok: false,
          status: 'failed',
          errorCode: 'INVALID_HEADERS',
          errorMessage: 'Custom headers JSON is malformed.',
          latencyMs: Date.now() - start,
        };
      }
    }

    let payloadText: string;
    if (gateway.customBodyTemplate?.trim()) {
      payloadText = gateway.customBodyTemplate
        .replace(/\{\{\s*to\s*\}\}/g, to.replace(/"/g, '\\"'))
        .replace(
          /\{\{\s*body\s*\}\}/g,
          body.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
        )
        .replace(/\{\{\s*sender\s*\}\}/g, (gateway.senderId || 'RelaySMS').replace(/"/g, '\\"'));
    } else {
      payloadText = JSON.stringify({
        to,
        message: body,
        sender: gateway.senderId || 'RelaySMS',
      });
    }

    const resp = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: payloadText,
    });
    const text = await resp.text().catch(() => '');
    const latencyMs = Date.now() - start;
    if (!resp.ok) {
      return {
        ok: false,
        status: 'failed',
        errorCode: `HTTP_${resp.status}`,
        errorMessage: text.slice(0, 200) || `Gateway responded with HTTP ${resp.status}`,
        latencyMs,
        protocolTrace: `POST ${targetUrl} -> HTTP ${resp.status}`,
      };
    }
    let providerId: string | undefined;
    try {
      const parsed = JSON.parse(text) as { id?: string; messageId?: string; sid?: string };
      providerId = parsed.id || parsed.messageId || parsed.sid;
    } catch {
      providerId = undefined;
    }
    return {
      ok: true,
      status: 'sent',
      providerMessageId: providerId || db.generateId('http'),
      latencyMs,
      protocolTrace: `POST ${targetUrl} -> HTTP ${resp.status}`,
    };
  }

  return {
    ok: false,
    status: 'failed',
    errorCode: 'UNSUPPORTED_GATEWAY',
    errorMessage: `Unsupported gateway type: ${gateway.type}`,
    latencyMs: Date.now() - start,
  };
}

export async function processCampaignQueue(
  campaignId: string,
  callbackBaseUrl?: string
): Promise<void> {
  if (activeQueues.has(campaignId)) return;
  activeQueues.add(campaignId);

  try {
    const stateSnapshot = db.getState();
    const campaign = stateSnapshot.campaigns.find((c) => c.id === campaignId);
    if (!campaign) return;

    const gateway = stateSnapshot.gateways.find((g) => g.id === campaign.gatewayId);
    const delayMs = Math.max(25, Math.floor(1000 / Math.max(1, campaign.rateLimitPerSec || 10)));

    const queuedIds = stateSnapshot.messages
      .filter((m) => m.campaignId === campaignId && m.status === 'queued')
      .map((m) => m.id);

    for (const msgId of queuedIds) {
      const msg = db.getState().messages.find((m) => m.id === msgId);
      if (!msg || msg.status !== 'queued') continue;

      if (!gateway) {
        db.update((st) => {
          const target = st.messages.find((m) => m.id === msgId);
          if (target) {
            target.status = 'failed';
            target.errorCode = 'GATEWAY_DELETED';
            target.errorMessage = 'Configured SMS gateway no longer exists.';
          }
        });
        recalculateCampaignStats(campaignId);
        continue;
      }

      if (gateway.type === 'device') {
        // Real SMS device pulls queued messages via /api/devices/:id/next-job
        continue;
      }

      db.update((st) => {
        const target = st.messages.find((m) => m.id === msgId);
        if (target) target.status = 'sending';
      });

      let result: DispatchResult;
      try {
        result = await sendViaGateway(gateway, msg.phone, msg.renderedBody, callbackBaseUrl);
      } catch (err) {
        result = {
          ok: false,
          status: 'failed',
          errorCode: 'NETWORK_ERROR',
          errorMessage: err instanceof Error ? err.message : 'Unexpected network error',
          latencyMs: 0,
        };
      }

      const cost = result.ok
        ? debitAccountForMessage(
            msg.accountId,
            msg.segments,
            `SMS to ${msg.phone} (${campaign.name})`
          )
        : 0;

      const nowIso = new Date().toISOString();
      db.update((st) => {
        const target = st.messages.find((m) => m.id === msgId);
        if (!target) return;
        target.status = result.status;
        target.providerMessageId = result.providerMessageId;
        target.errorCode = result.errorCode;
        target.errorMessage = result.errorMessage;
        target.latencyMs = result.latencyMs;
        target.protocolTrace = result.protocolTrace;
        target.cost = cost;
        if (result.ok) {
          target.sentAt = nowIso;
          if (result.status === 'delivered') {
            target.deliveredAt = nowIso;
          }
        }
      });

      recalculateCampaignStats(campaignId);
      await sleep(delayMs);
    }

    recalculateCampaignStats(campaignId);
  } finally {
    activeQueues.delete(campaignId);
  }
}

export async function dispatchBulkCampaign(params: {
  name: string;
  accountId?: string;
  gatewayId: string;
  messageTemplate: string;
  groupIds: string[];
  contactIds: string[];
  manualNumbers: string[];
  defaultCountryDialCode?: string;
  rateLimitPerSec?: number;
  callbackBaseUrl?: string;
}): Promise<Campaign> {
  const state = db.getState();
  const gateway = state.gateways.find((g) => g.id === params.gatewayId);
  if (!gateway) {
    throw new Error('Selected SMS gateway was not found.');
  }
  const template = params.messageTemplate.trim();
  if (!template) {
    throw new Error('Message content cannot be empty.');
  }

  const recipientMap = new Map<
    string,
    { contact?: Contact; phone: string; displayName: string; invalidReason?: string }
  >();

  for (const c of state.contacts) {
    const inGroup = params.groupIds.some((gid) => c.groupIds.includes(gid));
    const explicitlySelected = params.contactIds.includes(c.id);
    if (inGroup || explicitlySelected) {
      const norm = normalizePhone(c.phone, params.defaultCountryDialCode);
      const key = norm.e164 || c.phone;
      if (!recipientMap.has(key)) {
        recipientMap.set(key, {
          contact: c,
          phone: norm.e164 || c.phone,
          displayName: `${c.firstName} ${c.lastName}`.trim() || c.phone,
          invalidReason: norm.valid ? undefined : norm.reason,
        });
      }
    }
  }

  for (const rawPhone of params.manualNumbers) {
    const trimmed = rawPhone.trim();
    if (!trimmed) continue;
    const norm = normalizePhone(trimmed, params.defaultCountryDialCode);
    const key = norm.e164 || trimmed;
    if (!recipientMap.has(key)) {
      const matched = state.contacts.find((c) => normalizePhone(c.phone).e164 === key);
      recipientMap.set(key, {
        contact: matched,
        phone: key,
        displayName: matched ? `${matched.firstName} ${matched.lastName}`.trim() : key,
        invalidReason: norm.valid ? undefined : norm.reason,
      });
    }
  }

  if (recipientMap.size === 0) {
    throw new Error('Select at least one contact, group, or valid phone number.');
  }

  const nowIso = new Date().toISOString();
  const campaignId = db.generateId('cmp');
  const campaignName =
    params.name.trim() ||
    `Bulk Dispatch ${new Date().toLocaleTimeString('en-US', { hour12: false })}`;

  const logs: MessageLog[] = [];
  let totalSegments = 0;
  let queuedSegments = 0;

  const account = params.accountId
    ? state.accounts.find((a) => a.id === params.accountId)
    : undefined;

  for (const entry of recipientMap.values()) {
    const renderedBody = interpolateMessage(template, {
      firstName: entry.contact?.firstName,
      lastName: entry.contact?.lastName,
      company: entry.contact?.company,
      phone: entry.phone,
      email: entry.contact?.email,
    });
    const segInfo = calculateSmsSegments(renderedBody);
    totalSegments += segInfo.segments;

    let initialStatus: DeliveryStatus = 'queued';
    let errorCode: string | undefined;
    let errorMessage: string | undefined;

    if (entry.invalidReason) {
      initialStatus = 'failed';
      errorCode = 'INVALID_PHONE';
      errorMessage = entry.invalidReason;
    } else if (entry.contact?.optedOut) {
      initialStatus = 'opted_out';
      errorCode = 'OPTED_OUT';
      errorMessage = 'Recipient has opted out of SMS notifications';
    } else {
      queuedSegments += segInfo.segments;
    }

    const net = detectCountryFromPhone(entry.phone);

    logs.push({
      id: db.generateId('msg'),
      campaignId,
      campaignName,
      accountId: account?.id,
      accountName: account?.name,
      contactId: entry.contact?.id,
      recipientName: entry.displayName,
      phone: entry.phone,
      countryIso: net?.iso2,
      countryName: net?.name,
      carrierHint: net ? `MCC ${net.mcc} · ${net.carriers.slice(0, 2).join(' / ')}` : undefined,
      renderedBody,
      encoding: segInfo.encoding,
      segments: segInfo.segments,
      gatewayId: gateway.id,
      gatewayType: gateway.type,
      status: initialStatus,
      errorCode,
      errorMessage,
      queuedAt: nowIso,
    });
  }

  assertAccountCanDispatch(params.accountId, queuedSegments);

  const campaign: Campaign = {
    id: campaignId,
    name: campaignName,
    accountId: account?.id,
    accountName: account?.name,
    gatewayId: gateway.id,
    gatewayName: gateway.name,
    gatewayType: gateway.type,
    senderId: gateway.senderId,
    messageTemplate: template,
    targetGroupIds: params.groupIds,
    totalRecipients: logs.length,
    queuedCount: logs.filter((l) => l.status === 'queued').length,
    sentCount: 0,
    deliveredCount: 0,
    failedCount: logs.filter((l) => l.status === 'failed').length,
    optedOutCount: logs.filter((l) => l.status === 'opted_out').length,
    totalSegments,
    totalCost: 0,
    rateLimitPerSec: Math.min(
      50,
      Math.max(1, params.rateLimitPerSec || gateway.rateLimitPerSec || 10)
    ),
    status: logs.some((l) => l.status === 'queued') ? 'running' : 'partial_failure',
    createdAt: nowIso,
  };

  db.update((st) => {
    st.campaigns.unshift(campaign);
    st.messages.unshift(...logs);
  });

  void processCampaignQueue(campaignId, params.callbackBaseUrl);

  return campaign;
}

export async function testGatewayDispatch(
  gatewayId: string,
  toPhone: string,
  body: string,
  callbackBaseUrl?: string,
  accountId?: string,
  sourceLabel = 'Single Dispatch',
  defaultCountryDialCode?: string
): Promise<{ ok: boolean; log: MessageLog }> {
  const state = db.getState();
  const gateway = state.gateways.find((g) => g.id === gatewayId);
  if (!gateway) {
    throw new Error('Gateway not found.');
  }
  const norm = normalizePhone(toPhone, defaultCountryDialCode);
  if (!norm.valid) {
    throw new Error(norm.reason || 'Invalid phone number.');
  }

  const seg = calculateSmsSegments(body);
  const account = assertAccountCanDispatch(accountId, seg.segments);

  const nowIso = new Date().toISOString();
  const campaignId = db.generateId('cmp');
  const campaignName = `${sourceLabel} (${gateway.name})`;

  const result = await sendViaGateway(gateway, norm.e164, body, callbackBaseUrl);
  const finishedIso = new Date().toISOString();
  const isDeviceQueue = gateway.type === 'device' || result.status === 'queued';
  const net = detectCountryFromPhone(norm.e164);

  const cost =
    result.ok && !isDeviceQueue
      ? debitAccountForMessage(account?.id, seg.segments, `${sourceLabel} to ${norm.e164}`)
      : 0;

  const log: MessageLog = {
    id: db.generateId('msg'),
    campaignId,
    campaignName,
    accountId: account?.id,
    accountName: account?.name,
    recipientName: norm.e164,
    phone: norm.e164,
    countryIso: net?.iso2,
    countryName: net?.name,
    carrierHint: net ? `MCC ${net.mcc} · ${net.carriers.slice(0, 2).join(' / ')}` : undefined,
    renderedBody: body,
    encoding: seg.encoding,
    segments: seg.segments,
    cost,
    gatewayId: gateway.id,
    gatewayType: gateway.type,
    providerMessageId: result.providerMessageId,
    status: result.status,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    latencyMs: result.latencyMs,
    protocolTrace: result.protocolTrace,
    queuedAt: nowIso,
    sentAt: result.ok && !isDeviceQueue ? finishedIso : undefined,
    deliveredAt: result.status === 'delivered' ? finishedIso : undefined,
  };

  const campaign: Campaign = {
    id: campaignId,
    name: campaignName,
    accountId: account?.id,
    accountName: account?.name,
    gatewayId: gateway.id,
    gatewayName: gateway.name,
    gatewayType: gateway.type,
    senderId: gateway.senderId,
    messageTemplate: body,
    targetGroupIds: [],
    totalRecipients: 1,
    queuedCount: result.status === 'queued' ? 1 : 0,
    sentCount: result.status === 'sent' ? 1 : 0,
    deliveredCount: result.status === 'delivered' ? 1 : 0,
    failedCount: result.status === 'failed' ? 1 : 0,
    optedOutCount: 0,
    totalSegments: seg.segments,
    totalCost: cost,
    rateLimitPerSec: gateway.rateLimitPerSec,
    status: isDeviceQueue ? 'running' : result.ok ? 'completed' : 'partial_failure',
    createdAt: nowIso,
    completedAt: isDeviceQueue ? undefined : finishedIso,
  };

  db.update((st) => {
    st.campaigns.unshift(campaign);
    st.messages.unshift(log);
  });

  return { ok: result.ok, log };
}

export async function refreshLiveMessageStatuses(campaignId?: string): Promise<number> {
  const state = db.getState();
  const pendingLogs = state.messages.filter(
    (m) =>
      m.status === 'sent' &&
      m.providerMessageId &&
      (!campaignId || m.campaignId === campaignId)
  );
  let updatedCount = 0;

  for (const log of pendingLogs) {
    const gateway = state.gateways.find((g) => g.id === log.gatewayId);
    if (!gateway) continue;

    if (
      gateway.type === 'twilio' &&
      gateway.accountSid &&
      gateway.authToken &&
      log.providerMessageId
    ) {
      try {
        const auth = Buffer.from(`${gateway.accountSid}:${gateway.authToken}`).toString('base64');
        const resp = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(gateway.accountSid)}/Messages/${encodeURIComponent(log.providerMessageId)}.json`,
          { headers: { Authorization: `Basic ${auth}` } }
        );
        if (resp.ok) {
          const data = (await resp.json()) as {
            status?: string;
            error_code?: number;
            error_message?: string;
          };
          if (data.status === 'delivered') {
            db.update((st) => {
              const target = st.messages.find((m) => m.id === log.id);
              if (target) {
                target.status = 'delivered';
                target.deliveredAt = new Date().toISOString();
              }
            });
            recalculateCampaignStats(log.campaignId);
            updatedCount += 1;
          } else if (data.status === 'failed' || data.status === 'undelivered') {
            db.update((st) => {
              const target = st.messages.find((m) => m.id === log.id);
              if (target) {
                target.status = 'failed';
                target.errorCode = data.error_code ? String(data.error_code) : 'TWILIO_UNDELIVERED';
                target.errorMessage = data.error_message || `Twilio status: ${data.status}`;
              }
            });
            recalculateCampaignStats(log.campaignId);
            updatedCount += 1;
          }
        }
      } catch {
        // Ignore transient poll errors
      }
    } else if (gateway.type === 'textbelt' && log.providerMessageId) {
      try {
        const resp = await fetch(
          `https://textbelt.com/status/${encodeURIComponent(log.providerMessageId)}`
        );
        if (resp.ok) {
          const data = (await resp.json()) as { status?: string };
          if (data.status === 'DELIVERED') {
            db.update((st) => {
              const target = st.messages.find((m) => m.id === log.id);
              if (target) {
                target.status = 'delivered';
                target.deliveredAt = new Date().toISOString();
              }
            });
            recalculateCampaignStats(log.campaignId);
            updatedCount += 1;
          } else if (data.status === 'FAILED') {
            db.update((st) => {
              const target = st.messages.find((m) => m.id === log.id);
              if (target) {
                target.status = 'failed';
                target.errorCode = 'TEXTBELT_FAILED';
                target.errorMessage = 'Carrier reported delivery failure';
              }
            });
            recalculateCampaignStats(log.campaignId);
            updatedCount += 1;
          }
        }
      } catch {
        // Ignore transient poll errors
      }
    }
  }

  return updatedCount;
}
