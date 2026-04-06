import React, { useMemo, useState, useRef, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { SearchOutlined } from "@ant-design/icons";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import CustomButton from "./CustomButton";

// AG Grid v33+
ModuleRegistry.registerModules([AllCommunityModule]);

export default function ReusableDataTable({
    title = "Data Table",
    columnDefs = [],
    handleCreateUser,
    data = [],
    loading = false,
    searchPlaceholder = "Search...",
    tableSearch = true,
    onSearch = null,
    searchText: externalSearchText = "", // Accept external search text
    onFilter = null,
    showFilter = false,
    defaultPageSize = 10,
    pageSizeOptions = [10, 20, 50],
    onCellClicked = null,
    tableHeader = true,
    rowHeight = 48,
    shouldUseFlex = false,
    // Server-side pagination props
    totalItems = null,
    currentPage: externalPage = 1,
    itemsPerPage: externalPageSize = 10,
    onPageChange = null,
    onItemsPerPageChange = null,
    onSortChange = null,
}) {
    const gridRef = useRef(null);
    const [gridApi, setGridApi] = useState(null);
    const [internalSearchText, setInternalSearchText] = useState("");
    const [internalCurrentPage, setInternalCurrentPage] = useState(1);
    const [internalPageSize, setInternalPageSize] = useState(defaultPageSize);

    const isServerSide = totalItems !== null;
    const currentPage = isServerSide ? externalPage : internalCurrentPage;
    const pageSize = isServerSide ? externalPageSize : internalPageSize;

    // Use external search text if provided, otherwise use internal
    const activeSearchText = externalSearchText || internalSearchText;

    /* ---------- SEARCH ---------- */
    const filteredData = useMemo(() => {
        if (isServerSide) return data; // Backend already filtered/sorted
        if (onSearch) return onSearch(data, activeSearchText);
        if (!activeSearchText) return data;

        const s = activeSearchText.toLowerCase();
        return data.filter((row) =>
            Object.values(row).some((v) =>
                String(v ?? "").toLowerCase().includes(s)
            )
        );
    }, [data, activeSearchText, onSearch, isServerSide]);

    const effectiveTotal = isServerSide ? totalItems : filteredData.length;

    /* ---------- GRID READY ---------- */
    const onGridReady = (params) => {
        setGridApi(params.api);
        params.api.setGridOption("paginationPageSize", pageSize);
        if (!isServerSide) {
            params.api.addEventListener("paginationChanged", () => {
                setInternalCurrentPage(params.api.paginationGetCurrentPage() + 1);
            });
        }
        params.api.sizeColumnsToFit();
    };

    useEffect(() => {
        if (gridApi && !loading) {
            const maxPage = Math.ceil(filteredData.length / pageSize);
            const targetPage = Math.min(currentPage, maxPage || 1);
            gridApi.paginationGoToPage(targetPage - 1);
        }
    }, [filteredData, gridApi, pageSize]);

    // Reset to page 1 when search changes
    useEffect(() => {
        if (gridApi) {
            if (isServerSide) {
                // For server-side, parent handles page reset
            } else {
                setInternalCurrentPage(1);
                gridApi.paginationGoToPage(0);
            }
        }
    }, [activeSearchText, gridApi, isServerSide]);

    if (loading) {
        return (
            <div style={{ padding: 32, background: "#f8fafc" }}>
                <div style={{ textAlign: "center", padding: 40 }}>Loading...</div>
            </div>
        );
    }

    return (
        <div className={`flex flex-col font-creato ${tableHeader ? 'bg-[#f8fafc] min-h-[calc(100dvh-48px)]' : ''}`}>
            {/* ================= HEADER ================= */}
            {tableHeader && (
                <div className="flex gap-6 items-center mb-6 font-creato">
                    <h2 className="text-xl font-bold">{title}</h2>

                    <div className="w-[60px] h-8 rounded-full bg-[#E0E0E0] flex items-center justify-center">
                        {filteredData.length}
                    </div>

                    {/* Search */}
                    {tableSearch && (
                        <div className="relative w-[360px] ml-auto">
                            <SearchOutlined className="absolute left-[14px] top-1/2 -translate-y-1/2" />
                            <input
                                value={internalSearchText}
                                onChange={(e) => setInternalSearchText(e.target.value)}
                                placeholder={searchPlaceholder}
                                className="w-full rounded-lg border border-[#E0E0E0] pt-[10px] pr-[14px] pb-[10px] pl-[42px] focus:outline-none focus:border-[#1e9bd8] transition-colors"
                            />
                        </div>
                    )}

                    {showFilter && (
                        <div>
                            <CustomButton
                                className={`mt-0 cursor-pointer`}
                                variant={"primary"}
                                type="button"
                                onClick={handleCreateUser}
                            >
                                Create New User
                            </CustomButton>
                        </div>
                    )}
                </div>
            )}

            <div className="bg-white rounded-lg border border-[#eee] max-h-[calc(100vh-250px)] shadow overflow-hidden flex flex-col">
                <div
                    className="ag-theme-alpine w-full 
                    min-h-auto
                    transition-[height]
                    duration-200"
                    style={{
                        height: `${Math.max(
                            1,
                            Math.min(pageSize, filteredData.length - (currentPage - 1) * pageSize)
                        ) * rowHeight + 48}px`,
                    }}
                >
                        <AgGridReact
                        ref={gridRef}
                        columnDefs={columnDefs}
                        rowData={filteredData}
                        domLayout="normal"
                        getRowId={(params) => String(params.data.id)}
                        onSortChanged={(params) => {
                            if (isServerSide && onSortChange) {
                                const sortModel = params.api.getColumnState().find(c => c.sort != null);
                                if (sortModel) {
                                    onSortChange(sortModel.colId, sortModel.sort);
                                }
                            }
                        }}
                        defaultColDef={{
                            sortable: true,
                            filter: false,
                            resizable: false,
                            ...(shouldUseFlex ? { flex: 1 } : {}),
                            suppressMenu: true,
                            cellStyle: {
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            },
                        }}
                        pagination={!isServerSide}
                        suppressPaginationPanel
                        rowHeight={rowHeight}
                        headerHeight={48}
                        suppressCellFocus
                        onCellClicked={onCellClicked}
                        onGridReady={onGridReady}
                        theme="legacy"
                        getRowStyle={(params) => {
                            if (params.node.rowIndex % 2 === 1) {
                                return { backgroundColor: "#FFFFFF" }; // No zebra striping to match screenshot
                            }
                            return { backgroundColor: "#FFFFFF" };
                        }}
                    />
                </div>

                {/* ================= FOOTER ================= */}
                {effectiveTotal > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 rounded-b-lg bg-white">
                        {/* Left */}
                        <div className="flex items-center gap-3">
                            <span className="text-[13px] text-[#4B5563]">Items:</span>

                            <select
                                value={pageSize}
                                onChange={(e) => {
                                    const newSize = Number(e.target.value);
                                    if (isServerSide) {
                                        onItemsPerPageChange?.(newSize);
                                    } else {
                                        setInternalPageSize(newSize);
                                        setInternalCurrentPage(1);
                                        if (gridApi) {
                                            gridApi.setGridOption("paginationPageSize", newSize);
                                            gridApi.paginationGoToPage(0);
                                        }
                                    }
                                }}
                                className="border border-[#E5E7EB] rounded px-2 py-0.5 text-[13px] bg-white text-[#4B5563]"
                            >
                                {pageSizeOptions.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>

                            <span className="text-[13px] text-[#4B5563] ml-2">
                                {Math.min((currentPage - 1) * pageSize + 1, effectiveTotal)}
                                {"-"}
                                {Math.min(currentPage * pageSize, effectiveTotal)}
                                {" of "}
                                {effectiveTotal}
                            </span>
                        </div>

                        {/* Right - Pagination */}
                        <div className="flex items-center gap-1">
                            {(() => {
                                const totalPages = Math.ceil(effectiveTotal / pageSize);
                                const pages = [];
                                const maxVisible = 3; // Show max 3 page numbers

                                if (totalPages <= maxVisible + 2) {
                                    for (let i = 1; i <= totalPages; i++) pages.push(i);
                                } else {
                                    pages.push(1);
                                    if (currentPage <= 2) {
                                        pages.push(2);
                                        pages.push(3);
                                        pages.push('ellipsis');
                                        pages.push(totalPages);
                                    } else if (currentPage >= totalPages - 1) {
                                        pages.push('ellipsis');
                                        pages.push(totalPages - 2);
                                        pages.push(totalPages - 1);
                                        pages.push(totalPages);
                                    } else {
                                        pages.push('ellipsis-start');
                                        pages.push(currentPage);
                                        pages.push('ellipsis-end');
                                        pages.push(totalPages);
                                    }
                                }

                                return (
                                    <>
                                        {pages.map((p, idx) => {
                                            if (typeof p === 'string') {
                                                return <span key={idx} className="px-2 text-gray-400 text-sm">...</span>;
                                            }
                                            return (
                                                <button
                                                    key={idx}
                                                    onClick={() => {
                                                        if (isServerSide) {
                                                            onPageChange?.(p);
                                                        } else {
                                                            setInternalCurrentPage(p);
                                                            gridApi?.paginationGoToPage(p - 1);
                                                        }
                                                    }}
                                                    className={`min-w-[32px] h-8 rounded text-[13px] font-medium transition-colors ${currentPage === p
                                                        ? "bg-[#1e9bd8] !text-white"
                                                        : "bg-white text-[#4B5563] hover:bg-gray-50"
                                                        }`}
                                                >
                                                    {p}
                                                </button>
                                            );
                                        })}
                                    </>
                                );
                            })()}

                            {/* Previous Button */}
                            <button
                                onClick={() => {
                                    if (currentPage > 1) {
                                        if (isServerSide) {
                                            onPageChange?.(currentPage - 1);
                                        } else {
                                            setInternalCurrentPage(currentPage - 1);
                                            gridApi?.paginationGoToPage(currentPage - 2);
                                        }
                                    }
                                }}
                                disabled={currentPage === 1}
                                className={`min-w-[32px] h-8 flex items-center justify-center text-[18px] transition-colors ${currentPage === 1
                                    ? "text-gray-300 cursor-not-allowed"
                                    : "text-[#4B5563] hover:text-[#1e9bd8] cursor-pointer"
                                    }`}
                            >
                                &lt;
                            </button>

                            {/* Next Button */}
                            <button
                                onClick={() => {
                                    const totalPages = Math.ceil(effectiveTotal / pageSize);
                                    if (currentPage < totalPages) {
                                        if (isServerSide) {
                                            onPageChange?.(currentPage + 1);
                                        } else {
                                            setInternalCurrentPage(currentPage + 1);
                                            gridApi?.paginationGoToPage(currentPage);
                                        }
                                    }
                                }}
                                disabled={currentPage === Math.ceil(effectiveTotal / pageSize)}
                                className={`min-w-[32px] h-8 flex items-center justify-center text-[18px] transition-colors ${currentPage === Math.ceil(effectiveTotal / pageSize)
                                    ? "text-gray-300 cursor-not-allowed"
                                    : "text-[#4B5563] hover:text-[#1e9bd8] cursor-pointer"
                                    }`}
                            >
                                &gt;
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}