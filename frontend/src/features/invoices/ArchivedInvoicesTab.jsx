import { useEffect, useState, useCallback, useMemo } from "react";
import { SearchOutlined, CloseCircleOutlined, EyeOutlined } from "@ant-design/icons";
import { Skeleton, Tag, Tooltip, Button } from "antd";
import dayjs from "dayjs";
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
        render: (value) => (
            <span style={{ fontWeight: 600, color: "#1A1A2E" }}>{value || "—"}</span>
        ),
    },
    {
        header: "Vendor",
        accessor: "vendor_name",
        sortable: true,
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
    },
    {
        header: "Status at Deletion",
        accessor: "status",
        sortable: true,
        render: (value) => <StatusBadge status={value} />,
    },
    {
        header: "Uploaded By",
        accessor: "uploaded_by",
        sortable: true,
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
    const [sort, setSort]             = useState({ field: "deleted_at", direction: "desc" });

    const load = useCallback((currentSkip = 0, currentLimit = 50, searchVal = "", currentSort = { field: "deleted_at", direction: "desc" }) => {
        setIsLoading(true);
        setError(null);
        fetchDeletedInvoices({
            skip: currentSkip,
            limit: currentLimit,
            search: searchVal || undefined,
            sort_by: currentSort.field,
            sort_dir: currentSort.direction
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

    // Initial load handled by externalSearch useEffect if it exists, but need a fallback
    useEffect(() => {
        if (!externalSearch) {
           load(0, 50, "", { field: "deleted_at", direction: "desc" });
        }
    }, [load, externalSearch]);

    // Re-load when search query from parent changes
    useEffect(() => {
        if (externalSearch !== undefined) {
            setSearch(externalSearch || "");
            setSkip(0);
            load(0, limit, externalSearch || "", sort);
        }
    }, [externalSearch, load, limit, sort]);

    const handlePageChange = (page) => {
        const newSkip = (page - 1) * limit;
        setSkip(newSkip);
        load(newSkip, limit, search, sort);
    };

    const handleItemsPerPageChange = (newLimit) => {
        setLimit(newLimit);
        setSkip(0);
        load(0, newLimit, search, sort);
    };

    const handleSort = (field, direction) => {
        const newSort = { field, direction: direction || 'desc' };
        setSort(newSort);
        setSkip(0);
        load(0, limit, search, newSort);
    };

    const handleView = useCallback(async (data) => {
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
    }, [onView]);

    const columns = useMemo(() => [
        ...ARCHIVE_COLUMNS,
        {
            header: "Action",
            accessor: "id",
            width: "80px",
            render: (_, row) => (
                <div style={{ display: "flex", justifyContent: "center" }}>
                    <Tooltip title="View Snapshot">
                        <Button
                            type="text"
                            icon={<EyeOutlined style={{ color: "#4F46E5", fontSize: "16px" }} />}
                            onClick={() => handleView(row)}
                        />
                    </Tooltip>
                </div>
            ),
        }
    ], [handleView]);

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
                columns={columns}
                data={records}
                loading={isLoading}
                pagination={{
                    currentPage: Math.floor(skip / limit) + 1,
                    itemsPerPage: limit,
                    totalItems: total,
                    onPageChange: handlePageChange,
                    onItemsPerPageChange: handleItemsPerPageChange
                }}
                sort={sort}
                onSort={handleSort}
            />
        </div>
    );
};

export default ArchivedInvoicesTab;
