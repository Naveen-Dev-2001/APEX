// Fields.js

export const QUICK_VIEW_CONFIG = [

    // =============================
    //  HEADER SECTION
    // =============================
    {
        section: "Header",
        type: "form",
        fields: [
            {
                key: "vendorId",
                label: "Vendor ID",
                type: "input",
                editable: true,
            },
            {
                key: "vendorName",
                label: "Vendor Name",
                type: "input",
                editable: true,
            },
            {
                key: "invoiceNumber",
                label: "Invoice Number",
                type: "input",
                editable: true,
            },
            {
                key: "invoiceDate",
                label: "Invoice Date",
                type: "date",
                editable: true,
            },
            {
                key: "dueDate",
                label: "Due Date",
                type: "date",
                editable: true,
            },
            {
                key: "paymentTerms",
                label: "Payment Terms",
                type: "input",
                editable: true,
            },
            {
                key: "invoiceCurrency",
                label: "Invoice Currency",
                type: "dropdown",
                editable: true,
                options: [
                    { label: "$ USD", value: "USD" },
                    { label: "€ EUR", value: "EUR" },
                    { label: "£ GBP", value: "GBP" },
                    { label: "₹ INR", value: "INR" },
                    { label: "C$ CAD", value: "CAD" },
                    { label: "A$ AUD", value: "AUD" },
                ],
            },
            {
                key: "exchangeRate",
                label: "Exchange Rate",
                type: "input",
                editable: true,
                visible: (formData) => formData.invoiceCurrency !== "USD",
            },
            {
                key: "totalAmount",
                label: "Total Amount",
                type: "input",
                editable: true,
            },
            {
                key: "totalPayable",
                label: "Total Amount Payable",
                type: "input",
                editable: true,
            },
            {
                key: "amountPaid",
                label: "Amount Paid",
                type: "input",
                editable: true,
            },
            {
                key: "memo",
                label: "Memo",
                type: "input",
                editable: true,
            },
        ],
    },

    // =============================
    //  VENDOR MASTER DETAILS
    // =============================
    {
        section: "Vendor Master Details",
        type: "form",
        fields: [
            {
                key: "gstEligibility",
                label: "GST Eligibility",
                type: "input",
                editable: false,
            },
            {
                key: "tdsApplicability",
                label: "TDS Applicability",
                type: "input",
                editable: false,
            },
            {
                key: "tdsRate",
                label: "TDS Rate",
                type: "input",
                editable: false,
            },
            {
                key: "tdsSection",
                label: "TDS Section",
                type: "input",
                editable: false,
            },
            {
                key: "lineGrouping",
                label: "Line Grouping",
                type: "input",
                editable: false,
            },
        ],
    },

    // =============================
    //  LINE ITEMS TABLE
    // =============================
    {
        section: "Line Items",
        type: "table",
        columns: [
            {
                key: "description",
                label: "Description",
                type: "input",
                editable: true,
            },
            {
                key: "qty",
                label: "Qty",
                type: "input",
                editable: true,
            },
            {
                key: "unitPrice",
                label: "Unit Price",
                type: "input",
                editable: true,
            },
            {
                key: "discount",
                label: "Discount",
                type: "input",
                editable: true,
            },
            {
                key: "netAmount",
                label: "Net Amount",
                type: "input",
                editable: true,
            },
            {
                key: "taxAmt",
                label: "Tax Amt",
                type: "input",
                editable: true,
            },
        ],
    },
];