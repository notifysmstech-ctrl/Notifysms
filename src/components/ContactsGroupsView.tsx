import React, { useMemo, useState } from 'react';
import {
  Download,
  FolderPlus,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Contact, ContactGroup } from '../types/sms';
import { COUNTRY_NETWORKS, detectCountryFromPhone } from '../utils/countryNetworks';

interface ContactsGroupsViewProps {
  contacts: Contact[];
  groups: ContactGroup[];
  onRefresh: () => Promise<void>;
  onComposeToGroup: (groupId: string) => void;
}

function parseCsvText(raw: string): Array<{
  firstName: string;
  lastName: string;
  phone: string;
  company: string;
  email: string;
}> {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const firstCells = splitLine(lines[0]).map((c) => c.toLowerCase());
  const hasHeader =
    firstCells.some((h) => h.includes('phone') || h.includes('mobile') || h.includes('name'));

  let idxPhone = 0;
  let idxFirst = -1;
  let idxLast = -1;
  let idxName = -1;
  let idxCompany = -1;
  let idxEmail = -1;

  if (hasHeader) {
    idxPhone = firstCells.findIndex((h) => h.includes('phone') || h.includes('mobile') || h.includes('number'));
    idxFirst = firstCells.findIndex((h) => h === 'firstname' || h === 'first_name' || h === 'first name');
    idxLast = firstCells.findIndex((h) => h === 'lastname' || h === 'last_name' || h === 'last name');
    idxName = firstCells.findIndex((h) => h === 'name' || h === 'full name');
    idxCompany = firstCells.findIndex((h) => h.includes('company') || h.includes('org'));
    idxEmail = firstCells.findIndex((h) => h.includes('email'));
    if (idxPhone === -1) idxPhone = 0;
  } else {
    // Assume phone, firstName, lastName, company OR firstName, phone
    if (/[\d+]/.test(firstCells[0]) && firstCells[0].replace(/[^\d]/g, '').length >= 7) {
      idxPhone = 0;
      idxFirst = 1;
      idxLast = 2;
      idxCompany = 3;
    } else {
      idxFirst = 0;
      idxPhone = 1;
      idxCompany = 2;
    }
  }

  const startIdx = hasHeader ? 1 : 0;
  const rows: Array<{
    firstName: string;
    lastName: string;
    phone: string;
    company: string;
    email: string;
  }> = [];

  for (let i = startIdx; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const phone = cols[idxPhone] || '';
    if (!phone) continue;

    let firstName = idxFirst >= 0 ? cols[idxFirst] || '' : '';
    let lastName = idxLast >= 0 ? cols[idxLast] || '' : '';
    if (!firstName && idxName >= 0 && cols[idxName]) {
      const parts = cols[idxName].split(/\s+/);
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ');
    }

    rows.push({
      firstName: firstName || 'Contact',
      lastName,
      phone,
      company: idxCompany >= 0 ? cols[idxCompany] || '' : '',
      email: idxEmail >= 0 ? cols[idxEmail] || '' : '',
    });
  }

  return rows;
}

export const ContactsGroupsView: React.FC<ContactsGroupsViewProps> = ({
  contacts,
  groups,
  onRefresh,
  onComposeToGroup,
}) => {
  const [subTab, setSubTab] = useState<'contacts' | 'groups'>('contacts');
  const [search, setSearch] = useState('');
  const [filterGroupId, setFilterGroupId] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkGroupId, setBulkGroupId] = useState<string>(groups[0]?.id || '');

  // Contact modal state
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [cFirst, setCFirst] = useState('');
  const [cLast, setCLast] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cCompany, setCCompany] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cNotes, setCNotes] = useState('');
  const [cGroupIds, setCGroupIds] = useState<string[]>([]);
  const [cOptedOut, setCOptedOut] = useState(false);
  const [cCountryDialCode, setCCountryDialCode] = useState<string>('');

  // Import CSV modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importGroupId, setImportGroupId] = useState<string>('');
  const [importCountryDialCode, setImportCountryDialCode] = useState<string>('');
  const [importSummary, setImportSummary] = useState<string | null>(null);

  // Group modal state
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ContactGroup | null>(null);
  const [gName, setGName] = useState('');
  const [gDesc, setGDesc] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const groupMap = useMemo(() => {
    const m = new Map<string, ContactGroup>();
    for (const g of groups) m.set(g.id, g);
    return m;
  }, [groups]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (filterGroupId !== 'all' && !c.groupIds.includes(filterGroupId)) return false;
      if (!q) return true;
      return (
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    });
  }, [contacts, filterGroupId, search]);

  const openNewContact = () => {
    setEditingContact(null);
    setCFirst('');
    setCLast('');
    setCPhone('');
    setCCompany('');
    setCEmail('');
    setCNotes('');
    setCGroupIds(filterGroupId !== 'all' ? [filterGroupId] : []);
    setCOptedOut(false);
    setFormError(null);
    setShowContactModal(true);
  };

  const openEditContact = (c: Contact) => {
    setEditingContact(c);
    setCFirst(c.firstName);
    setCLast(c.lastName);
    setCPhone(c.phone);
    setCCompany(c.company);
    setCEmail(c.email);
    setCNotes(c.notes);
    setCGroupIds(c.groupIds);
    setCOptedOut(c.optedOut);
    setFormError(null);
    setShowContactModal(true);
  };

  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const payload = {
        firstName: cFirst,
        lastName: cLast,
        phone: cPhone,
        company: cCompany,
        email: cEmail,
        notes: cNotes,
        groupIds: cGroupIds,
        optedOut: cOptedOut,
        defaultCountryDialCode: cCountryDialCode || undefined,
      };
      const url = editingContact
        ? `/api/contacts/${editingContact.id}`
        : '/api/contacts';
      const resp = await fetch(url, {
        method: editingContact ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to save contact.');
      setShowContactModal(false);
      await onRefresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save contact.');
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = async (id: string) => {
    await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    await onRefresh();
  };

  const toggleOptOut = async (c: Contact) => {
    await fetch(`/api/contacts/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optedOut: !c.optedOut }),
    });
    await onRefresh();
  };

  const handleBulkAssign = async (mode: 'add' | 'remove') => {
    const targetGroup = bulkGroupId || groups[0]?.id;
    if (!targetGroup || selectedIds.length === 0) return;
    await fetch('/api/contacts/bulk-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactIds: selectedIds,
        groupId: targetGroup,
        mode,
      }),
    });
    setSelectedIds([]);
    await onRefresh();
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result || ''));
    };
    reader.readAsText(file);
  };

  const runCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const rows = parseCsvText(csvText);
    if (rows.length === 0) {
      setFormError('No valid rows detected. Include phone numbers in CSV format.');
      return;
    }
    setSaving(true);
    try {
      const resp = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          groupId: importGroupId || undefined,
          defaultCountryDialCode: importCountryDialCode || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Import failed.');
      setImportSummary(
        `Imported ${data.imported} contacts (${data.skipped} duplicates updated, ${data.invalid} invalid phones skipped).`
      );
      await onRefresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setSaving(false);
    }
  };

  const exportContactsCsv = () => {
    const header = 'FirstName,LastName,Phone,Company,Email,OptedOut,Groups\n';
    const body = filteredContacts
      .map((c) => {
        const gNames = c.groupIds
          .map((gid) => groupMap.get(gid)?.name)
          .filter(Boolean)
          .join('; ');
        return [
          c.firstName,
          c.lastName,
          c.phone,
          c.company,
          c.email,
          c.optedOut ? 'true' : 'false',
          gNames,
        ]
          .map((v) => `"${String(v || '').replace(/"/g, '""')}"`)
          .join(',');
      })
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'relaysms-contacts.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const openNewGroup = () => {
    setEditingGroup(null);
    setGName('');
    setGDesc('');
    setFormError(null);
    setShowGroupModal(true);
  };

  const openEditGroup = (g: ContactGroup) => {
    setEditingGroup(g);
    setGName(g.name);
    setGDesc(g.description);
    setFormError(null);
    setShowGroupModal(true);
  };

  const saveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const url = editingGroup ? `/api/groups/${editingGroup.id}` : '/api/groups';
      const resp = await fetch(url, {
        method: editingGroup ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gName, description: gDesc }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to save group.');
      setShowGroupModal(false);
      await onRefresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save group.');
    } finally {
      setSaving(false);
    }
  };

  const deleteGroup = async (id: string) => {
    await fetch(`/api/groups/${id}`, { method: 'DELETE' });
    if (filterGroupId === id) setFilterGroupId('all');
    await onRefresh();
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredContacts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredContacts.map((c) => c.id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Contacts &amp; Group Directory
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Organize E.164 verified recipients into segmented distribution lists and manage opt-out compliance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
            <button
              type="button"
              onClick={() => setSubTab('contacts')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                subTab === 'contacts'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Contacts ({contacts.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('groups')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                subTab === 'groups'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Contact Groups ({groups.length})
            </button>
          </div>

          {subTab === 'contacts' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setImportSummary(null);
                  setFormError(null);
                  setShowImportModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
              >
                <Upload className="h-3.5 w-3.5" />
                Import CSV
              </button>
              <button
                type="button"
                onClick={openNewContact}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-800 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Contact
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={openNewGroup}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-800 whitespace-nowrap"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              New Group
            </button>
          )}
        </div>
      </div>

      {subTab === 'contacts' ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, phone, company..."
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                />
              </div>

              <select
                value={filterGroupId}
                onChange={(e) => setFilterGroupId(e.target.value)}
                aria-label="Filter by contact group"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-700 focus:outline-none"
              >
                <option value="all">All groups ({contacts.length})</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={exportContactsCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>

          {/* Bulk group assignment bar */}
          {selectedIds.length > 0 && groups.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs">
              <span className="font-medium text-slate-800 tabular-nums">
                {selectedIds.length} contacts selected
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={bulkGroupId || groups[0]?.id || ''}
                  onChange={(e) => setBulkGroupId(e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleBulkAssign('add')}
                  className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-800"
                >
                  Add to Group
                </button>
                <button
                  type="button"
                  onClick={() => void handleBulkAssign('remove')}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
                >
                  Remove from Group
                </button>
              </div>
            </div>
          )}

          {filteredContacts.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-900">No contacts match your filter</p>
              <p className="mt-1 text-xs text-slate-500">
                Add a contact manually or import a CSV spreadsheet to build your SMS directory.
              </p>
              <button
                type="button"
                onClick={openNewContact}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800"
              >
                Add Contact
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={
                          filteredContacts.length > 0 &&
                          selectedIds.length === filteredContacts.length
                        }
                        onChange={toggleSelectAll}
                        aria-label="Select all contacts"
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700"
                      />
                    </th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Phone (E.164)</th>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Groups</th>
                    <th className="px-4 py-3">Consent</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredContacts.map((c) => {
                    const gNames = c.groupIds
                      .map((gid) => groupMap.get(gid)?.name)
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(c.id)}
                            onChange={() =>
                              setSelectedIds((prev) =>
                                prev.includes(c.id)
                                  ? prev.filter((x) => x !== c.id)
                                  : [...prev, c.id]
                              )
                            }
                            aria-label={`Select ${c.firstName} ${c.lastName}`}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">
                            {c.firstName} {c.lastName}
                          </div>
                          {c.email && <div className="text-xs text-slate-500">{c.email}</div>}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-800 tabular-nums">
                          <div>{c.phone}</div>
                          {(() => {
                            const net = detectCountryFromPhone(c.phone);
                            return net ? (
                              <div className="font-sans text-[11px] text-slate-500">
                                {net.iso2} · {net.name}
                              </div>
                            ) : null;
                          })()}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{c.company || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{gNames || 'Unassigned'}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => void toggleOptOut(c)}
                            className={`text-xs font-medium hover:underline ${
                              c.optedOut ? 'text-red-700' : 'text-emerald-700'
                            }`}
                          >
                            {c.optedOut ? 'Opted out' : 'Subscribed'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditContact(c)}
                              aria-label="Edit contact"
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteContact(c.id)}
                              aria-label="Delete contact"
                              className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-700"
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
        </div>
      ) : (
        /* Contact Groups View */
        <div className="rounded-xl border border-slate-200 bg-white">
          {groups.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-900">No contact groups created</p>
              <p className="mt-1 text-xs text-slate-500">
                Create groups like Operations, VIP Clients, or Regional Drivers for targeted bulk SMS.
              </p>
              <button
                type="button"
                onClick={openNewGroup}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800"
              >
                Create First Group
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="px-5 py-3">Group Name</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Reachable</th>
                    <th className="px-4 py-3 text-right">Opted Out</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {groups.map((g) => {
                    const members = contacts.filter((c) => c.groupIds.includes(g.id));
                    const active = members.filter((c) => !c.optedOut).length;
                    const opted = members.length - active;
                    return (
                      <tr key={g.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3.5 font-medium text-slate-900">{g.name}</td>
                        <td className="px-4 py-3.5 text-xs text-slate-600">
                          {g.description || '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-xs text-slate-900 tabular-nums">
                          {active}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-xs text-slate-500 tabular-nums">
                          {opted}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onComposeToGroup(g.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 whitespace-nowrap"
                            >
                              <Send className="h-3 w-3" />
                              Send Bulk SMS
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditGroup(g)}
                              aria-label="Edit group"
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteGroup(g.id)}
                              aria-label="Delete group"
                              className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-700"
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
        </div>
      )}

      {/* Add / Edit Contact Modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {editingContact ? 'Edit Contact' : 'Add New Contact'}
            </h2>
            {formError && (
              <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                {formError}
              </p>
            )}
            <form onSubmit={saveContact} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">First Name</label>
                  <input
                    required
                    type="text"
                    value={cFirst}
                    onChange={(e) => setCFirst(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Last Name</label>
                  <input
                    type="text"
                    value={cLast}
                    onChange={(e) => setCLast(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Default Country (if local format)
                  </label>
                  <select
                    value={cCountryDialCode}
                    onChange={(e) => setCCountryDialCode(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-blue-700 focus:outline-none"
                  >
                    <option value="">Auto (+ prefix or 10-digit US)</option>
                    {COUNTRY_NETWORKS.map((c) => (
                      <option key={c.iso2} value={c.dialCode}>
                        {c.name} ({c.dialCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Phone Number (E.164 or Local)
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="+447911123456 or 07911123456"
                    value={cPhone}
                    onChange={(e) => setCPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Company</label>
                <input
                  type="text"
                  value={cCompany}
                  onChange={(e) => setCCompany(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={cEmail}
                  onChange={(e) => setCEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none"
                />
              </div>

              {groups.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-slate-700">Assign to Groups</div>
                  <div className="mt-1.5 flex flex-wrap gap-3">
                    {groups.map((g) => (
                      <label key={g.id} className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={cGroupIds.includes(g.id)}
                          onChange={() =>
                            setCGroupIds((prev) =>
                              prev.includes(g.id)
                                ? prev.filter((id) => id !== g.id)
                                : [...prev, g.id]
                            )
                          }
                          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700"
                        />
                        {g.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={cOptedOut}
                  onChange={(e) => setCOptedOut(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700"
                />
                Contact has opted out (suppress all bulk SMS sends)
              </label>

              <div className="flex justify-end gap-2.5 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowContactModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Bulk Import Contacts (CSV)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Upload a CSV file or paste rows with headers such as <span className="font-mono">firstName,lastName,phone,company</span>.
            </p>
            {formError && (
              <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                {formError}
              </p>
            )}
            {importSummary && (
              <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {importSummary}
              </p>
            )}
            <form onSubmit={runCsvImport} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">Upload .CSV file</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFile}
                  className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-800 hover:file:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Or paste CSV rows
                </label>
                <textarea
                  rows={5}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={'firstName,lastName,phone,company\nJordan,Lee,+15550104300,Apex Freight'}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-mono text-xs focus:border-blue-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Default Country for Local Numbers
                  </label>
                  <select
                    value={importCountryDialCode}
                    onChange={(e) => setImportCountryDialCode(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  >
                    <option value="">Global E.164 (+ prefixed)</option>
                    {COUNTRY_NETWORKS.map((c) => (
                      <option key={c.iso2} value={c.dialCode}>
                        {c.name} ({c.dialCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Assign to Group (optional)
                  </label>
                  <select
                    value={importGroupId}
                    onChange={(e) => setImportGroupId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  >
                    <option value="">No group</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {saving ? 'Importing...' : 'Import Contacts'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {editingGroup ? 'Edit Contact Group' : 'Create Contact Group'}
            </h2>
            {formError && (
              <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                {formError}
              </p>
            )}
            <form onSubmit={saveGroup} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">Group Name</label>
                <input
                  required
                  type="text"
                  value={gName}
                  onChange={(e) => setGName(e.target.value)}
                  placeholder="e.g. Regional Warehouse Leads"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Description</label>
                <textarea
                  rows={3}
                  value={gDesc}
                  onChange={(e) => setGDesc(e.target.value)}
                  placeholder="Purpose and audience notes..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-700 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2.5 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
