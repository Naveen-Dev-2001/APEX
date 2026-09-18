import React, { useState, useRef, useMemo } from 'react';
import { reconciliationApi } from '../reconciliationApi';
import toast from '../../../utils/toast';
import DataTable from '../../../components/ui/DataTable';
import TableSkeleton from '../../../components/ui/TableSkeleton';
import {
  fmt,
  normalizeSearchValue,
  formatStatementMonthLabel,
  formatBankAccountOptionLabel,
  BankSelect,
  SearchSelect,
  Badge,
  StatusPill,
  EmptyState,
  SummaryCard,
  AccountBanner,
} from '../components/shared';

const BankStatementTab = () => {
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statements, setStatements] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedBank, setSelectedBank] = useState('all');
  const [uploadStatementMonth, setUploadStatementMonth] = useState('');
  const [uploadStatementYear, setUploadStatementYear] = useState('');
  const [statementSearch, setStatementSearch] = useState('');
  const [transactionSearch, setTransactionSearch] = useState('');
  const [selectedStatement, setSelectedStatement] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const fileRef = useRef();

  // State for main statements table
  const [stmtSortColumn, setStmtSortColumn] = useState(null);
  const [stmtSortDirection, setStmtSortDirection] = useState('asc');
  const [stmtColumnFilters, setStmtColumnFilters] = useState({});
  const [stmtCurrentPage, setStmtCurrentPage] = useState(1);
  const [stmtItemsPerPage, setStmtItemsPerPage] = useState(15);

  // State for transaction details modal table
  const [txnSortColumn, setTxnSortColumn] = useState(null);
  const [txnSortDirection, setTxnSortDirection] = useState('asc');
  const [txnColumnFilters, setTxnColumnFilters] = useState({});
  const [txnCurrentPage, setTxnCurrentPage] = useState(1);
  const [txnItemsPerPage, setTxnItemsPerPage] = useState(15);

  const monthDropdownOptions = useMemo(() => ([
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ]), []);

  const yearDropdownOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let year = currentYear; year >= currentYear - 10; year -= 1) {
      years.push({ value: String(year), label: String(year) });
    }
    return years;
  }, []);

  const availableMonthDropdownOptions = useMemo(() => {
    const now = new Date();
    const currentYear = String(now.getFullYear());
    const currentMonth = now.getMonth() + 1;
    if (uploadStatementYear === currentYear) {
      return monthDropdownOptions.filter((option) => Number(option.value) <= currentMonth);
    }
    return monthDropdownOptions;
  }, [monthDropdownOptions, uploadStatementYear]);

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

  const filteredStatements = useMemo(() => {
    const byBank = selectedBank === 'all'
      ? statements
      : statements.filter((s) => String(s.account_number || '').trim() === String(selectedBank).trim());
    const query = normalizeSearchValue(statementSearch).trim();
    if (!query) return byBank;
    return byBank.filter((s) => (
      normalizeSearchValue(s.filename).includes(query)
      || normalizeSearchValue(s.account_number).includes(query)
      || normalizeSearchValue(formatStatementMonthLabel(s.statement_month)).includes(query)
      || normalizeSearchValue(s.statement_month).includes(query)
      || normalizeSearchValue(s.status).includes(query)
      || normalizeSearchValue(s.transaction_count).includes(query)
      || normalizeSearchValue(new Date(s.upload_date).toLocaleDateString()).includes(query)
    ));
  }, [selectedBank, statements, statementSearch]);

  const sortedStatements = useMemo(() => {
    if (!stmtSortColumn) return filteredStatements;
    return [...filteredStatements].sort((a, b) => {
      let aVal = a[stmtSortColumn] ?? '';
      let bVal = b[stmtSortColumn] ?? '';
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return stmtSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return stmtSortDirection === 'asc'
        ? String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' })
        : String(bVal).localeCompare(String(aVal), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [filteredStatements, stmtSortColumn, stmtSortDirection]);

  const filteredStatementTransactions = useMemo(() => {
    const rows = transactions?.transactions || [];
    const query = normalizeSearchValue(transactionSearch).trim();
    if (!query) return rows;
    return rows.filter((t) => (
      normalizeSearchValue(t.date).includes(query)
      || normalizeSearchValue(t.description).includes(query)
      || normalizeSearchValue(t.account_name).includes(query)
      || normalizeSearchValue(t.account_number || selectedStatement?.account_number).includes(query)
      || normalizeSearchValue(t.check_number).includes(query)
      || normalizeSearchValue(t.transaction_type).includes(query)
      || normalizeSearchValue(t.reference).includes(query)
      || normalizeSearchValue(t.status).includes(query)
      || normalizeSearchValue(t.amount).includes(query)
      || normalizeSearchValue(t.debit).includes(query)
      || normalizeSearchValue(t.credit).includes(query)
    ));
  }, [transactions, transactionSearch, selectedStatement]);

  const sortedStatementTransactions = useMemo(() => {
    if (!txnSortColumn) return filteredStatementTransactions;
    return [...filteredStatementTransactions].sort((a, b) => {
      let aVal = a[txnSortColumn] ?? '';
      let bVal = b[txnSortColumn] ?? '';
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return txnSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return txnSortDirection === 'asc'
        ? String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' })
        : String(bVal).localeCompare(String(aVal), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [filteredStatementTransactions, txnSortColumn, txnSortDirection]);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchStatements = async () => {
    try {
      const [statementsRes, bankAccountsRes] = await Promise.all([
        reconciliationApi.getStatements(),
        reconciliationApi.getBankAccounts(),
      ]);
      const bankRows = Array.isArray(bankAccountsRes?.data)
        ? bankAccountsRes.data
        : Array.isArray(bankAccountsRes?.data?.items)
          ? bankAccountsRes.data.items
          : [];
      setStatements(statementsRes.data);
      setBankAccounts(bankRows);
    } catch {
      toast.error('Failed to load statements');
    }
  };

  const loadStatements = async () => {
    setLoading(true);
    await fetchStatements();
    setLoading(false);
  };

  React.useEffect(() => { loadStatements(); }, []);

  const handleFileUpload = async (file) => {
    if (!file) return;
    if (!uploadStatementMonth || !uploadStatementYear) {
      toast.error('Please select statement month');
      return;
    }
    const statementMonthValue = `${uploadStatementYear}-${uploadStatementMonth}`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('statement_month', statementMonthValue);

    if (selectedBank && selectedBank !== 'all') {
      const selectedRow = bankAccounts.find(
        (r) => String(r?.account_number || '').trim() === selectedBank,
      );
      const accountNumber = selectedRow?.account_number || selectedBank;
      const entity = selectedRow?.bank_id || selectedRow?.bank_name || null;
      formData.append('account_number', accountNumber);
      if (entity) formData.append('entity', entity);
    }

    setUploading(true);
    try {
      await reconciliationApi.uploadStatement(formData);
      toast.success('Bank statement uploaded successfully!');
      await loadStatements();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleViewTransactions = async (stmt) => {
    setSelectedStatement(stmt);
    setTransactionSearch('');
    try {
      const res = await reconciliationApi.getStatementTransactions(stmt.id);
      setTransactions(res.data);
    } catch {
      toast.error('Failed to load transactions');
    }
  };

  const openDeleteConfirmation = (e, stmt) => {
    e.stopPropagation();
    setDeleteTarget(stmt);
  };

  const confirmDeleteStatement = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteLoading(true);
    try {
      await reconciliationApi.deleteStatement(id);
      toast.success('Statement deleted');
      if (selectedStatement?.id === id) {
        setSelectedStatement(null);
        setTransactions(null);
      }
      setStatements((prev) => prev.filter((s) => s.id !== id));
      setDeleteTarget(null);
      // Silently refresh statements background data if needed
      fetchStatements();
    } catch {
      toast.error('Failed to delete statement');
    } finally {
      setDeleteLoading(false);
    }
  };

  const statementColumns = useMemo(() => [
    {
      header: 'File',
      accessor: 'filename',
      sortable: true,
      filterable: true,
      render: (val) => (
        <span className="font-medium text-gray-700 flex items-center gap-2">
          <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {val}
        </span>
      ),
    },
    {
      header: 'Account Number',
      accessor: 'account_number',
      sortable: true,
      filterable: true,
      render: (val) => (
        val ? <span className="bg-[#1e9bd8]/10 text-[#1e9bd8] px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono">{val}</span>
          : <span className="text-gray-300 text-xs italic">No account</span>
      ),
    },
    {
      header: 'Statement Month',
      accessor: 'statement_month',
      sortable: true,
      filterable: true,
      filterRender: (val) => formatStatementMonthLabel(val),
      render: (val) => <span className="text-gray-500">{val ? formatStatementMonthLabel(val) : '-'}</span>,
    },
    {
      header: 'Uploaded',
      accessor: 'upload_date',
      sortable: true,
      filterable: true,
      filterType: 'date',
      render: (val) => <span className="text-gray-400">{val ? new Date(val).toLocaleDateString() : '-'}</span>,
    },
    {
      header: 'Transactions',
      accessor: 'transaction_count',
      sortable: true,
      filterable: true,
      filterType: 'number',
      render: (val) => <span className="bg-[#1e9bd8]/10 text-[#1e9bd8] px-2 py-0.5 rounded-full text-xs font-semibold">{val}</span>,
    },
    {
      header: 'Status',
      accessor: 'status',
      sortable: true,
      filterable: true,
      render: (val) => <StatusPill matched={val === 'reconciled'} />,
    },
    {
      header: 'Actions',
      accessor: 'actions',
      sortable: false,
      filterable: false,
      render: (_, s) => (
        <div className="text-right flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => handleViewTransactions(s)} className="text-[#1e9bd8] hover:underline text-xs font-medium cursor-pointer">View</button>
          <button onClick={(e) => openDeleteConfirmation(e, s)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer" title="Delete Statement">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      ),
    },
  ], []);

  const transactionColumns = useMemo(() => [
    {
      header: 'Account Number',
      accessor: 'account_number',
      sortable: true,
      filterable: true,
      render: (val, row) => <span className="font-mono text-xs text-gray-500">{val || selectedStatement?.account_number || ''}</span>,
    },
    {
      header: 'Date',
      accessor: 'date',
      sortable: true,
      filterable: true,
      filterType: 'date',
      render: (val) => <span className="text-gray-500">{val || '-'}</span>,
    },
    {
      header: 'Description',
      accessor: 'description',
      sortable: true,
      filterable: true,
      render: (val) => <span className="text-gray-700 max-w-[220px] truncate block" title={val}>{val || '-'}</span>,
    },
    {
      header: 'Account Name',
      accessor: 'account_name',
      sortable: true,
      filterable: true,
      render: (val) => <span className="text-gray-500">{val || '-'}</span>,
    },
    {
      header: 'Debit',
      accessor: 'debit',
      sortable: true,
      filterable: true,
      filterType: 'number',
      filterRender: (val) => fmt(val),
      render: (val) => <span className="text-red-600 font-medium">{val != null ? fmt(val) : ''}</span>,
    },
    {
      header: 'Credit',
      accessor: 'credit',
      sortable: true,
      filterable: true,
      filterType: 'number',
      filterRender: (val) => fmt(val),
      render: (val) => <span className="text-green-600 font-medium">{val != null ? fmt(val) : ''}</span>,
    },
    {
      header: 'Check Number',
      accessor: 'check_number',
      sortable: true,
      filterable: true,
      render: (val) => <span className="font-mono text-xs text-gray-700">{val || '-'}</span>,
    },
    {
      header: 'Transaction Type',
      accessor: 'transaction_type',
      sortable: true,
      filterable: true,
      render: (val) => <Badge type={val} />,
    },
    {
      header: 'Reference',
      accessor: 'reference',
      sortable: true,
      filterable: true,
      render: (val) => <span className="font-mono text-xs text-gray-400">{val || '-'}</span>,
    },
    {
      header: 'Amount',
      accessor: 'amount',
      sortable: true,
      filterable: true,
      filterType: 'number',
      filterRender: (val) => fmt(val),
      render: (val) => <span className="font-medium text-gray-800 text-right block">{fmt(val)}</span>,
    },
    {
      header: 'Status',
      accessor: 'status',
      sortable: true,
      filterable: true,
      render: (val) => <span className="text-xs text-gray-500">{val || 'Pending'}</span>,
    },
  ], [selectedStatement]);

  return (
    <div className="flex flex-col space-y-4 h-full min-h-0 overflow-hidden">
      {/* Upload Zone */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="bank-statement-filter" className="text-xs font-semibold text-gray-700 whitespace-nowrap">
                Bank:
              </label>
              <BankSelect
                id="bank-statement-filter"
                value={selectedBank}
                onChange={setSelectedBank}
                options={bankOptions}
                allOptionLabel="All Banks"
                allOptionValue="all"
                className="w-44"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="upload-statement-month" className="text-xs font-semibold text-gray-700 whitespace-nowrap">
                Month:
              </label>
              <SearchSelect
                id="upload-statement-month"
                value={uploadStatementMonth}
                onChange={setUploadStatementMonth}
                options={availableMonthDropdownOptions}
                placeholder="Month"
                className="w-32"
              />
              <SearchSelect
                id="upload-statement-year"
                value={uploadStatementYear}
                onChange={setUploadStatementYear}
                options={yearDropdownOptions}
                placeholder="Year"
                className="w-28"
              />
            </div>
            <div className="flex-shrink-0">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files[0])}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 bg-[#1e9bd8] hover:bg-[#1887c0] text-white px-4 py-2 rounded-lg font-medium text-xs transition-colors disabled:opacity-60 cursor-pointer"
              >
                {uploading
                  ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading...</>
                  : <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Upload Statement
                  </>
                }
              </button>
            </div>
          </div>
          <div className="w-full sm:w-64">
            <input
              type="text"
              value={statementSearch}
              onChange={(e) => setStatementSearch(e.target.value)}
              placeholder="Search statements"
              className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-xs rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2"
            />
          </div>
        </div>
      </div>

      {/* Statements list */}
      {loading ? (
        <TableSkeleton rowCount={8} columnCount={6} />
      ) : sortedStatements.length > 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden p-3 space-y-2 flex-1 min-h-0 flex flex-col">
          <DataTable
            columns={statementColumns}
            data={sortedStatements}
            loading={loading}
            isClientSide={true}
            enableColumnFilters={true}
            sortColumn={stmtSortColumn}
            sortDirection={stmtSortDirection}
            onSort={(col, dir) => { setStmtSortColumn(col); setStmtSortDirection(dir); }}
            currentPage={stmtCurrentPage}
            itemsPerPage={stmtItemsPerPage}
            onPageChange={setStmtCurrentPage}
            onItemsPerPageChange={setStmtItemsPerPage}
            maxHeight="calc(100vh - 280px)"
            stickyHeader={true}
            expandable={false}
          />
        </div>
      ) : !uploading && (
        <EmptyState icon="📄" title="No statements yet" subtitle="Upload your first bank statement above to get started" />
      )}

      {/* Transaction detail modal */}
      {transactions && selectedStatement && (
        <div className="fixed inset-0 z-[2100] bg-black/40 backdrop-blur-[1px] p-4 md:p-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl h-full flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50">
              <div className="flex items-start justify-between gap-4 mb-3">
                <AccountBanner
                  accountNumber={selectedStatement.account_number}
                  extra={`${transactions.total} transactions  ${new Date(selectedStatement.upload_date).toLocaleDateString()}`}
                />
                <button
                  type="button"
                  onClick={() => { setSelectedStatement(null); setTransactions(null); }}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                  title="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <h3 className="font-semibold text-gray-700 text-sm">{selectedStatement.filename}</h3>
                <div className="flex-1 max-w-md mx-4">
                  <input
                    type="text"
                    value={transactionSearch}
                    onChange={(e) => setTransactionSearch(e.target.value)}
                    placeholder="Search bank statement transactions"
                    className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2.5"
                  />
                </div>
                <div className="flex gap-3">
                  <SummaryCard label="Debits" value={fmt(transactions.debits)} color="text-red-600" />
                  <SummaryCard label="Credits" value={fmt(transactions.credits)} color="text-green-600" />
                  <SummaryCard label="Total" value={transactions.total} color="text-[#1e9bd8]" />
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <DataTable
                columns={transactionColumns}
                data={sortedStatementTransactions}
                isClientSide={true}
                enableColumnFilters={true}
                sortColumn={txnSortColumn}
                sortDirection={txnSortDirection}
                onSort={(col, dir) => { setTxnSortColumn(col); setTxnSortDirection(dir); }}
                currentPage={txnCurrentPage}
                itemsPerPage={txnItemsPerPage}
                onPageChange={setTxnCurrentPage}
                onItemsPerPageChange={setTxnItemsPerPage}
                maxHeight="calc(100vh - 360px)"
                stickyHeader={true}
                expandable={false}
              />
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
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Bank Statement</h3>
            <p className="text-xs text-gray-600 mb-6 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-gray-800">{deleteTarget.filename}</span>? This will un-match any reconciled transactions.
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
                onClick={confirmDeleteStatement}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {deleteLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete Statement'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default BankStatementTab;

