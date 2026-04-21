import { EyeOutlined, DeleteOutlined } from "@ant-design/icons";

// ─── Status badge helper ──────────────────────────────────────────────────────
const StatusBadge = ({ value }) => {
    const colorMap = {
        approved:        "bg-green-100 text-green-700",
        pending:         "bg-yellow-100 text-yellow-700",
        rejected:        "bg-red-100 text-red-700",
        processed:       "bg-blue-100 text-blue-700",
        waiting_approval:"bg-orange-100 text-orange-700",
        waiting_coding:  "bg-purple-100 text-purple-700",
    };
    const cls = colorMap[value] ?? "bg-gray-100 text-gray-600";
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls}`}>
            {value ?? "-"}
        </span>
    );
};

// ─── Actions cell helper ──────────────────────────────────────────────────────
const actionsCol = (onView, onDelete) => ({
    header: "Actions",
    accessor: "actions",
    sortable: false,
    render: (_, row) => (
        <div className="flex items-center justify-center gap-3">
            <button
                onClick={() => onView(row)}
                className="text-blue-500 hover:text-blue-700 transition-colors cursor-pointer"
                title="View"
            >
                <EyeOutlined style={{ fontSize: 16 }} />
            </button>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    console.log("Delete button clicked for row:", row);
                    onDelete(row);
                }}
                className="text-red-400 hover:text-red-600 transition-colors cursor-pointer"
                title="Delete"
            >
                <DeleteOutlined style={{ fontSize: 16 }} />
            </button>
        </div>
    ),
});

export const VIEW_OPTIONS = [
    { label: "Condensed View", value: "condensed" },
    { label: "Full View",      value: "full"      },
];

// ─── Condensed columns ────────────────────────────────────────────────────────
export const getCondensedColumns = (onView, onDelete) => [
    {
        header:         "Vendor Name",
        accessor:       "vendor_name",
        sortable:       true,
        filterable:     true,
        getFilterValue: (row) => row?.extracted_data?.vendor_info?.name?.value ?? "",
        render:         (_, row) => row?.extracted_data?.vendor_info?.name?.value ?? "-",
    },
    {
        header:         "Vendor ID",
        accessor:       "vendor_id",
        sortable:       true,
        filterable:     true,
        // vendor_id is a direct field on row — no getFilterValue needed
    },
    {
        header:         "Invoice ID",
        accessor:       "invoice_number",
        sortable:       true,
        filterable:     true,
        // invoice_number is a direct field on row — no getFilterValue needed
    },
    {
        header:     "Total Amount",
        accessor:   "total_amount",
        filterable: true,
        filterType: 'number',
        getFilterValue: (row) => row?.extracted_data?.amounts?.total_invoice_amount?.value ?? "",
        render:     (_, row) => row?.extracted_data?.amounts?.total_invoice_amount?.value ?? "-",
    },
    {
        header:     "Amount Due",
        accessor:   "amount_due",
        filterable: true,
        filterType: 'number',
        getFilterValue: (row) => row?.extracted_data?.amounts?.amount_due?.value ?? "",
        render:     (_, row) => row?.extracted_data?.amounts?.amount_due?.value ?? "-",
    },
    {
        header:     "Last Updated",
        accessor:   "processed_at",
        sortable:   true,
        filterable: true,
        filterType: 'date',
        render:     (val) => val ? new Date(val).toLocaleDateString() : "-",
    },
    {
        header:     "Uploaded By",
        accessor:   "uploaded_by",
        sortable:   true,
        filterable: true,
        // uploaded_by is a direct field on row — no getFilterValue needed
    },
    {
        header:         "Status",
        accessor:       "status",
        sortable:       true,
        filterable:     true,
        // status is a direct field on row, getFilterValue falls back to row[accessor]
        render:         (val) => <StatusBadge value={val} />,
    },
    {
        header:         "Approver",
        accessor:       "approver",
        filterable:     true,
        getFilterValue: (row) => row?.assigned_approvers?.join(", ") || "",
        render:         (_, row) => row?.assigned_approvers?.join(", ") || "-",
    },
    {
        header:     "Action Time",
        accessor:   "action_time",
        filterable: true,
        getFilterValue: (row) => row?.processed_at ? new Date(row.processed_at).toLocaleString() : "",
        render:     (_, row) => row?.processed_at ? new Date(row.processed_at).toLocaleString() : "-",
    },
    actionsCol(onView, onDelete),
];

// ─── Full columns ─────────────────────────────────────────────────────────────
export const getFullColumns = (onView, onDelete) => [
    {
        header:         "Vendor Name",
        accessor:       "vendor_name",
        sortable:       true,
        filterable:     true,
        getFilterValue: (row) => row?.extracted_data?.vendor_info?.name?.value ?? "",
        render:         (_, row) => row?.extracted_data?.vendor_info?.name?.value ?? "-",
    },
    {
        header:         "Vendor Address",
        accessor:       "vendor_address",
        filterable:     true,
        getFilterValue: (row) => row?.extracted_data?.vendor_info?.address?.value ?? "",
        render:         (_, row) => row?.extracted_data?.vendor_info?.address?.value ?? "-",
    },
    {
        header:         "Vendor Country",
        accessor:       "vendor_country",
        filterable:     true,
        getFilterValue: (row) => row?.extracted_data?.vendor_info?.country?.value ?? "",
        render:         (_, row) => row?.extracted_data?.vendor_info?.country?.value ?? "-",
    },
    {
        header:         "Vendor Tax ID",
        accessor:       "vendor_tax_id",
        filterable:     true,
        getFilterValue: (row) => row?.extracted_data?.vendor_info?.tax_id?.value ?? "",
        render:         (_, row) => row?.extracted_data?.vendor_info?.tax_id?.value ?? "-",
    },
    {
        header:         "Vendor Email",
        accessor:       "vendor_email",
        filterable:     true,
        getFilterValue: (row) => row?.extracted_data?.vendor_info?.contact_email?.value ?? "",
        render:         (_, row) => row?.extracted_data?.vendor_info?.contact_email?.value ?? "-",
    },
    {
        header:         "Vendor Phone",
        accessor:       "vendor_phone",
        filterable:     true,
        getFilterValue: (row) => row?.extracted_data?.vendor_info?.phone?.value ?? "",
        render:         (_, row) => row?.extracted_data?.vendor_info?.phone?.value ?? "-",
    },
    {
        header:         "Client Name",
        accessor:       "client_name",
        filterable:     true,
        getFilterValue: (row) => row?.extracted_data?.client_info?.name?.value ?? "",
        render:         (_, row) => row?.extracted_data?.client_info?.name?.value ?? "-",
    },
    {
        header:         "Billing Address",
        accessor:       "billing_address",
        filterable:     true,
        getFilterValue: (row) => row?.extracted_data?.client_info?.billing_address?.value ?? "",
        render:         (_, row) => row?.extracted_data?.client_info?.billing_address?.value ?? "-",
    },
    {
        header:         "Shipping Address",
        accessor:       "shipping_address",
        filterable:     true,
        getFilterValue: (row) => row?.extracted_data?.client_info?.shipping_address?.value ?? "",
        render:         (_, row) => row?.extracted_data?.client_info?.shipping_address?.value ?? "-",
    },
    {
        header:     "Invoice Number",
        accessor:   "invoice_number",
        sortable:   true,
        filterable: true,
        // invoice_number is a direct field — no getFilterValue needed
    },
    {
        header:         "Invoice Date",
        accessor:       "invoice_date",
        filterable:     true,
        filterType:     'date',
        render:         (val) => val ? new Date(val).toLocaleDateString() : "-",
    },
    {
        header:         "Due Date",
        accessor:       "due_date",
        filterable:     true,
        filterType:     'date',
        render:         (val) => val ? new Date(val).toLocaleDateString() : "-",
    },
    {
        header:         "Currency",
        accessor:       "currency",
        filterable:     true,
        getFilterValue: (row) => row?.extracted_data?.invoice_details?.currency?.value ?? "",
        render:         (_, row) => row?.extracted_data?.invoice_details?.currency?.value ?? "-",
    },
    {
        header:         "Description",
        accessor:       "description",
        filterable:     true,
        getFilterValue: (row) => row?.extracted_data?.Items?.value?.[0]?.description?.value ?? "",
        render:         (_, row) => row?.extracted_data?.Items?.value?.[0]?.description?.value ?? "-",
    },
    {
        header:         "Item Code",
        accessor:       "item_code",
        filterable:     true,
        getFilterValue: (row) => row?.extracted_data?.Items?.value?.[0]?.item_number?.value ?? "",
        render:         (_, row) => row?.extracted_data?.Items?.value?.[0]?.item_number?.value ?? "-",
    },
    {
        header:         "Quantity",
        accessor:       "quantity",
        filterable:     true,
        filterType:     'number',
        getFilterValue: (row) => row?.extracted_data?.Items?.value?.[0]?.quantity?.value ?? "",
        render:         (_, row) => row?.extracted_data?.Items?.value?.[0]?.quantity?.value ?? "-",
    },
    {
        header:         "Net Amount",
        accessor:       "net_amount",
        filterable:     true,
        filterType:     'number',
        getFilterValue: (row) => row?.extracted_data?.Items?.value?.[0]?.amount?.value ?? "",
        render:         (_, row) => row?.extracted_data?.Items?.value?.[0]?.amount?.value ?? "-",
    },
    {
        header:         "Tax Amount",
        accessor:       "tax_amount",
        filterable:     true,
        filterType:     'number',
        getFilterValue: (row) => row?.extracted_data?.amounts?.total_tax_amount?.value ?? "",
        render:         (_, row) => row?.extracted_data?.amounts?.total_tax_amount?.value ?? "-",
    },
    {
        header:         "Subtotal",
        accessor:       "subtotal",
        filterable:     true,
        filterType:     'number',
        getFilterValue: (row) => row?.extracted_data?.amounts?.subtotal?.value ?? "",
        render:         (_, row) => row?.extracted_data?.amounts?.subtotal?.value ?? "-",
    },
    {
        header:         "Total Amount",
        accessor:       "total_amount",
        filterable:     true,
        filterType:     'number',
        getFilterValue: (row) => row?.extracted_data?.amounts?.total_invoice_amount?.value ?? "",
        render:         (_, row) => row?.extracted_data?.amounts?.total_invoice_amount?.value ?? "-",
    },
    {
        header:         "Amount Due",
        accessor:       "amount_due",
        filterable:     true,
        filterType:     'number',
        getFilterValue: (row) => row?.extracted_data?.amounts?.amount_due?.value ?? "",
        render:         (_, row) => row?.extracted_data?.amounts?.amount_due?.value ?? "-",
    },
    {
        header:     "Approval Status",
        accessor:   "status",
        sortable:   true,
        filterable: true,
        // status is a direct field on row
        render:     (val) => <StatusBadge value={val} />,
    },
    {
        header:         "Approver",
        accessor:       "approver",
        filterable:     true,
        getFilterValue: (row) => row?.assigned_approvers?.join(", ") || "",
        render:         (_, row) => row?.assigned_approvers?.join(", ") || "-",
    },
    {
        header:         "Approval Time",
        accessor:       "approval_time",
        filterable:     true,
        getFilterValue: (row) => row?.processed_at ? new Date(row.processed_at).toLocaleString() : "",
        render:         (_, row) => row?.processed_at ? new Date(row.processed_at).toLocaleString() : "-",
    },
    actionsCol(onView, onDelete),
];