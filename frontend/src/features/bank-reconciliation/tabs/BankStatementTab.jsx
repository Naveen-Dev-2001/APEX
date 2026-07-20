import React, { useState, useRef } from 'react';
import { reconciliationApi } from '../reconciliationApi';
import toast from '../../../utils/toast';
import {
  fmt,
  normalizeSearchValue,
  formatStatementMonthLabel,
  formatBankAccountOptionLabel,
  Badge,
  StatusPill,
  EmptyState,
  SummaryCard,
  AccountBanner,
} from '../components/shared';

const BankStatementTab = () => {
  const [uploading, setUploading] = useState(false);
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

  const monthDropdownOptions = React.useMemo(() => ([
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

  const yearDropdownOptions = React.useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let year = currentYear; year >= currentYear - 10; year -= 1) {
      years.push(String(year));
    }
    return years;
  }, []);

  const availableMonthDropdownOptions = React.useMemo(() => {
    const now = new Date();
    const currentYear = String(now.getFullYear());
    const currentMonth = now.getMonth() + 1;
    if (uploadStatementYear === currentYear) {
      return monthDropdownOptions.filter((option) => Number(option.value) <= currentMonth);
    }
    return monthDropdownOptions;
  }, [monthDropdownOptions, uploadStatementYear]);

  const bankOptions = React.useMemo(() => {
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

  const filteredStatements = React.useMemo(() => {
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

  const filteredStatementTransactions = React.useMemo(() => {
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

  const loadStatements = async () => {
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
    setUploading(true);
    try {
      await reconciliationApi.uploadStatement(formData);
      toast.success('Bank statement uploaded successfully!');
      await loadStatements();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
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

  const handleDeleteStatement = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this bank statement? This will un-match any reconciled transactions.')) return;
    try {
      await reconciliationApi.deleteStatement(id);
      toast.success('Statement deleted');
      if (selectedStatement?.id === id) {
        setSelectedStatement(null);
        setTransactions(null);
      }
      await loadStatements();
    } catch {
      toast.error('Failed to delete statement');
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4 lg:gap-5">
            <div className="flex items-center gap-2 min-w-[240px]">
              <label htmlFor="bank-statement-filter" className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                Bank:
              </label>
              <select
                id="bank-statement-filter"
                value={selectedBank}
                onChange={(e) => setSelectedBank(e.target.value)}
                className="appearance-none bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] block w-full p-2.5 transition-colors cursor-pointer"
              >
                <option value="all">All Banks</option>
                {bankOptions.map((bankOption) => (
                  <option key={bankOption.value} value={bankOption.value}>{bankOption.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 min-w-[330px]">
              <label htmlFor="upload-statement-month" className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                Statement Month:
              </label>
              <select
                id="upload-statement-month"
                value={uploadStatementMonth}
                onChange={(e) => setUploadStatementMonth(e.target.value)}
                className="appearance-none bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2.5 min-w-[140px]"
              >
                <option value="">Month</option>
                {availableMonthDropdownOptions.map((monthOption) => (
                  <option key={monthOption.value} value={monthOption.value}>{monthOption.label}</option>
                ))}
              </select>
              <select
                id="upload-statement-year"
                value={uploadStatementYear}
                onChange={(e) => setUploadStatementYear(e.target.value)}
                className="appearance-none bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2.5 min-w-[110px]"
              >
                <option value="">Year</option>
                {yearDropdownOptions.map((yearOption) => (
                  <option key={yearOption} value={yearOption}>{yearOption}</option>
                ))}
              </select>
            </div>
            <div className="flex-shrink-0 lg:ml-2">
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
                className="inline-flex items-center gap-2 bg-[#1e9bd8] hover:bg-[#1887c0] text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-60"
              >
                {uploading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading...</>
                  : <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Upload Bank Statement
                  </>
                }
              </button>
            </div>
          </div>
          <div className="w-full max-w-sm">
            <input
              type="text"
              value={statementSearch}
              onChange={(e) => setStatementSearch(e.target.value)}
              placeholder="Search statements"
              className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2.5"
            />
          </div>
        </div>
      </div>

      {/* Statements list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50">
          <h3 className="font-semibold text-gray-700">Uploaded Statements</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-6 py-3">File</th>
              <th className="text-left px-6 py-3">Account Number</th>
              <th className="text-left px-6 py-3">Statement Month</th>
              <th className="text-left px-6 py-3">Uploaded</th>
              <th className="text-left px-6 py-3">Transactions</th>
              <th className="text-left px-6 py-3">Status</th>
              <th className="text-right px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredStatements.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4 font-medium text-gray-700 flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {s.filename}
                </td>
                <td className="px-6 py-4">
                  {s.account_number
                    ? <span className="bg-[#1e9bd8]/10 text-[#1e9bd8] px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono">{s.account_number}</span>
                    : <span className="text-gray-300 text-xs italic">No account</span>
                  }
                </td>
                <td className="px-6 py-4 text-gray-500">{s.statement_month ? formatStatementMonthLabel(s.statement_month) : '-'}</td>
                <td className="px-6 py-4 text-gray-400">{new Date(s.upload_date).toLocaleDateString()}</td>
                <td className="px-6 py-4">
                  <span className="bg-[#1e9bd8]/10 text-[#1e9bd8] px-2 py-0.5 rounded-full text-xs font-semibold">{s.transaction_count}</span>
                </td>
                <td className="px-6 py-4"><StatusPill matched={s.status === 'reconciled'} /></td>
                <td className="px-6 py-4 text-right flex items-center justify-end gap-3">
                  <button onClick={() => handleViewTransactions(s)} className="text-[#1e9bd8] hover:underline text-xs font-medium">View</button>
                  <button onClick={(e) => handleDeleteStatement(e, s.id)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors" title="Delete Statement">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
            {filteredStatements.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-400">
                  No bank statements found. Upload your first statement to populate this table.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
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
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-400 text-xs uppercase sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-6 py-3">Account Number</th>
                    <th className="text-left px-6 py-3">Date</th>
                    <th className="text-left px-6 py-3">Description</th>
                    <th className="text-left px-6 py-3">Account Name</th>
                    <th className="text-left px-6 py-3">Debit</th>
                    <th className="text-left px-6 py-3">Credit</th>
                    <th className="text-left px-6 py-3">Check Number</th>
                    <th className="text-left px-6 py-3">Transaction Type</th>
                    <th className="text-left px-6 py-3">Reference</th>
                    <th className="text-right px-6 py-3">Amount</th>
                    <th className="text-left px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredStatementTransactions.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-3 text-gray-500 font-mono text-xs">{t.account_number || selectedStatement.account_number || ''}</td>
                      <td className="px-6 py-3 text-gray-500">{t.date}</td>
                      <td className="px-6 py-3 text-gray-700 max-w-[220px] truncate">{t.description || ''}</td>
                      <td className="px-6 py-3 text-gray-500">{t.account_name || ''}</td>
                      <td className="px-6 py-3 text-red-600 font-medium">{t.debit != null ? fmt(t.debit) : ''}</td>
                      <td className="px-6 py-3 text-green-600 font-medium">{t.credit != null ? fmt(t.credit) : ''}</td>
                      <td className="px-6 py-3 text-gray-700 font-mono text-xs">{t.check_number || ''}</td>
                      <td className="px-6 py-3"><Badge type={t.transaction_type} /></td>
                      <td className="px-6 py-3 text-gray-400 font-mono text-xs">{t.reference || ''}</td>
                      <td className="px-6 py-3 text-right font-medium text-gray-800">{fmt(t.amount)}</td>
                      <td className="px-6 py-3 text-gray-500 text-xs">{t.status || 'Pending'}</td>
                    </tr>
                  ))}
                  {filteredStatementTransactions.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-6 py-10 text-center text-sm text-gray-400">
                        No bank statement transactions found for your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {filteredStatements.length === 0 && !uploading && (
        <EmptyState icon="📄" title="No statements yet" subtitle="Upload your first bank statement above to get started" />
      )}
    </div>
  );
};

export default BankStatementTab;
