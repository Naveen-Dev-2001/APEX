import { useEffect, useState, useCallback } from "react";
import { SearchOutlined, CloseCircleOutlined, EyeOutlined } from "@ant-design/icons";
import { Skeleton, Tag, Tooltip, Button } from "antd";
import { fetchDeletedInvoices, fetchDeletedInvoiceById } from "../../api/invoiceApi";
import CustomInput from "../../shared/components/CustomInput";
import DataTable from "../../components/ui/DataTable";

const STATUS_COLORS = {
    waiting_coding:   { bg: "#FFF8E1", text: "#F59E0B", label: "Waiting Coding" },
    waiting_approval: { bg: "#E3F2FD", text: "#1976D2", label: "Waiting Approval" },
    approved:         { bg: "#E8F5E9", text: "#2E7D32", label: "Approved" },
    rejected:         { bg: "#FFEBEE", text: "#C62828", label: "Rejected" },
    processed:        { bg: "#EDE7F6", text: "#6A1B9A", label: "Processed" },
    reworked:         { bg: "#FFF3E0", text: "#E65100", label: "Reworked" },
    sage_posted:      { bg: "#E0F2F1", text: "#00695C", label: "Sage Posted" },
    sage_post_failed: { bg: "#FCE4EC", text: "#AD1457", label: "Sage Post Failed" },
};

const StatusBadge = ({ status }) => {
    const s = STATUS_COLORS[status] || { bg: "#F5F5F5", text: "#616161", label: status };
    return (
        <Tag
            style={{
                background: s.bg,
                color: s.text,
                border: "none",
                borderRadius: "999px",
                fontWeight: 600,
                fontSize: "11px",
                padding: "2px 10px",
            }}
        >
            {s.label}
        </Tag>
    );
};

const formatDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
        " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

export const ARCHIVE_COLUMNS = [
    {
        header: "Invoice #",
        accessor: "invoice_number",
        sortable: true,
        filterable: true,
        render: (value) => (
            <span style={{ fontWeight: 600, color: "#1A1A2E" }}>{value || "—"}</span>
        ),
    },
    {
        header: "Vendor",
        accessor: "vendor_name",
        sortable: true,
        filterable: true,
        render: (value, row) => (
            <Tooltip title={row.vendor_id}>
                <span>{value || "—"}</span>
            </Tooltip>
        ),
    },
    {
        header: "Entity",
        accessor: "entity",
        sortable: true,
        filterable: true,
    },
    {
        header: "Status at Deletion",
        accessor: "status",
        sortable: true,
        filterable: true,
        render: (value) => <StatusBadge status={value} />,
    },
    {
        header: "Uploaded By",
        accessor: "uploaded_by",
        sortable: true,
        filterable: true,
    },
    {
        header: "Uploaded At",
        accessor: "uploaded_at",
        sortable: true,
        render: (value) => (
            <span style={{ color: "#555", fontSize: "12px" }}>{formatDate(value)}</span>
        ),
    },
    {
        header: "Deleted By",
        accessor: "deleted_by",
        sortable: true,
        render: (value) => (
            <span style={{ color: "#C62828", fontWeight: 500 }}>{value || "—"}</span>
        ),
    },
    {
        header: "Deleted At",
        accessor: "deleted_at",
        sortable: true,
        render: (value) => (
            <span style={{ color: "#AD1457", fontSize: "12px" }}>{formatDate(value)}</span>
        ),
    },
    {
        header: "Sage Bill #",
        accessor: "sage_bill_number",
        sortable: true,
        render: (value) => (
            <span style={{ color: "#00695C" }}>{value || "—"}</span>
        ),
    },
    {
        header: "Action",
        accessor: "actions",
        width: 100,
        render: (value, row, index, onView) => (
            <div style={{ display: "flex", justifyContent: "center" }}>
                <Tooltip title="View Snapshot">
                    <Button
                        type="text"
                        icon={<EyeOutlined style={{ color: "#4F46E5", fontSize: "16px" }} />}
                        onClick={() => onView(row)}
                    />
                </Tooltip>
            </div>
        ),
    },
];

const PAGE_SIZE = 50;

const ArchivedInvoicesTab = ({ onView, onDataChange, externalSearch }) => {
    const [records, setRecords]       = useState([]);
    const [total, setTotal]           = useState(0);
    const [isLoading, setIsLoading]   = useState(false);
    const [error, setError]           = useState(null);
    const [skip, setSkip]             = useState(0);
    const [limit, setLimit]           = useState(50);
    const [search, setSearch]         = useState(externalSearch || "");
    const [sortColumn, setSortColumn] = useState("deleted_at");
    const [sortDirection, setSortDirection] = useState("desc");

    const load = useCallback((currentSkip = 0, currentLimit = 50, searchVal = "", sCol = "deleted_at", sDir = "desc") => {
        setIsLoading(true);
        setError(null);
        fetchDeletedInvoices({
            skip: currentSkip,
            limit: currentLimit,
            invoice_number: searchVal || undefined,
            sort_by: sCol,
            sort_dir: sDir
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
        load(skip, limit, search, sortColumn, sortDirection);
    }, [load, skip, limit, search, sortColumn, sortDirection]);

    // Re-load when search query from parent changes
    useEffect(() => {
        setSearch(externalSearch || "");
        setSkip(0);
    }, [externalSearch]);

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
            <DataTable
                columns={ARCHIVE_COLUMNS.map(col => 
                    col.accessor === "actions" 
                    ? { ...col, render: (v, r, i) => col.render(v, r, i, handleView) } 
                    : col
                )}
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
            />
        </div>
    );
};

export default ArchivedInvoicesTab;
