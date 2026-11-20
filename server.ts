import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import {
  buildAndroidApkKitZip,
  buildWindowsExeKitZip,
  getDeployManifest,
} from './server/deployPackager.ts';
import {
  ensureLocalSmppTestServer,
  testSmppBind,
} from './server/smppClient.ts';
import {
  debitAccountForMessage,
  dispatchBulkCampaign,
  processCampaignQueue,
  recalculateCampaignStats,
  refreshLiveMessageStatuses,
  testGatewayDispatch,
} from './server/smsEngine.ts';
import { db, generateApiKey } from './server/store.ts';
import type {
  Account,
  AccountRole,
  Campaign,
  Contact,
  GatewayConfig,
  GatewayType,
  MessageLog,
  SmsDevice,
  SmsDeviceKind,
  SmsDeviceStatus,
} from './src/types/sms.ts';
import { calculateSmsSegments, normalizePhone } from './src/types/sms.ts';
import { detectCountryFromPhone } from './src/utils/countryNetworks.ts';

const PORT = 3000;

function getRequestBaseUrl(req: express.Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function escapeCsv(val: unknown): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function authenticateExternalApi(req: express.Request): Account | null {
  const headerKey =
    (req.headers['x-api-key'] as string | undefined) ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined);
  const queryKey = typeof req.query.apiKey === 'string' ? req.query.apiKey : undefined;
  const key = (headerKey || queryKey || '').trim();
  if (!key) return null;
  return db.getState().accounts.find((a) => a.apiKey === key) || null;
}

async function startServer() {
  ensureLocalSmppTestServer();

  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

function computeDeviceStatus(dev: SmsDevice): SmsDeviceStatus {
  if (!dev.lastSeenAt) return 'waiting';
  const ageMs = Date.now() - new Date(dev.lastSeenAt).getTime();
  return ageMs <= 25_000 ? 'online' : 'offline';
}

function getHydratedDevices(): SmsDevice[] {
  return db.getState().devices.map((d) => ({
    ...d,
    status: computeDeviceStatus(d),
  }));
}

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'relaysms', timestamp: new Date().toISOString() });
  });

  app.get('/api/dashboard', (_req, res) => {
    const state = db.getState();
    res.json({
      contacts: state.contacts,
      groups: state.groups,
      gateways: db.maskGateways(),
      devices: getHydratedDevices(),
      campaigns: state.campaigns,
      messages: state.messages,
      accounts: state.accounts,
      transactions: state.transactions,
    });
  });

  // Contacts CRUD
  app.post('/api/contacts', (req, res) => {
    const body = req.body as Partial<Contact> & { defaultCountryDialCode?: string };
    const norm = normalizePhone(String(body.phone || ''), body.defaultCountryDialCode);
    if (!norm.valid) {
      res.status(400).json({ error: norm.reason || 'Valid phone number is required.' });
      return;
    }
    const existing = db.getState().contacts.find((c) => c.phone === norm.e164);
    if (existing) {
      res.status(409).json({ error: `A contact with ${norm.e164} already exists.` });
      return;
    }
    const now = new Date().toISOString();
    const contact: Contact = {
      id: db.generateId('cnt'),
      firstName: String(body.firstName || '').trim() || 'Unknown',
      lastName: String(body.lastName || '').trim(),
      phone: norm.e164,
      company: String(body.company || '').trim(),
      email: String(body.email || '').trim(),
      notes: String(body.notes || '').trim(),
      groupIds: Array.isArray(body.groupIds) ? body.groupIds : [],
      optedOut: Boolean(body.optedOut),
      createdAt: now,
      updatedAt: now,
    };
    db.update((st) => {
      st.contacts.unshift(contact);
    });
    res.status(201).json(contact);
  });

  app.patch('/api/contacts/:id', (req, res) => {
    const { id } = req.params;
    const body = req.body as Partial<Contact>;
    let updated: Contact | undefined;

    if (body.phone !== undefined) {
      const norm = normalizePhone(String(body.phone));
      if (!norm.valid) {
        res.status(400).json({ error: norm.reason || 'Invalid phone number.' });
        return;
      }
      body.phone = norm.e164;
    }

    db.update((st) => {
      const target = st.contacts.find((c) => c.id === id);
      if (!target) return;
      if (body.firstName !== undefined) target.firstName = String(body.firstName).trim();
      if (body.lastName !== undefined) target.lastName = String(body.lastName).trim();
      if (body.phone !== undefined) target.phone = body.phone;
      if (body.company !== undefined) target.company = String(body.company).trim();
      if (body.email !== undefined) target.email = String(body.email).trim();
      if (body.notes !== undefined) target.notes = String(body.notes).trim();
      if (Array.isArray(body.groupIds)) target.groupIds = body.groupIds;
      if (body.optedOut !== undefined) target.optedOut = Boolean(body.optedOut);
      target.updatedAt = new Date().toISOString();
      updated = target;
    });

    if (!updated) {
      res.status(404).json({ error: 'Contact not found.' });
      return;
    }
    res.json(updated);
  });

  app.delete('/api/contacts/:id', (req, res) => {
    const { id } = req.params;
    let found = false;
    db.update((st) => {
      const idx = st.contacts.findIndex((c) => c.id === id);
      if (idx !== -1) {
        st.contacts.splice(idx, 1);
        found = true;
      }
    });
    if (!found) {
      res.status(404).json({ error: 'Contact not found.' });
      return;
    }
    res.json({ deleted: true });
  });

  app.post('/api/contacts/import', (req, res) => {
    const { rows, groupId, defaultCountryDialCode } = req.body as {
      rows?: Array<{
        firstName?: string;
        lastName?: string;
        name?: string;
        phone?: string;
        company?: string;
        email?: string;
        notes?: string;
      }>;
      groupId?: string;
      defaultCountryDialCode?: string;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'Provide at least one contact row to import.' });
      return;
    }

    let imported = 0;
    let skipped = 0;
    let invalid = 0;
    const now = new Date().toISOString();

    db.update((st) => {
      const existingPhones = new Set(st.contacts.map((c) => c.phone));
      for (const r of rows) {
        const norm = normalizePhone(String(r.phone || ''), defaultCountryDialCode);
        if (!norm.valid) {
          invalid += 1;
          continue;
        }
        if (existingPhones.has(norm.e164)) {
          if (groupId) {
            const match = st.contacts.find((c) => c.phone === norm.e164);
            if (match && !match.groupIds.includes(groupId)) {
              match.groupIds.push(groupId);
              match.updatedAt = now;
            }
          }
          skipped += 1;
          continue;
        }

        let firstName = String(r.firstName || '').trim();
        let lastName = String(r.lastName || '').trim();
        if (!firstName && r.name) {
          const parts = String(r.name).trim().split(/\s+/);
          firstName = parts[0] || 'Contact';
          lastName = parts.slice(1).join(' ');
        }

        const newContact: Contact = {
          id: db.generateId('cnt'),
          firstName: firstName || 'Contact',
          lastName,
          phone: norm.e164,
          company: String(r.company || '').trim(),
          email: String(r.email || '').trim(),
          notes: String(r.notes || '').trim(),
          groupIds: groupId ? [groupId] : [],
          optedOut: false,
          createdAt: now,
          updatedAt: now,
        };
        st.contacts.unshift(newContact);
        existingPhones.add(norm.e164);
        imported += 1;
      }
    });

    res.json({ imported, skipped, invalid });
  });

  app.post('/api/contacts/bulk-assign', (req, res) => {
    const { contactIds, groupId, mode } = req.body as {
      contactIds?: string[];
      groupId?: string;
      mode?: 'add' | 'remove';
    };
    if (!Array.isArray(contactIds) || !groupId) {
      res.status(400).json({ error: 'contactIds and groupId are required.' });
      return;
    }
    const now = new Date().toISOString();
    db.update((st) => {
      for (const c of st.contacts) {
        if (!contactIds.includes(c.id)) continue;
        if (mode === 'remove') {
          c.groupIds = c.groupIds.filter((gid) => gid !== groupId);
        } else if (!c.groupIds.includes(groupId)) {
          c.groupIds.push(groupId);
        }
        c.updatedAt = now;
      }
    });
    res.json({ ok: true });
  });

  // Groups CRUD
  app.post('/api/groups', (req, res) => {
    const { name, description } = req.body as { name?: string; description?: string };
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      res.status(400).json({ error: 'Group name is required.' });
      return;
    }
    const group = {
      id: db.generateId('grp'),
      name: cleanName,
      description: String(description || '').trim(),
      createdAt: new Date().toISOString(),
    };
    db.update((st) => {
      st.groups.unshift(group);
    });
    res.status(201).json(group);
  });

  app.patch('/api/groups/:id', (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body as { name?: string; description?: string };
    let updated;
    db.update((st) => {
      const target = st.groups.find((g) => g.id === id);
      if (!target) return;
      if (name !== undefined && String(name).trim()) target.name = String(name).trim();
      if (description !== undefined) target.description = String(description).trim();
      updated = target;
    });
    if (!updated) {
      res.status(404).json({ error: 'Group not found.' });
      return;
    }
    res.json(updated);
  });

  app.delete('/api/groups/:id', (req, res) => {
    const { id } = req.params;
    let found = false;
    db.update((st) => {
      const idx = st.groups.findIndex((g) => g.id === id);
      if (idx !== -1) {
        st.groups.splice(idx, 1);
        for (const c of st.contacts) {
          c.groupIds = c.groupIds.filter((gid) => gid !== id);
        }
        found = true;
      }
    });
    if (!found) {
      res.status(404).json({ error: 'Group not found.' });
      return;
    }
    res.json({ deleted: true });
  });

  // Gateways CRUD, SMPP Bind Probe & Test
  app.post('/api/gateways', (req, res) => {
    const body = req.body as Partial<GatewayConfig>;
    const cleanName = String(body.name || '').trim();
    const gwType = body.type as GatewayType;
    if (!cleanName || !gwType) {
      res.status(400).json({ error: 'Gateway name and provider type are required.' });
      return;
    }
    const now = new Date().toISOString();
    const gw: GatewayConfig = {
      id: db.generateId('gw'),
      name: cleanName,
      type: gwType,
      isDefault: Boolean(body.isDefault),
      senderId: String(body.senderId || 'RelaySMS').trim(),
      accountSid: body.accountSid?.trim(),
      authToken: body.authToken?.trim(),
      apiKey: body.apiKey?.trim(),
      apiSecret: body.apiSecret?.trim(),
      webhookUrl: body.webhookUrl?.trim(),
      customHeadersJson: body.customHeadersJson?.trim(),
      customBodyTemplate: body.customBodyTemplate?.trim(),
      smppHost: body.smppHost?.trim(),
      smppPort: body.smppPort ? Number(body.smppPort) : 2775,
      smppSystemId: body.smppSystemId?.trim(),
      smppPassword: body.smppPassword?.trim(),
      smppSystemType: body.smppSystemType?.trim(),
      smppBindMode: body.smppBindMode === 'transmitter' ? 'transmitter' : 'transceiver',
      smppSourceTon: body.smppSourceTon !== undefined ? Number(body.smppSourceTon) : 5,
      smppSourceNpi: body.smppSourceNpi !== undefined ? Number(body.smppSourceNpi) : 0,
      smppDestTon: body.smppDestTon !== undefined ? Number(body.smppDestTon) : 1,
      smppDestNpi: body.smppDestNpi !== undefined ? Number(body.smppDestNpi) : 1,
      smppUseTls: Boolean(body.smppUseTls),
      rateLimitPerSec: Math.min(100, Math.max(1, Number(body.rateLimitPerSec) || 10)),
      updatedAt: now,
    };
    db.update((st) => {
      if (gw.isDefault) {
        for (const existing of st.gateways) existing.isDefault = false;
      }
      st.gateways.push(gw);
    });
    res.status(201).json(db.maskGateways().find((g) => g.id === gw.id));
  });

  app.patch('/api/gateways/:id', (req, res) => {
    const { id } = req.params;
    const body = req.body as Partial<GatewayConfig>;
    let found = false;
    db.update((st) => {
      const target = st.gateways.find((g) => g.id === id);
      if (!target) return;
      found = true;
      if (body.name !== undefined) target.name = String(body.name).trim();
      if (body.senderId !== undefined) target.senderId = String(body.senderId).trim();
      if (body.accountSid !== undefined) target.accountSid = String(body.accountSid).trim();
      if (body.authToken) target.authToken = String(body.authToken).trim();
      if (body.apiKey) target.apiKey = String(body.apiKey).trim();
      if (body.apiSecret) target.apiSecret = String(body.apiSecret).trim();
      if (body.webhookUrl !== undefined) target.webhookUrl = String(body.webhookUrl).trim();
      if (body.customHeadersJson !== undefined) {
        target.customHeadersJson = String(body.customHeadersJson).trim();
      }
      if (body.customBodyTemplate !== undefined) {
        target.customBodyTemplate = String(body.customBodyTemplate).trim();
      }
      if (body.smppHost !== undefined) target.smppHost = String(body.smppHost).trim();
      if (body.smppPort !== undefined) target.smppPort = Number(body.smppPort);
      if (body.smppSystemId !== undefined) target.smppSystemId = String(body.smppSystemId).trim();
      if (body.smppPassword) target.smppPassword = String(body.smppPassword).trim();
      if (body.smppSystemType !== undefined) {
        target.smppSystemType = String(body.smppSystemType).trim();
      }
      if (body.smppBindMode !== undefined) target.smppBindMode = body.smppBindMode;
      if (body.smppUseTls !== undefined) target.smppUseTls = Boolean(body.smppUseTls);
      if (body.rateLimitPerSec !== undefined) {
        target.rateLimitPerSec = Math.min(100, Math.max(1, Number(body.rateLimitPerSec) || 10));
      }
      if (body.isDefault) {
        for (const g of st.gateways) g.isDefault = false;
        target.isDefault = true;
      }
      target.updatedAt = new Date().toISOString();
    });
    if (!found) {
      res.status(404).json({ error: 'Gateway not found.' });
      return;
    }
    res.json(db.maskGateways().find((g) => g.id === id));
  });

  app.delete('/api/gateways/:id', (req, res) => {
    const { id } = req.params;
    const st = db.getState();
    if (st.gateways.length <= 1) {
      res.status(400).json({ error: 'At least one gateway must remain configured.' });
      return;
    }
    let found = false;
    db.update((state) => {
      const idx = state.gateways.findIndex((g) => g.id === id);
      if (idx !== -1) {
        const wasDefault = state.gateways[idx].isDefault;
        state.gateways.splice(idx, 1);
        if (wasDefault && state.gateways[0]) {
          state.gateways[0].isDefault = true;
        }
        found = true;
      }
    });
    if (!found) {
      res.status(404).json({ error: 'Gateway not found.' });
      return;
    }
    res.json({ deleted: true });
  });

  app.post('/api/gateways/:id/test-smpp', async (req, res) => {
    const { id } = req.params;
    const gw = db.getState().gateways.find((g) => g.id === id);
    if (!gw || gw.type !== 'smpp') {
      res.status(404).json({ error: 'SMPP gateway not found.' });
      return;
    }
    const result = await testSmppBind({
      host: gw.smppHost || '127.0.0.1',
      port: Number(gw.smppPort || 2775),
      systemId: gw.smppSystemId || '',
      password: gw.smppPassword || '',
      systemType: gw.smppSystemType || '',
      bindMode: gw.smppBindMode || 'transceiver',
      sourceTon: gw.smppSourceTon ?? 5,
      sourceNpi: gw.smppSourceNpi ?? 0,
      destTon: gw.smppDestTon ?? 1,
      destNpi: gw.smppDestNpi ?? 1,
      useTls: Boolean(gw.smppUseTls),
    });
    res.json(result);
  });

  app.post('/api/smpp/probe', async (req, res) => {
    const body = req.body as {
      host?: string;
      port?: number;
      systemId?: string;
      password?: string;
      systemType?: string;
      bindMode?: 'transceiver' | 'transmitter';
      useTls?: boolean;
    };
    if (!body.host?.trim() || !body.port || !body.systemId?.trim()) {
      res.status(400).json({ error: 'Host, port, and System ID are required.' });
      return;
    }
    const result = await testSmppBind({
      host: body.host.trim(),
      port: Number(body.port),
      systemId: body.systemId.trim(),
      password: body.password || '',
      systemType: body.systemType || '',
      bindMode: body.bindMode === 'transmitter' ? 'transmitter' : 'transceiver',
      useTls: Boolean(body.useTls),
    });
    res.json(result);
  });

  app.post('/api/gateways/:id/test', async (req, res) => {
    try {
      const { id } = req.params;
      const { phone, message, accountId } = req.body as {
        phone?: string;
        message?: string;
        accountId?: string;
      };
      const result = await testGatewayDispatch(
        id,
        String(phone || ''),
        String(message || 'RelaySMS connectivity verification test.'),
        getRequestBaseUrl(req),
        accountId,
        'Gateway Test'
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Test dispatch failed.',
      });
    }
  });

  // SMS Testing Lab Endpoint (multi-recipient or single diagnostic test)
  app.post('/api/testing/send', async (req, res) => {
    try {
      const { gatewayId, phones, message, accountId, defaultCountryDialCode } = req.body as {
        gatewayId?: string;
        phones?: string[];
        message?: string;
        accountId?: string;
        defaultCountryDialCode?: string;
      };
      if (!gatewayId || !Array.isArray(phones) || phones.length === 0 || !message?.trim()) {
        res.status(400).json({ error: 'Gateway, at least one phone number, and message are required.' });
        return;
      }

      const results = [];
      for (const p of phones.slice(0, 10)) {
        const result = await testGatewayDispatch(
          gatewayId,
          p,
          message,
          getRequestBaseUrl(req),
          accountId,
          'SMS Testing Lab',
          defaultCountryDialCode
        );
        results.push(result);
      }
      res.json({ results });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Test send failed.',
      });
    }
  });

  // Physical Real SMS Device Bridge & USB GSM Modem Routes
  app.get('/api/devices', (_req, res) => {
    res.json({ devices: getHydratedDevices() });
  });

  app.post('/api/devices', (req, res) => {
    const body = req.body as {
      name?: string;
      kind?: SmsDeviceKind;
      phoneNumber?: string;
      carrierName?: string;
      setAsDefault?: boolean;
    };
    const cleanName = String(body.name || '').trim() || 'My Test Phone';
    const kind: SmsDeviceKind = body.kind === 'usb_gsm' ? 'usb_gsm' : 'android_bridge';
    const rawPhone = String(body.phoneNumber || '').trim();
    const norm = rawPhone ? normalizePhone(rawPhone) : { valid: true, e164: '' };
    if (rawPhone && !norm.valid) {
      res.status(400).json({ error: norm.reason || 'Invalid SIM phone number.' });
      return;
    }

    const now = new Date().toISOString();
    const deviceId = db.generateId('dev');
    const gatewayId = db.generateId('gw');
    const pairingCode = crypto.randomBytes(3).toString('hex').toUpperCase();

    const gateway: GatewayConfig = {
      id: gatewayId,
      name: `Real Device: ${cleanName}`,
      type: 'device',
      isDefault: Boolean(body.setAsDefault),
      senderId: norm.e164 || cleanName.slice(0, 11),
      deviceId,
      rateLimitPerSec: 1,
      updatedAt: now,
    };

    const device: SmsDevice = {
      id: deviceId,
      name: cleanName,
      kind,
      pairingCode,
      phoneNumber: norm.e164,
      carrierName: String(body.carrierName || '').trim() || undefined,
      signalText: kind === 'usb_gsm' ? 'Serial Port' : 'Awaiting phone scan',
      status: kind === 'usb_gsm' ? 'online' : 'waiting',
      gatewayId,
      lastSeenAt: kind === 'usb_gsm' ? now : undefined,
      messagesRelayed: 0,
      createdAt: now,
    };

    db.update((st) => {
      if (gateway.isDefault) {
        for (const g of st.gateways) g.isDefault = false;
      }
      st.gateways.push(gateway);
      st.devices.unshift(device);
    });

    res.status(201).json({
      device: { ...device, status: computeDeviceStatus(device) },
      gateway: db.maskGateways().find((g) => g.id === gatewayId),
    });
  });

  app.delete('/api/devices/:id', (req, res) => {
    const { id } = req.params;
    let found = false;
    db.update((st) => {
      const idx = st.devices.findIndex((d) => d.id === id);
      if (idx === -1) return;
      const dev = st.devices[idx];
      st.devices.splice(idx, 1);
      const gwIdx = st.gateways.findIndex(
        (g) => g.id === dev.gatewayId || g.deviceId === dev.id
      );
      if (gwIdx !== -1) {
        const wasDefault = st.gateways[gwIdx].isDefault;
        st.gateways.splice(gwIdx, 1);
        if (wasDefault && st.gateways[0]) {
          st.gateways[0].isDefault = true;
        }
      }
      found = true;
    });
    if (!found) {
      res.status(404).json({ error: 'Device not found.' });
      return;
    }
    res.json({ deleted: true });
  });

  app.get('/api/devices/pair/:code', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const dev = db
      .getState()
      .devices.find(
        (d) => d.pairingCode.toUpperCase() === code || d.id.toUpperCase() === code
      );
    if (!dev) {
      res.status(404).json({ error: 'Pairing code not found. Create or re-pair your device first.' });
      return;
    }
    res.json({ device: { ...dev, status: computeDeviceStatus(dev) } });
  });

  app.post('/api/devices/:id/heartbeat', (req, res) => {
    const { id } = req.params;
    const body = req.body as {
      phoneNumber?: string;
      carrierName?: string;
      signalText?: string;
    };
    const now = new Date().toISOString();
    let updated: SmsDevice | undefined;

    db.update((st) => {
      const dev = st.devices.find((d) => d.id === id);
      if (!dev) return;
      dev.lastSeenAt = now;
      dev.status = 'online';
      if (body.carrierName !== undefined) dev.carrierName = String(body.carrierName).trim();
      if (body.signalText !== undefined) dev.signalText = String(body.signalText).trim();
      if (body.phoneNumber && String(body.phoneNumber).trim()) {
        const norm = normalizePhone(String(body.phoneNumber));
        if (norm.valid) {
          dev.phoneNumber = norm.e164;
          const gw = st.gateways.find((g) => g.id === dev.gatewayId);
          if (gw) gw.senderId = norm.e164;
        }
      }
      updated = { ...dev };
    });

    if (!updated) {
      res.status(404).json({ error: 'Device not found.' });
      return;
    }
    res.json({ device: updated });
  });

  app.get('/api/devices/:id/jobs', (req, res) => {
    const { id } = req.params;
    const st = db.getState();
    const dev = st.devices.find((d) => d.id === id);
    if (!dev) {
      res.status(404).json({ error: 'Device not found.' });
      return;
    }
    const pendingJobs = st.messages
      .filter(
        (m) =>
          m.gatewayId === dev.gatewayId &&
          (m.status === 'queued' || m.status === 'sending')
      )
      .slice(0, 25);
    const recentCompleted = st.messages
      .filter(
        (m) =>
          m.gatewayId === dev.gatewayId &&
          (m.status === 'delivered' || m.status === 'failed')
      )
      .slice(0, 10);

    res.json({
      device: { ...dev, status: computeDeviceStatus(dev) },
      pendingJobs,
      recentCompleted,
    });
  });

  app.get('/api/devices/:id/next-job', (req, res) => {
    const { id } = req.params;
    const now = new Date().toISOString();
    let claimedJob: MessageLog | null = null;
    let pendingCount = 0;

    db.update((st) => {
      const dev = st.devices.find((d) => d.id === id);
      if (!dev) return;
      dev.lastSeenAt = now;
      dev.status = 'online';

      const deviceQueue = st.messages.filter(
        (m) => m.gatewayId === dev.gatewayId && m.status === 'queued'
      );
      pendingCount = deviceQueue.length;
      if (deviceQueue.length > 0) {
        // Oldest queued job first
        const target = deviceQueue[deviceQueue.length - 1];
        target.status = 'sending';
        target.sentAt = now;
        target.protocolTrace = `Claimed by physical device "${dev.name}" at ${now}`;
        claimedJob = { ...target };
      }
    });

    if (!db.getState().devices.some((d) => d.id === id)) {
      res.status(404).json({ error: 'Device not found.' });
      return;
    }

    res.json({ job: claimedJob, pendingCount });
  });

  app.post('/api/devices/:id/report', (req, res) => {
    const { id } = req.params;
    const body = req.body as {
      messageId?: string;
      status?: 'delivered' | 'failed';
      errorMessage?: string;
      protocolTrace?: string;
    };
    if (!body.messageId || (body.status !== 'delivered' && body.status !== 'failed')) {
      res.status(400).json({ error: 'messageId and status (delivered|failed) are required.' });
      return;
    }

    const st = db.getState();
    const dev = st.devices.find((d) => d.id === id);
    if (!dev) {
      res.status(404).json({ error: 'Device not found.' });
      return;
    }
    const existingMsg = st.messages.find((m) => m.id === body.messageId);
    if (!existingMsg) {
      res.status(404).json({ error: 'Message not found.' });
      return;
    }

    let cost = existingMsg.cost || 0;
    if (body.status === 'delivered' && existingMsg.status !== 'delivered' && existingMsg.accountId && !existingMsg.cost) {
      cost = debitAccountForMessage(
        existingMsg.accountId,
        existingMsg.segments,
        `Real device "${dev.name}" SMS to ${existingMsg.phone}`
      );
    }

    const now = new Date().toISOString();
    let updatedMsg: MessageLog | undefined;

    db.update((state) => {
      const targetDev = state.devices.find((d) => d.id === id);
      const targetMsg = state.messages.find((m) => m.id === body.messageId);
      if (!targetMsg || !targetDev) return;

      targetDev.lastSeenAt = now;
      targetDev.status = 'online';

      const wasFinal = targetMsg.status === 'delivered';
      targetMsg.status = body.status!;
      targetMsg.cost = cost;
      if (body.status === 'delivered') {
        targetMsg.sentAt = targetMsg.sentAt || now;
        targetMsg.deliveredAt = now;
        targetMsg.errorCode = undefined;
        targetMsg.errorMessage = undefined;
        targetMsg.protocolTrace =
          body.protocolTrace || `REAL_DEVICE (${targetDev.name}) -> SIM SENT & CONFIRMED`;
        if (!wasFinal) targetDev.messagesRelayed += 1;
      } else {
        targetMsg.errorCode = 'DEVICE_SEND_FAILED';
        targetMsg.errorMessage =
          body.errorMessage || `Physical device "${targetDev.name}" reported send failure.`;
        targetMsg.protocolTrace =
          body.protocolTrace || `REAL_DEVICE (${targetDev.name}) -> FAILED`;
      }
      updatedMsg = { ...targetMsg };
    });

    if (updatedMsg) {
      recalculateCampaignStats(updatedMsg.campaignId);
    }
    res.json({ ok: true, message: updatedMsg });
  });

  app.post('/api/devices/:id/usb-log', (req, res) => {
    try {
      const { id } = req.params;
      const body = req.body as {
        phone?: string;
        message?: string;
        ok?: boolean;
        latencyMs?: number;
        protocolTrace?: string;
        errorMessage?: string;
        accountId?: string;
      };
      const st = db.getState();
      const dev = st.devices.find((d) => d.id === id);
      if (!dev) {
        res.status(404).json({ error: 'Device not found.' });
        return;
      }
      const norm = normalizePhone(String(body.phone || ''));
      if (!norm.valid) {
        res.status(400).json({ error: norm.reason || 'Valid phone number required.' });
        return;
      }

      const text = String(body.message || '').trim();
      const seg = calculateSmsSegments(text);
      const ok = Boolean(body.ok);
      const now = new Date().toISOString();
      const detectedNet = detectCountryFromPhone(norm.e164);
      const cost = ok
        ? debitAccountForMessage(body.accountId, seg.segments, `USB GSM (${dev.name}) to ${norm.e164}`)
        : 0;

      const campaignId = db.generateId('cmp');
      const campaignName = `USB GSM Test (${dev.name})`;
      const log: MessageLog = {
        id: db.generateId('msg'),
        campaignId,
        campaignName,
        accountId: body.accountId || undefined,
        recipientName: norm.e164,
        phone: norm.e164,
        countryIso: detectedNet?.iso2,
        countryName: detectedNet?.name,
        carrierHint: detectedNet ? detectedNet.carriers.slice(0, 2).join(', ') : undefined,
        renderedBody: text,
        encoding: seg.encoding,
        segments: seg.segments,
        cost,
        gatewayId: dev.gatewayId,
        gatewayType: 'device',
        providerMessageId: ok ? db.generateId('gsm') : undefined,
        status: ok ? 'delivered' : 'failed',
        errorCode: ok ? undefined : 'GSM_MODEM_ERROR',
        errorMessage: ok ? undefined : body.errorMessage || 'AT+CMGS failed',
        latencyMs: body.latencyMs || 0,
        protocolTrace: body.protocolTrace || 'WEB_SERIAL AT+CMGS',
        queuedAt: now,
        sentAt: ok ? now : undefined,
        deliveredAt: ok ? now : undefined,
      };

      const campaign: Campaign = {
        id: campaignId,
        name: campaignName,
        accountId: body.accountId || undefined,
        gatewayId: dev.gatewayId,
        gatewayName: dev.name,
        gatewayType: 'device',
        senderId: dev.phoneNumber || dev.name,
        messageTemplate: text,
        targetGroupIds: [],
        totalRecipients: 1,
        queuedCount: 0,
        sentCount: 0,
        deliveredCount: ok ? 1 : 0,
        failedCount: ok ? 0 : 1,
        optedOutCount: 0,
        totalSegments: seg.segments,
        totalCost: cost,
        rateLimitPerSec: 1,
        status: ok ? 'completed' : 'partial_failure',
        createdAt: now,
        completedAt: now,
      };

      db.update((state) => {
        const targetDev = state.devices.find((d) => d.id === id);
        if (targetDev) {
          targetDev.lastSeenAt = now;
          targetDev.status = 'online';
          if (ok) targetDev.messagesRelayed += 1;
        }
        state.campaigns.unshift(campaign);
        state.messages.unshift(log);
      });

      res.status(201).json({ ok, log });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to log USB modem SMS.',
      });
    }
  });

  // Sales & Customer Accounts CRUD & Credit Ledger
  app.get('/api/accounts', (_req, res) => {
    const state = db.getState();
    res.json({
      accounts: state.accounts,
      transactions: state.transactions,
    });
  });

  app.post('/api/accounts', (req, res) => {
    const body = req.body as Partial<Account> & { initialCredits?: number };
    const role: AccountRole =
      body.role === 'sales' || body.role === 'admin' ? body.role : 'customer';
    const cleanName = String(body.name || '').trim();
    const cleanEmail = String(body.email || '').trim();
    if (!cleanName || !cleanEmail) {
      res.status(400).json({ error: 'Account name and email are required.' });
      return;
    }

    const now = new Date().toISOString();
    const startingBalance = Math.max(0, Number(body.initialCredits ?? body.creditsBalance) || 0);
    const acc: Account = {
      id: db.generateId(role === 'sales' ? 'acc_sales' : 'acc_cust'),
      role,
      name: cleanName,
      email: cleanEmail,
      company: String(body.company || '').trim(),
      phone: String(body.phone || '').trim(),
      status: 'active',
      apiKey: generateApiKey(),
      creditsBalance: startingBalance,
      ratePerSegment: Math.max(0.001, Number(body.ratePerSegment) || 0.018),
      commissionRatePct:
        role === 'sales' ? Math.max(0, Math.min(80, Number(body.commissionRatePct) || 10)) : undefined,
      assignedSalesId: role === 'customer' ? body.assignedSalesId || undefined : undefined,
      defaultGatewayId: body.defaultGatewayId || undefined,
      totalMessagesSent: 0,
      totalSegmentsBilled: 0,
      createdAt: now,
      updatedAt: now,
    };

    db.update((st) => {
      st.accounts.unshift(acc);
      if (startingBalance > 0) {
        const salesRep = acc.assignedSalesId
          ? st.accounts.find((s) => s.id === acc.assignedSalesId)
          : undefined;
        st.transactions.unshift({
          id: db.generateId('txn'),
          accountId: acc.id,
          accountName: acc.name,
          type: 'topup',
          amount: startingBalance,
          balanceAfter: startingBalance,
          description: 'Opening account credit balance',
          salesAccountId: salesRep?.id,
          commissionAmount:
            salesRep && salesRep.commissionRatePct
              ? Number(((startingBalance * salesRep.commissionRatePct) / 100).toFixed(4))
              : undefined,
          createdAt: now,
        });
      }
    });

    res.status(201).json(acc);
  });

  app.patch('/api/accounts/:id', (req, res) => {
    const { id } = req.params;
    const body = req.body as Partial<Account>;
    let updated: Account | undefined;

    db.update((st) => {
      const target = st.accounts.find((a) => a.id === id);
      if (!target) return;
      if (body.name !== undefined && String(body.name).trim()) {
        target.name = String(body.name).trim();
      }
      if (body.email !== undefined && String(body.email).trim()) {
        target.email = String(body.email).trim();
      }
      if (body.company !== undefined) target.company = String(body.company).trim();
      if (body.phone !== undefined) target.phone = String(body.phone).trim();
      if (body.status === 'active' || body.status === 'suspended') target.status = body.status;
      if (body.ratePerSegment !== undefined) {
        target.ratePerSegment = Math.max(0.001, Number(body.ratePerSegment) || target.ratePerSegment);
      }
      if (body.commissionRatePct !== undefined && target.role === 'sales') {
        target.commissionRatePct = Math.max(0, Math.min(80, Number(body.commissionRatePct) || 0));
      }
      if (body.assignedSalesId !== undefined && target.role === 'customer') {
        target.assignedSalesId = body.assignedSalesId || undefined;
      }
      if (body.defaultGatewayId !== undefined) {
        target.defaultGatewayId = body.defaultGatewayId || undefined;
      }
      target.updatedAt = new Date().toISOString();
      updated = target;
    });

    if (!updated) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    res.json(updated);
  });

  app.delete('/api/accounts/:id', (req, res) => {
    const { id } = req.params;
    if (id === 'acc_admin') {
      res.status(400).json({ error: 'Core administrator account cannot be deleted.' });
      return;
    }
    let found = false;
    db.update((st) => {
      const idx = st.accounts.findIndex((a) => a.id === id);
      if (idx !== -1) {
        st.accounts.splice(idx, 1);
        for (const a of st.accounts) {
          if (a.assignedSalesId === id) a.assignedSalesId = undefined;
        }
        found = true;
      }
    });
    if (!found) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    res.json({ deleted: true });
  });

  app.post('/api/accounts/:id/topup', (req, res) => {
    const { id } = req.params;
    const { amount, description } = req.body as { amount?: number; description?: string };
    const delta = Number(amount);
    if (!Number.isFinite(delta) || delta === 0) {
      res.status(400).json({ error: 'Provide a non-zero credit amount.' });
      return;
    }

    let updated: Account | undefined;
    db.update((st) => {
      const target = st.accounts.find((a) => a.id === id);
      if (!target) return;
      target.creditsBalance = Number(Math.max(0, target.creditsBalance + delta).toFixed(4));
      target.updatedAt = new Date().toISOString();

      const salesRep = target.assignedSalesId
        ? st.accounts.find((s) => s.id === target.assignedSalesId)
        : undefined;
      const commissionAmount =
        delta > 0 && salesRep && salesRep.commissionRatePct
          ? Number(((delta * salesRep.commissionRatePct) / 100).toFixed(4))
          : undefined;

      st.transactions.unshift({
        id: db.generateId('txn'),
        accountId: target.id,
        accountName: target.name,
        type: delta > 0 ? 'topup' : 'adjustment',
        amount: delta,
        balanceAfter: target.creditsBalance,
        description: String(description || (delta > 0 ? 'Credit top-up' : 'Manual balance adjustment')),
        salesAccountId: salesRep?.id,
        commissionAmount,
        createdAt: new Date().toISOString(),
      });
      updated = target;
    });

    if (!updated) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    res.json(updated);
  });

  app.post('/api/accounts/:id/regenerate-key', (req, res) => {
    const { id } = req.params;
    let updated: Account | undefined;
    db.update((st) => {
      const target = st.accounts.find((a) => a.id === id);
      if (!target) return;
      target.apiKey = generateApiKey();
      target.updatedAt = new Date().toISOString();
      updated = target;
    });
    if (!updated) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    res.json(updated);
  });

  // Bulk Campaigns & Delivery Status Reports
  app.post('/api/campaigns/dispatch', async (req, res) => {
    try {
      const body = req.body as {
        name?: string;
        accountId?: string;
        gatewayId?: string;
        messageTemplate?: string;
        groupIds?: string[];
        contactIds?: string[];
        manualNumbers?: string[];
        defaultCountryDialCode?: string;
        rateLimitPerSec?: number;
      };
      const campaign = await dispatchBulkCampaign({
        name: String(body.name || ''),
        accountId: body.accountId,
        gatewayId: String(body.gatewayId || ''),
        messageTemplate: String(body.messageTemplate || ''),
        groupIds: Array.isArray(body.groupIds) ? body.groupIds : [],
        contactIds: Array.isArray(body.contactIds) ? body.contactIds : [],
        manualNumbers: Array.isArray(body.manualNumbers) ? body.manualNumbers : [],
        defaultCountryDialCode: body.defaultCountryDialCode,
        rateLimitPerSec: body.rateLimitPerSec,
        callbackBaseUrl: getRequestBaseUrl(req),
      });
      res.status(201).json(campaign);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to start bulk campaign.',
      });
    }
  });

  app.post('/api/campaigns/:id/retry-failed', (req, res) => {
    const { id } = req.params;
    let requeued = 0;
    db.update((st) => {
      for (const msg of st.messages) {
        if (msg.campaignId === id && msg.status === 'failed' && msg.errorCode !== 'INVALID_PHONE') {
          msg.status = 'queued';
          msg.errorCode = undefined;
          msg.errorMessage = undefined;
          requeued += 1;
        }
      }
    });
    if (requeued === 0) {
      res.status(400).json({ error: 'No retryable failed messages found for this campaign.' });
      return;
    }
    recalculateCampaignStats(id);
    void processCampaignQueue(id, getRequestBaseUrl(req));
    res.json({ requeued });
  });

  app.post('/api/campaigns/:id/refresh-status', async (req, res) => {
    const { id } = req.params;
    const updated = await refreshLiveMessageStatuses(id === 'all' ? undefined : id);
    res.json({ updated });
  });

  app.delete('/api/campaigns/:id', (req, res) => {
    const { id } = req.params;
    let found = false;
    db.update((st) => {
      const idx = st.campaigns.findIndex((c) => c.id === id);
      if (idx !== -1) {
        st.campaigns.splice(idx, 1);
        st.messages = st.messages.filter((m) => m.campaignId !== id);
        found = true;
      }
    });
    if (!found) {
      res.status(404).json({ error: 'Campaign not found.' });
      return;
    }
    res.json({ deleted: true });
  });

  app.get('/api/reports/export', (req, res) => {
    const format = String(req.query.format || 'csv').toLowerCase();
    const campaignId = req.query.campaignId ? String(req.query.campaignId) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;

    let logs = db.getState().messages;
    if (campaignId && campaignId !== 'all') {
      logs = logs.filter((m) => m.campaignId === campaignId);
    }
    if (status && status !== 'all') {
      logs = logs.filter((m) => m.status === status);
    }

    if (format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename="relaysms-delivery-report.json"');
      res.json(logs);
      return;
    }

    const headers = [
      'Message ID',
      'Campaign',
      'Account',
      'Recipient Name',
      'Phone',
      'Country',
      'Network',
      'Status',
      'Gateway',
      'Provider Message ID',
      'Encoding',
      'Segments',
      'Cost',
      'Error Code',
      'Error Message',
      'Queued At',
      'Sent At',
      'Delivered At',
      'Message Body',
    ];
    const lines = [headers.join(',')];
    for (const m of logs) {
      lines.push(
        [
          m.id,
          m.campaignName,
          m.accountName || '',
          m.recipientName,
          m.phone,
          m.countryName || m.countryIso || '',
          m.carrierHint || '',
          m.status,
          m.gatewayType,
          m.providerMessageId || '',
          m.encoding,
          m.segments,
          m.cost ?? 0,
          m.errorCode || '',
          m.errorMessage || '',
          m.queuedAt,
          m.sentAt || '',
          m.deliveredAt || '',
          m.renderedBody,
        ]
          .map(escapeCsv)
          .join(',')
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="relaysms-delivery-report.csv"');
    res.send(lines.join('\n'));
  });

  // External Bulk SMS Software REST Integration API (/api/v1/*)
  app.get('/api/v1/account/balance', (req, res) => {
    const account = authenticateExternalApi(req);
    if (!account) {
      res.status(401).json({ error: 'Invalid or missing X-API-Key / Bearer token.' });
      return;
    }
    res.json({
      accountId: account.id,
      name: account.name,
      role: account.role,
      status: account.status,
      creditsBalance: account.creditsBalance,
      ratePerSegment: account.ratePerSegment,
      totalMessagesSent: account.totalMessagesSent,
      totalSegmentsBilled: account.totalSegmentsBilled,
    });
  });

  app.post('/api/v1/sms/send', async (req, res) => {
    const account = authenticateExternalApi(req);
    if (!account) {
      res.status(401).json({ error: 'Invalid or missing X-API-Key / Bearer token.' });
      return;
    }
    try {
      const { to, message, gatewayId, defaultCountryDialCode } = req.body as {
        to?: string;
        message?: string;
        gatewayId?: string;
        defaultCountryDialCode?: string;
      };
      const st = db.getState();
      const targetGateway =
        (gatewayId && st.gateways.find((g) => g.id === gatewayId)) ||
        (account.defaultGatewayId && st.gateways.find((g) => g.id === account.defaultGatewayId)) ||
        st.gateways.find((g) => g.isDefault) ||
        st.gateways[0];

      if (!targetGateway) {
        res.status(400).json({ error: 'No SMS gateway configured.' });
        return;
      }

      const result = await testGatewayDispatch(
        targetGateway.id,
        String(to || ''),
        String(message || ''),
        getRequestBaseUrl(req),
        account.id,
        'External API v1',
        defaultCountryDialCode
      );

      res.status(result.ok ? 200 : 502).json({
        ok: result.ok,
        messageId: result.log.id,
        providerMessageId: result.log.providerMessageId,
        status: result.log.status,
        countryIso: result.log.countryIso,
        countryName: result.log.countryName,
        segments: result.log.segments,
        encoding: result.log.encoding,
        cost: result.log.cost,
        latencyMs: result.log.latencyMs,
        errorCode: result.log.errorCode,
        errorMessage: result.log.errorMessage,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'API SMS dispatch failed.',
      });
    }
  });

  app.post('/api/v1/sms/bulk', async (req, res) => {
    const account = authenticateExternalApi(req);
    if (!account) {
      res.status(401).json({ error: 'Invalid or missing X-API-Key / Bearer token.' });
      return;
    }
    try {
      const {
        name,
        recipients,
        groupIds,
        message,
        gatewayId,
        rateLimitPerSec,
        defaultCountryDialCode,
      } = req.body as {
        name?: string;
        recipients?: string[];
        groupIds?: string[];
        message?: string;
        gatewayId?: string;
        rateLimitPerSec?: number;
        defaultCountryDialCode?: string;
      };
      const st = db.getState();
      const targetGateway =
        (gatewayId && st.gateways.find((g) => g.id === gatewayId)) ||
        (account.defaultGatewayId && st.gateways.find((g) => g.id === account.defaultGatewayId)) ||
        st.gateways.find((g) => g.isDefault) ||
        st.gateways[0];

      if (!targetGateway) {
        res.status(400).json({ error: 'No SMS gateway configured.' });
        return;
      }

      const campaign = await dispatchBulkCampaign({
        name: name || `External API Bulk (${account.name})`,
        accountId: account.id,
        gatewayId: targetGateway.id,
        messageTemplate: String(message || ''),
        groupIds: Array.isArray(groupIds) ? groupIds : [],
        contactIds: [],
        manualNumbers: Array.isArray(recipients) ? recipients : [],
        defaultCountryDialCode,
        rateLimitPerSec,
        callbackBaseUrl: getRequestBaseUrl(req),
      });

      res.status(202).json({
        accepted: true,
        campaignId: campaign.id,
        status: campaign.status,
        totalRecipients: campaign.totalRecipients,
        queuedCount: campaign.queuedCount,
        totalSegments: campaign.totalSegments,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Bulk API dispatch failed.',
      });
    }
  });

  app.get('/api/v1/sms/status/:id', (req, res) => {
    const account = authenticateExternalApi(req);
    if (!account) {
      res.status(401).json({ error: 'Invalid or missing X-API-Key / Bearer token.' });
      return;
    }
    const { id } = req.params;
    const st = db.getState();
    const msg = st.messages.find((m) => m.id === id || m.providerMessageId === id);
    if (msg) {
      res.json({ type: 'message', ...msg });
      return;
    }
    const cmp = st.campaigns.find((c) => c.id === id);
    if (cmp) {
      res.json({ type: 'campaign', ...cmp });
      return;
    }
    res.status(404).json({ error: 'Message or campaign ID not found.' });
  });

  // Carrier Delivery Receipt (DLR) Webhooks
  app.post('/api/webhooks/twilio/status', (req, res) => {
    const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body as {
      MessageSid?: string;
      MessageStatus?: string;
      ErrorCode?: string;
      ErrorMessage?: string;
    };
    if (MessageSid) {
      let matchedCampaignId: string | undefined;
      db.update((st) => {
        const msg = st.messages.find((m) => m.providerMessageId === MessageSid);
        if (!msg) return;
        matchedCampaignId = msg.campaignId;
        const normalized = String(MessageStatus || '').toLowerCase();
        if (normalized === 'delivered') {
          msg.status = 'delivered';
          msg.deliveredAt = new Date().toISOString();
        } else if (normalized === 'failed' || normalized === 'undelivered') {
          msg.status = 'failed';
          msg.errorCode = ErrorCode || 'TWILIO_DLR_FAILED';
          msg.errorMessage = ErrorMessage || `Carrier status: ${normalized}`;
        } else if (normalized === 'sent' || normalized === 'queued') {
          msg.status = 'sent';
        }
      });
      if (matchedCampaignId) recalculateCampaignStats(matchedCampaignId);
    }
    res.status(204).end();
  });

  app.post('/api/webhooks/dlr', (req, res) => {
    const { messageId, providerMessageId, status, errorMessage } = req.body as {
      messageId?: string;
      providerMessageId?: string;
      status?: string;
      errorMessage?: string;
    };
    let matchedCampaignId: string | undefined;
    db.update((st) => {
      const msg = st.messages.find(
        (m) =>
          (messageId && m.id === messageId) ||
          (providerMessageId && m.providerMessageId === providerMessageId)
      );
      if (!msg) return;
      matchedCampaignId = msg.campaignId;
      if (status === 'delivered') {
        msg.status = 'delivered';
        msg.deliveredAt = new Date().toISOString();
      } else if (status === 'failed') {
        msg.status = 'failed';
        msg.errorMessage = errorMessage || 'Carrier delivery failure reported';
      }
    });
    if (matchedCampaignId) recalculateCampaignStats(matchedCampaignId);
    res.json({ ok: true });
  });

  // Cross-Platform Deployment Kits (.exe & .apk)
  app.get('/api/deploy/manifest', (req, res) => {
    const baseUrl = getRequestBaseUrl(req);
    res.json(getDeployManifest(baseUrl));
  });

  app.get('/api/deploy/windows-exe-kit.zip', async (req, res) => {
    try {
      const buffer = await buildWindowsExeKitZip(getRequestBaseUrl(req));
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="RelaySMS-Windows-EXE-Kit.zip"'
      );
      res.send(buffer);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to package Windows kit.',
      });
    }
  });

  app.get('/api/deploy/android-apk-kit.zip', async (req, res) => {
    try {
      const buffer = await buildAndroidApkKitZip(getRequestBaseUrl(req));
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="RelaySMS-Android-APK-Kit.zip"'
      );
      res.send(buffer);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to package Android kit.',
      });
    }
  });

  // Vite dev middleware or production static build
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Production build not found. Run npm run build first.');
      }
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`RelaySMS server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
