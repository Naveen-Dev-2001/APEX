import React, { useState } from 'react';
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
  const [loading, setLoading] = useState(true);
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

  const bankDisplayItems = statusFilter === 'matched' ? matchedItems.map((m) => m.bank).filter(Boolean)
    : statusFilter === 'unmatched' ? unmatchedBankItems : allBankItems;

  const uniqueBankDisplayItems = uniqueById(bankDisplayItems);

  const sageDisplayItems = statusFilter === 'matched' ? matchedItems.map((m) => m.sage).filter(Boolean)
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

  const [bankSortCol, setBankSortCol] = useState(null);
  const [bankSortDir, setBankSortDir] = useState('asc');
  const [bankCurrentPage, setBankCurrentPage] = useState(1);
  const [bankItemsPerPage, setBankItemsPerPage] = useState(15);

  const [sageSortCol, setSageSortCol] = useState(null);
  const [sageSortDir, setSageSortDir] = useState('asc');
  const [sageCurrentPage, setSageCurrentPage] = useState(1);
  const [sageItemsPerPage, setSageItemsPerPage] = useState(15);

  const sortedCompareBankItems = React.useMemo(() => {
    if (!bankSortCol) return filteredCompareBankItems;
    return [...filteredCompareBankItems].sort((a, b) => {
      let aVal = a[bankSortCol];
      let bVal = b[bankSortCol];
      if (bankSortCol === 'check_number') {
        aVal = a.check_number || a.reference || '';
        bVal = b.check_number || b.reference || '';
      } else if (bankSortCol === 'type') {
        aVal = a.type || a.transaction_type || '';
        bVal = b.type || b.transaction_type || '';
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return bankSortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return bankSortDir === 'asc'
        ? String(aVal ?? '').localeCompare(String(bVal ?? ''), undefined, { numeric: true, sensitivity: 'base' })
        : String(bVal ?? '').localeCompare(String(aVal ?? ''), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [filteredCompareBankItems, bankSortCol, bankSortDir]);

  const bankColumns = React.useMemo(() => [
    {
      header: 'Check No',
      accessor: 'check_number',
      sortable: true,
      filterable: true,
      getFilterValue: (row) => String(row?.check_number || row?.reference || ''),
      render: (val, row) => <span className="font-mono text-xs text-gray-700 truncate block">{row?.check_number || row?.reference || '-'}</span>,
    },
    {
      header: 'Date',
      accessor: 'date',
      sortable: true,
      filterable: true,
      render: (val) => <span className="text-gray-500 text-xs whitespace-nowrap">{val || '-'}</span>,
    },
    {
      header: 'Description',
      accessor: 'description',
      sortable: true,
      filterable: true,
      render: (val) => <span className="text-gray-700 text-xs truncate block max-w-[160px]" title={val}>{val || '-'}</span>,
    },
    {
      header: 'Type',
      accessor: 'type',
      sortable: true,
      filterable: true,
      getFilterValue: (row) => String(row?.type || row?.transaction_type || ''),
      render: (val, row) => <Badge type={val || row?.transaction_type} />,
    },
    {
      header: 'Amount',
      accessor: 'amount',
      sortable: true,
      filterable: true,
      getFilterValue: (row) => fmt(row?.amount),
      render: (val, row) => (
        <div className="text-right">
          <div className={`font-semibold text-xs ${statusFilter === 'unmatched' ? 'text-amber-700' : statusFilter === 'matched' ? 'text-green-700' : 'text-gray-800'}`}>{fmt(val)}</div>
          <div className={`text-[10px] uppercase font-semibold mt-0.5 ${statusFilter === 'all' ? (row?.is_matched ? 'text-green-600' : 'text-amber-600') : statusFilter === 'matched' ? 'text-green-600' : 'text-amber-600'}`}>
            {statusFilter === 'all' ? (row?.is_matched ? 'Matched' : 'Unmatched') : statusFilter === 'matched' ? 'Matched' : 'Unmatched'}
          </div>
        </div>
      ),
    },
  ], [statusFilter]);

  const groupedSageDisplayWithId = React.useMemo(() => {
    const list = groupedSageDisplay.map((g) => ({
      ...g,
      id: g.groupKey,
    }));
    if (!sageSortCol) return list;
    return [...list].sort((a, b) => {
      let aVal = a[sageSortCol];
      let bVal = b[sageSortCol];
      if (sageSortCol === 'date') {
        aVal = a.items?.[0]?.date || '';
        bVal = b.items?.[0]?.date || '';
      } else if (sageSortCol === 'description') {
        aVal = a.items?.length > 1 ? `${a.items.length} transactions` : (a.items?.[0]?.description || '');
        bVal = b.items?.length > 1 ? `${b.items.length} transactions` : (b.items?.[0]?.description || '');
      } else if (sageSortCol === 'type') {
        aVal = a.items?.[0]?.type || a.items?.[0]?.transaction_type || '';
        bVal = b.items?.[0]?.type || b.items?.[0]?.transaction_type || '';
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sageSortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sageSortDir === 'asc'
        ? String(aVal ?? '').localeCompare(String(bVal ?? ''), undefined, { numeric: true, sensitivity: 'base' })
        : String(bVal ?? '').localeCompare(String(aVal ?? ''), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [groupedSageDisplay, sageSortCol, sageSortDir]);

  const selectedSageGroupIds = React.useMemo(() => {
    return groupedSageDisplayWithId
      .filter((g) => g.items.length > 0 && g.items.every((item) => selectedSageIds.includes(item.id)))
      .map((g) => g.id);
  }, [groupedSageDisplayWithId, selectedSageIds]);

  const handleSageGroupSelectionChange = (newSelectedGroupIds) => {
    const allSelectedTransactionIds = [];
    groupedSageDisplayWithId.forEach((g) => {
      if (newSelectedGroupIds.includes(g.id)) {
        g.items.forEach((item) => allSelectedTransactionIds.push(item.id));
      }
    });
    setSelectedSageIds(allSelectedTransactionIds);
  };

  const sageColumns = React.useMemo(() => [
    {
      header: 'Check No',
      accessor: 'checkNumber',
      sortable: true,
      filterable: true,
      render: (val) => <span className="font-mono text-xs text-gray-700 truncate block">{val || '-'}</span>,
    },
    {
      header: 'Date',
      accessor: 'date',
      sortable: true,
      filterable: true,
      getFilterValue: (row) => String(row?.items?.[0]?.date || ''),
      render: (val, row) => <span className="text-gray-500 text-xs whitespace-nowrap">{row?.items?.[0]?.date || '-'}</span>,
    },
    {
      header: 'Description',
      accessor: 'description',
      sortable: true,
      filterable: true,
      getFilterValue: (row) => row?.items?.length > 1 ? `${row.items.length} transactions` : String(row?.items?.[0]?.description || ''),
      render: (val, row) => (
        <span className="text-gray-700 text-xs truncate block max-w-[160px]" title={row?.items?.length > 1 ? `${row.items.length} transactions` : (row?.items?.[0]?.description || '')}>
          {row?.items?.length > 1 ? `${row.items.length} transactions` : (row?.items?.[0]?.description || '-')}
        </span>
      ),
    },
    {
      header: 'Type',
      accessor: 'type',
      sortable: true,
      filterable: true,
      getFilterValue: (row) => String(row?.items?.[0]?.type || row?.items?.[0]?.transaction_type || ''),
      render: (val, row) => <Badge type={row?.items?.[0]?.type || row?.items?.[0]?.transaction_type} />,
    },
    {
      header: 'Amount',
      accessor: 'totalAmount',
      sortable: true,
      filterable: true,
      getFilterValue: (row) => fmt(row?.totalAmount),
      render: (val, row) => {
        const groupMatched = row?.items?.every((item) => item?.is_matched);
        return (
          <div className="text-right">
            <div className={`font-semibold text-xs ${statusFilter === 'unmatched' ? 'text-red-700' : statusFilter === 'matched' ? 'text-green-700' : 'text-gray-800'}`}>{fmt(val)}</div>
            <div className={`text-[10px] uppercase font-semibold mt-0.5 ${statusFilter === 'all' ? (groupMatched ? 'text-green-600' : 'text-red-600') : statusFilter === 'matched' ? 'text-green-600' : 'text-red-600'}`}>
              {statusFilter === 'all' ? (groupMatched ? 'Matched' : 'Unmatched') : statusFilter === 'matched' ? 'Matched' : 'Unmatched'}
            </div>
          </div>
        );
      },
    },
  ], [statusFilter]);

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
    const isSageOnlyVoidPair = selectedBankIds.length === 0 && selectedSageIds.length === 2;
    if (!isSageOnlyVoidPair && (!selectedBankIds.length || !selectedSageIds.length)) {
      toast.error('Select at least one Bank row and one Sage row (or exactly 2 Sage rows for a void pair)');
      return;
    }
    if (!isSageOnlyVoidPair && selectedBankIds.length !== selectedSageIds.length && selectedBankIds.length !== 1 && selectedSageIds.length !== 1) {
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
    <div className="flex flex-col space-y-3 h-full min-h-0 overflow-hidden">
      {/* Action bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            <div className="flex items-center gap-2 min-w-[180px]">
              <label htmlFor="bank-filter" className="text-xs font-semibold text-gray-700 whitespace-nowrap">Bank:</label>
              <BankSelect
                id="bank-filter"
                value={selectedBank}
                onChange={setSelectedBank}
                options={bankOptions}
                allOptionLabel="All Banks"
                allOptionValue="all"
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2 min-w-[140px]">
              <label htmlFor="status-filter" className="text-xs font-semibold text-gray-700 whitespace-nowrap">Show:</label>
              <select id="status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none bg-gray-50 border border-gray-200 text-gray-800 text-xs rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2 pr-3 transition-colors cursor-pointer min-w-[90px]">
                <option value="matched">Matched</option>
                <option value="unmatched">Unmatched</option>
                <option value="all">All</option>
              </select>
            </div>
            <div className="w-full sm:w-56">
              <input type="text" value={compareSearch} onChange={(e) => setCompareSearch(e.target.value)}
                placeholder="Search match & compare"
                className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-xs rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2" />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleMatch} disabled={matching}
              className="flex items-center justify-center gap-1.5 bg-[#1e9bd8] hover:bg-[#1887c0] text-white px-3.5 py-2 rounded-lg font-medium text-xs transition-all disabled:opacity-60 cursor-pointer">
              {matching
                ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Matching</>
                : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg> Run Matching</>
              }
            </button>
            <button onClick={handleManualMarkMatched} disabled={manualMarking || (selectedBankIds.length === 0 && selectedSageIds.length !== 2) || (selectedBankIds.length > 0 && !selectedSageIds.length)}
              className="flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3.5 py-2 rounded-lg font-medium text-xs transition-all disabled:opacity-60 cursor-pointer">
              {manualMarking
                ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Marking…</>
                : <>Mark as Matched</>
              }
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-2 gap-4">
          <TableSkeleton rowCount={8} columnCount={5} />
          <TableSkeleton rowCount={8} columnCount={5} />
        </div>
      )}

      {!loading && results && (
        <>
          <div className="grid grid-cols-3 gap-3">
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
                <div className="grid grid-cols-2 gap-4 items-start flex-1 min-h-0">
                  {/* LEFT — Bank Statement */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col p-3 space-y-2 flex-1 min-h-0">
                    <div className="flex items-center gap-2 bg-amber-50/60 p-2 rounded-xl border border-amber-100 shrink-0">
                      <span className="w-2 h-2 rounded-full bg-amber-500 inline-block flex-shrink-0" />
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Bank Statement</span>
                      <span className="ml-auto text-xs text-amber-600 font-semibold">{filteredCompareBankItems.length} items</span>
                    </div>
                    <DataTable
                      columns={bankColumns}
                      data={sortedCompareBankItems}
                      selectable={statusFilter === 'unmatched'}
                      selectedRows={selectedBankIds}
                      onSelectionChange={setSelectedBankIds}
                      isClientSide={true}
                      enableColumnFilters={true}
                      sortColumn={bankSortCol}
                      sortDirection={bankSortDir}
                      onSort={(col, dir) => { setBankSortCol(col); setBankSortDir(dir); }}
                      currentPage={bankCurrentPage}
                      itemsPerPage={bankItemsPerPage}
                      onPageChange={setBankCurrentPage}
                      onItemsPerPageChange={setBankItemsPerPage}
                      maxHeight="180px"
                      stickyHeader={true}
                      expandable={false}
                    />
                  </div>

                  {/* RIGHT — Sage Transactions */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col p-3 space-y-2 flex-1 min-h-0">
                    <div className="flex items-center gap-2 bg-red-50/60 p-2 rounded-xl border border-red-100 shrink-0">
                      <span className="w-2 h-2 rounded-full bg-red-500 inline-block flex-shrink-0" />
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Sage Transactions</span>
                      <span className="ml-auto text-xs text-red-600 font-semibold">{filteredGroupedSageDisplay.length} groups</span>
                    </div>
                    <DataTable
                      columns={sageColumns}
                      data={groupedSageDisplayWithId}
                      selectable={statusFilter === 'unmatched'}
                      selectedRows={selectedSageGroupIds}
                      onSelectionChange={handleSageGroupSelectionChange}
                      isClientSide={true}
                      enableColumnFilters={true}
                      sortColumn={sageSortCol}
                      sortDirection={sageSortDir}
                      onSort={(col, dir) => { setSageSortCol(col); setSageSortDir(dir); }}
                      currentPage={sageCurrentPage}
                      itemsPerPage={sageItemsPerPage}
                      onPageChange={setSageCurrentPage}
                      onItemsPerPageChange={setSageItemsPerPage}
                      maxHeight="180px"
                      stickyHeader={true}
                      expandable={false}
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-8 text-center text-gray-400 text-sm space-y-3">
                  <div>No records found for this filter combination.</div>
                  <button onClick={onGoToUnmatched}
                    className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer">
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
