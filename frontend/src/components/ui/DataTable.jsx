import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import TableSkeleton from './TableSkeleton';

// ─── Funnel / filter icon (inline SVG, no extra dep) ─────────────────────────
const FunnelIcon = ({ active }) => (
    <svg
        width="12" height="12" viewBox="0 0 16 16" fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
    >
        <path
            d="M1 3h14l-5 6v5l-4-2V9L1 3z"
            fill={active ? '#40a9ff' : 'rgba(255,255,255,0.55)'}
            stroke={active ? '#40a9ff' : 'rgba(255,255,255,0.55)'}
            strokeWidth="1.2"
            strokeLinejoin="round"
        />
    </svg>
);

// ─── Get the filterable text value for a row ──────────────────────────────────
const getColFilterValue = (col, row) => {
    if (col.getFilterValue) return String(col.getFilterValue(row) ?? '');
    return String(row[col.accessor] ?? '');
};

// ─── Column Filter Popover ────────────────────────────────────────────────────
const FilterPopover = ({ col, data, activeFilters, onApply, onClose, anchorPos }) => {
    const [search, setSearch] = useState('');
    const [pending, setPending] = useState(() => new Set(activeFilters ?? []));
    const popRef = useRef(null);
    const searchRef = useRef(null);

    // All unique values for this column derived from full data
    const allValues = useMemo(() => {
        const vals = [...new Set(data.map(row => getColFilterValue(col, row)))]
            .filter(v => v && v !== '-')
            .sort((a, b) => a.localeCompare(b));
        return vals;
    }, [data, col]);

    // Values visible after searching
    const visibleValues = useMemo(() => {
        if (!search.trim()) return allValues;
        const q = search.toLowerCase();
        return allValues.filter(v => v.toLowerCase().includes(q));
    }, [allValues, search]);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (popRef.current && !popRef.current.contains(e.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    // Auto-focus search
    useEffect(() => {
        setTimeout(() => searchRef.current?.focus(), 50);
    }, []);

    const toggle = (val) => {
        setPending(prev => {
            const next = new Set(prev);
            next.has(val) ? next.delete(val) : next.add(val);
            return next;
        });
    };

    // Adjust position so popover doesn't go off-screen
    const style = useMemo(() => {
        const W = 260;
        const viewW = window.innerWidth;
        let left = anchorPos.left;
        if (left + W > viewW - 8) left = viewW - W - 8;
        return {
            position: 'fixed',
            top: anchorPos.bottom + 4,
            left,
            width: W,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            zIndex: 9999,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
        };
    }, [anchorPos]);

    return (
        <div ref={popRef} style={style}>
            {/* Search box */}
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: '#f7f8fa', border: '1px solid #e5e7eb',
                    borderRadius: 6, padding: '5px 10px',
                }}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="6.5" cy="6.5" r="5" stroke="#9ca3af" strokeWidth="1.5" />
                        <path d="M10.5 10.5L14 14" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <input
                        ref={searchRef}
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search in filters"
                        style={{
                            border: 'none', outline: 'none', background: 'transparent',
                            fontSize: 12, color: '#374151', width: '100%',
                        }}
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, fontSize: 12 }}
                        >✕</button>
                    )}
                </div>
            </div>

            {/* Checkbox list */}
            <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 0' }}>
                {visibleValues.length === 0 ? (
                    <div style={{ padding: '12px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                        No matching values
                    </div>
                ) : visibleValues.map(val => {
                    const checked = pending.has(val);
                    return (
                        <label
                            key={val}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '7px 14px', cursor: 'pointer',
                                background: checked ? '#e6f4ff' : 'transparent',
                                transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => { if (!checked) e.currentTarget.style.background = '#f5f5f5'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = checked ? '#e6f4ff' : 'transparent'; }}
                        >
                            <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggle(val)}
                                style={{ display: 'none' }}
                            />
                            {/* Custom checkbox */}
                            <span style={{
                                width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                                border: checked ? '2px solid #1677ff' : '2px solid #d1d5db',
                                background: checked ? '#1677ff' : '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.15s',
                            }}>
                                {checked && (
                                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                                        <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                            </span>
                            <span style={{
                                fontSize: 13, color: checked ? '#1677ff' : '#374151',
                                fontWeight: checked ? 500 : 400,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                maxWidth: 190,
                            }}>
                                {val}
                            </span>
                        </label>
                    );
                })}
            </div>

            {/* Footer */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px', borderTop: '1px solid #f0f0f0',
                background: '#fafafa',
            }}>
                <button
                    onClick={() => setPending(new Set())}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#1677ff', fontSize: 13, fontWeight: 500, padding: 0,
                    }}
                >
                    Reset
                </button>
                <button
                    onClick={() => onApply(pending)}
                    style={{
                        background: '#1677ff', border: 'none', cursor: 'pointer',
                        color: '#fff', fontSize: 13, fontWeight: 500,
                        padding: '4px 18px', borderRadius: 5,
                    }}
                >
                    OK
                </button>
            </div>
        </div>
    );
};

// ─── Main DataTable ───────────────────────────────────────────────────────────
const DataTable = ({ 
  columns, 
  data, 
  loading = false,
  skeletonRows = 8,
  totalItems, 
  itemsPerPageOptions = [15, 30, 50],
  onPageChange,
  onItemsPerPageChange,
  currentPage = 1,
  itemsPerPage = 15,
  sortColumn,
  sortDirection,
  maxHeight,
  stickyHeader = false,
  enableColumnFilters = false,
  columnFilters: externalColumnFilters,
  onColumnFiltersChange: onExternalColumnFiltersChange,
}) => {
    // ── Filter state ──────────────────────────────────────────────────────────
    // columnFilters: { [accessor]: Set<string> }
    const [internalColumnFilters, setInternalColumnFilters] = useState({});
    
    const columnFilters = externalColumnFilters !== undefined ? externalColumnFilters : internalColumnFilters;

    const setColumnFilters = useCallback((update) => {
        if (onExternalColumnFiltersChange) {
            if (typeof update === 'function') {
                onExternalColumnFiltersChange(prev => update(prev || {}));
            } else {
                onExternalColumnFiltersChange(update);
            }
        } else {
            setInternalColumnFilters(update);
        }
    }, [onExternalColumnFiltersChange]);
    // Which column's popover is open + where to render it
    const [openFilter, setOpenFilter] = useState(null); // { accessor, anchorPos }

    const hasActiveFilters = Object.values(columnFilters).some(s => s && s.size > 0);
    const isColFiltered = (accessor) => (columnFilters[accessor]?.size ?? 0) > 0;

    const handleFunnelClick = useCallback((e, col) => {
        e.stopPropagation();
        if (openFilter?.accessor === col.accessor) {
            setOpenFilter(null);
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        setOpenFilter({
            accessor: col.accessor,
            col,
            anchorPos: { left: rect.left, bottom: rect.bottom },
        });
    }, [openFilter]);

    const applyFilter = useCallback((accessor, selected) => {
        setColumnFilters(prev => ({ ...prev, [accessor]: selected }));
        setOpenFilter(null);
    }, []);

    // ── Client-side filtering ─────────────────────────────────────────────────
    // Helper to filter data by a specific subset of filters
    const getFilteredDataCommon = useCallback((filters) => {
        if (!enableColumnFilters) return data;
        const activeAccessors = Object.keys(filters).filter(acc => filters[acc]?.size > 0);
        if (activeAccessors.length === 0) return data;

        return data.filter(row =>
            columns.every(col => {
                if (!col.filterable) return true;
                const selected = filters[col.accessor];
                if (!selected || selected.size === 0) return true;
                const val = getColFilterValue(col, row);
                return selected.has(val);
            })
        );
    }, [data, columns, enableColumnFilters]);

    // Main filtered data for the table body
    const filteredData = useMemo(() => {
        return getFilteredDataCommon(columnFilters);
    }, [getFilteredDataCommon, columnFilters]);

    // Data for a specific column's filter popover (all filters EXCEPT its own)
    const getDataForFilterPopover = useCallback((colAccessor) => {
        const otherFilters = { ...columnFilters };
        delete otherFilters[colAccessor];
        return getFilteredDataCommon(otherFilters);
    }, [getFilteredDataCommon, columnFilters]);

    if (loading) {
        return <TableSkeleton rowCount={skeletonRows} columnCount={columns.length} />;
    }

    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    const handlePageClick = (page) => {
        if (page >= 1 && page <= totalPages && onPageChange) {
            onPageChange(page);
        }
    };

    const renderPaginationNumbers = () => {
        let pages = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            if (currentPage <= 4) {
                pages = [1, 2, 3, 4, 5, '...', totalPages - 1, totalPages];
            } else if (currentPage >= totalPages - 3) {
                pages = [1, 2, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
            } else {
                pages = [1, 2, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages - 1, totalPages];
            }
        }
        return pages.map((page, idx) => (
            <button
                key={idx}
                onClick={() => typeof page === 'number' ? handlePageClick(page) : null}
                className={`w-7 h-7 flex items-center justify-center rounded-md text-sm mx-0.5 
                    ${page === currentPage ? 'bg-[#24a0ed] text-white font-medium' : 'text-gray-500 hover:bg-gray-100'} 
                    ${typeof page !== 'number' ? 'cursor-default' : 'cursor-pointer'}`}
            >
                {page}
            </button>
        ));
    };

    return (
        <>
        <div className="w-full flex flex-col bg-white rounded-md border border-gray-200 overflow-hidden shadow-sm">
            <div 
                className="w-full overflow-x-auto overflow-y-auto"
                style={maxHeight ? { maxHeight } : {}}
            >
                <table className="w-full text-left text-[13px] text-gray-700 border-separate border-spacing-0">
                    <thead className={`${stickyHeader ? 'sticky top-0 z-20' : ''} bg-[#1D71AB] text-white`}>
                        <tr>
                            {columns.map((col, idx) => {
                                const isSortedColumn = sortColumn === col.accessor;
                                const isLastColumn = idx === columns.length - 1;
                                const isSticky = isLastColumn && col.accessor === 'actions';
                                const filtered = enableColumnFilters && col.filterable && isColFiltered(col.accessor);
                                return (
                                    <th 
                                        key={idx} 
                                        className={`px-4 py-3 font-medium whitespace-nowrap
                                            ${col.sortable ? 'cursor-pointer select-none hover:bg-[#1a669a]' : ''}
                                            ${isSticky ? 'sticky right-0 bg-[#1D71AB] z-30 shadow-[-12px_1px_12px_-8px_rgba(0,0,0,0.3)]' : ''}`}
                                        onClick={() => col.sortable && col.onClick ? col.onClick() : null}
                                    >
                                        <div className="flex items-center justify-between w-full gap-1.5">
                                            {/* Column label */}
                                            <span>{col.header}</span>

                                            {/* Sort arrows + Filter icon grouped at the right end */}
                                            <div className="flex items-center gap-1 ml-auto shrink-0">
                                                {col.sortable && (
                                                    <div className="flex flex-col text-[10px] leading-[6px] opacity-70">
                                                        <span className={isSortedColumn && sortDirection === 'asc' ? 'text-white font-bold opacity-100' : 'opacity-40'}>▲</span>
                                                        <span className={isSortedColumn && sortDirection === 'desc' ? 'text-white font-bold opacity-100' : 'opacity-40'}>▼</span>
                                                    </div>
                                                )}

                                                {enableColumnFilters && col.filterable && (
                                                    <button
                                                        onClick={(e) => handleFunnelClick(e, col)}
                                                        title={`Filter by ${col.header}`}
                                                        style={{
                                                            background: filtered
                                                                ? 'rgba(64,169,255,0.2)'
                                                                : openFilter?.accessor === col.accessor
                                                                    ? 'rgba(255,255,255,0.15)'
                                                                    : 'transparent',
                                                            border: filtered ? '1px solid rgba(64,169,255,0.6)' : '1px solid transparent',
                                                            borderRadius: 4,
                                                            cursor: 'pointer',
                                                            padding: '2px 3px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            transition: 'all 0.15s',
                                                        }}
                                                        onMouseEnter={e => {
                                                            if (!filtered) e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                                                        }}
                                                        onMouseLeave={e => {
                                                            if (!filtered) e.currentTarget.style.background = openFilter?.accessor === col.accessor ? 'rgba(255,255,255,0.15)' : 'transparent';
                                                        }}
                                                    >
                                                        <FunnelIcon active={filtered} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredData.map((row, rowIdx) => (
                            <tr key={rowIdx} className="hover:bg-gray-50 transition-colors group">
                                {columns.map((col, colIdx) => {
                                    const isLastColumn = colIdx === columns.length - 1;
                                    const isSticky = isLastColumn && col.accessor === 'actions';
                                    return (
                                        <td 
                                            key={colIdx} 
                                            className={`px-4 py-3.5 whitespace-nowrap border-r border-transparent last:border-none
                                                ${isSticky ? 'sticky right-0 bg-white group-hover:bg-gray-50 z-10 shadow-[-12px_1px_12px_-8px_rgba(30,30,30,0.15)]' : ''}`}
                                        >
                                            {col.render ? col.render(row[col.accessor], row) : row[col.accessor] || '-'}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                        {filteredData.length === 0 && (
                            <tr>
                                <td colSpan={columns.length} className="px-5 py-8 text-center text-gray-500">
                                    {hasActiveFilters
                                        ? 'No records match the current filters.'
                                        : 'No data available'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* ── Pagination Footer ── */}
            <div className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-5 py-3 border-t border-gray-200 bg-white z-10 gap-4 sm:gap-0">
                <div className="flex items-center justify-between sm:justify-start gap-4 w-full sm:w-auto text-[13px] text-gray-600">
                    <div className="flex items-center gap-2">
                        <span>Items:</span>
                        <select 
                            className="border border-gray-300 rounded px-2 py-1 bg-white outline-none focus:border-blue-500 cursor-pointer text-gray-700"
                            value={itemsPerPage}
                            onChange={(e) => onItemsPerPageChange && onItemsPerPageChange(Number(e.target.value))}
                        >
                            {itemsPerPageOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>
                    <span>
                        {hasActiveFilters ? `${filteredData.length} filtered / ` : ''}
                        {startItem}-{endItem} of {totalItems}
                    </span>
                    {hasActiveFilters && (
                        <button
                            onClick={() => setColumnFilters({})}
                            style={{
                                fontSize: 12, color: '#1677ff', background: 'none',
                                border: '1px solid #1677ff', borderRadius: 4,
                                padding: '2px 8px', cursor: 'pointer',
                            }}
                        >
                            Clear all filters
                        </button>
                    )}
                </div>

                <div className="flex items-center justify-center gap-1 w-full sm:w-auto">
                    {renderPaginationNumbers()}
                    <button 
                        onClick={() => handlePageClick(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed ml-1 sm:ml-2 font-bold"
                    >
                        &lt;
                    </button>
                    <button 
                        onClick={() => handlePageClick(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed font-bold"
                    >
                        &gt;
                    </button>
                </div>
            </div>
        </div>

        {/* ── Filter Popover (portal-like, fixed positioning) ── */}
        {openFilter && (
            <FilterPopover
                col={openFilter.col}
                data={getDataForFilterPopover(openFilter.accessor)}
                activeFilters={columnFilters[openFilter.accessor]}
                anchorPos={openFilter.anchorPos}
                onApply={(selected) => applyFilter(openFilter.accessor, selected)}
                onClose={() => setOpenFilter(null)}
            />
        )}
        </>
    );
};

export default DataTable;
