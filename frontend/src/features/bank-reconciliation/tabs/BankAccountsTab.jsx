import React, { useState, useRef, useMemo } from 'react';
import { reconciliationApi } from '../reconciliationApi';
import toast from '../../../utils/toast';
import DataTable from '../../../components/ui/DataTable';
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
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [columnFilters, setColumnFilters] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);
  const fileRef = useRef();

  const filteredAccounts = useMemo(() => {
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

  const sortedAccounts = useMemo(() => {
    if (!sortColumn) return filteredAccounts;
    return [...filteredAccounts].sort((a, b) => {
      let aVal = a[sortColumn] ?? '';
      let bVal = b[sortColumn] ?? '';
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortDirection === 'asc'
        ? String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' })
        : String(bVal).localeCompare(String(aVal), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [filteredAccounts, sortColumn, sortDirection]);

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

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const openDeleteConfirmation = (account) => {
    setDeleteTarget(account);
  };

  const confirmDeleteAccount = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteLoading(true);
    setDeletingAccountId(id);
    try {
      await reconciliationApi.deleteBankAccount(id);
      toast.success('Bank account deleted');
      setAccounts((prev) => prev.filter((account) => account.id !== id));
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete bank account');
    } finally {
      setDeletingAccountId(null);
      setDeleteLoading(false);
    }
  };

  const handleSort = (col, dir) => {
    setSortColumn(col);
    setSortDirection(dir);
  };

  const columns = useMemo(() => [
    {
      header: 'Bank ID',
      accessor: 'bank_id',
      sortable: true,
      filterable: true,
      render: (val) => <span className="font-mono text-xs text-gray-700">{val || '-'}</span>,
    },
    {
      header: 'Bank Name',
      accessor: 'bank_name',
      sortable: true,
      filterable: true,
      render: (val) => <span className="text-gray-700 font-medium">{val || '-'}</span>,
    },
    {
      header: 'Account Number',
      accessor: 'account_number',
      sortable: true,
      filterable: true,
      render: (val) => <span className="font-mono text-xs text-gray-700">{val || '-'}</span>,
    },
    {
      header: 'GL Account',
      accessor: 'gl_account',
      sortable: true,
      filterable: true,
      render: (val) => <span className="font-mono text-xs text-gray-700">{val || '-'}</span>,
    },
    {
      header: 'GL Account Title',
      accessor: 'gl_account_title',
      sortable: true,
      filterable: true,
      render: (val) => <span className="text-gray-700">{val || '-'}</span>,
    },
    {
      header: 'Currency',
      accessor: 'currency_code',
      sortable: true,
      filterable: true,
      render: (val) => <span className="text-gray-700">{val || '-'}</span>,
    },
    {
      header: 'Source',
      accessor: 'source',
      sortable: true,
      filterable: true,
      render: (val) => <span className="text-xs text-gray-500">{val || '-'}</span>,
    },
    {
      header: 'Status',
      accessor: 'is_active',
      sortable: true,
      filterable: true,
      filterRender: (val) => (val ? 'Active' : 'Inactive'),
      render: (val) => (
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${val !== false ? 'text-green-600' : 'text-gray-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${val !== false ? 'bg-green-500' : 'bg-gray-300'}`} />
          {val !== false ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      header: 'Actions',
      accessor: 'actions',
      sortable: false,
      filterable: false,
      render: (_, row) => (
        <div className="text-right" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => openDeleteConfirmation(row)}
            disabled={deletingAccountId === row.id}
            className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors disabled:opacity-60"
            title="Delete Bank Account"
          >
            {deletingAccountId === row.id
              ? <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            }
          </button>
        </div>
      ),
    },
  ], [deletingAccountId]);

  return (
    <div className="flex flex-col space-y-3 h-full min-h-0 overflow-hidden">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="w-full sm:w-64">
            <input
              type="text"
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
              placeholder="Search bank accounts"
              className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-xs rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2"
            />
          </div>
          <div className="flex items-center gap-2">
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
              className="inline-flex items-center gap-1.5 bg-[#1e9bd8] hover:bg-[#1887c0] text-white px-4 py-2 rounded-lg font-medium text-xs transition-colors disabled:opacity-60"
            >
              {uploading
                ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading...</>
                : <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium text-xs transition-colors disabled:opacity-60"
            >
              {syncing
                ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Syncing...</>
                : <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync from Sage
                </>
              }
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-[#1e9bd8] border-t-transparent rounded-full animate-spin" /></div>
      ) : accounts.length > 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden p-3 space-y-2 flex-1 min-h-0 flex flex-col">
          <div className="px-1 py-0.5">
            <h3 className="font-semibold text-gray-700 text-xs uppercase tracking-wider">Bank Accounts Master</h3>
          </div>
          <DataTable
            columns={columns}
            data={sortedAccounts}
            loading={loading}
            isClientSide={true}
            enableColumnFilters={true}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={setItemsPerPage}
            maxHeight="calc(100vh - 220px)"
            stickyHeader={true}
            expandable={false}
          />
        </div>
      ) : !uploading && !syncing && (
        <EmptyState icon="🏦" title="No bank accounts yet" subtitle="Upload a bank accounts file or sync from Sage to populate this table" />
      )}

      {/* Application Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[2200] bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-red-100 shadow-xl max-w-md w-full overflow-hidden p-6 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Bank Account</h3>
            <p className="text-xs text-gray-600 mb-6 leading-relaxed">
              Are you sure you want to delete bank account <span className="font-semibold text-gray-800">{deleteTarget.bank_name || deleteTarget.account_number}</span>?
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteAccount}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {deleteLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete Account'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankAccountsTab;
