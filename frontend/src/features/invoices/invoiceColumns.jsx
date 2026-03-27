import { EyeOutlined, DeleteOutlined } from "@ant-design/icons";

// Reusable column helper to keep it DRY
const col = (headerName, valueGetter, extra = {}) => ({
    headerName,
    valueGetter,
    minWidth: 150,
    tooltipValueGetter: valueGetter,   // ← shows full content on hover
    cellStyle: {
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    ...extra,
});

const fieldCol = (field, headerName, valueFormatter, extra = {}) => ({
    field,
    headerName,
    minWidth: 150,
    tooltipField: field,               // ← shows full content on hover
    valueFormatter,
    cellStyle: {
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    ...extra,
});

// ─── Actions Column ───────────────────────────────────────────────────────────
const actionsCol = (onView, onDelete) => ({
    headerName: "Actions",
    field: "actions",
    pinned: "right",        // ← always visible on right
    lockPinned: true,       // ← user cannot unpin it
    sortable: false,
    filter: false,
    minWidth: 100,
    maxWidth: 100,
    cellStyle: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
    },
    cellRenderer: (p) => (
        <div className="flex items-center justify-center gap-3">
            <button
                onClick={() => onView(p.data)}
                className="text-blue-500 hover:text-blue-700 transition-colors cursor-pointer"
                title="View"
            >
                <EyeOutlined style={{ fontSize: 16 }} />
            </button>
            <button
                onClick={() => onDelete(p.data)}
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
    { label: "Full View", value: "full" },
];

export const getCondensedColumns = (onView, onDelete) => [
    col("Vendor Name", (p) => p.data?.extracted_data?.vendor_info?.name?.value ?? "-"),
    fieldCol("vendor_id", "Vendor ID", (p) => p.value ?? "-"),
    fieldCol("invoice_number", "Invoice ID", (p) => p.value ?? "-"),
    col("Total Amount", (p) => p.data?.extracted_data?.amounts?.total_invoice_amount?.value ?? "-"),
    col("Amount Due", (p) => p.data?.extracted_data?.amounts?.amount_due?.value ?? "-"),
    fieldCol("processed_at", "Last Updated", (p) => p.value ? new Date(p.value).toLocaleDateString() : "-"),
    fieldCol("uploaded_by", "Uploaded By", (p) => p.value ?? "-"),
    {
        field: "status",
        headerName: "Status",
        minWidth: 150,
        tooltipField: "status",
        cellRenderer: (p) => {
            const colorMap = {
                approved: "bg-green-100 text-green-700",
                pending: "bg-yellow-100 text-yellow-700",
                rejected: "bg-red-100 text-red-700",
                processed: "bg-blue-100 text-blue-700",
                waiting_approval: "bg-orange-100 text-orange-700",
            };
            const cls = colorMap[p.value] ?? "bg-gray-100 text-gray-600";
            return (
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls}`}>
                    {p.value ?? "-"}
                </span>
            );
        },
    },
    col("Approver", (p) => p.data?.assigned_approvers?.join(", ") || "-"),
    fieldCol("processed_at", "Action Time", (p) => p.value ? new Date(p.value).toLocaleString() : "-"),
    actionsCol(onView, onDelete),   // ← pinned last column
];

export const getFullColumns = (onView, onDelete) => [
    col("Vendor Name", (p) => p.data?.extracted_data?.vendor_info?.name?.value ?? "-"),
    col("Vendor Address", (p) => p.data?.extracted_data?.vendor_info?.address?.value ?? "-", { minWidth: 200 }),
    col("Vendor Country", (p) => p.data?.extracted_data?.vendor_info?.country?.value ?? "-"),
    col("Vendor Tax ID", (p) => p.data?.extracted_data?.vendor_info?.tax_id?.value ?? "-"),
    col("Vendor Email", (p) => p.data?.extracted_data?.vendor_info?.contact_email?.value ?? "-", { minWidth: 180 }),
    col("Vendor Phone", (p) => p.data?.extracted_data?.vendor_info?.phone?.value ?? "-"),
    col("Client Name", (p) => p.data?.extracted_data?.client_info?.name?.value ?? "-"),
    col("Billing Address", (p) => p.data?.extracted_data?.client_info?.billing_address?.value ?? "-", { minWidth: 200 }),
    col("Shipping Address", (p) => p.data?.extracted_data?.client_info?.shipping_address?.value ?? "-", { minWidth: 200 }),
    fieldCol("invoice_number", "Invoice Number", (p) => p.value ?? "-"),
    col("Invoice Date", (p) => p.data?.extracted_data?.invoice_details?.invoice_date?.value ?? "-"),
    col("Due Date", (p) => p.data?.extracted_data?.invoice_details?.due_date?.value ?? "-"),
    col("Currency", (p) => p.data?.extracted_data?.invoice_details?.currency?.value ?? "-"),
    col("Description", (p) => p.data?.extracted_data?.Items?.value?.[0]?.description?.value ?? "-", { minWidth: 220 }),
    col("Item Code", (p) => p.data?.extracted_data?.Items?.value?.[0]?.item_number?.value ?? "-"),
    col("Quantity", (p) => p.data?.extracted_data?.Items?.value?.[0]?.quantity?.value ?? "-"),
    col("Net Amount", (p) => p.data?.extracted_data?.Items?.value?.[0]?.amount?.value ?? "-"),
    col("Tax Amount", (p) => p.data?.extracted_data?.amounts?.total_tax_amount?.value ?? "-"),
    col("Subtotal", (p) => p.data?.extracted_data?.amounts?.subtotal?.value ?? "-"),
    col("Total Amount", (p) => p.data?.extracted_data?.amounts?.total_invoice_amount?.value ?? "-"),
    col("Amount Due", (p) => p.data?.extracted_data?.amounts?.amount_due?.value ?? "-"),
    fieldCol("status", "Approval Status", (p) => p.value ?? "-"),
    col("Approver", (p) => p.data?.assigned_approvers?.join(", ") || "-"),
    fieldCol("processed_at", "Approval Time", (p) => p.value ? new Date(p.value).toLocaleString() : "-"),
    actionsCol(onView, onDelete),   // ← pinned last column
];