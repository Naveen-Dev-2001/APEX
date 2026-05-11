import { useEffect, useState, useCallback, useMemo } from "react";
import { EyeOutlined } from "@ant-design/icons";
import { Skeleton, Tooltip, Button } from "antd";
import { fetchDeletedInvoices, fetchDeletedInvoiceById, getInvoiceFilterOptions } from "../../api/invoiceApi";
import DataTable from "../../components/ui/DataTable";
import { getCondensedColumns, getFullColumns } from "./invoiceColumns";

const ACCESSOR_TO_DB_FIELD = {
    vendor_name: "vendor_name",
    vendor_id: "vendor_id",
    invoice_number: "invoice_number",
    uploaded_by: "uploaded_by",
    status: "status",
    total_amount: "total_amount",
    amount_due: "amount_due",
    uploaded_at: "uploaded_at",
    processed_at: "processed_at",
    deleted_at: "deleted_at",
    deleted_by: "deleted_by",
};

const ArchivedInvoicesTab = ({ onView, onDataChange, externalSearch, userRole, view = "condensed" }) => {
    const [records, setRecords]       = useState([]);
    const [total, setTotal]           = useState(0);
    const [isLoading, setIsLoading]   = useState(false);
    const [error, setError]           = useState(null);
    const [skip, setSkip]             = useState(0);
    const [limit, setLimit]           = useState(50);
    const [search, setSearch]         = useState(externalSearch || "");
    const [sortColumn, setSortColumn] = useState("deleted_at");
    const [sortDirection, setSortDirection] = useState("desc");
    const [columnFilters, setColumnFilters] = useState({});

    const backendFilters = useMemo(() => {
        const filters = {};
        Object.entries(columnFilters).forEach(([accessor, value]) => {
            if (!value) return;
            const dbField = ACCESSOR_TO_DB_FIELD[accessor] || accessor;

            if (value instanceof Set) {
                if (value.size > 0) {
                    filters[dbField] = Array.from(value);
                }
            } else if (typeof value === 'object' && value.op) {
                if (value.op === 'between') {
                    if (Array.isArray(value.val) && (value.val[0] || value.val[1])) {
                        filters[dbField] = { op: 'between', val: value.val };
                    }
                } else if (value.val !== "" && value.val !== undefined) {
                    filters[dbField] = { op: value.op, val: parseFloat(value.val) };
                }
            }
        });
        return filters;
    }, [columnFilters]);


    const load = useCallback((currentSkip = 0, currentLimit = 50, searchVal = "", sCol = "deleted_at", sDir = "desc", filters = {}) => {
        setIsLoading(true);
        setError(null);
        fetchDeletedInvoices({
            skip: currentSkip,
            limit: currentLimit,
            invoice_number: searchVal || undefined,
            sort_by: sCol,
            sort_dir: sDir,
            filters: filters
        })
            .then((data) => {
                const recs = data.data || [];
                setRecords(recs);
                setTotal(data.total || 0);
                if (onDataChange) onDataChange(recs);
            })
            .catch((err) => {
                console.error("Failed to fetch archived invoices", err);
                setError(
                    err?.response?.data?.detail ||
                    "Failed to load archived invoices."
                );
            })
            .finally(() => setIsLoading(false));
    }, [onDataChange]);

    // Initial load
    useEffect(() => {
        load(skip, limit, search, sortColumn, sortDirection, backendFilters);
    }, [load, skip, limit, search, sortColumn, sortDirection, backendFilters]);

    // Re-load when search query from parent changes
    useEffect(() => {
        setSearch(externalSearch || "");
        setSkip(0);
    }, [externalSearch]);

    // Reset skip when filters change
    useEffect(() => {
        setSkip(0);
    }, [columnFilters]);

    const handlePageChange = (page) => {
        setSkip((page - 1) * limit);
    };

    const handleSort = (col, dir) => {
        setSortColumn(col);
        setSortDirection(dir);
        setSkip(0);
    };

    const handleView = async (data) => {
        try {
            setIsLoading(true);
            const fullData = await fetchDeletedInvoiceById(data.id);
            if (onView) {
                onView(fullData);
            }
        } catch (err) {
            console.error("Failed to fetch deleted invoice details", err);
            setError("Failed to load archived invoice details.");
        } finally {
            setIsLoading(false);
        }
    };

    const columnDefs = useMemo(() => {
        const cols = view === "condensed"
            ? getCondensedColumns(handleView, null, null, userRole, null, true)
            : getFullColumns(handleView, null, null, userRole, null, true);

        return cols.map(col => ({
            ...col,
            onGetOptions: col.filterable ? async (accessor) => {
                const otherFilters = { ...backendFilters };
                delete otherFilters[accessor];
                return await getInvoiceFilterOptions(accessor, otherFilters, "delete");
            } : undefined
        }));
    }, [view, handleView, userRole, backendFilters]);

    return (
        <div style={{ padding: "0 16px 24px" }}>

            {/* ── Error ── */}
            {error && (
                <div
                    style={{
                        background: "#FFEBEE",
                        border: "1px solid #FFCDD2",
                        borderRadius: 8,
                        padding: "12px 16px",
                        color: "#C62828",
                        marginBottom: 16,
                        fontSize: 13,
                    }}
                >
                    ⚠️ {error}
                </div>
            )}

            {/* ── Table ── */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-4">
                <DataTable
                    columns={columnDefs}
                    data={records}
                    loading={isLoading}
                    totalItems={total}
                    currentPage={Math.floor(skip / limit) + 1}
                    itemsPerPage={limit}
                    onPageChange={handlePageChange}
                    onItemsPerPageChange={(l) => {
                        setLimit(l);
                        setSkip(0);
                    }}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    maxHeight="calc(100vh - 250px)"
                    stickyHeader={true}
                    enableColumnFilters={true}
                    columnFilters={columnFilters}
                    onColumnFiltersChange={setColumnFilters}
                    transparent={true}
                />
            </div>
        </div>
    );
};

export default ArchivedInvoicesTab;
