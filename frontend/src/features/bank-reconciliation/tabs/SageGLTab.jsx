import React, { useState, useRef, useMemo } from 'react';
import { reconciliationApi } from '../reconciliationApi';
import toast from '../../../utils/toast';
import DataTable from '../../../components/ui/DataTable';
import TableSkeleton from '../../../components/ui/TableSkeleton';
import {
  fmt,
  normalizeSearchValue,
  formatBankAccountOptionLabel,
  BankSelect,
  Badge,
  StatusPill,
  EmptyState,
  SummaryCard,
} from '../components/shared';

const SageGLTab = () => {
  const [data, setData] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [deletingBank, setDeletingBank] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedBank, setSelectedBank] = useState('all');
  const [sageSearch, setSageSearch] = useState('');
  const [sageDetailSearch, setSageDetailSearch] = useState('');
  const [viewingBankSummary, setViewingBankSummary] = useState(null);

  // Main summaries table state
  const [summarySortColumn, setSummarySortColumn] = useState(null);
  const [summarySortDirection, setSummarySortDirection] = useState('asc');
  const [summaryColumnFilters, setSummaryColumnFilters] = useState({});
  const [summaryCurrentPage, setSummaryCurrentPage] = useState(1);
  const [summaryItemsPerPage, setSummaryItemsPerPage] = useState(15);

  // Detail modal table state
  const [detailSortColumn, setDetailSortColumn] = useState(null);
  const [detailSortDirection, setDetailSortDirection] = useState('asc');
  const [detailColumnFilters, setDetailColumnFilters] = useState({});
  const [detailCurrentPage, setDetailCurrentPage] = useState(1);
  const [detailItemsPerPage, setDetailItemsPerPage] = useState(15);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadBank, setUploadBank] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const load = async () => {
    setLoading(true);
    try {
      const [sageRes, bankAccountsRes] = await Promise.all([
        reconciliationApi.getSageTransactions(),
        reconciliationApi.getBankAccounts(),
      ]);
      const bankRows = Array.isArray(bankAccountsRes?.data)
        ? bankAccountsRes.data
        : Array.isArray(bankAccountsRes?.data?.items)
          ? bankAccountsRes.data.items
          : [];
      setData(sageRes.data);
      setBankAccounts(bankRows);
    } catch {
      toast.error('Failed to load Sage transactions');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, []);

  const selectedBankAccountNumber = String(selectedBank || '').trim();
  const selectedBankAccountRow = useMemo(() => {
    if (selectedBank === 'all') return null;
    return (bankAccounts || []).find((row) => String(row?.account_number || '').trim() === selectedBankAccountNumber) || null;
  }, [bankAccounts, selectedBank, selectedBankAccountNumber]);

  const selectedBankGlAccount = selectedBank === 'all'
    ? null
    : String(selectedBankAccountRow?.gl_account || selectedBankAccountNumber || '').trim();

  const selectedBankName = selectedBank === 'all'
    ? null
    : String(selectedBankAccountRow?.bank_name || '').trim();

  const selectedBankId = selectedBank === 'all'
    ? null
    : String(selectedBankAccountRow?.bank_id || '').trim();

  const handleFetch = async () => {
    setFetching(true);
    try {
      const accountNumber = selectedBank === 'all' ? null : (selectedBankGlAccount || selectedBankAccountNumber || null);
      const financialEntity = selectedBank === 'all' ? null : (selectedBankId || null);
      const res = await reconciliationApi.fetchSageTransactions(accountNumber, financialEntity);
      toast.success(res.data.message);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to fetch from Sage');
    } finally {
      setFetching(false);
    }
  };

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const openDeleteConfirmation = (bankName) => {
    const targetBank = String(bankName || '').trim();
    if (!targetBank) {
      toast.error('Missing bank name for delete.');
      return;
    }
    setDeleteTarget(targetBank);
  };

  const confirmDeleteBankTransactions = async () => {
    if (!deleteTarget) return;
    const targetBank = deleteTarget;
    const accountFilter = selectedBank === 'all'
      ? null
      : (selectedBankGlAccount || selectedBankAccountNumber || null);

    setDeleteLoading(true);
    setDeletingBank(targetBank);
    try {
      const res = await reconciliationApi.deleteSageTransactions(targetBank, accountFilter);
      toast.success(res?.data?.message || 'Sage transactions deleted');
      if (viewingBankSummary?.bank === targetBank) {
        setViewingBankSummary(null);
        setSageDetailSearch('');
      }
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete Sage transactions');
    } finally {
      setDeletingBank('');
      setDeleteLoading(false);
    }
  };

  const openUploadModal = () => {
    setUploadBank('');
    setUploadFile(null);
    if (fileRef.current) fileRef.current.value = '';
    setShowUploadModal(true);
  };

  const closeUploadModal = () => {
    setShowUploadModal(false);
    setUploadFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFileChange = (e) => {
    setUploadFile(e.target.files?.[0] || null);
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      toast.error('Please select an Excel file to upload.');
      return;
    }

    const selectedRow = bankAccounts.find(
      (r) => String(r?.account_number || '').trim() === uploadBank,
    );
    const accountNumber = selectedRow?.gl_account || selectedRow?.account_number || uploadBank || null;
    const bank = selectedRow?.bank_id || selectedRow?.bank_name || null;

    const fd = new FormData();
    fd.append('file', uploadFile);
    if (accountNumber) fd.append('account_number', accountNumber);
    if (bank) fd.append('bank', bank);

    setUploading(true);
    try {
      const res = await reconciliationApi.uploadSageTransactions(fd);
      toast.success(res.data.message || 'Upload successful');
      closeUploadModal();
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const bankOptions = useMemo(() => {
    const dedupedByAccount = new Map();
    (bankAccounts || []).forEach((row) => {
      const accountNumber = String(row?.account_number || '').trim();
      if (!accountNumber || dedupedByAccount.has(accountNumber)) return;
      dedupedByAccount.set(accountNumber, {
        value: accountNumber,
        label: formatBankAccountOptionLabel(row?.bank_id || row?.bank_name, accountNumber),
      });
    });
    return Array.from(dedupedByAccount.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [bankAccounts]);

  const filteredTransactions = useMemo(() => {
    const txns = data?.transactions || [];
    const byBank = selectedBank === 'all'
      ? txns
      : txns.filter((t) => {
        const txnBankName = String(t.bank || t.financial_entity || '').trim();
        const txnAccount = String(t.account || t.account_number || '').trim();
        return txnAccount === selectedBankGlAccount
          || txnAccount === selectedBankAccountNumber
          || (selectedBankId && txnBankName === selectedBankId)
          || (selectedBankName && txnBankName === selectedBankName);
      });
    const query = normalizeSearchValue(sageSearch).trim();
    if (!query) return byBank;
    return byBank.filter((t) => (
      normalizeSearchValue(t.bank || t.financial_entity).includes(query)
      || normalizeSearchValue(t.account).includes(query)
      || normalizeSearchValue(t.date).includes(query)
      || normalizeSearchValue(t.entry_date).includes(query)
      || normalizeSearchValue(t.doc_number || t.check_no).includes(query)
      || normalizeSearchValue(t.vendor).includes(query)
      || normalizeSearchValue(t.customer).includes(query)
      || normalizeSearchValue(t.record_type).includes(query)
      || normalizeSearchValue(t.description).includes(query)
      || normalizeSearchValue(t.transaction_type).includes(query)
      || normalizeSearchValue(t.amount).includes(query)
    ));
  }, [data, selectedBank, selectedBankGlAccount, selectedBankAccountNumber, selectedBankId, selectedBankName, sageSearch]);

  const filteredViewingTransactions = useMemo(() => {
    const rows = viewingBankSummary?.transactions || [];
    const query = normalizeSearchValue(sageDetailSearch).trim();
    if (!query) return rows;
    return rows.filter((t) => (
      normalizeSearchValue(t.date).includes(query)
      || normalizeSearchValue(t.entry_date).includes(query)
      || normalizeSearchValue(t.doc_number || t.check_no).includes(query)
      || normalizeSearchValue(t.account).includes(query)
      || normalizeSearchValue(t.transaction_type).includes(query)
      || normalizeSearchValue(t.tr_type || t.txn_type).includes(query)
      || normalizeSearchValue(t.vendor).includes(query)
      || normalizeSearchValue(t.customer).includes(query)
      || normalizeSearchValue(t.record_type).includes(query)
      || normalizeSearchValue(t.cleared).includes(query)
      || normalizeSearchValue(t.description).includes(query)
      || normalizeSearchValue(t.amount).includes(query)
      || normalizeSearchValue(t.is_matched ? 'matched' : 'unmatched').includes(query)
    ));
  }, [viewingBankSummary, sageDetailSearch]);

  const sortedViewingTransactions = useMemo(() => {
    if (!detailSortColumn) return filteredViewingTransactions;
    return [...filteredViewingTransactions].sort((a, b) => {
      let aVal = a[detailSortColumn] ?? '';
      let bVal = b[detailSortColumn] ?? '';
      if (detailSortColumn === 'check_no') {
        aVal = a.doc_number || a.check_no || '';
        bVal = b.doc_number || b.check_no || '';
      } else if (detailSortColumn === 'tr_type') {
        aVal = a.tr_type || a.txn_type || '';
        bVal = b.tr_type || b.txn_type || '';
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return detailSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return detailSortDirection === 'asc'
        ? String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' })
        : String(bVal).localeCompare(String(aVal), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [filteredViewingTransactions, detailSortColumn, detailSortDirection]);

  const filteredDebits = filteredTransactions
    .filter((t) => String(t.transaction_type || '').toLowerCase() === 'debit')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const filteredCredits = filteredTransactions
    .filter((t) => String(t.transaction_type || '').toLowerCase() === 'credit')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const bankSummaries = useMemo(() => {
    const grouped = new Map();
    filteredTransactions.forEach((t) => {
      const bankName = t.bank || t.financial_entity || 'Unknown Bank';
      if (!grouped.has(bankName)) {
        grouped.set(bankName, { bank: bankName, transactions: [], transactionCount: 0, debitTotal: 0, creditTotal: 0, totalAmount: 0 });
      }
      const item = grouped.get(bankName);
      const amount = Number(t.amount || 0);
      item.transactions.push(t);
      item.transactionCount += 1;
      item.totalAmount += amount;
      if (String(t.transaction_type || '').toLowerCase() === 'debit') item.debitTotal += amount;
      if (String(t.transaction_type || '').toLowerCase() === 'credit') item.creditTotal += amount;
    });
    return Array.from(grouped.values()).sort((a, b) => a.bank.localeCompare(b.bank));
  }, [filteredTransactions]);

  const sortedBankSummaries = useMemo(() => {
    if (!summarySortColumn) return bankSummaries;
    return [...bankSummaries].sort((a, b) => {
      let aVal = a[summarySortColumn] ?? '';
      let bVal = b[summarySortColumn] ?? '';
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return summarySortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return summarySortDirection === 'asc'
        ? String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' })
        : String(bVal).localeCompare(String(aVal), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [bankSummaries, summarySortColumn, summarySortDirection]);

  const summaryColumns = useMemo(() => [
    {
      header: 'Bank',
      accessor: 'bank',
      sortable: true,
      filterable: true,
      render: (val) => <span className="font-semibold text-gray-700">{val}</span>,
    },
    {
      header: 'Transactions',
      accessor: 'transactionCount',
      sortable: true,
      filterable: true,
      filterType: 'number',
      render: (val) => <span className="font-medium text-gray-600 text-right block">{val}</span>,
    },
    {
      header: 'Debits',
      accessor: 'debitTotal',
      sortable: true,
      filterable: true,
      filterType: 'number',
      filterRender: (val) => fmt(val),
      render: (val) => <span className="font-medium text-red-600 text-right block">{fmt(val)}</span>,
    },
    {
      header: 'Credits',
      accessor: 'creditTotal',
      sortable: true,
      filterable: true,
      filterType: 'number',
      filterRender: (val) => fmt(val),
      render: (val) => <span className="font-medium text-green-600 text-right block">{fmt(val)}</span>,
    },
    {
      header: 'Total Amount',
      accessor: 'totalAmount',
      sortable: true,
      filterable: true,
      filterType: 'number',
      filterRender: (val) => fmt(val),
      render: (val) => <span className="font-semibold text-gray-800 text-right block">{fmt(val)}</span>,
    },
    {
      header: 'Actions',
      accessor: 'actions',
      sortable: false,
      filterable: false,
      render: (_, bankRow) => (
        <div className="text-right flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => { setViewingBankSummary(bankRow); setSageDetailSearch(''); }}
            className="text-[#1e9bd8] hover:underline text-xs font-medium cursor-pointer"
          >
            View
          </button>
          <button
            type="button"
            onClick={() => openDeleteConfirmation(bankRow.bank)}
            disabled={deletingBank === bankRow.bank}
            title="Delete"
            className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {deletingBank === bankRow.bank
              ? <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
                </svg>
              )}
          </button>
        </div>
      ),
    },
  ], [deletingBank]);

  const detailColumns = useMemo(() => [
    {
      header: 'Txn Date',
      accessor: 'date',
      sortable: true,
      filterable: true,
      filterType: 'date',
      render: (val) => <span className="text-gray-500">{val || '-'}</span>,
    },
    {
      header: 'Entry Date',
      accessor: 'entry_date',
      sortable: true,
      filterable: true,
      filterType: 'date',
      render: (val) => <span className="text-gray-500">{val || '-'}</span>,
    },
    {
      header: 'Check No',
      accessor: 'check_no',
      sortable: true,
      filterable: true,
      getFilterValue: (row) => row.doc_number || row.check_no || '',
      render: (_, row) => <span className="font-mono text-xs text-gray-700">{row.doc_number || row.check_no || '-'}</span>,
    },
    {
      header: 'Account Number',
      accessor: 'account',
      sortable: true,
      filterable: true,
      render: (val) => <span className="bg-[#1e9bd8]/10 text-[#1e9bd8] px-2 py-0.5 rounded-full text-xs font-semibold font-mono">{val || '-'}</span>,
    },
    {
      header: 'Type',
      accessor: 'transaction_type',
      sortable: true,
      filterable: true,
      render: (val) => <Badge type={val} />,
    },
    {
      header: 'Txn Type',
      accessor: 'tr_type',
      sortable: true,
      filterable: true,
      getFilterValue: (row) => row.tr_type || row.txn_type || '',
      render: (_, row) => <span className="text-xs font-mono text-gray-400">{row.tr_type || row.txn_type || '-'}</span>,
    },
    {
      header: 'Txn Amount',
      accessor: 'amount',
      sortable: true,
      filterable: true,
      filterType: 'number',
      filterRender: (val) => fmt(val),
      render: (val) => <span className="font-medium text-gray-800 text-right block">{fmt(val)}</span>,
    },
    {
      header: 'Vendor',
      accessor: 'vendor',
      sortable: true,
      filterable: true,
      render: (val) => <span className="text-gray-700 max-w-[120px] truncate block" title={val}>{val || '-'}</span>,
    },
    {
      header: 'Customer',
      accessor: 'customer',
      sortable: true,
      filterable: true,
      render: (val) => <span className="text-gray-700 max-w-[120px] truncate block" title={val}>{val || '-'}</span>,
    },
    {
      header: 'Record Type',
      accessor: 'record_type',
      sortable: true,
      filterable: true,
      render: (val) => <span className="text-xs text-gray-500">{val || '-'}</span>,
    },
    {
      header: 'Cleared',
      accessor: 'cleared',
      sortable: true,
      filterable: true,
      render: (val) => <span className="text-xs text-gray-400">{val || '-'}</span>,
    },
    {
      header: 'Description',
      accessor: 'description',
      sortable: true,
      filterable: true,
      render: (val) => <span className="text-gray-700 max-w-[220px] truncate block" title={val}>{val || '-'}</span>,
    },
    {
      header: 'Status',
      accessor: 'is_matched',
      sortable: true,
      filterable: true,
      filterRender: (val) => (val ? 'Matched' : 'Unmatched'),
      render: (val) => <StatusPill matched={val} />,
    },
  ], []);

  return (
    <div className="flex flex-col space-y-6 h-full min-h-0 overflow-hidden">
      {/* Action bar */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3">
        <div className="flex items-center gap-3 flex-1">
          <label htmlFor="sage-bank-filter" className="text-xs font-semibold text-gray-700 whitespace-nowrap">Bank:</label>
          <BankSelect
            id="sage-bank-filter"
            value={selectedBank}
            onChange={setSelectedBank}
            options={bankOptions}
            allOptionLabel="All Banks"
            allOptionValue="all"
            className="w-44"
          />
          <input
            type="text"
            value={sageSearch}
            onChange={(e) => setSageSearch(e.target.value)}
            placeholder="Search Sage transactions"
            className="w-full max-w-xs bg-gray-50 border border-gray-200 text-gray-800 text-xs rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Upload Excel button */}
          <button
            id="sage-upload-excel-btn"
            onClick={openUploadModal}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium text-xs transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload Excel
          </button>
          {/* Sync from Sage button */}
          <button
            id="sage-sync-btn"
            onClick={handleFetch}
            disabled={fetching}
            className="flex items-center gap-1.5 bg-[#1e9bd8] hover:bg-[#1887c0] text-white px-4 py-2 rounded-lg font-medium text-xs transition-colors disabled:opacity-60 cursor-pointer"
          >
            {fetching
              ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Fetching</>
              : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Sync from Sage</>
            }
          </button>
        </div>
      </div>

      {loading && <TableSkeleton rowCount={8} columnCount={7} />}

      {!loading && data && filteredTransactions.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label="Total Transactions" value={filteredTransactions.length} />
            <SummaryCard label="Total Debits" value={fmt(filteredDebits)} color="text-red-600" />
            <SummaryCard label="Total Credits" value={fmt(filteredCredits)} color="text-green-600" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden p-3 space-y-2 flex-1 min-h-0 flex flex-col">
            <DataTable
              columns={summaryColumns}
              data={sortedBankSummaries}
              isClientSide={true}
              enableColumnFilters={true}
              sortColumn={summarySortColumn}
              sortDirection={summarySortDirection}
              onSort={(col, dir) => { setSummarySortColumn(col); setSummarySortDirection(dir); }}
              currentPage={summaryCurrentPage}
              itemsPerPage={summaryItemsPerPage}
              onPageChange={setSummaryCurrentPage}
              onItemsPerPageChange={setSummaryItemsPerPage}
              maxHeight="calc(100vh - 280px)"
              stickyHeader={true}
              expandable={false}
            />
          </div>
        </>
      )}

      {/* Detail modal */}
      {viewingBankSummary && (
        <div className="fixed inset-0 z-[2100] bg-black/40 backdrop-blur-[1px] p-4 md:p-6">
          <div className="bg-[#fff] rounded-2xl border border-gray-100 shadow-xl h-full flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-800 text-base">{viewingBankSummary.bank}</h3>
                <p className="text-xs text-gray-400 mt-1">{viewingBankSummary.transactionCount} transactions</p>
                <div className="mt-3 max-w-md">
                  <input
                    type="text"
                    value={sageDetailSearch}
                    onChange={(e) => setSageDetailSearch(e.target.value)}
                    placeholder="Search this bank's Sage transactions"
                    className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2.5"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setViewingBankSummary(null); setSageDetailSearch(''); }}
                className="inline-flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
            <div className="px-6 py-3 border-b border-gray-50 bg-gray-50/60">
              <div className="grid grid-cols-3 gap-3">
                <SummaryCard label="Debits" value={fmt(viewingBankSummary.debitTotal)} color="text-red-600" />
                <SummaryCard label="Credits" value={fmt(viewingBankSummary.creditTotal)} color="text-green-600" />
                <SummaryCard label="Total" value={fmt(viewingBankSummary.totalAmount)} color="text-[#1e9bd8]" />
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <DataTable
                columns={detailColumns}
                data={sortedViewingTransactions}
                isClientSide={true}
                enableColumnFilters={true}
                sortColumn={detailSortColumn}
                sortDirection={detailSortDirection}
                onSort={(col, dir) => { setDetailSortColumn(col); setDetailSortDirection(dir); }}
                currentPage={detailCurrentPage}
                itemsPerPage={detailItemsPerPage}
                onPageChange={setDetailCurrentPage}
                onItemsPerPageChange={setDetailItemsPerPage}
                maxHeight="calc(100vh - 360px)"
                stickyHeader={true}
                expandable={false}
              />
            </div>
          </div>
        </div>
      )}


      {/* Upload Excel modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[2200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md overflow-hidden">
            {/* Modal header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 text-base">Upload Sage Transactions</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Import from Excel / CSV export</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeUploadModal}
                disabled={uploading}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              {/* Bank account selector */}
              <div>
                <label htmlFor="upload-sage-bank" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Bank Account <span className="text-gray-400 font-normal">(optional — helps link transactions)</span>
                </label>
                <BankSelect
                  id="upload-sage-bank"
                  value={uploadBank}
                  onChange={setUploadBank}
                  options={bankOptions}
                  allOptionLabel="— No specific bank account —"
                  allOptionValue=""
                  className="w-full"
                />
              </div>

              {/* File picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Sage GL Export File <span className="text-red-500">*</span>
                </label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`relative flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors ${uploadFile
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-gray-200 bg-gray-50 hover:border-emerald-300 hover:bg-emerald-50/40'
                    }`}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {uploadFile ? (
                    <>
                      <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm font-semibold text-emerald-700">{uploadFile.name}</p>
                      <p className="text-xs text-emerald-500">{(uploadFile.size / 1024).toFixed(1)} KB — click to change</p>
                    </>
                  ) : (
                    <>
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-sm font-medium text-gray-600">Click to browse</p>
                      <p className="text-xs text-gray-400">.xlsx, .xls, .csv accepted</p>
                    </>
                  )}
                </div>
              </div>

              {/* Column hint */}
              <p className="text-xs text-gray-400 leading-relaxed">
                Expected columns:{' '}
                <span className="font-mono text-gray-500">
                  source_object, direction, date, doc_number, description, total, party_name, payment_method, display_state, cleared
                </span>
              </p>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeUploadModal}
                disabled={uploading}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="sage-upload-submit-btn"
                type="button"
                onClick={handleUpload}
                disabled={uploading || !uploadFile}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
              >
                {uploading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading…</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg> Upload</>
                )}
              </button>
            </div>
          </div>
        </div>
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
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Sage Transactions</h3>
            <p className="text-xs text-gray-600 mb-6 leading-relaxed">
              Are you sure you want to delete Sage transactions for <span className="font-semibold text-gray-800">{deleteTarget}</span>? This will un-match linked reconciliation records.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteBankTransactions}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {deleteLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete Transactions'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && (!data || filteredTransactions.length === 0) && (
        <EmptyState icon="📊" title="No Sage transactions yet" subtitle="Click 'Sync from Sage' or 'Upload Excel' to add GL entries" />
      )}
    </div>
  );
};

export default SageGLTab;
