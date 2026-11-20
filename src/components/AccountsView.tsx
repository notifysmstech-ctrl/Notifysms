import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  CreditCard,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserCheck,
} from 'lucide-react';
import type { Account, AccountRole, CreditTransaction, GatewayConfig } from '../types/sms';

interface AccountsViewProps {
  accounts: Account[];
  transactions: CreditTransaction[];
  gateways: GatewayConfig[];
  activeAccountId: string;
  onSelectActiveAccount: (id: string) => void;
  onRefresh: () => Promise<void>;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  accounts,
  transactions,
  gateways,
  activeAccountId,
  onSelectActiveAccount,
  onRefresh,
}) => {
  const [subTab, setSubTab] = useState<'customers' | 'sales' | 'ledger'>('customers');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create / Edit Account modal
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [role, setRole] = useState<AccountRole>('customer');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [ratePerSegment, setRatePerSegment] = useState(0.018);
  const [initialCredits, setInitialCredits] = useState(100);
  const [commissionRatePct, setCommissionRatePct] = useState(12);
  const [assignedSalesId, setAssignedSalesId] = useState('');
  const [defaultGatewayId, setDefaultGatewayId] = useState('');
  const [status, setStatus] = useState<'active' | 'suspended'>('active');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Credit Top-Up Modal
  const [topupAccount, setTopupAccount] = useState<Account | null>(null);
  const [topupAmount, setTopupAmount] = useState(100);
  const [topupNote, setTopupNote] = useState('Prepaid SMS credit top-up');

  const salesAccounts = useMemo(
    () => accounts.filter((a) => a.role === 'sales'),
    [accounts]
  );
  const customerAccounts = useMemo(
    () => accounts.filter((a) => a.role === 'customer'),
    [accounts]
  );

  const totalCustomerCredits = useMemo(
    () => customerAccounts.reduce((acc, a) => acc + a.creditsBalance, 0),
    [customerAccounts]
  );

  const totalCommissions = useMemo(
    () => transactions.reduce((acc, t) => acc + (t.commissionAmount || 0), 0),
    [transactions]
  );

  const copyKey = (id: string, key: string) => {
    void navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const openCreateModal = (targetRole: AccountRole) => {
    setEditingAccount(null);
    setRole(targetRole);
    setName('');
    setEmail('');
    setCompany('');
    setPhone('');
    setRatePerSegment(targetRole === 'sales' ? 0.012 : 0.018);
    setInitialCredits(targetRole === 'sales' ? 500 : 100);
    setCommissionRatePct(12);
    setAssignedSalesId(salesAccounts[0]?.id || '');
    setDefaultGatewayId(gateways[0]?.id || '');
    setStatus('active');
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (acc: Account) => {
    setEditingAccount(acc);
    setRole(acc.role);
    setName(acc.name);
    setEmail(acc.email);
    setCompany(acc.company);
    setPhone(acc.phone);
    setRatePerSegment(acc.ratePerSegment);
    setInitialCredits(acc.creditsBalance);
    setCommissionRatePct(acc.commissionRatePct ?? 10);
    setAssignedSalesId(acc.assignedSalesId || '');
    setDefaultGatewayId(acc.defaultGatewayId || '');
    setStatus(acc.status);
    setFormError(null);
    setShowModal(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const url = editingAccount ? `/api/accounts/${editingAccount.id}` : '/api/accounts';
      const resp = await fetch(url, {
        method: editingAccount ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          name,
          email,
          company,
          phone,
          ratePerSegment,
          initialCredits,
          commissionRatePct: role === 'sales' ? commissionRatePct : undefined,
          assignedSalesId: role === 'customer' ? assignedSalesId || undefined : undefined,
          defaultGatewayId: defaultGatewayId || undefined,
          status,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to save account.');
      setShowModal(false);
      await onRefresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save account.');
    } finally {
      setSaving(false);
    }
  };

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topupAccount) return;
    setSaving(true);
    try {
      const resp = await fetch(`/api/accounts/${topupAccount.id}/topup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: topupAmount, description: topupNote }),
      });
      if (resp.ok) {
        setTopupAccount(null);
        await onRefresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateKey = async (id: string) => {
    await fetch(`/api/accounts/${id}/regenerate-key`, { method: 'POST' });
    await onRefresh();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    if (activeAccountId === id) onSelectActiveAccount('acc_admin');
    await onRefresh();
  };

  const salesNameById = (id?: string) =>
    accounts.find((a) => a.id === id)?.name || 'Direct / Unassigned';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Sales &amp; Customer Accounts
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage reseller sales representatives, customer SMS balances, per-segment pricing, API keys, and commission attribution.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => openCreateModal('sales')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Sales Account
          </button>
          <button
            type="button"
            onClick={() => openCreateModal('customer')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-800 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Customer Account
          </button>
        </div>
      </div>

      {/* Summary KPI strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Customer Accounts</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {customerAccounts.length}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {customerAccounts.filter((a) => a.status === 'active').length} active
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Sales Accounts</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {salesAccounts.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">Reseller &amp; partner reps</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Customer Credit Pool</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            ${totalCustomerCredits.toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Available prepaid SMS balance</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Sales Commissions Logged</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            ${totalCommissions.toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {transactions.length} ledger transactions
          </div>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
          <button
            type="button"
            onClick={() => setSubTab('customers')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'customers'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Customer Accounts ({customerAccounts.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('sales')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'sales'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sales Accounts ({salesAccounts.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('ledger')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'ledger'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Credit &amp; Commission Ledger ({transactions.length})
          </button>
        </div>
      </div>

      {/* Customer Accounts Table */}
      {subTab === 'customers' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-500">
                <th className="px-5 py-3">Customer</th>
                <th className="px-4 py-3">Sales Rep</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-right">Rate / Seg</th>
                <th className="px-4 py-3 text-right">Sent</th>
                <th className="px-4 py-3">API Key</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {customerAccounts.map((acc) => {
                const isActive = activeAccountId === acc.id;
                return (
                  <tr key={acc.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-900">{acc.name}</div>
                      <div className="text-slate-500">
                        {acc.company || acc.email} · {acc.email}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">
                      {salesNameById(acc.assignedSalesId)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      ${acc.creditsBalance.toFixed(2)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-700 tabular-nums">
                      ${acc.ratePerSegment.toFixed(3)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-700 tabular-nums">
                      {acc.totalMessagesSent}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="inline-flex items-center gap-1.5 font-mono text-slate-600">
                        <span>{acc.apiKey.slice(0, 14)}…</span>
                        <button
                          type="button"
                          onClick={() => copyKey(acc.id, acc.apiKey)}
                          aria-label="Copy API key"
                          className="rounded p-1 hover:bg-slate-100"
                        >
                          {copiedId === acc.id ? (
                            <Check className="h-3 w-3 text-emerald-700" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRegenerateKey(acc.id)}
                          aria-label="Regenerate API key"
                          className="rounded p-1 hover:bg-slate-100"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`font-medium ${
                          acc.status === 'active' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {acc.status === 'active' ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setTopupAccount(acc);
                            setTopupAmount(100);
                            setTopupNote('Customer prepaid credit top-up');
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <CreditCard className="h-3 w-3" />
                          Top Up
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectActiveAccount(acc.id)}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium ${
                            isActive
                              ? 'bg-blue-50 text-blue-800'
                              : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <UserCheck className="h-3 w-3" />
                          {isActive ? 'Using' : 'Use'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(acc)}
                          aria-label="Edit customer account"
                          className="rounded p-1 text-slate-500 hover:bg-slate-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(acc.id)}
                          aria-label="Delete customer account"
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sales Accounts Table */}
      {subTab === 'sales' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-500">
                <th className="px-5 py-3">Sales Rep</th>
                <th className="px-4 py-3 text-right">Assigned Customers</th>
                <th className="px-4 py-3 text-right">Commission %</th>
                <th className="px-4 py-3 text-right">Earned Commission</th>
                <th className="px-4 py-3 text-right">Reseller Pool</th>
                <th className="px-4 py-3">API Key</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {salesAccounts.map((sales) => {
                const assignedCount = customerAccounts.filter(
                  (c) => c.assignedSalesId === sales.id
                ).length;
                const earned = transactions
                  .filter((t) => t.salesAccountId === sales.id)
                  .reduce((acc, t) => acc + (t.commissionAmount || 0), 0);
                const isActive = activeAccountId === sales.id;
                return (
                  <tr key={sales.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-900">{sales.name}</div>
                      <div className="text-slate-500">
                        {sales.company || 'Sales Channel'} · {sales.email}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                      {assignedCount}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                      {sales.commissionRatePct ?? 0}%
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                      ${earned.toFixed(2)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                      ${sales.creditsBalance.toFixed(2)}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-600">
                      <div className="inline-flex items-center gap-1.5">
                        <span>{sales.apiKey.slice(0, 14)}…</span>
                        <button
                          type="button"
                          onClick={() => copyKey(sales.id, sales.apiKey)}
                          className="rounded p-1 hover:bg-slate-100"
                        >
                          {copiedId === sales.id ? (
                            <Check className="h-3 w-3 text-emerald-700" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectActiveAccount(sales.id)}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium ${
                            isActive
                              ? 'bg-blue-50 text-blue-800'
                              : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <UserCheck className="h-3 w-3" />
                          {isActive ? 'Using' : 'Use'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(sales)}
                          aria-label="Edit sales account"
                          className="rounded p-1 text-slate-500 hover:bg-slate-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(sales.id)}
                          aria-label="Delete sales account"
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Credit & Commission Ledger */}
      {subTab === 'ledger' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-500">
                <th className="px-5 py-3">Timestamp</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Balance After</th>
                <th className="px-5 py-3 text-right">Sales Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {transactions.map((txn) => (
                <tr key={txn.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono text-slate-500 tabular-nums whitespace-nowrap">
                    {new Date(txn.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{txn.accountName}</td>
                  <td className="px-4 py-3 uppercase font-mono text-slate-600">{txn.type}</td>
                  <td className="px-4 py-3 text-slate-600">{txn.description}</td>
                  <td
                    className={`px-4 py-3 text-right font-mono font-medium tabular-nums ${
                      txn.amount >= 0 ? 'text-emerald-700' : 'text-slate-800'
                    }`}
                  >
                    {txn.amount >= 0 ? `+$${txn.amount.toFixed(4)}` : `-$${Math.abs(txn.amount).toFixed(4)}`}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    ${txn.balanceAfter.toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-emerald-700 tabular-nums">
                    {txn.commissionAmount ? `$${txn.commissionAmount.toFixed(4)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Account Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {editingAccount
                ? `Edit ${role === 'sales' ? 'Sales' : 'Customer'} Account`
                : `Create ${role === 'sales' ? 'Sales' : 'Customer'} Account`}
            </h2>
            {formError && (
              <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                {formError}
              </p>
            )}

            <form onSubmit={handleSaveAccount} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Account Name</label>
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={role === 'sales' ? 'e.g. Alex Rivera' : 'e.g. Acme Dispatch Ltd'}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Email</label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Company</label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Phone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+15550104500"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Rate / Segment ($)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={ratePerSegment}
                    onChange={(e) => setRatePerSegment(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                  />
                </div>

                {!editingAccount && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Opening Credits ($)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={initialCredits}
                      onChange={(e) => setInitialCredits(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                    />
                  </div>
                )}

                {role === 'sales' ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Commission (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="80"
                      value={commissionRatePct}
                      onChange={(e) => setCommissionRatePct(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Assigned Sales Rep
                    </label>
                    <select
                      value={assignedSalesId}
                      onChange={(e) => setAssignedSalesId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
                    >
                      <option value="">Direct (No Sales Rep)</option>
                      {salesAccounts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.commissionRatePct}%)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Default Gateway Route
                  </label>
                  <select
                    value={defaultGatewayId}
                    onChange={(e) => setDefaultGatewayId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  >
                    <option value="">Workspace Default</option>
                    {gateways.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                {editingAccount && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as 'active' | 'suspended')}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                    >
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2.5 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top Up Credits Modal */}
      {topupAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Top Up SMS Credits
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {topupAccount.name} · Current balance:{' '}
              <span className="font-mono font-semibold text-slate-800">
                ${topupAccount.creditsBalance.toFixed(2)}
              </span>
            </p>
            <form onSubmit={handleTopup} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Credit Amount ($)
                </label>
                <input
                  required
                  type="number"
                  step="0.01"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Memo</label>
                <input
                  type="text"
                  value={topupNote}
                  onChange={(e) => setTopupNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2.5 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setTopupAccount(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {saving ? 'Applying...' : 'Add Credits'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
