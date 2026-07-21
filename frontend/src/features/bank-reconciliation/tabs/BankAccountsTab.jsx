import React, { useState, useRef } from 'react';
import { reconciliationApi } from '../reconciliationApi';
import toast from '../../../utils/toast';
import {
  normalizeSearchValue,
  EmptyState,
} from '../components/shared';

const BankAccountsTab = () => {
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [accountSearch, setAccountSearch] = useState('');
  const [deletingAccountId, setDeletingAccountId] = useState(null);
  const fileRef = useRef();

  const filteredAccounts = React.useMemo(() => {
    const query = normalizeSearchValue(accountSearch).trim();
    if (!query) return accounts;
    return accounts.filter((a) => (
      normalizeSearchValue(a.bank_id).includes(query)
      || normalizeSearchValue(a.bank_name).includes(query)
      || normalizeSearchValue(a.account_number).includes(query)
      || normalizeSearchValue(a.account_name).includes(query)
      || normalizeSearchValue(a.gl_account).includes(query)
      || normalizeSearchValue(a.gl_account_title).includes(query)
      || normalizeSearchValue(a.currency_code).includes(query)
      || normalizeSearchValue(a.source).includes(query)
      || normalizeSearchValue(a.is_active ? 'active' : 'inactive').includes(query)
    ));
  }, [accounts, accountSearch]);

  const loadBankAccounts = async () => {
    setLoading(true);
    try {
      const res = await reconciliationApi.getBankAccounts();
      setAccounts(res.data?.items || []);
    } catch {
      toast.error('Failed to load bank accounts');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { loadBankAccounts(); }, []);

  const handleFileUpload = async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);
    try {
      await reconciliationApi.uploadBankAccounts(formData);
      toast.success('Bank accounts file uploaded successfully');
      await loadBankAccounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSyncFromSage = async () => {
    setSyncing(true);
    try {
      const res = await reconciliationApi.syncBankAccounts();
      toast.success(res.data?.message || 'Synced from Sage successfully');
      await loadBankAccounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to sync from Sage');
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteAccount = async (id) => {
    if (!window.confirm('Are you sure you want to delete this bank account?')) return;
    setDeletingAccountId(id);
    try {
      await reconciliationApi.deleteBankAccount(id);
      toast.success('Bank account deleted');
      setAccounts((prev) => prev.filter((account) => account.id !== id));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete bank account');
    } finally {
      setDeletingAccountId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="w-full md:max-w-md">
            <input
              type="text"
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
              placeholder="Search bank accounts"
              className="mt-3 w-full bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2.5"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 bg-[#1e9bd8] hover:bg-[#1887c0] text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-60"
            >
              {uploading
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading...</>
                : <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload File
                </>
              }
            </button>
            <button
              type="button"
              onClick={handleSyncFromSage}
              disabled={syncing}
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-60"
            >
              {syncing
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Syncing...</>
                : <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync from Sage
                </>
              }
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-[#1e9bd8] border-t-transparent rounded-full animate-spin" /></div>
      )}

      {!loading && accounts.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <h3 className="font-semibold text-gray-700">Bank Accounts Master</h3>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-6 py-3">Bank ID</th>
                  <th className="text-left px-6 py-3">Bank Name</th>
                  <th className="text-left px-6 py-3">Account Number</th>
                  <th className="text-left px-6 py-3">GL Account</th>
                  <th className="text-left px-6 py-3">GL Account Title</th>
                  <th className="text-left px-6 py-3">Currency</th>
                  <th className="text-left px-6 py-3">Source</th>
                  <th className="text-right px-6 py-3">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredAccounts.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3 text-gray-700 font-mono text-xs">{a.bank_id || ''}</td>
                    <td className="px-6 py-3 text-gray-700">{a.bank_name || ''}</td>
                    <td className="px-6 py-3 text-gray-700 font-mono text-xs">{a.account_number || ''}</td>
                    <td className="px-6 py-3 text-gray-700 font-mono text-xs">{a.gl_account || ''}</td>
                    <td className="px-6 py-3 text-gray-700">{a.gl_account_title || ''}</td>
                    <td className="px-6 py-3 text-gray-700">{a.currency_code || ''}</td>
                    <td className="px-6 py-3 text-gray-500 text-xs">{a.source || ''}</td>
                    <td className="px-6 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteAccount(a.id)}
                        disabled={deletingAccountId === a.id}
                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors disabled:opacity-60"
                        title="Delete Bank Account"
                      >
                        {deletingAccountId === a.id
                          ? <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                          : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        }
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredAccounts.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-400">
                      No bank accounts found for your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && accounts.length === 0 && (
        <EmptyState icon="🏦" title="No bank accounts yet" subtitle="Upload a bank accounts file or sync from Sage to populate this table" />
      )}
    </div>
  );
};

export default BankAccountsTab;
