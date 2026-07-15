import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { reconciliationApi } from './reconciliationApi';
import logo from '../../assets/loandna_logo_dark.png';
import '../../layout/AuthLayout.css';
import toast from '../../utils/toast';

/* ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ helpers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
const fmt = (v) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v ?? 0);

const normalizeSearchValue = (value) => String(value ?? '').toLowerCase();

const formatStatementMonthLabel = (value) => {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(text)) return text;
  const [year, month] = text.split('-').map(Number);
  const dt = new Date(year, month - 1, 1);
  return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const formatBankAccountOptionLabel = (bankName, accountNumber) => {
  const rawAccount = String(accountNumber ?? '').trim();
  const resolvedBankName = String(bankName ?? '').trim() || 'Unknown Bank';

  return rawAccount
    ? `${resolvedBankName} - ${rawAccount}`
    : resolvedBankName;
};

const getTopLevelEntityName = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';

  // Entity selector stores values like "ENTITY_ID - Entity Name".
  const splitByDash = text.split(' - ');
  if (splitByDash.length >= 2) {
    return splitByDash.slice(1).join(' - ').trim();
  }

  return text;
};

const Badge = ({ type }) => {
  const map = { debit: 'bg-red-100 text-red-600', credit: 'bg-green-100 text-green-600' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[type] ?? 'bg-gray-100 text-gray-500'}`}>
      {type}
    </span>
  );
};

const StatusPill = ({ matched }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${matched ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${matched ? 'bg-green-500' : 'bg-amber-500'}`} />
    {matched ? 'Matched' : 'Unmatched'}
  </span>
);

const EmptyState = ({ icon, title, subtitle }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="text-5xl mb-4">{icon}</div>
    <h3 className="text-gray-700 font-semibold text-lg mb-1">{title}</h3>
    <p className="text-gray-400 text-sm max-w-xs">{subtitle}</p>
  </div>
);

const SummaryCard = ({ label, value, color }) => (
  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col gap-1">
    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
    <span className={`text-xl font-bold ${color ?? 'text-gray-800'}`}>{value}</span>
  </div>
);

/* Account number banner shown at top of content area */
const AccountBanner = ({ accountNumber, extra }) => {
  if (!accountNumber) return null;
  return (
    <div className="flex items-center gap-3 bg-[#1e9bd8]/8 border border-[#1e9bd8]/20 rounded-xl px-5 py-3 mb-5">
      <div className="w-8 h-8 rounded-lg bg-[#1e9bd8] flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="2" y="5" width="20" height="14" rx="2" strokeWidth={1.8} />
          <line x1="2" y1="10" x2="22" y2="10" strokeWidth={1.8} />
        </svg>
      </div>
      <div>
        <span className="text-xs text-[#1e9bd8] font-medium uppercase tracking-wide">GL Account</span>
        <p className="font-bold text-gray-800 text-base leading-tight">{accountNumber}</p>
      </div>
      {extra && <div className="ml-auto text-sm text-gray-400">{extra}</div>}
    </div>
  );
};

/* ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ Tab: Bank Statement ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
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
        label: formatBankAccountOptionLabel(row?.bank_name, accountNumber),
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
    if (!window.confirm('Are you sure you want to delete this bank statement? This will un-match any reconciled transactions.')) {
      return;
    }
    
    try {
      await reconciliationApi.deleteStatement(id);
      toast.success('Statement deleted');
      if (selectedStatement?.id === id) {
        setSelectedStatement(null);
        setTransactions(null);
      }
      await loadStatements();
    } catch (err) {
      toast.error('Failed to delete statement');
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex flex-wrap items-end gap-4 lg:gap-5">
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
          <div className="flex-1 min-w-[280px] lg:min-w-[340px] xl:min-w-[420px]">
            <input
              type="text"
              value={statementSearch}
              onChange={(e) => setStatementSearch(e.target.value)}
              placeholder="Search statements"
              className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2.5"
            />
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

      {/* Transaction detail */}
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
        <EmptyState icon="" title="No statements yet" subtitle="Upload your first bank statement above to get started" />
      )}
    </div>
  );
};

/* Tab: Bank Accounts */
const BankAccountsTab = () => {
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [accountSearch, setAccountSearch] = useState('');
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

  React.useEffect(() => {
    loadBankAccounts();
  }, []);

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
      if (fileRef.current) {
        fileRef.current.value = '';
      }
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

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="w-full md:max-w-md">
            {/* <h3 className="text-base font-semibold text-gray-800">Bank Accounts</h3> */}
            {/* <p className="text-sm text-gray-400 mt-1">Upload Excel or CSV and sync account data from Sage.</p> */}
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
                  <th className="text-left px-6 py-3">Account Name</th>
                  <th className="text-left px-6 py-3">GL Account</th>
                  <th className="text-left px-6 py-3">GL Account Title</th>
                  <th className="text-left px-6 py-3">Currency</th>
                  <th className="text-left px-6 py-3">Source</th>
                  <th className="text-left px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredAccounts.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3 text-gray-700 font-mono text-xs">{a.bank_id || ''}</td>
                    <td className="px-6 py-3 text-gray-700">{a.bank_name || ''}</td>
                    <td className="px-6 py-3 text-gray-700 font-mono text-xs">{a.account_number || ''}</td>
                    <td className="px-6 py-3 text-gray-700">{a.account_name || ''}</td>
                    <td className="px-6 py-3 text-gray-700 font-mono text-xs">{a.gl_account || ''}</td>
                    <td className="px-6 py-3 text-gray-700">{a.gl_account_title || ''}</td>
                    <td className="px-6 py-3 text-gray-700">{a.currency_code || ''}</td>
                    <td className="px-6 py-3 text-gray-500 text-xs">{a.source || ''}</td>
                    <td className="px-6 py-3">
                      <StatusPill matched={Boolean(a.is_active)} />
                    </td>
                  </tr>
                ))}
                {filteredAccounts.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-10 text-center text-sm text-gray-400">
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
        <EmptyState icon="" title="No bank accounts yet" subtitle="Upload a bank accounts file or sync from Sage to populate this table" />
      )}
    </div>
  );
};

/* ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ Tab: Sage GL Transactions ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
const SageGLTab = () => {
  const [data, setData] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedBank, setSelectedBank] = useState('all');
  const [sageSearch, setSageSearch] = useState('');
  const [sageDetailSearch, setSageDetailSearch] = useState('');
  const [viewingBankSummary, setViewingBankSummary] = useState(null);

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
  const selectedBankAccountRow = React.useMemo(() => {
    if (selectedBank === 'all') return null;
    return (bankAccounts || []).find((row) => String(row?.account_number || '').trim() === selectedBankAccountNumber) || null;
  }, [bankAccounts, selectedBank, selectedBankAccountNumber]);

  const selectedBankGlAccount = selectedBank === 'all'
    ? null
    : String(selectedBankAccountRow?.gl_account || selectedBankAccountNumber || '').trim();

  const selectedBankName = selectedBank === 'all'
    ? null
    : String(selectedBankAccountRow?.bank_name || '').trim();

  const selectedBankFinancialEntity = selectedBank === 'all'
    ? null
    : formatBankAccountOptionLabel(selectedBankName, selectedBankAccountNumber);

  const handleFetch = async () => {
    setFetching(true);
    try {
      const accountNumber = selectedBank === 'all' ? null : (selectedBankGlAccount || selectedBankAccountNumber || null);
      const financialEntity = selectedBank === 'all' ? null : (selectedBankFinancialEntity || null);
      const res = await reconciliationApi.fetchSageTransactions(accountNumber, financialEntity);
      toast.success(res.data.message);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to fetch from Sage');
    } finally {
      setFetching(false);
    }
  };

  const bankOptions = React.useMemo(() => {
    const dedupedByAccount = new Map();
    (bankAccounts || []).forEach((row) => {
      const accountNumber = String(row?.account_number || '').trim();
      if (!accountNumber || dedupedByAccount.has(accountNumber)) return;
      dedupedByAccount.set(accountNumber, {
        value: accountNumber,
        label: formatBankAccountOptionLabel(row?.bank_name, accountNumber),
      });
    });

    return Array.from(dedupedByAccount.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [bankAccounts]);

  const filteredTransactions = React.useMemo(() => {
    const txns = data?.transactions || [];
    const byBank = selectedBank === 'all'
      ? txns
      : txns.filter((t) => {
        const txnBankName = String(t.bank || t.financial_entity || '').trim();
        const txnAccount = String(t.account || t.account_number || '').trim();
        return txnAccount === selectedBankGlAccount
          || txnAccount === selectedBankAccountNumber
          || (selectedBankFinancialEntity && txnBankName === selectedBankFinancialEntity)
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
  }, [data, selectedBank, selectedBankGlAccount, selectedBankAccountNumber, selectedBankFinancialEntity, selectedBankName, sageSearch]);

  const filteredViewingTransactions = React.useMemo(() => {
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

  const filteredDebits = filteredTransactions
    .filter((t) => String(t.transaction_type || '').toLowerCase() === 'debit')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const filteredCredits = filteredTransactions
    .filter((t) => String(t.transaction_type || '').toLowerCase() === 'credit')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const bankSummaries = React.useMemo(() => {
    const grouped = new Map();

    filteredTransactions.forEach((t) => {
      const bankName = t.bank || t.financial_entity || 'Unknown Bank';
      if (!grouped.has(bankName)) {
        grouped.set(bankName, {
          bank: bankName,
          transactions: [],
          transactionCount: 0,
          debitTotal: 0,
          creditTotal: 0,
          totalAmount: 0,
        });
      }

      const item = grouped.get(bankName);
      const amount = Number(t.amount || 0);
      item.transactions.push(t);
      item.transactionCount += 1;
      item.totalAmount += amount;

      if (String(t.transaction_type || '').toLowerCase() === 'debit') {
        item.debitTotal += amount;
      }

      if (String(t.transaction_type || '').toLowerCase() === 'credit') {
        item.creditTotal += amount;
      }
    });

    return Array.from(grouped.values()).sort((a, b) => a.bank.localeCompare(b.bank));
  }, [filteredTransactions]);

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4">
        <div className="flex items-center gap-3 flex-1">
          <label htmlFor="sage-bank-filter" className="text-sm font-semibold text-gray-700 whitespace-nowrap">
            Bank:
          </label>
          <select
            id="sage-bank-filter"
            value={selectedBank}
            onChange={(e) => setSelectedBank(e.target.value)}
            className="appearance-none bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] block w-52 p-2.5 transition-colors cursor-pointer"
          >
            <option value="all">All Banks</option>
            {bankOptions.map((bankOption) => (
              <option key={bankOption.value} value={bankOption.value}>{bankOption.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={sageSearch}
            onChange={(e) => setSageSearch(e.target.value)}
            placeholder="Search Sage transactions"
            className="w-full max-w-sm bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2.5"
          />
        </div>
        <button
          onClick={handleFetch}
          disabled={fetching}
          className="flex items-center gap-2 bg-[#1e9bd8] hover:bg-[#1887c0] text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-60"
        >
          {fetching
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Fetching</>
            : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Sync from Sage</>
          }
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#1e9bd8] border-t-transparent rounded-full animate-spin" /></div>
      )}

      {!loading && data && filteredTransactions.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard label="Total Transactions" value={filteredTransactions.length} />
            <SummaryCard label="Total Debits" value={fmt(filteredDebits)} color="text-red-600" />
            <SummaryCard label="Total Credits" value={fmt(filteredCredits)} color="text-green-600" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-auto max-h-[450px]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-400 text-xs uppercase sticky top-0">
                  <tr>
                    <th className="text-left px-6 py-3">Bank</th>
                    <th className="text-right px-6 py-3">Transactions</th>
                    <th className="text-right px-6 py-3">Debits</th>
                    <th className="text-right px-6 py-3">Credits</th>
                    <th className="text-right px-6 py-3">Total Amount</th>
                    <th className="text-right px-6 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {bankSummaries.map((bankRow) => (
                    <tr key={bankRow.bank} className="hover:bg-gray-50/50">
                      <td className="px-6 py-3 text-gray-700 font-semibold">{bankRow.bank}</td>
                      <td className="px-6 py-3 text-right text-gray-600 font-medium">{bankRow.transactionCount}</td>
                      <td className="px-6 py-3 text-right text-red-600 font-medium">{fmt(bankRow.debitTotal)}</td>
                      <td className="px-6 py-3 text-right text-green-600 font-medium">{fmt(bankRow.creditTotal)}</td>
                      <td className="px-6 py-3 text-right text-gray-800 font-semibold">{fmt(bankRow.totalAmount)}</td>
                      <td className="px-6 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setViewingBankSummary(bankRow);
                            setSageDetailSearch('');
                          }}
                          className="inline-flex items-center gap-2 bg-[#1e9bd8] hover:bg-[#1887c0] text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {viewingBankSummary && (
        <div className="fixed inset-0 z-[2100] bg-black/40 backdrop-blur-[1px] p-4 md:p-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl h-full flex flex-col overflow-hidden">
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
                onClick={() => {
                  setViewingBankSummary(null);
                  setSageDetailSearch('');
                }}
                className="inline-flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
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

            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-400 text-xs uppercase sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-6 py-3">Txn Date</th>
                    <th className="text-left px-6 py-3">Entry Date</th>
                    <th className="text-left px-6 py-3">Check No</th>
                    <th className="text-left px-6 py-3">Account Number</th>
                    <th className="text-left px-6 py-3">Type</th>
                    <th className="text-left px-6 py-3">Txn Type</th>
                    <th className="text-right px-6 py-3">Txn Amount</th>
                    <th className="text-left px-6 py-3">Vendor</th>
                    <th className="text-left px-6 py-3">Customer</th>
                    <th className="text-left px-6 py-3">Record Type</th>
                    <th className="text-left px-6 py-3">Cleared</th>
                    <th className="text-left px-6 py-3">Description</th>
                    <th className="text-left px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredViewingTransactions.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-3 text-gray-500">{t.date}</td>
                      <td className="px-6 py-3 text-gray-500">{t.entry_date || ''}</td>
                      <td className="px-6 py-3 text-gray-700 font-mono text-xs">{t.doc_number || t.check_no || ''}</td>
                      <td className="px-6 py-3">
                        <span className="bg-[#1e9bd8]/10 text-[#1e9bd8] px-2 py-0.5 rounded-full text-xs font-semibold font-mono">{t.account || ''}</span>
                      </td>
                      <td className="px-6 py-3"><Badge type={t.transaction_type} /></td>
                      <td className="px-6 py-3 text-gray-400 text-xs font-mono">{t.tr_type || t.txn_type || ''}</td>
                      <td className="px-6 py-3 text-right font-medium text-gray-800">{fmt(t.amount)}</td>
                      <td className="px-6 py-3 text-gray-700 max-w-[120px] truncate" title={t.vendor}>{t.vendor || ''}</td>
                      <td className="px-6 py-3 text-gray-700 max-w-[120px] truncate" title={t.customer}>{t.customer || ''}</td>
                      <td className="px-6 py-3 text-gray-500 text-xs">{t.record_type || ''}</td>
                      <td className="px-6 py-3 text-gray-400 text-xs">{t.cleared || ''}</td>
                      <td className="px-6 py-3 text-gray-700 max-w-[220px] truncate" title={t.description}>{t.description || ''}</td>
                      <td className="px-6 py-3"><StatusPill matched={t.is_matched} /></td>
                    </tr>
                  ))}
                  {filteredViewingTransactions.length === 0 && (
                    <tr>
                      <td colSpan={13} className="px-6 py-10 text-center text-sm text-gray-400">
                        No Sage transactions found for your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!loading && (!data || filteredTransactions.length === 0) && (
        <EmptyState icon="" title="No Sage transactions yet" subtitle="Click 'Sync from Sage' to pull the latest GL entries" />
      )}
    </div>
  );
};

/* ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ Tab: Match & Compare (grouped by account) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
const MatchCompareTab = ({ onGoToUnmatched }) => {
  const disableGlAccountFilter = true;
  const [results, setResults] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [matching, setMatching] = useState(false);
  const [manualMarking, setManualMarking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('unmatched');
  const [selectedBank, setSelectedBank] = useState('all');
  const [compareSearch, setCompareSearch] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedBankIds, setSelectedBankIds] = useState([]);
  const [selectedSageIds, setSelectedSageIds] = useState([]);
  const [expandedSageGroups, setExpandedSageGroups] = useState([]);
  const allAccounts = results?.accounts || [];
  const selectedBankAccountNumber = String(selectedBank || '').trim();

  const selectedBankAccountRow = React.useMemo(() => {
    if (selectedBank === 'all') return null;
    return (bankAccounts || []).find((row) => String(row?.account_number || '').trim() === selectedBankAccountNumber) || null;
  }, [bankAccounts, selectedBank, selectedBankAccountNumber]);

  const selectedBankGlAccount = selectedBank === 'all'
    ? null
    : String(selectedBankAccountRow?.gl_account || selectedBankAccountNumber || '').trim();

  const bankNameByAccount = React.useMemo(() => {
    const map = new Map();
    (bankAccounts || []).forEach((row) => {
      const accountNumber = String(row?.account_number || '').trim();
      if (!accountNumber || map.has(accountNumber)) return;
      map.set(accountNumber, String(row?.bank_name || '').trim());
    });
    return map;
  }, [bankAccounts]);

  const resolveBankName = (txn) => {
    const directBankName = String(txn?.bank_name || txn?.bank || '').trim();
    if (directBankName) return directBankName;

    const accountNumber = String(txn?.account_number || txn?.account || '').trim();
    return bankNameByAccount.get(accountNumber) || '';
  };

  const bankOptions = React.useMemo(() => {
    const dedupedByAccount = new Map();
    const rows = Array.isArray(bankAccounts)
      ? bankAccounts
      : Array.isArray(bankAccounts?.items)
        ? bankAccounts.items
        : [];

    rows.forEach((row) => {
      const accountNumber = String(row?.account_number ?? '').trim();
      if (!accountNumber || dedupedByAccount.has(accountNumber)) return;

      dedupedByAccount.set(accountNumber, {
        value: accountNumber,
        label: formatBankAccountOptionLabel(row?.bank_name, accountNumber),
      });
    });

    return Array.from(dedupedByAccount.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [bankAccounts]);

  const filteredAccounts = allAccounts.filter((g) => {
    const byStatus =
      statusFilter === 'matched'
        ? (g.matched_count || 0) > 0
        : statusFilter === 'unmatched'
          ? (g.unmatched_bank_count || 0) > 0 || (g.unmatched_sage_count || 0) > 0
          : true;

    if (!byStatus) return false;
    if (selectedBank === 'all') return true;

    const groupAccount = String(g.account ?? '').trim();
    const hasBankTxnForSelectedAccount = (g.bank_transactions || []).some((t) => {
      const txnBankAccount = String(t?.account_number || t?.account || '').trim();
      return txnBankAccount && txnBankAccount === selectedBankAccountNumber;
    });
    const hasSageTxnForSelectedGl = (g.sage_transactions || []).some((t) => {
      const txnGlAccount = String(t?.account || t?.account_number || '').trim();
      return txnGlAccount && txnGlAccount === selectedBankGlAccount;
    });

    return groupAccount === selectedBankGlAccount
      || groupAccount === selectedBankAccountNumber
      || hasBankTxnForSelectedAccount
      || hasSageTxnForSelectedGl;
  });

  const scopedAccountsForSummary = React.useMemo(() => {
    if (selectedBank === 'all') return allAccounts;

    const allowedAccounts = new Set(
      [selectedBankAccountNumber, selectedBankGlAccount]
        .map((v) => String(v || '').trim())
        .filter(Boolean)
    );

    if (!allowedAccounts.size) return [];

    return allAccounts.filter((g) => {
      const groupAccount = String(g.account ?? '').trim();
      return allowedAccounts.has(groupAccount);
    });
  }, [allAccounts, selectedBank, selectedBankAccountNumber, selectedBankGlAccount]);

  const summaryMatchedCount = React.useMemo(
    () => scopedAccountsForSummary.reduce((sum, g) => sum + (g.matched_count || 0), 0),
    [scopedAccountsForSummary]
  );

  const summaryUnmatchedBankCount = React.useMemo(
    () => scopedAccountsForSummary.reduce((sum, g) => sum + (g.unmatched_bank_count || 0), 0),
    [scopedAccountsForSummary]
  );

  const summaryUnmatchedSageCount = React.useMemo(
    () => scopedAccountsForSummary.reduce((sum, g) => sum + (g.unmatched_sage_count || 0), 0),
    [scopedAccountsForSummary]
  );

  const orderedFilteredAccounts = [...filteredAccounts].sort((a, b) => {
    if (statusFilter !== 'unmatched') return 0;

    const bankDelta = (b.unmatched_bank_count || 0) - (a.unmatched_bank_count || 0);
    if (bankDelta !== 0) return bankDelta;

    return (b.unmatched_sage_count || 0) - (a.unmatched_sage_count || 0);
  });

  const load = async () => {
    setLoading(true);
    try {
      const [resultsRes, bankAccountsRes] = await Promise.all([
        reconciliationApi.getResults(),
        reconciliationApi.getBankAccounts(),
      ]);

      const bankRows = Array.isArray(bankAccountsRes?.data)
        ? bankAccountsRes.data
        : Array.isArray(bankAccountsRes?.data?.items)
          ? bankAccountsRes.data.items
          : [];

      setResults(resultsRes.data);
      setBankAccounts(bankRows);

      const initialAccounts = (resultsRes.data?.accounts || []).filter((g) => (g.matched_count || 0) > 0);
      if (initialAccounts.length > 0) {
        setSelectedAccount(initialAccounts[0].account);
      } else {
        setSelectedAccount('');
      }
    } catch {
      toast.error('Failed to load results');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, []);

  const handleMatch = async () => {
    setMatching(true);
    try {
      const res = await reconciliationApi.runMatching();
      toast.success(res.data.message);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Matching failed');
    } finally {
      setMatching(false);
    }
  };

  React.useEffect(() => {
    if (disableGlAccountFilter) return;
    if (!orderedFilteredAccounts.length) {
      setSelectedAccount('');
      return;
    }
    if (!orderedFilteredAccounts.some((g) => g.account === selectedAccount)) {
      setSelectedAccount(orderedFilteredAccounts[0].account);
    }
  }, [statusFilter, selectedBank, results]);

  const selectedGroup = disableGlAccountFilter
    ? {
        account: 'All Accounts',
        matched_count: orderedFilteredAccounts.reduce((sum, g) => sum + (g.matched_count || 0), 0),
        matched: orderedFilteredAccounts.flatMap((g) => g.matched || []),
        bank_transactions: orderedFilteredAccounts.flatMap((g) => g.bank_transactions || []),
        sage_transactions: orderedFilteredAccounts.flatMap((g) => g.sage_transactions || []),
        unmatched_bank_count: orderedFilteredAccounts.reduce((sum, g) => sum + (g.unmatched_bank_count || 0), 0),
        unmatched_sage_count: orderedFilteredAccounts.reduce((sum, g) => sum + (g.unmatched_sage_count || 0), 0),
      }
    : orderedFilteredAccounts.find((g) => g.account === selectedAccount);
  const matchedItems = (selectedGroup?.matched || []).filter((m) => {
    if (selectedBank === 'all') return true;

    const sageAccount = String(m?.sage?.account || m?.sage?.account_number || '').trim();
    const bankAccount = String(m?.bank?.account_number || m?.bank?.account || '').trim();

    return sageAccount === selectedBankGlAccount || bankAccount === selectedBankAccountNumber;
  });
  const filteredBankItemsByBank = (selectedGroup?.bank_transactions || []).filter((t) => {
    if (selectedBank === 'all') return true;

    const accountNumber = String(t?.account_number || t?.account || '').trim();
    return accountNumber === selectedBankAccountNumber;
  });

  const unmatchedBankItems = filteredBankItemsByBank.filter((t) => !t.is_matched);
  const unmatchedSageItems = (selectedGroup?.sage_transactions || []).filter((t) => {
    if (t?.is_matched) return false;
    if (selectedBank === 'all') return true;

    const accountNumber = String(t?.account || t?.account_number || '').trim();
    return accountNumber === selectedBankGlAccount;
  });
  const allBankItems = filteredBankItemsByBank;
  const allSageItems = (selectedGroup?.sage_transactions || []).filter((t) => {
    if (selectedBank === 'all') return true;

    const accountNumber = String(t?.account || t?.account_number || '').trim();
    return accountNumber === selectedBankGlAccount;
  });

  const uniqueById = (items = []) => {
    const seen = new Set();
    return items.filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  };

  const groupByCheckNo = (items = []) => {
    const grouped = new Map();

    items.forEach((item) => {
      const checkNo = String(item?.check_number || item?.reference || '').trim();
      const key = checkNo || `single-${item?.id}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          groupKey: key,
          checkNumber: checkNo || '',
          totalAmount: 0,
          items: [],
        });
      }

      const g = grouped.get(key);
      g.items.push(item);
      g.totalAmount += Number(item?.amount || 0);
    });

    return Array.from(grouped.values());
  };

  const bankDisplayItems = statusFilter === 'matched'
    ? matchedItems.map((m) => m.bank)
    : statusFilter === 'unmatched'
      ? unmatchedBankItems
      : allBankItems;

  const uniqueBankDisplayItems = uniqueById(bankDisplayItems);

  const sageDisplayItems = statusFilter === 'matched'
    ? matchedItems.map((m) => m.sage)
    : statusFilter === 'unmatched'
      ? unmatchedSageItems
      : allSageItems;

  const groupedSageDisplay = groupByCheckNo(sageDisplayItems);

  const filteredCompareBankItems = React.useMemo(() => {
    const query = normalizeSearchValue(compareSearch).trim();
    if (!query) return uniqueBankDisplayItems;

    return uniqueBankDisplayItems.filter((t) => (
      normalizeSearchValue(t?.description).includes(query)
      || normalizeSearchValue(t?.check_number || t?.reference).includes(query)
      || normalizeSearchValue(t?.type || t?.transaction_type).includes(query)
      || normalizeSearchValue(t?.account_number || t?.account || selectedGroup?.account).includes(query)
      || normalizeSearchValue(t?.date).includes(query)
      || normalizeSearchValue(t?.amount).includes(query)
      || normalizeSearchValue(t?.is_matched ? 'matched' : 'unmatched').includes(query)
    ));
  }, [uniqueBankDisplayItems, compareSearch, selectedGroup]);

  const filteredGroupedSageDisplay = React.useMemo(() => {
    const query = normalizeSearchValue(compareSearch).trim();
    if (!query) return groupedSageDisplay;

    return groupedSageDisplay.filter((g) => {
      if (normalizeSearchValue(g.checkNumber).includes(query) || normalizeSearchValue(g.totalAmount).includes(query)) {
        return true;
      }

      return g.items.some((item) => (
        normalizeSearchValue(item?.description).includes(query)
        || normalizeSearchValue(item?.check_number || item?.reference).includes(query)
        || normalizeSearchValue(item?.type || item?.transaction_type).includes(query)
        || normalizeSearchValue(item?.account || item?.account_number || selectedGroup?.account).includes(query)
        || normalizeSearchValue(item?.date).includes(query)
        || normalizeSearchValue(item?.amount).includes(query)
        || normalizeSearchValue(item?.bank).includes(query)
        || normalizeSearchValue(item?.is_matched ? 'matched' : 'unmatched').includes(query)
      ));
    });
  }, [groupedSageDisplay, compareSearch, selectedGroup]);

  React.useEffect(() => {
    setSelectedBankIds([]);
    setSelectedSageIds([]);
    setExpandedSageGroups([]);
  }, [statusFilter, selectedBank, selectedAccount, results]);

  const toggleSelection = (id, selectedIds, setSelectedIds) => {
    setSelectedIds(selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]);
  };

  const isGroupSelected = (groupItems, selectedIds) =>
    groupItems.every((row) => selectedIds.includes(row.id));

  const toggleGroupSelection = (groupItems, selectedIds, setSelectedIds) => {
    const ids = groupItems.map((x) => x.id);
    const fullySelected = ids.every((id) => selectedIds.includes(id));

    if (fullySelected) {
      setSelectedIds(selectedIds.filter((id) => !ids.includes(id)));
    } else {
      setSelectedIds(Array.from(new Set([...selectedIds, ...ids])));
    }
  };

  const toggleExpandedSageGroup = (groupKey) => {
    setExpandedSageGroups((prev) =>
      prev.includes(groupKey) ? prev.filter((k) => k !== groupKey) : [...prev, groupKey]
    );
  };

  const handleManualMarkMatched = async () => {
    if (!selectedBankIds.length || !selectedSageIds.length) {
      toast.error('Select at least one Bank row and one Sage row');
      return;
    }

    if (
      selectedBankIds.length !== selectedSageIds.length
      && selectedBankIds.length !== 1
      && selectedSageIds.length !== 1
    ) {
      toast.error('Select equal counts, or use grouped matching only for non-ACH debit transactions.');
      return;
    }

    setManualMarking(true);
    try {
      const res = await reconciliationApi.markMatchedPairs(selectedBankIds, selectedSageIds);
      toast.success(res.data?.message || 'Marked as matched');
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to mark selected rows as matched');
    } finally {
      setManualMarking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 w-full">
            <div className="flex items-center gap-2 w-full">
              <label htmlFor="bank-filter" className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                Bank:
              </label>
              <div className="relative flex-1">
                <select
                  id="bank-filter"
                  value={selectedBank}
                  onChange={(e) => setSelectedBank(e.target.value)}
                  className="appearance-none bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] block w-full p-2.5 pr-8 transition-colors cursor-pointer"
                >
                  <option value="all">All Banks</option>
                  {bankOptions.map((bankOption) => (
                    <option key={bankOption.value} value={bankOption.value}>{bankOption.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full">
              <label htmlFor="status-filter" className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                Show:
              </label>
              <div className="relative flex-1">
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="appearance-none bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] block w-full p-2.5 pr-3 transition-colors cursor-pointer"
                >
                  <option value="matched">Matched</option>
                  <option value="unmatched">Unmatched</option>
                  <option value="all">All</option>
                </select>
              </div>
            </div>

            <div className="w-full">
              <input
                type="text"
                value={compareSearch}
                onChange={(e) => setCompareSearch(e.target.value)}
                placeholder="Search match and compare"
                className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full lg:max-w-xl lg:ml-auto">
            <button
              onClick={handleMatch}
              disabled={matching}
              className="flex items-center justify-center gap-2 bg-[#1e9bd8] hover:bg-[#1887c0] text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-60 w-full"
            >
              {matching
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Matching</>
                : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg> Run Matching</>
              }
            </button>
            <button
              onClick={handleManualMarkMatched}
              disabled={manualMarking || !selectedBankIds.length || !selectedSageIds.length}
              className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-60 w-full"
            >
              {manualMarking
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> MarkingΓÇª</>
                : <>Mark as Matched</>
              }
            </button>
          </div>
        </div>
      </div>

      {loading && <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#1e9bd8] border-t-transparent rounded-full animate-spin" /></div>}

      {!loading && results && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard label="Matched" value={summaryMatchedCount} color="text-green-600" />
            <SummaryCard label="Unmatched Bank" value={summaryUnmatchedBankCount} color="text-amber-600" />
            <SummaryCard label="Unmatched Sage" value={summaryUnmatchedSageCount} color="text-red-600" />
          </div>

          {/* Filters */}
          {orderedFilteredAccounts.length > 0 && !disableGlAccountFilter && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mt-4 flex items-center gap-4 flex-wrap">
              <label htmlFor="gl-account-select" className="text-sm font-semibold text-gray-700">
                Select GL Account:
              </label>
              <div className="relative">
                <select
                  id="gl-account-select"
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  className="appearance-none bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] block w-64 p-2.5 pr-8 transition-colors cursor-pointer"
                >
                  {orderedFilteredAccounts.map((acct) => (
                    <option key={acct.account} value={acct.account}>
                      {acct.account}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* Selected Account Comparison */}
          {selectedGroup ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              {selectedGroup.account !== 'All Accounts' && (
                <div className="px-6 py-4 border-b border-gray-50">
                  <AccountBanner accountNumber={selectedGroup.account} extra={`${statusFilter.charAt(0).toUpperCase()}${statusFilter.slice(1)} view`} />
                </div>
              )}
              
              {(statusFilter === 'matched' && matchedItems.length > 0)
                || (statusFilter === 'unmatched' && (unmatchedBankItems.length > 0 || unmatchedSageItems.length > 0))
                || (statusFilter === 'all' && (allBankItems.length > 0 || allSageItems.length > 0)) ? (
                <div className="flex bg-gray-50/50 flex-1 min-h-[400px]">
                  {/* Left: Bank Statement */}
                  <div className="w-1/2 border-r border-gray-100 p-4">
                    <div className="flex items-center gap-2 mb-3 px-2">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bank Statement</span>
                      <span className="text-xs text-gray-400 ml-1">
                        {filteredCompareBankItems.length} items
                      </span>
                    </div>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                      {filteredCompareBankItems.map((t, idx) => (
                        <div key={`bank-${t?.id ?? idx}`} className={`border rounded-xl p-3 flex justify-between items-start transition-colors ${statusFilter === 'unmatched' ? 'bg-amber-50/30 border-amber-100/60 hover:bg-amber-50/50' : statusFilter === 'matched' ? 'bg-green-50/40 border-green-100/50 hover:bg-green-50' : 'bg-white border-gray-100 hover:bg-gray-50'}`}>
                          {statusFilter === 'unmatched' && (
                            <div className="pr-3 pt-1">
                              <input
                                type="checkbox"
                                checked={selectedBankIds.includes(t?.id)}
                                onChange={() => t?.id && toggleSelection(t.id, selectedBankIds, setSelectedBankIds)}
                                className="w-4 h-4 accent-[#1e9bd8]"
                              />
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-gray-800 text-sm">
                              {t?.description }
                            </div>
                            <div className="text-[11px] text-gray-500 mt-1 space-y-0.5">
                              <div><span className="text-gray-400">Check No:</span> {t?.check_number || t?.reference || ''}</div>
                              <div><span className="text-gray-400">Bank Name:</span> {resolveBankName(t) || ''}</div>
                              <div><span className="text-gray-400">Txn Type:</span> {t?.type || t?.transaction_type || ''}</div>
                              <div><span className="text-gray-400">Account No:</span> {t?.account_number || t?.account || selectedGroup?.account || ''}</div>
                              <div><span className="text-gray-400">Date:</span> {t?.date || ''}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[11px] text-gray-400 uppercase tracking-wide">Amount Paid</div>
                            <div className={`font-bold ${statusFilter === 'unmatched' ? 'text-amber-700' : statusFilter === 'matched' ? 'text-green-700' : 'text-gray-700'}`}>{fmt(t?.amount)}</div>
                            <div className={`text-[10px] mt-1 uppercase tracking-wider font-semibold inline-block px-1.5 py-0.5 rounded ${statusFilter === 'unmatched' ? 'bg-amber-100/60 text-amber-700' : statusFilter === 'matched' ? 'bg-green-100/50 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                              {statusFilter === 'all' ? (t?.is_matched ? 'Matched' : 'Unmatched') : statusFilter === 'matched' ? 'Matched' : 'Unmatched'}
                            </div>
                          </div>
                        </div>
                      ))}
                      {filteredCompareBankItems.length === 0 && (
                        <div className="text-center text-sm text-gray-400 py-10 bg-white rounded-xl border border-gray-100">
                          No bank transactions found for your search.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Sage GL Transactions */}
                  <div className="w-1/2 p-4">
                    <div className="flex items-center gap-2 mb-3 px-2">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sage GL Transactions</span>
                      <span className="text-xs text-gray-400 ml-1">
                        {filteredGroupedSageDisplay.length} groups
                      </span>
                    </div>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                      {filteredGroupedSageDisplay.map((g, idx) => {
                        const t = g.items[0];
                        const groupMatched = g.items.every((item) => item?.is_matched);
                        const isExpanded = expandedSageGroups.includes(g.groupKey);
                        return (
                        <div key={`sage-${g.groupKey}-${idx}`} className={`border rounded-xl p-3 transition-colors ${statusFilter === 'unmatched' ? 'bg-red-50/30 border-red-100/60 hover:bg-red-50/50' : statusFilter === 'matched' ? 'bg-green-50/40 border-green-100/50 hover:bg-green-50' : 'bg-white border-gray-100 hover:bg-gray-50'}`}>
                          <div className="flex justify-between items-start">
                          {statusFilter === 'unmatched' && (
                            <div className="pr-3 pt-1">
                              <input
                                type="checkbox"
                                checked={isGroupSelected(g.items, selectedSageIds)}
                                onChange={() => toggleGroupSelection(g.items, selectedSageIds, setSelectedSageIds)}
                                className="w-4 h-4 accent-[#1e9bd8]"
                              />
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-gray-800 text-sm">
                              {g.items.length > 1 ? `${g.items.length} transactions` : (t?.description || '')}
                            </div>
                            <div className="text-[11px] text-gray-500 mt-1 space-y-0.5">
                              <div><span className="text-gray-400">Check No:</span> {g.checkNumber}</div>
                              <div><span className="text-gray-400">Bank Name:</span> {t?.bank || ''}</div>
                              <div><span className="text-gray-400">Txn Type:</span> {t?.type || t?.transaction_type || ''}</div>
                              <div><span className="text-gray-400">GL Account:</span> {t?.account || t?.account_number || selectedGroup?.account || ''}</div>
                              <div><span className="text-gray-400">Date:</span> {t?.date || ''}</div>
                            </div>
                            {t?.bank && <div className="text-[10px] text-gray-400 mt-1">Bank: {t.bank}</div>}
                          </div>
                          <div className="text-right">
                            <div className="text-[11px] text-gray-400 uppercase tracking-wide">Amount Paid</div>
                            <div className={`font-bold ${statusFilter === 'unmatched' ? 'text-red-700' : statusFilter === 'matched' ? 'text-green-700' : 'text-gray-700'}`}>{fmt(g.totalAmount)}</div>
                            {g.items.length > 1 && (
                              <button
                                onClick={() => toggleExpandedSageGroup(g.groupKey)}
                                className="text-[11px] text-[#1e9bd8] hover:underline mt-1"
                              >
                                {isExpanded ? 'Hide entries' : `View entries (${g.items.length})`}
                              </button>
                            )}
                            <div className={`text-[10px] mt-1 uppercase tracking-wider font-semibold inline-block px-1.5 py-0.5 rounded ${statusFilter === 'unmatched' ? 'bg-red-100/60 text-red-700' : statusFilter === 'matched' ? 'bg-green-100/50 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                              {statusFilter === 'all' ? (groupMatched ? 'Matched' : 'Unmatched') : statusFilter === 'matched' ? 'Matched' : 'Unmatched'}
                            </div>
                          </div>
                          </div>

                          {isExpanded && g.items.length > 1 && (
                            <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                              {g.items.map((entry) => (
                                <div key={`sage-entry-${entry.id}`} className="bg-white/60 border border-gray-100 rounded-lg px-3 py-2 text-[11px] text-gray-600 flex justify-between gap-3">
                                  <div className="space-y-0.5">
                                    <div><span className="text-gray-400">Date:</span> {entry.date || ''}</div>
                                    <div><span className="text-gray-400">Txn Type:</span> {entry.type || entry.transaction_type || ''}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-semibold text-gray-700">{fmt(entry.amount)}</div>
                                    <div className="text-gray-400">ID: {entry.id}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )})}
                      {filteredGroupedSageDisplay.length === 0 && (
                        <div className="text-center text-sm text-gray-400 py-10 bg-white rounded-xl border border-gray-100">
                          No Sage transactions found for your search.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-6 py-8 text-center text-gray-400 text-sm space-y-3">
                  <div>No records found for this filter combination.</div>
                  <button
                    onClick={onGoToUnmatched}
                    className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Go to Unmatched
                  </button>
                </div>
              )}
            </div>
          ) : (
            orderedFilteredAccounts.length === 0 && (
              <EmptyState icon="≡ƒöì" title="No records for selected filters" subtitle="Try a different Status/Bank filter or run matching to create matched records" />
            )
          )}
        </>
      )}
    </div>
  );
};

/* ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ Tab: Unmatched ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
const UnmatchedTab = () => {
  const [results, setResults] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [manualMarking, setManualMarking] = useState(false);
  const [selectedBank, setSelectedBank] = useState('all');
  const [unmatchedSearch, setUnmatchedSearch] = useState('');
  const [selectedBankIds, setSelectedBankIds] = useState([]);
  const [selectedSageIds, setSelectedSageIds] = useState([]);
  const [expandedBankGroups, setExpandedBankGroups] = useState([]);
  const [expandedSageGroups, setExpandedSageGroups] = useState([]);

  const allAccounts = results?.accounts || [];

  const selectedBankAccountNumber = String(selectedBank || '').trim();
  const selectedBankAccountRow = React.useMemo(() => {
    if (selectedBank === 'all') return null;
    return (bankAccounts || []).find((row) => String(row?.account_number || '').trim() === selectedBankAccountNumber) || null;
  }, [bankAccounts, selectedBank, selectedBankAccountNumber]);

  const selectedBankGlAccount = selectedBank === 'all'
    ? null
    : String(selectedBankAccountRow?.gl_account || selectedBankAccountNumber || '').trim();

  const bankOptions = React.useMemo(() => {
    const dedupedByAccount = new Map();
    (bankAccounts || []).forEach((row) => {
      const accountNumber = String(row?.account_number || '').trim();
      if (!accountNumber || dedupedByAccount.has(accountNumber)) return;

      dedupedByAccount.set(accountNumber, {
        value: accountNumber,
        label: formatBankAccountOptionLabel(row?.bank_name, accountNumber),
      });
    });

    return Array.from(dedupedByAccount.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [bankAccounts]);

  const load = async () => {
    setLoading(true);
    try {
      const [resultsRes, bankAccountsRes] = await Promise.all([
        reconciliationApi.getResults(),
        reconciliationApi.getBankAccounts(),
      ]);

      const bankRows = Array.isArray(bankAccountsRes?.data)
        ? bankAccountsRes.data
        : Array.isArray(bankAccountsRes?.data?.items)
          ? bankAccountsRes.data.items
          : [];

      setResults(resultsRes.data);
      setBankAccounts(bankRows);
    } catch {
      toast.error('Failed to load unmatched items');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, []);

  const groupByCheckNumber = (items = []) => {
    const grouped = new Map();

    items.forEach((item) => {
      const checkNo = String(item.check_number || item.reference || '').trim();
      const key = checkNo || `single-${item.id}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          groupKey: key,
          checkNumber: checkNo || '',
          totalAmount: 0,
          items: [],
        });
      }
      const g = grouped.get(key);
      g.items.push(item);
      g.totalAmount += Number(item.amount || 0);
    });

    return Array.from(grouped.values());
  };

  const isGroupSelected = (groupItems, selectedIds) =>
    groupItems.every((row) => selectedIds.includes(row.id));

  const toggleGroupSelection = (groupItems, selectedIds, setSelectedIds) => {
    const ids = groupItems.map((x) => x.id);
    const fullySelected = ids.every((id) => selectedIds.includes(id));

    if (fullySelected) {
      setSelectedIds(selectedIds.filter((id) => !ids.includes(id)));
    } else {
      setSelectedIds(Array.from(new Set([...selectedIds, ...ids])));
    }
  };

  const toggleExpanded = (groupKey, expanded, setExpanded) => {
    setExpanded(expanded.includes(groupKey)
      ? expanded.filter((k) => k !== groupKey)
      : [...expanded, groupKey]);
  };

  const filteredUnmatchedBank = React.useMemo(() => {
    const bankRows = results?.unmatched_bank || [];
    const byBank = selectedBank === 'all'
      ? bankRows
      : bankRows.filter((t) => {
        const accountNumber = String(t?.account_number || t?.account || '').trim();
        return accountNumber === selectedBankAccountNumber;
      });

    const query = normalizeSearchValue(unmatchedSearch).trim();
    if (!query) return byBank;

    return byBank.filter((t) => (
      normalizeSearchValue(t?.check_number || t?.reference).includes(query)
      || normalizeSearchValue(t?.date).includes(query)
      || normalizeSearchValue(t?.description).includes(query)
      || normalizeSearchValue(t?.reference).includes(query)
      || normalizeSearchValue(t?.type || t?.transaction_type).includes(query)
      || normalizeSearchValue(t?.amount).includes(query)
      || normalizeSearchValue(t?.account_number || t?.account).includes(query)
    ));
  }, [results, selectedBank, selectedBankAccountNumber, unmatchedSearch]);

  const unmatchedSageGroups = React.useMemo(() => {
    const groups = (results?.accounts || []).filter((g) => g.unmatched_sage_count > 0);
    const query = normalizeSearchValue(unmatchedSearch).trim();

    return groups
      .map((group) => {
        const byBank = selectedBank === 'all'
          ? (group.unmatched_sage || [])
          : (group.unmatched_sage || []).filter((t) => {
            const accountNumber = String(t?.account || t?.account_number || '').trim();
            return accountNumber === selectedBankGlAccount;
          });

        const filteredRows = !query
          ? byBank
          : byBank.filter((t) => (
            normalizeSearchValue(t?.check_number || t?.reference).includes(query)
            || normalizeSearchValue(t?.date).includes(query)
            || normalizeSearchValue(t?.description).includes(query)
            || normalizeSearchValue(t?.type || t?.transaction_type).includes(query)
            || normalizeSearchValue(t?.amount).includes(query)
            || normalizeSearchValue(t?.account || t?.account_number).includes(query)
            || normalizeSearchValue(t?.bank).includes(query)
          ));

        return {
          ...group,
          display_unmatched_sage: filteredRows,
        };
      })
      .filter((group) => group.display_unmatched_sage.length > 0);
  }, [results, selectedBank, selectedBankGlAccount, unmatchedSearch]);

  const groupedUnmatchedBank = groupByCheckNumber(filteredUnmatchedBank);

  const filteredUnmatchedSageCount = unmatchedSageGroups.reduce((sum, group) => {
    const unmatchedRows = group.display_unmatched_sage || [];
    return sum + unmatchedRows.length;
  }, 0);

  const toggleSelection = (id, selectedIds, setSelectedIds) => {
    setSelectedIds(selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]);
  };

  const handleManualMarkMatched = async () => {
    if (!selectedBankIds.length || !selectedSageIds.length) {
      toast.error('Select at least one Bank row and one Sage row');
      return;
    }

    if (
      selectedBankIds.length !== selectedSageIds.length
      && selectedBankIds.length !== 1
      && selectedSageIds.length !== 1
    ) {
      toast.error('Select equal counts, or use grouped matching only for non-ACH debit transactions.');
      return;
    }

    setManualMarking(true);
    try {
      const res = await reconciliationApi.markMatchedPairs(selectedBankIds, selectedSageIds);
      toast.success(res.data?.message || 'Marked as matched');
      setSelectedBankIds([]);
      setSelectedSageIds([]);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to mark selected rows as matched');
    } finally {
      setManualMarking(false);
    }
  };

  React.useEffect(() => {
    setSelectedBankIds([]);
    setSelectedSageIds([]);
    setExpandedBankGroups([]);
    setExpandedSageGroups([]);
  }, [selectedBank]);

  return (
    <div className="space-y-6">
      {loading && <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>}

      {!loading && results && (
        <>
          {/* Summary cards */}
          {/* <div className="grid grid-cols-2 gap-4">
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-700">{filteredUnmatchedBank.length}</div>
                <div className="text-xs text-amber-600 font-medium">Unmatched in Bank Statement</div>
              </div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-700">{filteredUnmatchedSageCount}</div>
                <div className="text-xs text-red-600 font-medium">Unmatched in Sage GL</div>
              </div>
            </div>
          </div> */}

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <label htmlFor="unmatched-bank-filter" className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                Bank:
              </label>
              <select
                id="unmatched-bank-filter"
                value={selectedBank}
                onChange={(e) => setSelectedBank(e.target.value)}
                className="appearance-none bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] block w-52 p-2.5 transition-colors cursor-pointer"
              >
                <option value="all">All Banks</option>
                {bankOptions.map((bankOption) => (
                  <option key={bankOption.value} value={bankOption.value}>{bankOption.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={unmatchedSearch}
                onChange={(e) => setUnmatchedSearch(e.target.value)}
                placeholder="Search unmatched transactions"
                className="w-full max-w-sm bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2.5"
              />
            </div>
            <button
              onClick={handleManualMarkMatched}
              disabled={manualMarking || !selectedBankIds.length || !selectedSageIds.length}
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60"
            >
              {manualMarking
                ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> MarkingΓÇª</>
                : <>Mark as Matched</>
              }
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-700">{filteredUnmatchedBank.length}</div>
                <div className="text-xs text-amber-600 font-medium">Unmatched in Bank Statement</div>
              </div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-700">{filteredUnmatchedSageCount}</div>
                <div className="text-xs text-red-600 font-medium">Unmatched in Sage GL</div>
              </div>
            </div>
          </div>

          {/* Unmatched Bank */}
          {filteredUnmatchedBank.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                <h3 className="font-semibold text-gray-700">Unmatched Bank Transactions</h3>
                <span className="ml-auto text-xs text-amber-600 font-semibold">{filteredUnmatchedBank.length} items</span>
              </div>
              <div className="overflow-auto max-h-64">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-400 text-xs uppercase sticky top-0">
                    <tr>
                      <th className="text-left px-6 py-3">Select</th>
                      <th className="text-left px-6 py-3">Check No</th>
                      <th className="text-left px-6 py-3">Date</th>
                      <th className="text-left px-6 py-3">Description</th>
                      <th className="text-left px-6 py-3">Reference</th>
                      <th className="text-left px-6 py-3">Type</th>
                      <th className="text-right px-6 py-3">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {groupedUnmatchedBank.map((g) => (
                      <React.Fragment key={`bank-group-${g.groupKey}`}>
                      <tr className="hover:bg-amber-50/30">
                        <td className="px-6 py-3">
                          <input
                            type="checkbox"
                            checked={isGroupSelected(g.items, selectedBankIds)}
                            onChange={() => toggleGroupSelection(g.items, selectedBankIds, setSelectedBankIds)}
                            className="w-4 h-4 accent-[#1e9bd8]"
                          />
                        </td>
                        <td className="px-6 py-3 text-gray-700 font-mono text-xs">{g.checkNumber}</td>
                        <td className="px-6 py-3 text-gray-500">{g.items[0]?.date}</td>
                        <td className="px-6 py-3 text-gray-700 max-w-[240px] truncate">{g.items.length > 1 ? `${g.items.length} transactions` : (g.items[0]?.description || '')}</td>
                        <td className="px-6 py-3 text-gray-400 font-mono text-xs">{g.items[0]?.reference || ''}</td>
                        <td className="px-6 py-3"><Badge type={g.items[0]?.type} /></td>
                        <td className="px-6 py-3 text-right font-medium text-gray-800">
                          {fmt(g.totalAmount)}
                          {g.items.length > 1 && (
                            <button
                              onClick={() => toggleExpanded(g.groupKey, expandedBankGroups, setExpandedBankGroups)}
                              className="ml-3 text-xs text-[#1e9bd8] hover:underline"
                            >
                              {expandedBankGroups.includes(g.groupKey) ? 'Hide' : 'Show'} details
                            </button>
                          )}
                        </td>
                      </tr>
                      {g.items.length > 1 && expandedBankGroups.includes(g.groupKey) && g.items.map((t) => (
                        <tr key={`bank-child-${t.id}`} className="bg-amber-50/20">
                          <td className="px-6 py-3">
                            <input
                              type="checkbox"
                              checked={selectedBankIds.includes(t.id)}
                              onChange={() => toggleSelection(t.id, selectedBankIds, setSelectedBankIds)}
                              className="w-4 h-4 accent-[#1e9bd8]"
                            />
                          </td>
                          <td className="px-6 py-3 text-gray-400 font-mono text-xs">{t.check_number || t.reference || ''}</td>
                          <td className="px-6 py-3 text-gray-500">{t.date}</td>
                          <td className="px-6 py-3 text-gray-700 max-w-[240px] truncate">{t.description || ''}</td>
                          <td className="px-6 py-3 text-gray-400 font-mono text-xs">{t.reference || ''}</td>
                          <td className="px-6 py-3"><Badge type={t.type} /></td>
                          <td className="px-6 py-3 text-right font-medium text-gray-800">{fmt(t.amount)}</td>
                        </tr>
                      ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Unmatched Sage  grouped by account */}
          {/* {unmatchedSageGroups.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                <h3 className="font-semibold text-gray-700">Unmatched Sage Transactions</h3>
                <span className="ml-auto text-xs text-red-600 font-semibold">{filteredUnmatchedSageCount} items</span>
              </div>
            </div>
          )} */}
          {unmatchedSageGroups.map((group) => {
            const groupUnmatchedSage = group.display_unmatched_sage || [];

            return (
            <div key={group.account} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                <h3 className="font-semibold text-gray-700">Unmatched Sage Transactions</h3>
                <span className="ml-auto text-xs text-red-600 font-semibold">{filteredUnmatchedSageCount} items</span>
                             {/* <AccountBanner accountNumber={group.account} extra={`${groupUnmatchedSage.length} unmatched`} /> */}
              </div>
              <div className="overflow-auto max-h-64">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-400 text-xs uppercase sticky top-0">
                    <tr>
                      <th className="text-left px-6 py-3">Select</th>
                      <th className="text-left px-6 py-3">Check No</th>
                      <th className="text-left px-6 py-3">Date</th>
                      <th className="text-left px-6 py-3">Description</th>
                      <th className="text-left px-6 py-3">Type</th>
                      <th className="text-right px-6 py-3">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {groupByCheckNumber(groupUnmatchedSage).map((g) => (
                      <React.Fragment key={`sage-group-${group.account}-${g.groupKey}`}>
                      <tr className="hover:bg-red-50/20">
                        <td className="px-6 py-3">
                          <input
                            type="checkbox"
                            checked={isGroupSelected(g.items, selectedSageIds)}
                            onChange={() => toggleGroupSelection(g.items, selectedSageIds, setSelectedSageIds)}
                            className="w-4 h-4 accent-[#1e9bd8]"
                          />
                        </td>
                        <td className="px-6 py-3 text-gray-700 font-mono text-xs">{g.checkNumber}</td>
                        <td className="px-6 py-3 text-gray-500">{g.items[0]?.date}</td>
                        <td className="px-6 py-3 text-gray-700 max-w-[280px] truncate">{g.items.length > 1 ? `${g.items.length} transactions` : (g.items[0]?.description || '')}</td>
                        <td className="px-6 py-3"><Badge type={g.items[0]?.type} /></td>
                        <td className="px-6 py-3 text-right font-medium text-gray-800">
                          {fmt(g.totalAmount)}
                          {g.items.length > 1 && (
                            <button
                              onClick={() => toggleExpanded(`${group.account}-${g.groupKey}`, expandedSageGroups, setExpandedSageGroups)}
                              className="ml-3 text-xs text-[#1e9bd8] hover:underline"
                            >
                              {expandedSageGroups.includes(`${group.account}-${g.groupKey}`) ? 'Hide' : 'Show'} details
                            </button>
                          )}
                        </td>
                      </tr>
                      {g.items.length > 1 && expandedSageGroups.includes(`${group.account}-${g.groupKey}`) && g.items.map((t) => (
                        <tr key={`sage-child-${t.id}`} className="bg-red-50/20">
                          <td className="px-6 py-3">
                            <input
                              type="checkbox"
                              checked={selectedSageIds.includes(t.id)}
                              onChange={() => toggleSelection(t.id, selectedSageIds, setSelectedSageIds)}
                              className="w-4 h-4 accent-[#1e9bd8]"
                            />
                          </td>
                          <td className="px-6 py-3 text-gray-400 font-mono text-xs">{t.check_number || ''}</td>
                          <td className="px-6 py-3 text-gray-500">{t.date}</td>
                          <td className="px-6 py-3 text-gray-700 max-w-[280px] truncate">{t.description || ''}</td>
                          <td className="px-6 py-3"><Badge type={t.type} /></td>
                          <td className="px-6 py-3 text-right font-medium text-gray-800">{fmt(t.amount)}</td>
                        </tr>
                      ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })}

          {filteredUnmatchedBank.length === 0 && filteredUnmatchedSageCount === 0 && (
            <EmptyState icon="" title="All transactions matched!" subtitle="No unmatched transactions found. Reconciliation is complete." />
          )}
        </>
      )}
    </div>
  );
};

/* ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ Sidebar Tabs ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
const TABS = [
  {
    id: 'bank-statement', label: 'Bank Statement',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>,
  },
  {
    id: 'bank-accounts', label: 'Bank Accounts',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M5 7l1 12h12l1-12M9 11v5m6-5v5" /></svg>,
  },
  {
    id: 'sage-gl', label: 'Sage GL Transactions',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" /></svg>,
  },
  {
    id: 'match-compare', label: 'Match & Compare',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  },
  {
    id: 'unmatched', label: 'Unmatched',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
];

/* ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ Main Page ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
const BankReconciliationPage = () => {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const activeRole = useAuthStore((state) => state.activeRole);
  const [activeTab, setActiveTab] = useState('bank-statement');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef();

  const userInitial = user?.username ? user.username.charAt(0).toUpperCase() : 'U';
  const rawEntityName = sessionStorage.getItem('selected_entity_name');
  const selectedEntityName = getTopLevelEntityName(rawEntityName) || 'Top Level';
  const handleLogout = () => { logout(); navigate('/login'); };

  React.useEffect(() => {
    const handle = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsDropdownOpen(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);


  const subtitles = {
    // 'bank-statement': 'Upload and review your bank statement transactions',
    // 'bank-accounts': 'Upload bank account files and sync account data from Sage',
    // 'sage-gl': 'View GL transactions pulled from Sage Intacct, grouped by account',
    // 'match-compare': 'Auto-match bank and Sage transactions side by side',
    // 'unmatched': 'Review transactions that could not be automatically matched',
  };

  return (
    <div className="min-h-screen bg-[#f5f6fa] flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 w-full h-[64px] bg-white border-b border-gray-100 shadow-sm px-6 flex items-center justify-between z-[2000]">
        <div className="flex items-center gap-4 min-w-0">
          <img src={logo} alt="Logo" className="h-[40px] w-auto" onError={(e) => { e.target.style.display = 'none'; }} />
          <nav className="hidden lg:flex items-center gap-1 ml-4 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors
                  ${activeTab === tab.id
                    ? 'bg-[#1e9bd8]/10 text-[#1e9bd8] border border-[#1e9bd8]/20'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700 border border-transparent'
                  }`}
              >
                <span className={activeTab === tab.id ? 'text-[#1e9bd8]' : 'text-gray-400'}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative cursor-pointer" ref={dropdownRef}>
            <div
              className="bg-[#1e9bd8] text-white w-[34px] h-[34px] rounded-full flex justify-center items-center text-[15px] font-semibold"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              {userInitial}
            </div>
            {isDropdownOpen && (
              <div className="absolute right-0 mt-3 w-[280px] bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden">
                <div className="absolute -top-[6px] right-2.5 w-3 h-3 bg-white border-l border-t border-gray-100 rotate-45 z-0"></div>

                <div className="relative z-10 p-4">
                  <div className="flex justify-between items-center mb-4">
                    <span
                      className="text-[11px] font-bold text-[#333] tracking-tighter uppercase opacity-60 truncate mr-2"
                      title={selectedEntityName}
                    >
                      {selectedEntityName}
                    </span>
                    <button
                      onClick={handleLogout}
                      className="text-[13px] text-[#ff5a5f] hover:text-red-600 font-semibold transition-colors shrink-0"
                    >
                      Logout
                    </button>
                  </div>

                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-12 h-12 bg-[#3ba5d8] rounded-xl flex items-center justify-center text-white text-xl font-bold shadow-sm shrink-0">
                      {userInitial}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[16px] font-bold text-gray-900 truncate leading-none mb-1">
                        {user?.username || 'admin'}
                      </span>
                      <span className="text-[13px] text-gray-400 font-medium truncate capitalize">
                        {activeRole || 'User'} - {user?.department?.toLowerCase() === 'finance' ? 'Finance' : 'Non-Finance'}
                      </span>
                    </div>
                  </div>

                  <div className="h-[1px] w-full bg-gray-50 mb-3"></div>

                  <button
                    onClick={() => {
                      navigate('/module-select');
                      setIsDropdownOpen(false);
                    }}
                    className="flex items-center space-x-3 w-full group transition-all duration-200 py-0.5"
                  >
                    <div className="p-1 rounded-lg text-[#3ba5d8]">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                    </div>
                    <span className="text-[14px] font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                      Switch Module
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 pt-[64px]">
        {/* Main */}
        <main className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-5xl mx-auto">
            <nav className="lg:hidden mb-4 bg-white border border-gray-100 rounded-xl shadow-sm p-2 overflow-x-auto">
              <div className="flex items-center gap-2 min-w-max">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors
                      ${activeTab === tab.id
                        ? 'bg-[#1e9bd8]/10 text-[#1e9bd8] border border-[#1e9bd8]/20'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700 border border-transparent'
                      }`}
                  >
                    <span className={activeTab === tab.id ? 'text-[#1e9bd8]' : 'text-gray-400'}>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </nav>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-800">{TABS.find((t) => t.id === activeTab)?.label}</h1>
              <p className="text-sm text-gray-400 mt-1">{subtitles[activeTab]}</p>
            </div>
            {activeTab === 'bank-statement'  && <BankStatementTab />}
            {activeTab === 'bank-accounts'   && <BankAccountsTab />}
            {activeTab === 'sage-gl'         && <SageGLTab />}
            {activeTab === 'match-compare'   && <MatchCompareTab onGoToUnmatched={() => setActiveTab('unmatched')} />}
            {activeTab === 'unmatched'       && <UnmatchedTab />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default BankReconciliationPage;
