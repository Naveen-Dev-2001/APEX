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
} from '../components/shared';

const UnmatchedTab = () => {
  const [results, setResults] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
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

  const [bankSortCol, setBankSortCol] = useState(null);
  const [bankSortDir, setBankSortDir] = useState('asc');
  const [bankCurrentPage, setBankCurrentPage] = useState(1);
  const [bankItemsPerPage, setBankItemsPerPage] = useState(15);

  const [sageSortCol, setSageSortCol] = useState(null);
  const [sageSortDir, setSageSortDir] = useState('asc');
  const [sageCurrentPage, setSageCurrentPage] = useState(1);
  const [sageItemsPerPage, setSageItemsPerPage] = useState(15);

  const groupedUnmatchedBankWithId = React.useMemo(() => {
    const rawGroups = groupByCheckNumber(filteredUnmatchedBank);
    const list = rawGroups.map((g) => ({
      ...g,
      id: g.groupKey,
    }));
    if (!bankSortCol) return list;
    return [...list].sort((a, b) => {
      let aVal = a[bankSortCol];
      let bVal = b[bankSortCol];
      if (bankSortCol === 'date') {
        aVal = a.items?.[0]?.date || '';
        bVal = b.items?.[0]?.date || '';
      } else if (bankSortCol === 'description') {
        aVal = a.items?.length > 1 ? `${a.items.length} transactions` : (a.items?.[0]?.description || '');
        bVal = b.items?.length > 1 ? `${b.items.length} transactions` : (b.items?.[0]?.description || '');
      } else if (bankSortCol === 'type') {
        aVal = a.items?.[0]?.type || a.items?.[0]?.transaction_type || '';
        bVal = b.items?.[0]?.type || b.items?.[0]?.transaction_type || '';
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return bankSortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return bankSortDir === 'asc'
        ? String(aVal ?? '').localeCompare(String(bVal ?? ''), undefined, { numeric: true, sensitivity: 'base' })
        : String(bVal ?? '').localeCompare(String(aVal ?? ''), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [filteredUnmatchedBank, bankSortCol, bankSortDir]);

  const selectedBankGroupIds = React.useMemo(() => {
    return groupedUnmatchedBankWithId
      .filter((g) => g.items.length > 0 && g.items.every((item) => selectedBankIds.includes(item.id)))
      .map((g) => g.id);
  }, [groupedUnmatchedBankWithId, selectedBankIds]);

  const handleBankGroupSelectionChange = (newSelectedGroupIds) => {
    const allSelectedTransactionIds = [];
    groupedUnmatchedBankWithId.forEach((g) => {
      if (newSelectedGroupIds.includes(g.id)) {
        g.items.forEach((item) => allSelectedTransactionIds.push(item.id));
      }
    });
    setSelectedBankIds(allSelectedTransactionIds);
  };

  const bankColumns = React.useMemo(() => [
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
      render: (val, row) => (
        <div className="text-right font-semibold text-gray-800 text-xs">{fmt(val)}</div>
      ),
    },
  ], []);

  const flattenedSageCheckGroups = React.useMemo(() => {
    const list = unmatchedSageGroups.flatMap((group) => {
      const checkGroups = groupByCheckNumber(group.display_unmatched_sage || []);
      return checkGroups.map((g) => ({
        ...g,
        id: `${group.account}-${g.groupKey}`,
      }));
    });
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
  }, [unmatchedSageGroups, sageSortCol, sageSortDir]);

  const selectedSageGroupIds = React.useMemo(() => {
    return flattenedSageCheckGroups
      .filter((g) => g.items.length > 0 && g.items.every((item) => selectedSageIds.includes(item.id)))
      .map((g) => g.id);
  }, [flattenedSageCheckGroups, selectedSageIds]);

  const handleSageGroupSelectionChange = (newSelectedGroupIds) => {
    const allSelectedTransactionIds = [];
    flattenedSageCheckGroups.forEach((g) => {
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
      render: (val, row) => (
        <div className="text-right font-semibold text-gray-800 text-xs">{fmt(val)}</div>
      ),
    },
  ], []);

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
    <div className="flex flex-col space-y-3 h-full min-h-0 overflow-hidden">
      {loading && (
        <div className="grid grid-cols-2 gap-4">
          <TableSkeleton rowCount={8} columnCount={5} />
          <TableSkeleton rowCount={8} columnCount={5} />
        </div>
      )}

      {!loading && results && (
        <>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <label htmlFor="unmatched-bank-filter" className="text-xs font-semibold text-gray-700 whitespace-nowrap">Bank:</label>
              <BankSelect
                id="unmatched-bank-filter"
                value={selectedBank}
                onChange={setSelectedBank}
                options={bankOptions}
                allOptionLabel="All Banks"
                allOptionValue="all"
                className="w-44"
              />
              <input type="text" value={unmatchedSearch} onChange={(e) => setUnmatchedSearch(e.target.value)}
                placeholder="Search unmatched transactions"
                className="w-full max-w-xs bg-gray-50 border border-gray-200 text-gray-800 text-xs rounded-lg focus:ring-[#1e9bd8] focus:border-[#1e9bd8] p-2" />
            </div>
            <button onClick={handleManualMarkMatched} disabled={manualMarking || !selectedBankIds.length || !selectedSageIds.length}
              className="flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3.5 py-2 rounded-lg font-medium text-xs transition-all disabled:opacity-60 cursor-pointer">
              {manualMarking
                ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Marking…</>
                : <>Mark as Matched</>
              }
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
              </div>
              <div>
                <div className="text-lg font-bold text-amber-700">{filteredUnmatchedBank.length}</div>
                <div className="text-[11px] text-amber-600 font-medium">Unmatched in Bank Statement</div>
              </div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-lg font-bold text-red-700">{filteredUnmatchedSageCount}</div>
                <div className="text-[11px] text-red-600 font-medium">Unmatched in Sage GL</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 items-start flex-1 min-h-0">
            {/* LEFT — Unmatched Bank Statement */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col p-3 space-y-2 flex-1 min-h-0">
              <div className="flex items-center gap-2 bg-amber-50/60 p-2 rounded-xl border border-amber-100 shrink-0">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block flex-shrink-0" />
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Bank Statement</span>
                <span className="ml-auto text-xs text-amber-600 font-semibold">{filteredUnmatchedBank.length} items</span>
              </div>
              <DataTable
                columns={bankColumns}
                data={groupedUnmatchedBankWithId}
                selectable={true}
                selectedRows={selectedBankGroupIds}
                onSelectionChange={handleBankGroupSelectionChange}
                isClientSide={true}
                enableColumnFilters={true}
                sortColumn={bankSortCol}
                sortDirection={bankSortDir}
                onSort={(col, dir) => { setBankSortCol(col); setBankSortDir(dir); }}
                currentPage={bankCurrentPage}
                itemsPerPage={bankItemsPerPage}
                onPageChange={setBankCurrentPage}
                onItemsPerPageChange={setBankItemsPerPage}
                maxHeight="calc(100vh - 365px)"
                stickyHeader={true}
                expandable={false}
              />
            </div>

            {/* RIGHT — Unmatched Sage Transactions */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col p-3 space-y-2 flex-1 min-h-0">
              <div className="flex items-center gap-2 bg-red-50/60 p-2 rounded-xl border border-red-100 shrink-0">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block flex-shrink-0" />
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Sage Transactions</span>
                <span className="ml-auto text-xs text-red-600 font-semibold">{filteredUnmatchedSageCount} items</span>
              </div>
              <DataTable
                columns={sageColumns}
                data={flattenedSageCheckGroups}
                selectable={true}
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
                maxHeight="calc(100vh - 365px)"
                stickyHeader={true}
                expandable={false}
              />
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
