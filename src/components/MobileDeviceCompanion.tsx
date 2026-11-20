import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Send,
  Smartphone,
  Wifi,
  XCircle,
} from 'lucide-react';
import type { MessageLog, SmsDevice } from '../types/sms';

interface MobileDeviceCompanionProps {
  pairCode: string;
  onExitBridge: () => void;
}

export const MobileDeviceCompanion: React.FC<MobileDeviceCompanionProps> = ({
  pairCode,
  onExitBridge,
}) => {
  const [device, setDevice] = useState<SmsDevice | null>(null);
  const [pendingJobs, setPendingJobs] = useState<MessageLog[]>([]);
  const [recentCompleted, setRecentCompleted] = useState<MessageLog[]>([]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadJobs = useCallback(async (deviceId: string) => {
    const resp = await fetch(`/api/devices/${deviceId}/jobs`);
    if (!resp.ok) return;
    const data = (await resp.json()) as {
      device: SmsDevice;
      pendingJobs: MessageLog[];
      recentCompleted: MessageLog[];
    };
    setDevice(data.device);
    setPendingJobs(data.pendingJobs || []);
    setRecentCompleted(data.recentCompleted || []);
  }, []);

  const sendHeartbeat = useCallback(
    async (deviceId: string, customPhone?: string, customCarrier?: string) => {
      await fetch(`/api/devices/${deviceId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: customPhone || undefined,
          carrierName: customCarrier || undefined,
          signalText: 'SIM Bridge Active',
        }),
      });
    },
    []
  );

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const resp = await fetch(`/api/devices/pair/${encodeURIComponent(pairCode)}`);
        const data = (await resp.json()) as { device?: SmsDevice; error?: string };
        if (!resp.ok || !data.device) {
          throw new Error(data.error || 'Pairing code not found.');
        }
        if (!active) return;
        setDevice(data.device);
        setPhoneNumber(data.device.phoneNumber || '');
        setCarrierName(data.device.carrierName || '');
        await sendHeartbeat(data.device.id);
        await loadJobs(data.device.id);
        setError(null);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to pair device.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void init();
    return () => {
      active = false;
    };
  }, [pairCode, loadJobs, sendHeartbeat]);

  useEffect(() => {
    if (!device?.id) return;
    const devId = device.id;
    const timer = setInterval(() => {
      void sendHeartbeat(devId);
      void loadJobs(devId);
    }, 3000);
    return () => clearInterval(timer);
  }, [device?.id, loadJobs, sendHeartbeat]);

  const buildSmsUri = (phone: string, body: string) => {
    const encoded = encodeURIComponent(body);
    const isIos =
      typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
    return isIos ? `sms:${phone}&body=${encoded}` : `sms:${phone}?body=${encoded}`;
  };

  const handleOpenPhoneSmsApp = async (job: MessageLog) => {
    if (!device) return;
    // Mark as claimed / sending on server if queued
    if (job.status === 'queued') {
      await fetch(`/api/devices/${device.id}/next-job`);
    }
    window.location.href = buildSmsUri(job.phone, job.renderedBody);
    await loadJobs(device.id);
  };

  const handleReportStatus = async (job: MessageLog, status: 'delivered' | 'failed') => {
    if (!device) return;
    setBusyId(job.id);
    try {
      await fetch(`/api/devices/${device.id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: job.id,
          status,
          protocolTrace:
            status === 'delivered'
              ? `SIM_BRIDGE (${device.name}) -> Sent via Phone Messages & Confirmed`
              : `SIM_BRIDGE (${device.name}) -> Marked Failed by Operator`,
        }),
      });
      await loadJobs(device.id);
    } finally {
      setBusyId(null);
    }
  };

  const handleUpdateSimInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!device) return;
    await sendHeartbeat(device.id, phoneNumber, carrierName);
    await loadJobs(device.id);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
          Connecting phone bridge ({pairCode})...
        </div>
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 text-center space-y-4">
          <XCircle className="mx-auto h-8 w-8 text-red-700" />
          <div className="text-sm font-medium text-slate-900">{error || 'Device not found'}</div>
          <button
            type="button"
            onClick={onExitBridge}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
          >
            Open Full RelaySMS Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-10">
      <header className="border-b border-slate-200 bg-white px-4 py-3.5">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-display text-sm font-semibold text-slate-900">
                {device.name}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                <Wifi className="h-3 w-3" />
                <span>Connected · Code {device.pairingCode}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onExitBridge}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shrink-0"
          >
            Dashboard
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-5 px-4 pt-5">
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              SIM Card &amp; Device Details
            </h2>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {device.messagesRelayed} relayed
            </span>
          </div>
          <form onSubmit={handleUpdateSimInfo} className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="SIM Phone (+1555...)"
              className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-700 focus:outline-none"
            />
            <input
              type="text"
              value={carrierName}
              onChange={(e) => setCarrierName(e.target.value)}
              placeholder="Carrier (e.g. T-Mobile)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-700 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
            >
              Save SIM Info
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-700" />
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Outgoing SMS Queue ({pendingJobs.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void loadJobs(device.id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>

          {pendingJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
              No messages waiting right now. Send a test SMS from RelaySMS desktop to this device and it will pop up here immediately.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingJobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900">
                      To: {job.phone}
                    </span>
                    <span className="font-mono text-xs text-slate-500 tabular-nums">
                      {job.segments} seg · {job.status}
                    </span>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 whitespace-pre-wrap">
                    {job.renderedBody}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void handleOpenPhoneSmsApp(job)}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-medium text-white hover:bg-blue-800"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Send in Phone Messages
                    </button>
                    <button
                      type="button"
                      disabled={busyId === job.id}
                      onClick={() => void handleReportStatus(job, 'delivered')}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Mark Delivered
                    </button>
                    <button
                      type="button"
                      disabled={busyId === job.id}
                      onClick={() => void handleReportStatus(job, 'failed')}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Failed
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {recentCompleted.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Recent Completed Tests
            </h2>
            <div className="divide-y divide-slate-200">
              {recentCompleted.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2 text-xs">
                  <div>
                    <div className="font-mono font-medium text-slate-800">{m.phone}</div>
                    <div className="truncate max-w-[230px] text-slate-500">{m.renderedBody}</div>
                  </div>
                  <span
                    className={`font-medium ${
                      m.status === 'delivered' ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {m.status === 'delivered' ? 'Delivered' : 'Failed'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
