import { useEffect, useState, useCallback } from "react";
import { SearchOutlined, CloseCircleOutlined, EyeOutlined } from "@ant-design/icons";
import { Skeleton, Tag, Tooltip, Button } from "antd";
import { fetchDeletedInvoices, fetchDeletedInvoiceById } from "../../api/invoiceApi";
import CustomInput from "../../shared/components/CustomInput";
import ReusableDataTable from "../../shared/components/ReusableDataTable";

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
        headerName: "Invoice #",
        field: "invoice_number",
        flex: 1,
        minWidth: 130,
        cellRenderer: ({ value }) => (
            <span style={{ fontWeight: 600, color: "#1A1A2E" }}>{value || "—"}</span>
        ),
    },
    {
        headerName: "Vendor",
        field: "vendor_name",
        flex: 1.5,
        minWidth: 160,
        cellRenderer: ({ value, data }) => (
            <Tooltip title={data.vendor_id}>
                <span>{value || "—"}</span>
            </Tooltip>
        ),
    },
    {
        headerName: "Entity",
        field: "entity",
        flex: 0.8,
        minWidth: 100,
    },
    {
        headerName: "Status at Deletion",
        field: "status",
        flex: 1,
        minWidth: 150,
        cellRenderer: ({ value }) => <StatusBadge status={value} />,
    },
    {
        headerName: "Uploaded By",
        field: "uploaded_by",
        flex: 0.9,
        minWidth: 120,
    },
    {
        headerName: "Uploaded At",
        field: "uploaded_at",
        flex: 1,
        minWidth: 150,
        cellRenderer: ({ value }) => (
            <span style={{ color: "#555", fontSize: "12px" }}>{formatDate(value)}</span>
        ),
    },
    {
        headerName: "Deleted By",
        field: "deleted_by",
        flex: 0.9,
        minWidth: 120,
        cellRenderer: ({ value }) => (
            <span style={{ color: "#C62828", fontWeight: 500 }}>{value || "—"}</span>
        ),
    },
    {
        headerName: "Deleted At",
        field: "deleted_at",
        flex: 1,
        minWidth: 150,
        cellRenderer: ({ value }) => (
            <span style={{ color: "#AD1457", fontSize: "12px" }}>{formatDate(value)}</span>
        ),
    },
    {
        headerName: "Sage Bill #",
        field: "sage_bill_number",
        flex: 0.9,
        minWidth: 110,
        cellRenderer: ({ value }) => (
            <span style={{ color: "#00695C" }}>{value || "—"}</span>
        ),
    },
    {
        headerName: "Action",
        field: "action",
        width: 100,
        pinned: "right",
        cellRenderer: (params) => (
            <div style={{ display: "flex", justifyContent: "center" }}>
                <Tooltip title="View Snapshot">
                    <Button
                        type="text"
                        icon={<EyeOutlined style={{ color: "#4F46E5", fontSize: "16px" }} />}
                        onClick={() => params.onView(params.data)}
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
    const [search, setSearch]         = useState(externalSearch || "");
    const load = useCallback((currentSkip = 0, searchVal = "") => {
        setIsLoading(true);
        setError(null);
        fetchDeletedInvoices({
            skip: currentSkip,
            limit: PAGE_SIZE,
            invoice_number: searchVal || undefined,
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
    }, []);

    // Initial load
    useEffect(() => {
        load(0, "");
    }, [load]);

    // Re-load when search query from parent changes
    useEffect(() => {
        setSearch(externalSearch || "");
        setSkip(0);
        load(0, externalSearch || "");
    }, [externalSearch, load]);

    const handlePageChange = (page) => {
        const newSkip = (page - 1) * PAGE_SIZE;
        setSkip(newSkip);
        load(newSkip, search);
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
            {isLoading ? (
                <Skeleton active paragraph={{ rows: 8 }} />
            ) : (
                <ReusableDataTable
                    columnDefs={ARCHIVE_COLUMNS.map(col => 
                        col.field === "action" 
                        ? { ...col, cellRendererParams: { onView: handleView } } 
                        : col
                    )}
                    data={records}
                    tableHeader={false}
                    tableSearch={false}
                    defaultPageSize={PAGE_SIZE}
                    shouldUseFlex={false}
                    totalItems={total}
                    currentPage={Math.floor(skip / PAGE_SIZE) + 1}
                    itemsPerPage={PAGE_SIZE}
                    onPageChange={handlePageChange}
                />
            )}
        </div>
    );
};

export default ArchivedInvoicesTab;
