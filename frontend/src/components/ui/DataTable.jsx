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
            fill={active ? '#24A1DD' : 'rgba(255,255,255,0.55)'}
            stroke={active ? '#24A1DD' : 'rgba(255,255,255,0.55)'}
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
    const isNumber = col.filterType === 'number';
    const isDate = col.filterType === 'date';
    const [filterMode, setFilterMode] = useState(() => {
        if ((isNumber || isDate) && activeFilters && !(activeFilters instanceof Set)) return 'condition';
        return 'list';
    });

    const [search, setSearch] = useState('');
    const [pendingSet, setPendingSet] = useState(() => (activeFilters instanceof Set ? new Set(activeFilters) : new Set()));
    const [pendingCond, setPendingCond] = useState(() => {
        if (activeFilters && !(activeFilters instanceof Set)) return activeFilters;
        if (isDate) return { op: 'between', val: ['', ''] };
        return { op: '>', val: '' };
    });
    const popRef = useRef(null);
    const searchRef = useRef(null);

    // All unique values for this column
    const [allValues, setAllValues] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const fetchOptions = async () => {
            if (!col.onGetOptions) {
                // Fallback to deriving from local data
                const vals = [...new Set(data.map(row => getColFilterValue(col, row)))]
                    .filter(v => v && v !== '-')
                    .sort((a, b) => String(a).localeCompare(String(b)));
                setAllValues(vals);
                return;
            }

            setLoading(true);
            try {
                const options = await col.onGetOptions(col.accessor);
                if (isMounted) {
                    setAllValues(options);
                }
            } catch (err) {
                console.error('Error fetching filter options:', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchOptions();
        return () => { isMounted = false; };
    }, [col, data]);

    // Values visible after searching
    const visibleValues = useMemo(() => {
        if (!search.trim()) return allValues;
        const q = search.toLowerCase();
        return allValues.filter(v => String(v).toLowerCase().includes(q));
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
        setPendingSet(prev => {
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
            borderRadius: 12,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            zIndex: 9999,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: '"Creato Display", sans-serif',
        };
    }, [anchorPos]);

    return (
        <div ref={popRef} style={style}>
            {(isNumber || isDate) && (
                <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', background: '#f9fafb' }}>
                    <button
                        onClick={() => setFilterMode('list')}
                        style={{
                            flex: 1, padding: '12px', fontSize: 13, fontWeight: 600,
                            background: filterMode === 'list' ? '#fff' : 'transparent',
                            border: 'none', 
                            borderBottom: filterMode === 'list' ? '2px solid #24A1DD' : '2px solid transparent',
                            color: filterMode === 'list' ? '#24A1DD' : '#6b7280',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        List
                    </button>
                    <button
                        onClick={() => setFilterMode('condition')}
                        style={{
                            flex: 1, padding: '12px', fontSize: 13, fontWeight: 600,
                            background: filterMode === 'condition' ? '#fff' : 'transparent',
                            border: 'none', 
                            borderBottom: filterMode === 'condition' ? '2px solid #24A1DD' : '2px solid transparent',
                            color: filterMode === 'condition' ? '#24A1DD' : '#6b7280',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        Condition
                    </button>
                </div>
            )}

            {filterMode === 'list' ? (
                <>
                    {/* Search box */}
                    <div style={{ padding: '12px 14px', borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: '#f9fafb', border: '1px solid #e5e7eb',
                            borderRadius: 8, padding: '8px 12px',
                            transition: 'border-color 0.2s',
                        }}>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="6.5" cy="6.5" r="5" stroke="#9ca3af" strokeWidth="1.8" />
                                <path d="M10.5 10.5L14 14" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                            <input
                                ref={searchRef}
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search values..."
                                style={{
                                    border: 'none', outline: 'none', background: 'transparent',
                                    fontSize: 13, color: '#303030', width: '100%',
                                    fontFamily: 'inherit'
                                }}
                                onFocus={e => e.currentTarget.parentElement.style.borderColor = '#24A1DD'}
                                onBlur={e => e.currentTarget.parentElement.style.borderColor = '#e5e7eb'}
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch('')}
                                    style={{ 
                                        background: 'none', border: 'none', cursor: 'pointer', 
                                        color: '#9ca3af', padding: 0, fontSize: 14,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                >✕</button>
                            )}
                        </div>
                    </div>

                    <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 0' }}>
                        {loading ? (
                            <div style={{ padding: '20px', textAlign: 'center' }}>
                                <div className="inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        ) : visibleValues.length === 0 ? (
                            <div style={{ padding: '12px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                                No matching values
                            </div>
                        ) : visibleValues.map(val => {
                            const checked = pendingSet.has(val);
                            const label = String(val);
                            return (
                                <label
                                    key={val}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '7px 14px', cursor: 'pointer',
                                        background: checked ? '#f0f9ff' : 'transparent',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => { if (!checked) e.currentTarget.style.background = '#f9fafb'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = checked ? '#f0f9ff' : 'transparent'; }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggle(val)}
                                        style={{ display: 'none' }}
                                    />
                                    {/* Custom checkbox */}
                                    <span style={{
                                        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                                        border: checked ? '2px solid #24A1DD' : '2px solid #d1d5db',
                                        background: checked ? '#24A1DD' : '#fff',
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
                                        fontSize: 13, color: checked ? '#24A1DD' : '#374151',
                                        fontWeight: checked ? 600 : 400,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        maxWidth: 190,
                                    }}>
                                        {label}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </>
            ) : (
                <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {isDate ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>From</span>
                                <input
                                    type="date"
                                    value={pendingCond.val[0] || ''}
                                    onChange={e => setPendingCond(prev => ({ ...prev, op: 'between', val: [e.target.value, prev.val[1] || ''] }))}
                                    style={{
                                        width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db',
                                        fontSize: 13, color: '#303030', outline: 'none', transition: 'border-color 0.2s',
                                        fontFamily: 'inherit'
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#24A1DD'}
                                    onBlur={e => e.target.style.borderColor = '#d1d5db'}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</span>
                                <input
                                    type="date"
                                    value={pendingCond.val[1] || ''}
                                    onChange={e => setPendingCond(prev => ({ ...prev, op: 'between', val: [prev.val[0] || '', e.target.value] }))}
                                    style={{
                                        width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db',
                                        fontSize: 13, color: '#303030', outline: 'none', transition: 'border-color 0.2s',
                                        fontFamily: 'inherit'
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#24A1DD'}
                                    onBlur={e => e.target.style.borderColor = '#d1d5db'}
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Operator</span>
                                <select
                                    value={pendingCond.op}
                                    onChange={e => setPendingCond(prev => ({ ...prev, op: e.target.value }))}
                                    style={{
                                        width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db',
                                        fontSize: 13, color: '#303030', outline: 'none', background: '#fff',
                                        cursor: 'pointer', transition: 'border-color 0.2s'
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#24A1DD'}
                                    onBlur={e => e.target.style.borderColor = '#d1d5db'}
                                >
                                    <option value="=">=</option>
                                    <option value=">">&gt;</option>
                                    <option value="<">&lt;</option>
                                    <option value=">=">&gt;=</option>
                                    <option value="<=">&lt;=</option>
                                    <option value="!=">!=</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Value</span>
                                <input
                                    type="number"
                                    value={pendingCond.val}
                                    onChange={e => setPendingCond(prev => ({ ...prev, val: e.target.value }))}
                                    placeholder="Enter value"
                                    style={{
                                        width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db',
                                        fontSize: 13, color: '#303030', outline: 'none', transition: 'border-color 0.2s'
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#24A1DD'}
                                    onBlur={e => e.target.style.borderColor = '#d1d5db'}
                                />
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Footer */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px', borderTop: '1px solid #f0f0f0',
                background: '#fafafa',
            }}>
                <button
                    onClick={() => {
                        if (filterMode === 'list') setPendingSet(new Set());
                        else if (isDate) setPendingCond({ op: 'between', val: ['', ''] });
                        else setPendingCond({ op: '>', val: '' });
                    }}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#24A1DD', fontSize: 13, fontWeight: 600, padding: '4px 8px',
                        borderRadius: 4, transition: 'background 0.2s'
                    }}
                    onMouseEnter={e => e.target.style.background = '#f0f9ff'}
                    onMouseLeave={e => e.target.style.background = 'none'}
                >
                    Reset
                </button>
                <button
                    onClick={() => {
                        if (filterMode === 'list') onApply(pendingSet);
                        else onApply(pendingCond);
                    }}
                    style={{
                        background: '#24A1DD', border: 'none', cursor: 'pointer',
                        color: '#fff', fontSize: 13, fontWeight: 600,
                        padding: '6px 20px', borderRadius: 8,
                        boxShadow: '0 2px 4px rgba(36,161,221,0.2)',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { e.target.style.opacity = '0.9'; e.target.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { e.target.style.opacity = '1'; e.target.style.transform = 'translateY(0)'; }}
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
  onSort,
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

    const hasActiveFilters = Object.values(columnFilters).some(val => {
        if (!val) return false;
        if (val instanceof Set) return val.size > 0;
        if (typeof val === 'object' && val.op) {
            if (val.op === 'between') {
                return (val.val[0] !== "" && val.val[0] !== undefined) || (val.val[1] !== "" && val.val[1] !== undefined);
            }
            return val.val !== "" && val.val !== undefined;
        }
        return false;
    });

    const isColFiltered = (accessor) => {
        const val = columnFilters[accessor];
        if (!val) return false;
        if (val instanceof Set) return val.size > 0;
        if (typeof val === 'object' && val.op) {
            if (val.op === 'between') {
                return (val.val[0] !== "" && val.val[0] !== undefined) || (val.val[1] !== "" && val.val[1] !== undefined);
            }
            return val.val !== "" && val.val !== undefined;
        }
        return false;
    };

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
        // If server side filtering is enabled, we assume 'data' is already filtered
        if (enableColumnFilters) return data;
        
        return data.filter(row =>
            columns.every(col => {
                if (!col.filterable) return true;
                const selected = filters[col.accessor];
                if (!selected) return true;
                
                if (selected instanceof Set) {
                    if (selected.size === 0) return true;
                    const val = getColFilterValue(col, row);
                    return selected.has(val);
                    } else if (typeof selected === 'object' && selected.op) {
                    if (selected.op === 'between') {
                        const rowVal = getColFilterValue(col, row);
                        if (!rowVal) return false;
                        const rowDate = new Date(rowVal);
                        if (isNaN(rowDate.getTime())) return false;
                        
                        const [from, to] = selected.val;
                        if (from) {
                            const fromDate = new Date(from);
                            if (rowDate < fromDate) return false;
                        }
                        if (to) {
                            const toDate = new Date(to);
                            if (rowDate > toDate) return false;
                        }
                        return true;
                    }
                    
                    if (selected.val === "" || selected.val === undefined) return true;
                    const rowVal = parseFloat(getColFilterValue(col, row));
                    const filterVal = parseFloat(selected.val);
                    if (isNaN(rowVal) || isNaN(filterVal)) return false;
                    
                    switch (selected.op) {
                        case '=': return rowVal === filterVal;
                        case '>': return rowVal > filterVal;
                        case '<': return rowVal < filterVal;
                        case '>=': return rowVal >= filterVal;
                        case '<=': return rowVal <= filterVal;
                        case '!=': return rowVal !== filterVal;
                        default: return true;
                    }
                }
                return true;
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
                                        onClick={() => {
                                            if (col.sortable) {
                                                if (onSort) {
                                                    const newDirection = (sortColumn === col.accessor && sortDirection === 'asc') ? 'desc' : 'asc';
                                                    onSort(col.accessor, newDirection);
                                                } else if (col.onClick) {
                                                    col.onClick();
                                                }
                                            }
                                        }}
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
                                            {col.render ? col.render(row[col.accessor], row, rowIdx) : row[col.accessor] || '-'}
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
                                fontSize: 12, color: '#24A1DD', background: 'none',
                                border: '1px solid #24A1DD', borderRadius: 4,
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
