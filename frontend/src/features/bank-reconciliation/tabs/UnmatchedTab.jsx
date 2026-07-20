import React, { useState } from 'react';
import { reconciliationApi } from '../reconciliationApi';
import toast from '../../../utils/toast';
import {
  fmt,
  normalizeSearchValue,
  formatBankAccountOptionLabel,
  Badge,
  EmptyState,
} from '../components/shared';

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
        label: formatBankAccountOptionLabel(row?.bank_id || row?.bank_name, accountNumber),
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
      if (!grouped.has(key)) grouped.set(key, { groupKey: key, checkNumber: checkNo || '', totalAmount: 0, items: [] });
      const g = grouped.get(key);
      g.items.push(item);
      g.totalAmount += Number(item.amount || 0);
    });
    return Array.from(grouped.values());
  };

  const isGroupSelected = (groupItems, selectedIds) => groupItems.every((row) => selectedIds.includes(row.id));

  const toggleGroupSelection = (groupItems, selectedIds, setSelectedIds) => {
    const ids = groupItems.map((x) => x.id);
    const fullySelected = ids.every((id) => selectedIds.includes(id));
    setSelectedIds(fullySelected ? selectedIds.filter((id) => !ids.includes(id)) : Array.from(new Set([...selectedIds, ...ids])));
  };

  const toggleExpanded = (groupKey, expanded, setExpanded) =>
    setExpanded(expanded.includes(groupKey) ? expanded.filter((k) => k !== groupKey) : [...expanded, groupKey]);

  const filteredUnmatchedBank = React.useMemo(() => {
    const bankRows = results?.unmatched_bank || [];
    const byBank = selectedBank === 'all'
      ? bankRows
      : bankRows.filter((t) => String(t?.account_number || t?.account || '').trim() === selectedBankAccountNumber);
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
    return groups.map((group) => {
      const byBank = selectedBank === 'all'
        ? (group.unmatched_sage || [])
        : (group.unmatched_sage || []).filter((t) => String(t?.account || t?.account_number || '').trim() === selectedBankGlAccount);
      const filteredRows = !query ? byBank : byBank.filter((t) => (
        normalizeSearchValue(t?.check_number || t?.reference).includes(query)
        || normalizeSearchValue(t?.date).includes(query)
        || normalizeSearchValue(t?.description).includes(query)
        || normalizeSearchValue(t?.type || t?.transaction_type).includes(query)
        || normalizeSearchValue(t?.amount).includes(query)
        || normalizeSearchValue(t?.account || t?.account_number).includes(query)
        || normalizeSearchValue(t?.bank).includes(query)
      ));
      return { ...group, display_unmatched_sage: filteredRows };
    }).filter((group) => group.display_unmatched_sage.length > 0);
  }, [results, selectedBank, selectedBankGlAccount, unmatchedSearch]);

  const groupedUnmatchedBank = groupByCheckNumber(filteredUnmatchedBank);
  const filteredUnmatchedSageCount = unmatchedSageGroups.reduce((sum, group) => sum + (group.display_unmatched_sage || []).length, 0);

  const toggleSelection = (id, selectedIds, setSelectedIds) =>
    setSelectedIds(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const handleManualMarkMatched = async () => {
    if (!selectedBankIds.length || !selectedSageIds.length) { toast.error('Select at least one Bank row and one Sage row'); return; }
    if (selectedBankIds.length !== selectedSageIds.length && selectedBankIds.length !== 1 && selectedSageIds.length !== 1) {
      toast.error('Select equal counts, or use grouped matching only for non-ACH debit transactions.'); return;
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
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <label htmlFor="unmatched-bank-filter" className="text-sm font-semibold text-gray-700 whitespace-nowrap">Bank:</label>
              <select id="unmatched-bank-filter" value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)}
                className="appearance-none bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] block w-52 p-2.5 transition-colors cursor-pointer">
                <option value="all">All Banks</option>
                {bankOptions.map((bankOption) => <option key={bankOption.value} value={bankOption.value}>{bankOption.label}</option>)}
              </select>
              <input type="text" value={unmatchedSearch} onChange={(e) => setUnmatchedSearch(e.target.value)}
                placeholder="Search unmatched transactions"
                className="w-full max-w-sm bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2.5" />
            </div>
            <button onClick={handleManualMarkMatched} disabled={manualMarking || !selectedBankIds.length || !selectedSageIds.length}
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60">
              {manualMarking
                ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Marking…</>
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

          <div className="grid grid-cols-2 gap-4 items-start">
            {/* LEFT — Unmatched Bank Statement */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2 bg-amber-50/60 sticky top-0 z-10">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block flex-shrink-0" />
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Bank Statement</span>
                <span className="ml-auto text-xs text-amber-600 font-semibold">{filteredUnmatchedBank.length} items</span>
              </div>
              <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
                {filteredUnmatchedBank.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm">
                    <span className="text-3xl mb-2">✓</span>No unmatched bank transactions
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-400 text-xs uppercase sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-3 w-8"></th>
                        <th className="text-left px-4 py-3">Check No</th>
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-left px-4 py-3">Description</th>
                        <th className="text-left px-4 py-3">Type</th>
                        <th className="text-right px-4 py-3">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {groupedUnmatchedBank.map((g) => (
                        <React.Fragment key={`bank-group-${g.groupKey}`}>
                          <tr className="hover:bg-amber-50/40 transition-colors">
                            <td className="px-4 py-3">
                              <input type="checkbox" checked={isGroupSelected(g.items, selectedBankIds)}
                                onChange={() => toggleGroupSelection(g.items, selectedBankIds, setSelectedBankIds)}
                                className="w-4 h-4 accent-[#1e9bd8]" />
                            </td>
                            <td className="px-4 py-3 text-gray-700 font-mono text-xs">{g.checkNumber}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{g.items[0]?.date}</td>
                            <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate text-xs">
                              {g.items.length > 1 ? `${g.items.length} transactions` : (g.items[0]?.description || '')}
                            </td>
                            <td className="px-4 py-3"><Badge type={g.items[0]?.type} /></td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-800 text-xs">
                              {fmt(g.totalAmount)}
                              {g.items.length > 1 && (
                                <button onClick={() => toggleExpanded(g.groupKey, expandedBankGroups, setExpandedBankGroups)}
                                  className="block ml-auto text-[10px] text-[#1e9bd8] hover:underline">
                                  {expandedBankGroups.includes(g.groupKey) ? 'Hide' : `+${g.items.length}`}
                                </button>
                              )}
                            </td>
                          </tr>
                          {g.items.length > 1 && expandedBankGroups.includes(g.groupKey) && g.items.map((t) => (
                            <tr key={`bank-child-${t.id}`} className="bg-amber-50/20">
                              <td className="px-4 py-2">
                                <input type="checkbox" checked={selectedBankIds.includes(t.id)}
                                  onChange={() => toggleSelection(t.id, selectedBankIds, setSelectedBankIds)}
                                  className="w-4 h-4 accent-[#1e9bd8]" />
                              </td>
                              <td className="px-4 py-2 text-gray-400 font-mono text-xs">{t.check_number || t.reference || ''}</td>
                              <td className="px-4 py-2 text-gray-500 text-xs">{t.date}</td>
                              <td className="px-4 py-2 text-gray-600 max-w-[160px] truncate text-xs">{t.description || ''}</td>
                              <td className="px-4 py-2"><Badge type={t.type} /></td>
                              <td className="px-4 py-2 text-right font-medium text-gray-800 text-xs">{fmt(t.amount)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* RIGHT — Unmatched Sage GL Transactions */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2 bg-red-50/60 sticky top-0 z-10">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block flex-shrink-0" />
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Sage GL Transactions</span>
                <span className="ml-auto text-xs text-red-600 font-semibold">{filteredUnmatchedSageCount} items</span>
              </div>
              <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
                {unmatchedSageGroups.length === 0 || filteredUnmatchedSageCount === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm">
                    <span className="text-3xl mb-2">✓</span>No unmatched Sage transactions
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-400 text-xs uppercase sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-3 w-8"></th>
                        <th className="text-left px-4 py-3">Check No</th>
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-left px-4 py-3">Description</th>
                        <th className="text-left px-4 py-3">Type</th>
                        <th className="text-right px-4 py-3">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {unmatchedSageGroups.flatMap((group) => {
                        const groupUnmatchedSage = group.display_unmatched_sage || [];
                        return groupByCheckNumber(groupUnmatchedSage).flatMap((g) => {
                          const sageKey = `${group.account}-${g.groupKey}`;
                          const isExpanded = expandedSageGroups.includes(sageKey);
                          const rows = [
                            <tr key={`sage-group-${sageKey}`} className="hover:bg-red-50/30 transition-colors">
                              <td className="px-4 py-3">
                                <input type="checkbox" checked={isGroupSelected(g.items, selectedSageIds)}
                                  onChange={() => toggleGroupSelection(g.items, selectedSageIds, setSelectedSageIds)}
                                  className="w-4 h-4 accent-[#1e9bd8]" />
                              </td>
                              <td className="px-4 py-3 text-gray-700 font-mono text-xs">{g.checkNumber}</td>
                              <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{g.items[0]?.date}</td>
                              <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate text-xs">
                                {g.items.length > 1 ? `${g.items.length} transactions` : (g.items[0]?.description || '')}
                              </td>
                              <td className="px-4 py-3"><Badge type={g.items[0]?.type} /></td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-800 text-xs">
                                {fmt(g.totalAmount)}
                                {g.items.length > 1 && (
                                  <button onClick={() => toggleExpanded(sageKey, expandedSageGroups, setExpandedSageGroups)}
                                    className="block ml-auto text-[10px] text-[#1e9bd8] hover:underline">
                                    {isExpanded ? 'Hide' : `+${g.items.length}`}
                                  </button>
                                )}
                              </td>
                            </tr>,
                          ];
                          if (g.items.length > 1 && isExpanded) {
                            g.items.forEach((t) => {
                              rows.push(
                                <tr key={`sage-child-${t.id}`} className="bg-red-50/20">
                                  <td className="px-4 py-2">
                                    <input type="checkbox" checked={selectedSageIds.includes(t.id)}
                                      onChange={() => toggleSelection(t.id, selectedSageIds, setSelectedSageIds)}
                                      className="w-4 h-4 accent-[#1e9bd8]" />
                                  </td>
                                  <td className="px-4 py-2 text-gray-400 font-mono text-xs">{t.check_number || ''}</td>
                                  <td className="px-4 py-2 text-gray-500 text-xs">{t.date}</td>
                                  <td className="px-4 py-2 text-gray-600 max-w-[160px] truncate text-xs">{t.description || ''}</td>
                                  <td className="px-4 py-2"><Badge type={t.type} /></td>
                                  <td className="px-4 py-2 text-right font-medium text-gray-800 text-xs">{fmt(t.amount)}</td>
                                </tr>
                              );
                            });
                          }
                          return rows;
                        });
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {filteredUnmatchedBank.length === 0 && filteredUnmatchedSageCount === 0 && (
            <EmptyState icon="✅" title="All transactions matched!" subtitle="No unmatched transactions found. Reconciliation is complete." />
          )}
        </>
      )}
    </div>
  );
};

export default UnmatchedTab;
