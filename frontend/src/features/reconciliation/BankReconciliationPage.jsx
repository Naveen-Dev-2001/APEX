import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { reconciliationApi } from '../../api/reconciliationApi';
import logo from '../../assets/loandna_logo_dark.png';
import '../../layout/AuthLayout.css';
import toast from '../../utils/toast';

/* ────────────── helpers ────────────── */
const fmt = (v) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v ?? 0);

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

/* ────────────── Tab: Bank Statement ────────────── */
const BankStatementTab = () => {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [accountInput, setAccountInput] = useState('');
  const [statements, setStatements] = useState([]);
  const [selectedStatement, setSelectedStatement] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const fileRef = useRef();

  const loadStatements = async () => {
    try {
      const res = await reconciliationApi.getStatements();
      setStatements(res.data);
    } catch {
      toast.error('Failed to load statements');
    }
  };

  React.useEffect(() => { loadStatements(); }, []);

  const handleFileUpload = async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    if (accountInput.trim()) formData.append('account_number', accountInput.trim());
    setUploading(true);
    try {
      await reconciliationApi.uploadStatement(formData);
      toast.success('Bank statement uploaded successfully!');
      setAccountInput('');
      await loadStatements();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleViewTransactions = async (stmt) => {
    setSelectedStatement(stmt);
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
        <div className="px-6 py-4 border-b border-gray-50">
          <h3 className="font-semibold text-gray-700">Upload Bank Statement</h3>
          <p className="text-xs text-gray-400 mt-0.5">Link this statement to a GL account number for accurate reconciliation</p>
        </div>
        <div className="p-6 space-y-4">
          {/* Account number input */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              GL Account Number <span className="text-gray-400 font-normal">(optional but recommended)</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1e9bd8]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="2" y="5" width="20" height="14" rx="2" strokeWidth={1.8} />
                    <line x1="2" y1="10" x2="22" y2="10" strokeWidth={1.8} />
                  </svg>
                </div>
                <input
                  type="text"
                  value={accountInput}
                  onChange={(e) => setAccountInput(e.target.value)}
                  placeholder="e.g. 5313774449"
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1e9bd8] focus:ring-2 focus:ring-[#1e9bd8]/10 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFileUpload(e.dataTransfer.files[0]); }}
            onClick={() => fileRef.current.click()}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-200
              ${dragging ? 'border-[#1e9bd8] bg-[#1e9bd8]/5' : 'border-gray-200 hover:border-[#1e9bd8] hover:bg-[#1e9bd8]/3'}`}
          >
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFileUpload(e.target.files[0])} />
            <div className="w-12 h-12 rounded-full bg-[#1e9bd8]/10 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-[#1e9bd8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            {uploading
              ? <div className="flex items-center gap-2 text-[#1e9bd8] font-medium text-sm">
                  <div className="w-4 h-4 border-2 border-[#1e9bd8] border-t-transparent rounded-full animate-spin" />
                  Uploading…
                </div>
              : <>
                  <p className="font-semibold text-gray-700 text-sm">Drop your bank statement here</p>
                  <p className="text-xs text-gray-400 mt-1">or click to browse — CSV or Excel supported</p>
                </>
            }
          </div>
        </div>
      </div>

      {/* Statements list */}
      {statements.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <h3 className="font-semibold text-gray-700">Uploaded Statements</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-400 text-xs uppercase">
              <tr>
                <th className="text-left px-6 py-3">File</th>
                <th className="text-left px-6 py-3">GL Account</th>
                <th className="text-left px-6 py-3">Uploaded</th>
                <th className="text-left px-6 py-3">Transactions</th>
                <th className="text-left px-6 py-3">Status</th>
                <th className="text-right px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {statements.map((s) => (
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
            </tbody>
          </table>
        </div>
      )}

      {/* Transaction detail */}
      {transactions && selectedStatement && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <AccountBanner
              accountNumber={selectedStatement.account_number}
              extra={`${transactions.total} transactions · ${new Date(selectedStatement.upload_date).toLocaleDateString()}`}
            />
            <div className="flex items-center justify-between mt-2">
              <h3 className="font-semibold text-gray-700 text-sm">{selectedStatement.filename}</h3>
              <div className="flex gap-3">
                <SummaryCard label="Debits" value={fmt(transactions.debits)} color="text-red-600" />
                <SummaryCard label="Credits" value={fmt(transactions.credits)} color="text-green-600" />
                <SummaryCard label="Total" value={transactions.total} color="text-[#1e9bd8]" />
              </div>
            </div>
          </div>
          <div className="overflow-auto max-h-80">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-400 text-xs uppercase sticky top-0">
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
                {transactions.transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-3 text-gray-500 font-mono text-xs">{t.account_number || selectedStatement.account_number || '—'}</td>
                    <td className="px-6 py-3 text-gray-500">{t.date}</td>
                    <td className="px-6 py-3 text-gray-700 max-w-[220px] truncate">{t.description || '—'}</td>
                    <td className="px-6 py-3 text-gray-500">{t.account_name || '—'}</td>
                    <td className="px-6 py-3 text-red-600 font-medium">{t.debit != null ? fmt(t.debit) : '—'}</td>
                    <td className="px-6 py-3 text-green-600 font-medium">{t.credit != null ? fmt(t.credit) : '—'}</td>
                    <td className="px-6 py-3 text-gray-700 font-mono text-xs">{t.check_number || '—'}</td>
                    <td className="px-6 py-3"><Badge type={t.transaction_type} /></td>
                    <td className="px-6 py-3 text-gray-400 font-mono text-xs">{t.reference || '—'}</td>
                    <td className="px-6 py-3 text-right font-medium text-gray-800">{fmt(t.amount)}</td>
                    <td className="px-6 py-3 text-gray-500 text-xs">{t.status || 'Pending'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {statements.length === 0 && !uploading && (
        <EmptyState icon="📄" title="No statements yet" subtitle="Upload your first bank statement above to get started" />
      )}
    </div>
  );
};

/* ────────────── Tab: Sage GL Transactions ────────────── */
const SageGLTab = () => {
  const [data, setData] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('');

  const load = async (acct) => {
    setLoading(true);
    try {
      const res = await reconciliationApi.getSageTransactions(acct);
      setData(res.data);
    } catch {
      toast.error('Failed to load Sage transactions');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(''); }, []);

  const handleFetch = async () => {
    setFetching(true);
    try {
      const res = await reconciliationApi.fetchSageTransactions(selectedAccount || null);
      toast.success(res.data.message);
      await load(selectedAccount);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to fetch from Sage');
    } finally {
      setFetching(false);
    }
  };

  const handleAccountFilter = (acct) => {
    setSelectedAccount(acct);
    load(acct);
  };

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4">
        <div>
          <h3 className="font-semibold text-gray-700">Sage GL Transactions</h3>
          <p className="text-xs text-gray-400 mt-0.5">Pull the latest GL entries from Sage Intacct</p>
        </div>
        <button
          onClick={handleFetch}
          disabled={fetching}
          className="flex items-center gap-2 bg-[#1e9bd8] hover:bg-[#1887c0] text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-60"
        >
          {fetching
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Fetching…</>
            : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Sync from Sage</>
          }
        </button>
      </div>

      {/* Account filter chips */}
      {data?.accounts?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleAccountFilter('')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              selectedAccount === '' ? 'bg-[#1e9bd8] text-white border-[#1e9bd8]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#1e9bd8] hover:text-[#1e9bd8]'
            }`}
          >
            All Accounts
          </button>
          {data.accounts.map((acct) => (
            <button
              key={acct}
              onClick={() => handleAccountFilter(acct)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border font-mono transition-all ${
                selectedAccount === acct ? 'bg-[#1e9bd8] text-white border-[#1e9bd8]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1e9bd8] hover:text-[#1e9bd8]'
              }`}
            >
              {acct}
            </button>
          ))}
        </div>
      )}

      {/* Account banner */}
      {selectedAccount && <AccountBanner accountNumber={selectedAccount} />}

      {loading && (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#1e9bd8] border-t-transparent rounded-full animate-spin" /></div>
      )}

      {!loading && data && data.transactions.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard label="Total Transactions" value={data.total} />
            <SummaryCard label="Total Debits" value={fmt(data.debits)} color="text-red-600" />
            <SummaryCard label="Total Credits" value={fmt(data.credits)} color="text-green-600" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-auto max-h-[450px]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-400 text-xs uppercase sticky top-0">
                  <tr>
                    <th className="text-left px-6 py-3">Bank</th>
                    <th className="text-left px-6 py-3">Txn Date</th>
                    <th className="text-left px-6 py-3">Entry Date</th>
                    <th className="text-left px-6 py-3">Check No</th>
                    <th className="text-left px-6 py-3">GL Account</th>
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
                  {data.transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-3 text-gray-500 font-medium">{t.bank || t.financial_entity || '—'}</td>
                      <td className="px-6 py-3 text-gray-500">{t.date}</td>
                      <td className="px-6 py-3 text-gray-500">{t.entry_date || '—'}</td>
                      <td className="px-6 py-3 text-gray-700 font-mono text-xs">{t.doc_number || t.check_no || '—'}</td>
                      <td className="px-6 py-3">
                        <span className="bg-[#1e9bd8]/10 text-[#1e9bd8] px-2 py-0.5 rounded-full text-xs font-semibold font-mono">{t.account || '—'}</span>
                      </td>
                      <td className="px-6 py-3"><Badge type={t.transaction_type} /></td>
                      <td className="px-6 py-3 text-gray-400 text-xs font-mono">{t.tr_type || t.txn_type || '—'}</td>
                      <td className="px-6 py-3 text-right font-medium text-gray-800">{fmt(t.amount)}</td>
                      <td className="px-6 py-3 text-gray-700 max-w-[120px] truncate" title={t.vendor}>{t.vendor || '—'}</td>
                      <td className="px-6 py-3 text-gray-700 max-w-[120px] truncate" title={t.customer}>{t.customer || '—'}</td>
                      <td className="px-6 py-3 text-gray-500 text-xs">{t.record_type || '—'}</td>
                      <td className="px-6 py-3 text-gray-400 text-xs">{t.cleared || '—'}</td>
                      <td className="px-6 py-3 text-gray-700 max-w-[200px] truncate" title={t.description}>{t.description || '—'}</td>
                      <td className="px-6 py-3"><StatusPill matched={t.is_matched} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && (!data || data.transactions.length === 0) && (
        <EmptyState icon="🔄" title="No Sage transactions yet" subtitle="Click 'Sync from Sage' to pull the latest GL entries" />
      )}
    </div>
  );
};

/* ────────────── Tab: Match & Compare (grouped by account) ────────────── */
const MatchCompareTab = ({ onGoToUnmatched }) => {
  const disableGlAccountFilter = true;
  const [results, setResults] = useState(null);
  const [matching, setMatching] = useState(false);
  const [manualMarking, setManualMarking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('unmatched');
  const [selectedBank, setSelectedBank] = useState('all');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedBankIds, setSelectedBankIds] = useState([]);
  const [selectedSageIds, setSelectedSageIds] = useState([]);
  const allAccounts = results?.accounts || [];

  const bankOptions = Array.from(new Set(
    allAccounts.flatMap((g) => (g.sage_transactions || []).map((t) => t.bank).filter(Boolean))
  )).sort();

  const filteredAccounts = allAccounts.filter((g) => {
    const byStatus =
      statusFilter === 'matched'
        ? (g.matched_count || 0) > 0
        : statusFilter === 'unmatched'
          ? (g.unmatched_bank_count || 0) > 0 || (g.unmatched_sage_count || 0) > 0
          : true;

    if (!byStatus) return false;
    if (selectedBank === 'all') return true;

    return (g.sage_transactions || []).some((t) => t.bank === selectedBank)
      || (g.matched || []).some((m) => m.sage?.bank === selectedBank);
  });

  const orderedFilteredAccounts = [...filteredAccounts].sort((a, b) => {
    if (statusFilter !== 'unmatched') return 0;

    const bankDelta = (b.unmatched_bank_count || 0) - (a.unmatched_bank_count || 0);
    if (bankDelta !== 0) return bankDelta;

    return (b.unmatched_sage_count || 0) - (a.unmatched_sage_count || 0);
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await reconciliationApi.getResults();
      setResults(res.data);
      const initialAccounts = (res.data?.accounts || []).filter((g) => (g.matched_count || 0) > 0);
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
  const matchedItems = (selectedGroup?.matched || []).filter((m) => selectedBank === 'all' || m.sage?.bank === selectedBank);
  const unmatchedBankItems = (selectedGroup?.bank_transactions || []).filter((t) => !t.is_matched);
  const unmatchedSageItems = (selectedGroup?.sage_transactions || []).filter((t) => !t.is_matched && (selectedBank === 'all' || t.bank === selectedBank));
  const allBankItems = selectedGroup?.bank_transactions || [];
  const allSageItems = (selectedGroup?.sage_transactions || []).filter((t) => selectedBank === 'all' || t.bank === selectedBank);

  React.useEffect(() => {
    setSelectedBankIds([]);
    setSelectedSageIds([]);
  }, [statusFilter, selectedBank, selectedAccount, results]);

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
      toast.error('Select equal counts, or choose one Bank row with many Sage rows (or vice versa)');
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
      <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4">
        <div>
          <h3 className="font-semibold text-gray-700">Match & Compare</h3>
          <p className="text-xs text-gray-400 mt-0.5">Select a GL account to compare its Bank and Sage transactions</p>
        </div>
        <button
          onClick={handleMatch}
          disabled={matching}
          className="flex items-center gap-2 bg-[#1e9bd8] hover:bg-[#1887c0] text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-60"
        >
          {matching
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Matching…</>
            : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg> Run Matching</>
          }
        </button>
        <button
          onClick={handleManualMarkMatched}
          disabled={manualMarking || !selectedBankIds.length || !selectedSageIds.length}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-60"
        >
          {manualMarking
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Marking…</>
            : <>Mark as Matched</>
          }
        </button>
      </div>

      {loading && <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#1e9bd8] border-t-transparent rounded-full animate-spin" /></div>}

      {!loading && results && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-4">
            <SummaryCard label="GL Accounts" value={results?.summary?.total_accounts ?? 0} color="text-[#1e9bd8]" />
            <SummaryCard label="Matched" value={results?.summary?.total_matched ?? 0} color="text-green-600" />
            <SummaryCard label="Unmatched Bank" value={results?.summary?.total_unmatched_bank ?? 0} color="text-amber-600" />
            <SummaryCard label="Unmatched Sage" value={results?.summary?.total_unmatched_sage ?? 0} color="text-red-600" />
          </div>

          {/* Filters */}
          {orderedFilteredAccounts.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mt-4 flex items-center gap-4 flex-wrap">
              <label htmlFor="status-filter" className="text-sm font-semibold text-gray-700">
                Show:
              </label>
              <div className="relative">
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="appearance-none bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] block w-40 p-2.5 pr-8 transition-colors cursor-pointer"
                >
                  <option value="matched">Matched</option>
                  <option value="unmatched">Unmatched</option>
                  <option value="all">All</option>
                </select>
              </div>

              <label htmlFor="bank-filter" className="text-sm font-semibold text-gray-700">
                Bank:
              </label>
              <div className="relative">
                <select
                  id="bank-filter"
                  value={selectedBank}
                  onChange={(e) => setSelectedBank(e.target.value)}
                  className="appearance-none bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] block w-48 p-2.5 pr-8 transition-colors cursor-pointer"
                >
                  <option value="all">All Banks</option>
                  {bankOptions.map((bank) => (
                    <option key={bank} value={bank}>{bank}</option>
                  ))}
                </select>
              </div>

              {!disableGlAccountFilter && (
                <>
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
                </>
              )}
            </div>
          )}

          {/* Selected Account Comparison */}
          {selectedGroup ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-gray-50">
                <AccountBanner accountNumber={selectedGroup.account} extra={`${statusFilter.charAt(0).toUpperCase()}${statusFilter.slice(1)} view`} />
              </div>
              
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
                        {statusFilter === 'matched' ? `${matchedItems.length} matched` : statusFilter === 'unmatched' ? `${unmatchedBankItems.length} unmatched` : `${allBankItems.length} items`}
                      </span>
                    </div>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                      {(statusFilter === 'matched' ? matchedItems.map((m) => m.bank) : statusFilter === 'unmatched' ? unmatchedBankItems : allBankItems).map((t, idx) => (
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
                              {t?.description || '—'}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {t?.date}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-bold ${statusFilter === 'unmatched' ? 'text-amber-700' : statusFilter === 'matched' ? 'text-green-700' : 'text-gray-700'}`}>{fmt(t?.amount)}</div>
                            <div className={`text-[10px] mt-1 uppercase tracking-wider font-semibold inline-block px-1.5 py-0.5 rounded ${statusFilter === 'unmatched' ? 'bg-amber-100/60 text-amber-700' : statusFilter === 'matched' ? 'bg-green-100/50 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                              {statusFilter === 'all' ? (t?.is_matched ? 'Matched' : 'Unmatched') : statusFilter === 'matched' ? 'Matched' : 'Unmatched'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: Sage GL Transactions */}
                  <div className="w-1/2 p-4">
                    <div className="flex items-center gap-2 mb-3 px-2">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sage GL Transactions</span>
                      <span className="text-xs text-gray-400 ml-1">
                        {statusFilter === 'matched' ? `${matchedItems.length} matched` : statusFilter === 'unmatched' ? `${unmatchedSageItems.length} unmatched` : `${allSageItems.length} items`}
                      </span>
                    </div>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                      {(statusFilter === 'matched' ? matchedItems.map((m) => m.sage) : statusFilter === 'unmatched' ? unmatchedSageItems : allSageItems).map((t, idx) => (
                        <div key={`sage-${t?.id ?? idx}`} className={`border rounded-xl p-3 flex justify-between items-start transition-colors ${statusFilter === 'unmatched' ? 'bg-red-50/30 border-red-100/60 hover:bg-red-50/50' : statusFilter === 'matched' ? 'bg-green-50/40 border-green-100/50 hover:bg-green-50' : 'bg-white border-gray-100 hover:bg-gray-50'}`}>
                          {statusFilter === 'unmatched' && (
                            <div className="pr-3 pt-1">
                              <input
                                type="checkbox"
                                checked={selectedSageIds.includes(t?.id)}
                                onChange={() => t?.id && toggleSelection(t.id, selectedSageIds, setSelectedSageIds)}
                                className="w-4 h-4 accent-[#1e9bd8]"
                              />
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-gray-800 text-sm">
                              {t?.description || '—'}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {t?.date}
                            </div>
                            {t?.bank && <div className="text-[10px] text-gray-400 mt-1">Bank: {t.bank}</div>}
                          </div>
                          <div className="text-right">
                            <div className={`font-bold ${statusFilter === 'unmatched' ? 'text-red-700' : statusFilter === 'matched' ? 'text-green-700' : 'text-gray-700'}`}>{fmt(t?.amount)}</div>
                            <div className={`text-[10px] mt-1 uppercase tracking-wider font-semibold inline-block px-1.5 py-0.5 rounded ${statusFilter === 'unmatched' ? 'bg-red-100/60 text-red-700' : statusFilter === 'matched' ? 'bg-green-100/50 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                              {statusFilter === 'all' ? (t?.is_matched ? 'Matched' : 'Unmatched') : statusFilter === 'matched' ? 'Matched' : 'Unmatched'}
                            </div>
                          </div>
                        </div>
                      ))}
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
              <EmptyState icon="🔍" title="No records for selected filters" subtitle="Try a different Status/Bank filter or run matching to create matched records" />
            )
          )}
        </>
      )}
    </div>
  );
};

/* ────────────── Tab: Unmatched ────────────── */
const UnmatchedTab = () => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [manualMarking, setManualMarking] = useState(false);
  const [selectedBankIds, setSelectedBankIds] = useState([]);
  const [selectedSageIds, setSelectedSageIds] = useState([]);
  const [expandedBankGroups, setExpandedBankGroups] = useState([]);
  const [expandedSageGroups, setExpandedSageGroups] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await reconciliationApi.getResults();
      setResults(res.data);
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
          checkNumber: checkNo || '—',
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

  const groupedUnmatchedBank = groupByCheckNumber(results?.unmatched_bank || []);

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
      toast.error('Select equal counts, or choose one Bank row with many Sage rows (or vice versa)');
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

  return (
    <div className="space-y-6">
      {loading && <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>}

      {!loading && results && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-700">{results.summary?.total_unmatched_bank ?? 0}</div>
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
                <div className="text-2xl font-bold text-red-700">{results.summary?.total_unmatched_sage ?? 0}</div>
                <div className="text-xs text-red-600 font-medium">Unmatched in Sage GL</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              Selected: <span className="font-semibold text-amber-700">Bank {selectedBankIds.length}</span> · <span className="font-semibold text-red-700">Sage {selectedSageIds.length}</span>
            </div>
            <button
              onClick={handleManualMarkMatched}
              disabled={manualMarking || !selectedBankIds.length || !selectedSageIds.length}
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60"
            >
              {manualMarking
                ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Marking…</>
                : <>Mark as Matched</>
              }
            </button>
          </div>

          {/* Unmatched Bank */}
          {results.unmatched_bank?.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                <h3 className="font-semibold text-gray-700">Unmatched Bank Transactions</h3>
                <span className="ml-auto text-xs text-amber-600 font-semibold">{results.unmatched_bank.length} items</span>
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
                        <td className="px-6 py-3 text-gray-700 max-w-[240px] truncate">{g.items.length > 1 ? `${g.items.length} transactions` : (g.items[0]?.description || '—')}</td>
                        <td className="px-6 py-3 text-gray-400 font-mono text-xs">{g.items[0]?.reference || '—'}</td>
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
                          <td className="px-6 py-3 text-gray-400 font-mono text-xs">{t.check_number || t.reference || '—'}</td>
                          <td className="px-6 py-3 text-gray-500">{t.date}</td>
                          <td className="px-6 py-3 text-gray-700 max-w-[240px] truncate">{t.description || '—'}</td>
                          <td className="px-6 py-3 text-gray-400 font-mono text-xs">{t.reference || '—'}</td>
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

          {/* Unmatched Sage — grouped by account */}
          {results.accounts?.filter((g) => g.unmatched_sage_count > 0).map((group) => (
            <div key={group.account} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50">
                <AccountBanner accountNumber={group.account} extra={`${group.unmatched_sage_count} unmatched`} />
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
                    {groupByCheckNumber(group.unmatched_sage).map((g) => (
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
                        <td className="px-6 py-3 text-gray-700 max-w-[280px] truncate">{g.items.length > 1 ? `${g.items.length} transactions` : (g.items[0]?.description || '—')}</td>
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
                          <td className="px-6 py-3 text-gray-400 font-mono text-xs">{t.check_number || '—'}</td>
                          <td className="px-6 py-3 text-gray-500">{t.date}</td>
                          <td className="px-6 py-3 text-gray-700 max-w-[280px] truncate">{t.description || '—'}</td>
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
          ))}

          {results.summary?.total_unmatched_bank === 0 && results.summary?.total_unmatched_sage === 0 && (
            <EmptyState icon="✅" title="All transactions matched!" subtitle="No unmatched transactions found. Reconciliation is complete." />
          )}
        </>
      )}
    </div>
  );
};

/* ────────────── Sidebar Tabs ────────────── */
const TABS = [
  {
    id: 'bank-statement', label: 'Bank Statement',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>,
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

/* ────────────── Main Page ────────────── */
const BankReconciliationPage = () => {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const [activeTab, setActiveTab] = useState('bank-statement');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef();

  const userInitial = user?.username ? user.username.charAt(0).toUpperCase() : 'U';
  const handleLogout = () => { logout(); navigate('/login'); };

  React.useEffect(() => {
    const handle = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsDropdownOpen(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const subtitles = {
    'bank-statement': 'Upload and review your bank statement transactions',
    'sage-gl': 'View GL transactions pulled from Sage Intacct, grouped by account',
    'match-compare': 'Auto-match bank and Sage transactions side by side — grouped by GL account',
    'unmatched': 'Review transactions that could not be automatically matched',
  };

  return (
    <div className="min-h-screen bg-[#f5f6fa] flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 w-full h-[64px] bg-white border-b border-gray-100 shadow-sm px-6 flex items-center justify-between z-[2000]">
        <div className="flex items-center gap-4">
          <img src={logo} alt="Logo" className="h-[40px] w-auto" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="hidden sm:flex items-center gap-2 text-sm text-gray-400">
            <button onClick={() => navigate('/module-select')} className="hover:text-[#1e9bd8] transition-colors font-medium">Modules</button>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <span className="text-gray-700 font-semibold">Bank Reconciliation</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/module-select')} className="hidden sm:flex items-center gap-2 text-sm text-gray-500 hover:text-[#1e9bd8] font-medium transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Switch Module
          </button>
          <div className="relative cursor-pointer" ref={dropdownRef}>
            <div
              className="bg-[#1e9bd8] text-white w-[36px] h-[36px] rounded-full flex justify-center items-center text-sm font-bold shadow"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              {userInitial}
            </div>
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-100 rounded-xl shadow-lg py-1 z-50">
                <div className="px-4 py-2 border-b border-gray-50">
                  <p className="text-xs font-semibold text-gray-700 truncate">{user?.username}</p>
                  <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                </div>
                <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 pt-[64px]">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-100 flex flex-col fixed top-[64px] bottom-0 left-0 overflow-y-auto">
          <div className="px-5 py-5 border-b border-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#1e9bd8] flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="2" y="5" width="20" height="14" rx="2" strokeWidth={1.5} />
                  <line x1="2" y1="10" x2="22" y2="10" strokeWidth={1.5} />
                </svg>
              </div>
              <div>
                <p className="font-bold text-gray-800 text-sm">Reconciliation</p>
                <p className="text-xs text-gray-400">Bank ↔ Sage GL</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 text-left
                  ${activeTab === tab.id
                    ? 'bg-[#1e9bd8]/10 text-[#1e9bd8] border border-[#1e9bd8]/20'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                  }`}
              >
                <span className={activeTab === tab.id ? 'text-[#1e9bd8]' : 'text-gray-400'}>{tab.icon}</span>
                {tab.label}
                {activeTab === tab.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#1e9bd8]" />}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 ml-64 p-6 overflow-y-auto">
          <div className="max-w-5xl mx-auto">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-800">{TABS.find((t) => t.id === activeTab)?.label}</h1>
              <p className="text-sm text-gray-400 mt-1">{subtitles[activeTab]}</p>
            </div>
            {activeTab === 'bank-statement'  && <BankStatementTab />}
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
