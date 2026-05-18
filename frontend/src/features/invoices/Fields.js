export const QUICK_VIEW_CONFIG = [
    {
        section: "Header",
        type: "form",
        fields: [
            { key: "vendorId", label: "Vendor ID", type: "input", editable: true, required: true },
            { key: "vendorName", label: "Vendor Name", type: "input", editable: true, required: true },
            { key: "invoiceNumber", label: "Invoice Number", type: "input", editable: true, required: true },
            { key: "referenceNumber", label: "Reference Number", type: "input", editable: true, required: true },
            { key: "invoiceDate", label: "Invoice Date", type: "date", editable: true, required: true },
            { key: "dueDate", label: "Due Date", type: "date", editable: true, required: true },
            { key: "postingDate", label: "Posting Date", type: "date", editable: true, required: true },
            { key: "paymentTerms", label: "Payment Terms", type: "input", editable: true },
            {
                key: "invoiceCurrency", label: "Invoice Currency", type: "dropdown", editable: true
                // options will be injected dynamically
            },
            {
                key: "exchangeRate", label: "Exchange Rate", type: "input", editable: true,
                visible: (f) => f.invoiceCurrency !== "USD"
            },
            { key: "totalAmount", label: "Total Amount", type: "input", editable: true, required: true },
            { key: "totalPayable", label: "Total Payable", type: "input", editable: true, required: true },
            { key: "memo", label: "Memo", type: "input", editable: true },
            {
                key: "gstEligibility", label: "GST Eligibility", type: "dropdown", editable: true,
                options: [
                    { label: "Eligible", value: "Eligible" },
                    { label: "Ineligible", value: "Ineligible" }
                ],
                visible: (f, ent) => ent?.gst_applicable === true
            },
            {
                key: "tdsApplicability", label: "TDS Applicability", type: "dropdown", editable: true,
                options: [
                    { label: "Yes", value: "Yes" },
                    { label: "No", value: "No" }
                ],
                visible: (f, ent) => ent?.gst_applicable === true
            },
            { key: "tdsRate", label: "TDS Rate", type: "input", editable: true, visible: (f, ent) => ent?.gst_applicable === true && f.tdsApplicability === "Yes" },
            {
                key: "tdsSection", label: "TDS Section", type: "dropdown", editable: true,
                visible: (f, ent) => ent?.gst_applicable === true && f.tdsApplicability === "Yes"
                // options will be injected dynamically
            },
            {
                key: "lineGrouping", label: "Line Grouping", type: "dropdown", editable: true,
                options: [
                    { label: "Yes", value: "Yes" },
                    { label: "No", value: "No" }
                ]
            },
            // AllFields only ↓
            { key: "amountPaid", label: "Amount Paid", type: "input", editable: true, showInAllFields: true },
            { key: "invoiceType", label: "Invoice Type", type: "input", editable: true, showInAllFields: true },
            { key: "poNumber", label: "PO Number", type: "input", editable: true, showInAllFields: true },
            { key: "paymentMethod", label: "Payment Method", type: "input", editable: true, showInAllFields: true },
            { key: "costCenter", label: "Cost Center", type: "input", editable: true, showInAllFields: true },
            { key: "serviceStartDate", label: "Service Period Start", type: "date", editable: true, showInAllFields: true },
            { key: "serviceEndDate", label: "Service Period End", type: "date", editable: true, showInAllFields: true },
        ],
    },
    // AllFields only sections ↓
    {
        section: "Vendor Level",
        type: "form",
        showInAllFields: true,   // entire section hidden in QuickView
        fields: [
            { key: "vendorAddress", label: "Vendor Address", type: "input", editable: true },
            { key: "vendorCountry", label: "Vendor Country", type: "input", editable: true },
            { key: "vendorTaxId", label: "Vendor Tax ID", type: "input", editable: true },
            { key: "vendorEmail", label: "Vendor Email", type: "input", editable: true },
            { key: "vendorPhone", label: "Vendor Phone", type: "input", editable: true },
            { key: "vendorBankName", label: "Vendor Bank Name", type: "input", editable: true },
            { key: "vendorBankAccount", label: "Vendor Bank Account", type: "input", editable: true },
            { key: "vendorContactPerson", label: "Vendor Contact Person", type: "input", editable: true },
        ],
    },
    {
        section: "Buyer Information",
        type: "form",
        showInAllFields: true,
        fields: [
            { key: "clientName", label: "Client Name", type: "input", editable: true },
            { key: "billingAddress", label: "Billing Address", type: "input", editable: true },
            { key: "shippingAddress", label: "Shipping Address", type: "input", editable: true },
            { key: "phoneNumber", label: "Phone Number", type: "input", editable: true },
            { key: "email", label: "Email", type: "input", editable: true },
            { key: "clientTaxId", label: "Client Tax ID", type: "input", editable: true },
            { key: "contactPerson", label: "Contact Person", type: "input", editable: true },
        ],
    },
    {
        section: "Taxes",
        type: "form",
        showInAllFields: true,
        visible: (f, ent) => ent?.gst_applicable === true,
        fields: [
            { key: "totalTaxAmount", label: "Total Tax Amount", type: "input", editable: true },
            { key: "cgst", label: "CGST", type: "input", editable: true },
            { key: "sgst", label: "SGST", type: "input", editable: true },
            { key: "igst", label: "IGST", type: "input", editable: true },
            { key: "withholdingTax", label: "Withholding Tax", type: "input", editable: true },
        ],
    },
    {
        section: "Totals",
        type: "form",
        showInAllFields: true,
        fields: [
            { key: "subtotal", label: "Subtotal", type: "input", editable: true },
            { key: "shippingFees", label: "Shipping / Fees", type: "input", editable: true },
            { key: "surcharges", label: "Surcharges", type: "input", editable: true },
            { key: "totalInvoiceAmount", label: "Total Invoice Amount", type: "input", editable: true },
            { key: "amountDue", label: "Amount Due", type: "input", editable: true },
        ],
    },
    {
        section: "Compliance",
        type: "form",
        showInAllFields: true,
        fields: [
            { key: "notes", label: "Notes / Terms", type: "input", editable: true },
            { key: "qrOrIrn", label: "QR Code / IRN", type: "input", editable: true },
            { key: "companyRegistrationNumber", label: "Company Registration No.", type: "input", editable: true },
        ],
    },
    // Line Items — always shown in both
    {
        section: "Line Items",
        type: "table",
        columns: [
            { key: "description", label: "Description", editable: true },
            { key: "qty", label: "Qty", editable: true },
            { key: "unitPrice", label: "Unit Price", editable: true },
            { key: "discount", label: "Discount", editable: true },
            { key: "netAmount", label: "Net Amount", editable: true },
            { key: "taxAmt", label: "Tax Amt", editable: true },
        ],
    },
];