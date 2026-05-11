import { EyeOutlined, LoadingOutlined, InboxOutlined } from "@ant-design/icons";
import { Trash2 } from "lucide-react";
import { formatCurrency, formatIST } from "../../utils/formatters";

// ─── Status badge helper ──────────────────────────────────────────────────────
const getStatusLabel = (value, level, row = null) => {
    if (row?.status_label) return row.status_label;
    if (typeof value === 'string' && (value.startsWith("Waiting for") || value.includes("(level"))) {
        return value;
    }

    const labelMap = {
        approved: "Approved",
        pending: "Pending",
        rejected: "Rejected",
        processed: "Processed",
        waiting_approval: "Waiting Approval",
        waiting_coding: "Waiting For Coding",
        sage_posted: "Posted to Sage",
        sage_post_failed: "Sage Post Failed",
        reworked: "Reworked",
        archived: "Archived",
    };

    let label = labelMap[value] ?? value;

    if (value === 'waiting_approval' && level) {
        label = `Waiting for approver ${level}`;
    }
    return label;
};

// ─── Status badge helper ──────────────────────────────────────────────────────
const StatusBadge = ({ value, level, label }) => {
    const colorMap = {
        approved: "bg-green-100 text-green-700",
        pending: "bg-yellow-100 text-yellow-700",
        rejected: "bg-red-100 text-red-700",
        processed: "bg-blue-100 text-blue-700",
        waiting_approval: "bg-orange-100 text-orange-700",
        waiting_coding: "bg-purple-100 text-purple-700",
        sage_posted: "bg-emerald-100 text-emerald-700",
        sage_post_failed: "bg-red-100 text-red-700",
        reworked: "bg-rose-100 text-rose-700",
        archived: "bg-indigo-100 text-indigo-700",
    };

    const cls = colorMap[value] ?? "bg-gray-100 text-gray-600";
    const displayLabel = label ?? getStatusLabel(value, level);

    return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls}`}>
            {displayLabel ?? "-"}
        </span>
    );
};

// ─── Next Action By helper ───────────────────────────────────────────────────
const getNextApprover = (row) => {
    const status = (row?.status || "").toLowerCase();
    if (status === 'sage_posted' || status === 'approved') return "Completed";
    if (status === 'rejected') return "Rejected";
    if (status === 'waiting_coding' || status === 'processed') return "Finance Team";

    const currentLevel = row?.current_approver_level || 1;
    const stage = row?.assigned_approvers?.[currentLevel - 1];

    if (!stage) return "-";

    if (stage.is_finance === true) return "Finance Team";

    const names = stage.names || stage.emails;
    if (Array.isArray(names)) {
        return names.map(n => {
            if (typeof n === 'string' && n.includes('@')) {
                return n.split('@')[0].split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
            }
            return n;
        }).join(", ");
    }
    if (typeof names === 'string') {
        if (names.includes('@')) {
            return names.split('@')[0].split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
        }
        return names;
    }

    return "-";
};

// ─── Workflow Users helper ───────────────────────────────────────────────────
export const getWorkflowUsers = (row) => {
    if (!row?.assigned_approvers || !Array.isArray(row.assigned_approvers)) return "-";

    const allUsers = [];
    row.assigned_approvers.forEach(stage => {
        if (stage.is_finance === true) {
            if (!allUsers.includes("Finance Team")) allUsers.push("Finance Team");
        } else {
            const names = stage.names || stage.emails;
            if (Array.isArray(names)) {
                names.forEach(n => {
                    let formatted = n;
                    if (typeof n === 'string' && n.includes('@')) {
                        formatted = n.split('@')[0].split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
                    }
                    if (!allUsers.includes(formatted)) allUsers.push(formatted);
                });
            } else if (typeof names === 'string') {
                let formatted = names;
                if (names.includes('@')) {
                    formatted = names.split('@')[0].split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
                }
                if (!allUsers.includes(formatted)) allUsers.push(formatted);
            }
        }
    });

    return allUsers.length > 0 ? allUsers.join(", ") : "-";
};

// ─── Actions cell helper ──────────────────────────────────────────────────────
const actionsCol = (onView, onDelete, onArchive, userRole, openingInvoiceId, hideDelete = false) => ({
    header: "Actions",
    accessor: "actions",
    sortable: false,
    render: (_, row) => {
        const allowedRoles = ["scanner", "coder"];
        const currentRole = userRole?.toLowerCase();
        const canDelete = allowedRoles.includes(currentRole) && row.status !== 'sage_posted' && !hideDelete;
        const isOpening = openingInvoiceId != null && String(openingInvoiceId) === String(row?.id);
        const canArchive = allowedRoles.includes(currentRole) && row.status === 'sage_posted';

        return (
            <div className="flex items-center justify-center gap-3">
                <button
                    onClick={() => onView(row)}
                    disabled={isOpening}
                    className="text-blue-500 hover:text-blue-700 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    title="View"
                >
                    {isOpening ? <LoadingOutlined style={{ fontSize: 16 }} spin /> : <EyeOutlined style={{ fontSize: 16 }} />}
                </button>
                {canDelete && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(row);
                        }}
                        className="text-red-400 hover:text-red-600 transition-colors cursor-pointer"
                        title="Delete"
                    >
                        <Trash2 size={16} />
                    </button>
                )}
                {canArchive && onArchive && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onArchive(row);
                        }}
                        className="text-emerald-500 hover:text-emerald-700 transition-colors cursor-pointer"
                        title="Archive"
                    >
                        <InboxOutlined style={{ fontSize: 16 }} />
                    </button>
                )}
            </div>
        );
    },
});

export const VIEW_OPTIONS = [
    { label: "Condensed View", value: "condensed" },
    { label: "Full View", value: "full" },
];

// ─── Condensed columns ────────────────────────────────────────────────────────
export const getCondensedColumns = (onView, onDelete, onArchive, userRole, openingInvoiceId = null, hideDelete = false) => [
    {
        header: "Vendor Name",
        accessor: "vendor_name",
        sortable: true,
        filterable: true,
        getFilterValue: (row) => row?.extracted_data?.vendor_info?.name?.value ?? "",
        render: (_, row) => row?.extracted_data?.vendor_info?.name?.value ?? "-",
    },
    {
        header: "Vendor ID",
        accessor: "vendor_id",
        sortable: true,
        filterable: true,
    },
    {
        header: "Invoice Number",
        accessor: "invoice_number",
        sortable: true,
        filterable: true,
    },
    {
        header: "Total Amount",
        accessor: "total_amount",
        filterable: true,
        filterType: 'number',
        getFilterValue: (row) => row?.extracted_data?.amounts?.total_invoice_amount?.value ?? "",
        filterRender: (val) => formatCurrency(val),
        render: (_, row) => formatCurrency(row?.extracted_data?.amounts?.total_invoice_amount?.value),
    },
    {
        header: "Amount Due",
        accessor: "amount_due",
        filterable: true,
        filterType: 'number',
        getFilterValue: (row) => row?.extracted_data?.amounts?.amount_due?.value ?? "",
        filterRender: (val) => formatCurrency(val),
        render: (_, row) => formatCurrency(row?.extracted_data?.amounts?.amount_due?.value),
    },
    {
        header: "Last Updated",
        accessor: "processed_at",
        sortable: true,
        filterable: true,
        filterType: 'date',
        render: (val) => val ? new Date(val).toLocaleDateString() : "-",
    },
    {
        header: "Uploaded By",
        accessor: "uploaded_by",
        sortable: true,
        filterable: true,
    },
    {
        header: "Status",
        accessor: "status",
        sortable: true,
        filterable: true,
        filterRender: (val) => getStatusLabel(val),
        render: (val, row) => <StatusBadge value={val} level={row?.current_approver_level} label={row?.status_label} />,
    },
    {
        header: "Next Action By",
        accessor: "next_approver",
        filterable: true,
        getFilterValue: (row) => getNextApprover(row),
        render: (_, row) => getNextApprover(row),
    },
    {
        header: "Last Modified By",
        accessor: "last_modified_by",
        filterable: true,
        render: (val) => val || "-",
    },
    {
        header: "Action Time",
        accessor: "action_time",
        filterable: true,
        getFilterValue: (row) => formatIST(row?.updated_at),
        render: (_, row) => formatIST(row?.updated_at),
    },
    {
        header: "Workflow Users",
        accessor: "workflow_users",
        filterable: true,
        getFilterValue: (row) => getWorkflowUsers(row),
        render: (_, row) => getWorkflowUsers(row),
    },
    {
        header: "Entity",
        accessor: "entity",
        filterable: true,
    },
    actionsCol(onView, onDelete, onArchive, userRole, openingInvoiceId, hideDelete),
];

// ─── Full columns ─────────────────────────────────────────────────────────────
export const getFullColumns = (onView, onDelete, onArchive, userRole, openingInvoiceId = null, hideDelete = false) => [
    {
        header: "Vendor Name",
        accessor: "vendor_name",
        sortable: true,
        filterable: true,
        getFilterValue: (row) => row?.extracted_data?.vendor_info?.name?.value ?? "",
        render: (_, row) => row?.extracted_data?.vendor_info?.name?.value ?? "-",
    },
    {
        header: "Vendor Address",
        accessor: "vendor_address",
        filterable: true,
        getFilterValue: (row) => row?.extracted_data?.vendor_info?.address?.value ?? "",
        render: (_, row) => row?.extracted_data?.vendor_info?.address?.value ?? "-",
    },
    {
        header: "Vendor Country",
        accessor: "vendor_country",
        filterable: true,
        getFilterValue: (row) => row?.extracted_data?.vendor_info?.country?.value ?? "",
        render: (_, row) => row?.extracted_data?.vendor_info?.country?.value ?? "-",
    },
    {
        header: "Vendor Tax ID",
        accessor: "vendor_tax_id",
        filterable: true,
        getFilterValue: (row) => row?.extracted_data?.vendor_info?.tax_id?.value ?? "",
        render: (_, row) => row?.extracted_data?.vendor_info?.tax_id?.value ?? "-",
    },
    {
        header: "Vendor Email",
        accessor: "vendor_email",
        filterable: true,
        getFilterValue: (row) => row?.extracted_data?.vendor_info?.contact_email?.value ?? "",
        render: (_, row) => row?.extracted_data?.vendor_info?.contact_email?.value ?? "-",
    },
    {
        header: "Vendor Phone",
        accessor: "vendor_phone",
        filterable: true,
        getFilterValue: (row) => row?.extracted_data?.vendor_info?.phone?.value ?? "",
        render: (_, row) => row?.extracted_data?.vendor_info?.phone?.value ?? "-",
    },
    {
        header: "Client Name",
        accessor: "client_name",
        filterable: true,
        getFilterValue: (row) => row?.extracted_data?.client_info?.name?.value ?? "",
        render: (_, row) => row?.extracted_data?.client_info?.name?.value ?? "-",
    },
    {
        header: "Billing Address",
        accessor: "billing_address",
        filterable: true,
        getFilterValue: (row) => row?.extracted_data?.client_info?.billing_address?.value ?? "",
        render: (_, row) => row?.extracted_data?.client_info?.billing_address?.value ?? "-",
    },
    {
        header: "Shipping Address",
        accessor: "shipping_address",
        filterable: true,
        getFilterValue: (row) => row?.extracted_data?.client_info?.shipping_address?.value ?? "",
        render: (_, row) => row?.extracted_data?.client_info?.shipping_address?.value ?? "-",
    },
    {
        header: "Uploaded At",
        accessor: "uploaded_at",
        sortable: true,
        filterable: true,
        filterType: 'date',
        render: (val) => val ? new Date(val).toLocaleDateString() : "-",
    },
    {
        header: "Invoice Number",
        accessor: "invoice_number",
        sortable: true,
        filterable: true,
    },
    {
        header: "Invoice Date",
        accessor: "invoice_date",
        filterable: true,
        filterType: 'date',
        render: (val) => val ? new Date(val).toLocaleDateString() : "-",
    },
    {
        header: "Due Date",
        accessor: "due_date",
        filterable: true,
        filterType: 'date',
        render: (val) => val ? new Date(val).toLocaleDateString() : "-",
    },
    {
        header: "Currency",
        accessor: "currency",
        filterable: true,
        getFilterValue: (row) => row?.extracted_data?.invoice_details?.currency?.value ?? "",
        render: (_, row) => row?.extracted_data?.invoice_details?.currency?.value ?? "-",
    },
    {
        header: "Description",
        accessor: "description",
        filterable: true,
        getFilterValue: (row) => row?.extracted_data?.Items?.value?.[0]?.description?.value ?? "",
        render: (_, row) => {
            const val = row?.extracted_data?.Items?.value?.[0]?.description?.value ?? "-";
            return <span title={val}>{val}</span>;
        },
    },
    {
        header: "Item Code",
        accessor: "item_code",
        filterable: true,
        getFilterValue: (row) => row?.extracted_data?.Items?.value?.[0]?.item_number?.value ?? "",
        render: (_, row) => row?.extracted_data?.Items?.value?.[0]?.item_number?.value ?? "-",
    },
    {
        header: "Quantity",
        accessor: "quantity",
        filterable: true,
        filterType: 'number',
        getFilterValue: (row) => row?.extracted_data?.Items?.value?.[0]?.quantity?.value ?? "",
        render: (_, row) => row?.extracted_data?.Items?.value?.[0]?.quantity?.value ?? "-",
    },
    {
        header: "Net Amount",
        accessor: "net_amount",
        filterable: true,
        filterType: 'number',
        getFilterValue: (row) => row?.extracted_data?.Items?.value?.[0]?.amount?.value ?? "",
        filterRender: (val) => formatCurrency(val),
        render: (_, row) => formatCurrency(row?.extracted_data?.Items?.value?.[0]?.amount?.value),
    },
    {
        header: "Tax Amount",
        accessor: "tax_amount",
        filterable: true,
        filterType: 'number',
        getFilterValue: (row) => row?.extracted_data?.amounts?.total_tax_amount?.value ?? "",
        filterRender: (val) => formatCurrency(val),
        render: (_, row) => formatCurrency(row?.extracted_data?.amounts?.total_tax_amount?.value),
    },
    {
        header: "Subtotal",
        accessor: "subtotal",
        filterable: true,
        filterType: 'number',
        getFilterValue: (row) => row?.extracted_data?.amounts?.subtotal?.value ?? "",
        filterRender: (val) => formatCurrency(val),
        render: (_, row) => formatCurrency(row?.extracted_data?.amounts?.subtotal?.value),
    },
    {
        header: "Total Amount",
        accessor: "total_amount",
        filterable: true,
        filterType: 'number',
        getFilterValue: (row) => row?.extracted_data?.amounts?.total_invoice_amount?.value ?? "",
        filterRender: (val) => formatCurrency(val),
        render: (_, row) => formatCurrency(row?.extracted_data?.amounts?.total_invoice_amount?.value),
    },
    {
        header: "Amount Due",
        accessor: "amount_due",
        filterable: true,
        filterType: 'number',
        getFilterValue: (row) => row?.extracted_data?.amounts?.amount_due?.value ?? "",
        filterRender: (val) => formatCurrency(val),
        render: (_, row) => formatCurrency(row?.extracted_data?.amounts?.amount_due?.value),
    },
    {
        header: "Approval Status",
        accessor: "status",
        sortable: true,
        filterable: true,
        filterRender: (val) => getStatusLabel(val),
        render: (val, row) => <StatusBadge value={val} level={row?.current_approver_level} label={row?.status_label} />,
    },
    {
        header: "Next Action By",
        accessor: "next_approver",
        filterable: true,
        getFilterValue: (row) => getNextApprover(row),
        render: (_, row) => getNextApprover(row),
    },
    {
        header: "Last Modified By",
        accessor: "last_modified_by",
        filterable: true,
        render: (val) => val || "-",
    },
    {
        header: "Approval Time",
        accessor: "approval_time",
        filterable: true,
        getFilterValue: (row) => formatIST(row?.updated_at),
        render: (_, row) => formatIST(row?.updated_at),
    },
    {
        header: "Workflow Users",
        accessor: "workflow_users",
        filterable: true,
        getFilterValue: (row) => getWorkflowUsers(row),
        render: (_, row) => getWorkflowUsers(row),
    },
    {
        header: "Entity",
        accessor: "entity",
        filterable: true,
    },
    {
        header: "Sage Bill Number",
        accessor: "sage_bill_number",
        filterable: true,
        render: (val) => val || "-",
    },
    {
        header: "Confidence Score",
        accessor: "confidence_score",
        render: (val) => val ? `${(parseFloat(val) * 100).toFixed(1)}%` : "-",
    },
    actionsCol(onView, onDelete, onArchive, userRole, openingInvoiceId, hideDelete),
];
