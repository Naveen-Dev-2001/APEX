import React, { useState } from 'react';
import { reconciliationApi } from '../reconciliationApi';
import toast from '../../../utils/toast';
import {
  fmt,
  normalizeSearchValue,
  formatBankAccountOptionLabel,
  Badge,
  StatusPill,
  EmptyState,
  SummaryCard,
} from '../components/shared';

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

  const filteredTransactions = React.useMemo(() => {
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

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4">
        <div className="flex items-center gap-3 flex-1">
          <label htmlFor="sage-bank-filter" className="text-sm font-semibold text-gray-700 whitespace-nowrap">Bank:</label>
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

      {loading && <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#1e9bd8] border-t-transparent rounded-full animate-spin" /></div>}

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
                          onClick={() => { setViewingBankSummary(bankRow); setSageDetailSearch(''); }}
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

      {/* Detail modal */}
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
                onClick={() => { setViewingBankSummary(null); setSageDetailSearch(''); }}
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
        <EmptyState icon="📊" title="No Sage transactions yet" subtitle="Click 'Sync from Sage' to pull the latest GL entries" />
      )}
    </div>
  );
};

export default SageGLTab;
