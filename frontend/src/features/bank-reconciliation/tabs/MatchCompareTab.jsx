import React, { useState } from 'react';
import { reconciliationApi } from '../reconciliationApi';
import toast from '../../../utils/toast';
import {
  fmt,
  normalizeSearchValue,
  formatBankAccountOptionLabel,
  Badge,
  EmptyState,
  SummaryCard,
  AccountBanner,
} from '../components/shared';

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

  const bankOptions = React.useMemo(() => {
    const dedupedByAccount = new Map();
    const rows = Array.isArray(bankAccounts) ? bankAccounts : Array.isArray(bankAccounts?.items) ? bankAccounts.items : [];
    rows.forEach((row) => {
      const accountNumber = String(row?.account_number ?? '').trim();
      if (!accountNumber || dedupedByAccount.has(accountNumber)) return;
      dedupedByAccount.set(accountNumber, {
        value: accountNumber,
        label: formatBankAccountOptionLabel(row?.bank_id || row?.bank_name, accountNumber),
      });
    });
    return Array.from(dedupedByAccount.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [bankAccounts]);

  const filteredAccounts = allAccounts.filter((g) => {
    const byStatus =
      statusFilter === 'matched' ? (g.matched_count || 0) > 0
        : statusFilter === 'unmatched' ? (g.unmatched_bank_count || 0) > 0 || (g.unmatched_sage_count || 0) > 0
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
    return groupAccount === selectedBankGlAccount || groupAccount === selectedBankAccountNumber
      || hasBankTxnForSelectedAccount || hasSageTxnForSelectedGl;
  });

  const scopedAccountsForSummary = React.useMemo(() => {
    if (selectedBank === 'all') return allAccounts;
    const allowedAccounts = new Set(
      [selectedBankAccountNumber, selectedBankGlAccount].map((v) => String(v || '').trim()).filter(Boolean)
    );
    if (!allowedAccounts.size) return [];
    return allAccounts.filter((g) => allowedAccounts.has(String(g.account ?? '').trim()));
  }, [allAccounts, selectedBank, selectedBankAccountNumber, selectedBankGlAccount]);

  const summaryMatchedCount = React.useMemo(() => scopedAccountsForSummary.reduce((sum, g) => sum + (g.matched_count || 0), 0), [scopedAccountsForSummary]);
  const summaryUnmatchedBankCount = React.useMemo(() => scopedAccountsForSummary.reduce((sum, g) => sum + (g.unmatched_bank_count || 0), 0), [scopedAccountsForSummary]);
  const summaryUnmatchedSageCount = React.useMemo(() => scopedAccountsForSummary.reduce((sum, g) => sum + (g.unmatched_sage_count || 0), 0), [scopedAccountsForSummary]);

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
      setSelectedAccount(initialAccounts.length > 0 ? initialAccounts[0].account : '');
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
    if (!orderedFilteredAccounts.length) { setSelectedAccount(''); return; }
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
    return String(t?.account_number || t?.account || '').trim() === selectedBankAccountNumber;
  });

  const unmatchedBankItems = filteredBankItemsByBank.filter((t) => !t.is_matched);
  const unmatchedSageItems = (selectedGroup?.sage_transactions || []).filter((t) => {
    if (t?.is_matched) return false;
    if (selectedBank === 'all') return true;
    return String(t?.account || t?.account_number || '').trim() === selectedBankGlAccount;
  });
  const allBankItems = filteredBankItemsByBank;
  const allSageItems = (selectedGroup?.sage_transactions || []).filter((t) => {
    if (selectedBank === 'all') return true;
    return String(t?.account || t?.account_number || '').trim() === selectedBankGlAccount;
  });

  const uniqueById = (items = []) => {
    const seen = new Set();
    return items.filter((item) => { if (!item?.id || seen.has(item.id)) return false; seen.add(item.id); return true; });
  };

  const groupByCheckNo = (items = []) => {
    const grouped = new Map();
    items.forEach((item) => {
      const checkNo = String(item?.check_number || item?.reference || '').trim();
      const key = checkNo || `single-${item?.id}`;
      if (!grouped.has(key)) grouped.set(key, { groupKey: key, checkNumber: checkNo || '', totalAmount: 0, items: [] });
      const g = grouped.get(key);
      g.items.push(item);
      g.totalAmount += Number(item?.amount || 0);
    });
    return Array.from(grouped.values());
  };

  const bankDisplayItems = statusFilter === 'matched' ? matchedItems.map((m) => m.bank)
    : statusFilter === 'unmatched' ? unmatchedBankItems : allBankItems;

  const uniqueBankDisplayItems = uniqueById(bankDisplayItems);

  const sageDisplayItems = statusFilter === 'matched' ? matchedItems.map((m) => m.sage)
    : statusFilter === 'unmatched' ? unmatchedSageItems : allSageItems;

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
      if (normalizeSearchValue(g.checkNumber).includes(query) || normalizeSearchValue(g.totalAmount).includes(query)) return true;
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

  const toggleSelection = (id, selectedIds, setSelectedIds) =>
    setSelectedIds(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const isGroupSelected = (groupItems, selectedIds) => groupItems.every((row) => selectedIds.includes(row.id));

  const toggleGroupSelection = (groupItems, selectedIds, setSelectedIds) => {
    const ids = groupItems.map((x) => x.id);
    const fullySelected = ids.every((id) => selectedIds.includes(id));
    setSelectedIds(fullySelected ? selectedIds.filter((id) => !ids.includes(id)) : Array.from(new Set([...selectedIds, ...ids])));
  };

  const toggleExpandedSageGroup = (groupKey) =>
    setExpandedSageGroups((prev) => prev.includes(groupKey) ? prev.filter((k) => k !== groupKey) : [...prev, groupKey]);

  const handleManualMarkMatched = async () => {
    if (!selectedBankIds.length || !selectedSageIds.length) { toast.error('Select at least one Bank row and one Sage row'); return; }
    if (selectedBankIds.length !== selectedSageIds.length && selectedBankIds.length !== 1 && selectedSageIds.length !== 1) {
      toast.error('Select equal counts, or use grouped matching only for non-ACH debit transactions.'); return;
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
              <label htmlFor="bank-filter" className="text-sm font-semibold text-gray-700 whitespace-nowrap">Bank:</label>
              <div className="relative flex-1">
                <select id="bank-filter" value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)}
                  className="appearance-none bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] block w-full p-2.5 pr-8 transition-colors cursor-pointer">
                  <option value="all">All Banks</option>
                  {bankOptions.map((bankOption) => <option key={bankOption.value} value={bankOption.value}>{bankOption.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full">
              <label htmlFor="status-filter" className="text-sm font-semibold text-gray-700 whitespace-nowrap">Show:</label>
              <div className="relative flex-1">
                <select id="status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                  className="appearance-none bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] block w-full p-2.5 pr-3 transition-colors cursor-pointer">
                  <option value="matched">Matched</option>
                  <option value="unmatched">Unmatched</option>
                  <option value="all">All</option>
                </select>
              </div>
            </div>
            <div className="w-full">
              <input type="text" value={compareSearch} onChange={(e) => setCompareSearch(e.target.value)}
                placeholder="Search match and compare"
                className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2.5" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full lg:max-w-xl lg:ml-auto">
            <button onClick={handleMatch} disabled={matching}
              className="flex items-center justify-center gap-2 bg-[#1e9bd8] hover:bg-[#1887c0] text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-60 w-full">
              {matching
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Matching</>
                : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg> Run Matching</>
              }
            </button>
            <button onClick={handleManualMarkMatched} disabled={manualMarking || !selectedBankIds.length || !selectedSageIds.length}
              className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-60 w-full">
              {manualMarking
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Marking…</>
                : <>Mark as Matched</>
              }
            </button>
          </div>
        </div>
      </div>

      {loading && <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#1e9bd8] border-t-transparent rounded-full animate-spin" /></div>}

      {!loading && results && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard label="Matched" value={summaryMatchedCount} color="text-green-600" />
            <SummaryCard label="Unmatched Bank" value={summaryUnmatchedBankCount} color="text-amber-600" />
            <SummaryCard label="Unmatched Sage" value={summaryUnmatchedSageCount} color="text-red-600" />
          </div>

          {selectedGroup ? (
            <>
              {selectedGroup.account !== 'All Accounts' && (
                <AccountBanner accountNumber={selectedGroup.account} extra={`${statusFilter.charAt(0).toUpperCase()}${statusFilter.slice(1)} view`} />
              )}

              {(statusFilter === 'matched' && matchedItems.length > 0)
                || (statusFilter === 'unmatched' && (unmatchedBankItems.length > 0 || unmatchedSageItems.length > 0))
                || (statusFilter === 'all' && (allBankItems.length > 0 || allSageItems.length > 0)) ? (
                <div className="grid grid-cols-2 gap-4 items-start">
                  {/* LEFT — Bank Statement */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 bg-amber-50/60">
                      <span className="w-2 h-2 rounded-full bg-amber-500 inline-block flex-shrink-0" />
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Bank Statement</span>
                      <span className="ml-auto text-xs text-amber-600 font-semibold">{filteredCompareBankItems.length} items</span>
                    </div>
                    <div className="overflow-auto flex-1" style={{ maxHeight: 'calc(100vh - 260px)' }}>
                      {filteredCompareBankItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm">
                          <span className="text-3xl mb-2">—</span>No bank transactions found.
                        </div>
                      ) : (
                        <table className="w-full table-fixed text-sm">
                          <thead className="bg-gray-50 text-gray-400 text-xs uppercase sticky top-0 z-10">
                            <tr>
                              {statusFilter === 'unmatched' && <th className="text-left px-4 py-3 w-10"></th>}
                              <th className="text-left px-4 py-3 w-1/4">Check No</th>
                              <th className="text-left px-4 py-3 w-1/4">Date</th>
                              <th className="text-left px-4 py-3 w-1/3">Description</th>
                              <th className="text-left px-4 py-3 w-1/6">Type</th>
                              <th className="text-right px-4 py-3 w-1/4">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {filteredCompareBankItems.map((t, idx) => (
                              <tr key={`bank-${t?.id ?? idx}`}
                                className={`transition-colors ${statusFilter === 'unmatched' ? 'hover:bg-amber-50/40' : statusFilter === 'matched' ? 'hover:bg-green-50/40' : 'hover:bg-gray-50'}`}>
                                {statusFilter === 'unmatched' && (
                                  <td className="px-4 py-3">
                                    <input type="checkbox" checked={selectedBankIds.includes(t?.id)}
                                      onChange={() => t?.id && toggleSelection(t.id, selectedBankIds, setSelectedBankIds)}
                                      className="w-4 h-4 accent-[#1e9bd8]" />
                                  </td>
                                )}
                                <td className="px-4 py-3 text-gray-700 font-mono text-xs truncate">{t?.check_number || t?.reference || ''}</td>
                                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{t?.date || ''}</td>
                                <td className="px-4 py-3 text-gray-700 truncate text-xs" title={t?.description}>{t?.description || ''}</td>
                                <td className="px-4 py-3"><Badge type={t?.type || t?.transaction_type} /></td>
                                <td className="px-4 py-3 text-right text-xs">
                                  <div className={`font-semibold ${statusFilter === 'unmatched' ? 'text-amber-700' : statusFilter === 'matched' ? 'text-green-700' : 'text-gray-800'}`}>{fmt(t?.amount)}</div>
                                  <div className={`text-[10px] uppercase font-semibold mt-0.5 ${statusFilter === 'all' ? (t?.is_matched ? 'text-green-600' : 'text-amber-600') : statusFilter === 'matched' ? 'text-green-600' : 'text-amber-600'}`}>
                                    {statusFilter === 'all' ? (t?.is_matched ? 'Matched' : 'Unmatched') : statusFilter === 'matched' ? 'Matched' : 'Unmatched'}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  {/* RIGHT — Sage GL Transactions */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 bg-red-50/60">
                      <span className="w-2 h-2 rounded-full bg-red-500 inline-block flex-shrink-0" />
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Sage GL Transactions</span>
                      <span className="ml-auto text-xs text-red-600 font-semibold">{filteredGroupedSageDisplay.length} groups</span>
                    </div>
                    <div className="overflow-auto flex-1" style={{ maxHeight: 'calc(100vh - 260px)' }}>
                      {filteredGroupedSageDisplay.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm">
                          <span className="text-3xl mb-2">—</span>No Sage transactions found.
                        </div>
                      ) : (
                        <table className="w-full table-fixed text-sm">
                          <thead className="bg-gray-50 text-gray-400 text-xs uppercase sticky top-0 z-10">
                            <tr>
                              {statusFilter === 'unmatched' && <th className="text-left px-4 py-3 w-10"></th>}
                              <th className="text-left px-4 py-3 w-1/4">Check No</th>
                              <th className="text-left px-4 py-3 w-1/4">Date</th>
                              <th className="text-left px-4 py-3 w-1/3">Description</th>
                              <th className="text-left px-4 py-3 w-1/6">Type</th>
                              <th className="text-right px-4 py-3 w-1/4">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {filteredGroupedSageDisplay.map((g, idx) => {
                              const t = g.items[0];
                              const groupMatched = g.items.every((item) => item?.is_matched);
                              const isExpanded = expandedSageGroups.includes(g.groupKey);
                              return (
                                <React.Fragment key={`sage-${g.groupKey}-${idx}`}>
                                  <tr className={`transition-colors ${statusFilter === 'unmatched' ? 'hover:bg-red-50/40' : statusFilter === 'matched' ? 'hover:bg-green-50/40' : 'hover:bg-gray-50'}`}>
                                    {statusFilter === 'unmatched' && (
                                      <td className="px-4 py-3">
                                        <input type="checkbox" checked={isGroupSelected(g.items, selectedSageIds)}
                                          onChange={() => toggleGroupSelection(g.items, selectedSageIds, setSelectedSageIds)}
                                          className="w-4 h-4 accent-[#1e9bd8]" />
                                      </td>
                                    )}
                                    <td className="px-4 py-3 text-gray-700 font-mono text-xs truncate">{g.checkNumber}</td>
                                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{t?.date || ''}</td>
                                    <td className="px-4 py-3 text-gray-700 truncate text-xs" title={g.items.length > 1 ? `${g.items.length} transactions` : (t?.description || '')}>
                                      {g.items.length > 1 ? `${g.items.length} transactions` : (t?.description || '')}
                                    </td>
                                    <td className="px-4 py-3"><Badge type={t?.type || t?.transaction_type} /></td>
                                    <td className="px-4 py-3 text-right text-xs">
                                      <div className={`font-semibold ${statusFilter === 'unmatched' ? 'text-red-700' : statusFilter === 'matched' ? 'text-green-700' : 'text-gray-800'}`}>{fmt(g.totalAmount)}</div>
                                      {g.items.length > 1 && (
                                        <button onClick={() => toggleExpandedSageGroup(g.groupKey)} className="block ml-auto text-[10px] text-[#1e9bd8] hover:underline mt-0.5">
                                          {isExpanded ? 'Hide' : `+${g.items.length}`}
                                        </button>
                                      )}
                                      <div className={`text-[10px] uppercase font-semibold mt-0.5 ${statusFilter === 'all' ? (groupMatched ? 'text-green-600' : 'text-red-600') : statusFilter === 'matched' ? 'text-green-600' : 'text-red-600'}`}>
                                        {statusFilter === 'all' ? (groupMatched ? 'Matched' : 'Unmatched') : statusFilter === 'matched' ? 'Matched' : 'Unmatched'}
                                      </div>
                                    </td>
                                  </tr>
                                  {isExpanded && g.items.length > 1 && g.items.map((entry) => (
                                    <tr key={`sage-entry-${entry.id}`} className="bg-red-50/20">
                                      {statusFilter === 'unmatched' && <td className="px-4 py-2" />}
                                      <td className="px-4 py-2 text-gray-400 font-mono text-xs truncate">{entry.check_number || ''}</td>
                                      <td className="px-4 py-2 text-gray-500 text-xs">{entry.date || ''}</td>
                                      <td className="px-4 py-2 text-gray-600 truncate text-xs" title={entry.description}>{entry.description || ''}</td>
                                      <td className="px-4 py-2"><Badge type={entry.type || entry.transaction_type} /></td>
                                      <td className="px-4 py-2 text-right font-medium text-gray-800 text-xs">{fmt(entry.amount)}</td>
                                    </tr>
                                  ))}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-8 text-center text-gray-400 text-sm space-y-3">
                  <div>No records found for this filter combination.</div>
                  <button onClick={onGoToUnmatched}
                    className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors">
                    Go to Unmatched
                  </button>
                </div>
              )}
            </>
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

export default MatchCompareTab;
