import { create } from "zustand";

export const useInvoiceStore = create((set, get) => ({

    invoiceSection: 1,
    setInvoiceSection: (section) => set({ invoiceSection: section }),

    entityList: [],
    setEntityList: (entities) => set({ entityList: entities }),

    selectedEntity: null,
    setSelectedEntity: (entity) => set({ selectedEntity: entity }),

    view: "condensed",
    setView: (view) => set({ view }),

    searchQuery: "",
    setSearchQuery: (query) => set({ searchQuery: query, skip: 0 }),

    sortColumn: "uploaded_at",
    sortDirection: "desc",
    setSort: (column, direction) => set({ sortColumn: column, sortDirection: direction }),

    skip: 0,
    setSkip: (skip) => set({ skip }),

    limit: 10,
    setLimit: (limit) => set({ limit }),

    viewInvoiceId: null,
    setViewInvoiceId: (id) => set({ viewInvoiceId: id }),

    fileName: "",
    setFileName: (name) => set({ fileName: name }),

    isModalOpen: false,
    setIsModalOpen: (open) => set({ isModalOpen: open }),

    // Invoice View Screen State
    tabList: ["Quick View", "All Fields", "GL Summary", "Workflow", "Audit Trail", "Coding"],

    invoiceActiveTab: "Quick View",
    setInvoiceActiveTab: (tab) => set({ invoiceActiveTab: tab }),

    selectedVendorId: null,
    setSelectedVendorId: (vendorId) => set({ selectedVendorId: vendorId }),

    // =============================
    //  QUICK VIEW - FORM DATA
    // =============================
    quickViewFormData: {
        vendorId: "",
        vendorName: "",
        invoiceNumber: "",
        invoiceDate: "",
        dueDate: "",
        paymentTerms: "",
        invoiceCurrency: "",
        exchangeRate: "",
        totalAmount: "",
        totalPayable: "",
        amountPaid: "",
        memo: "",
        invoiceType: "",
        poNumber: "",
        paymentMethod: "",
        costCenter: "",
        serviceStartDate: "",
        serviceEndDate: "",
        vendorAddress: "",
        vendorCountry: "",
        vendorTaxId: "",
        vendorEmail: "",
        vendorPhone: "",
        vendorBankName: "",
        vendorBankAccount: "",
        vendorContactPerson: "",
        clientName: "",
        billingAddress: "",
        shippingAddress: "",
        phoneNumber: "",
        email: "",
        clientTaxId: "",
        contactPerson: "",
        totalTaxAmount: "",
        cgst: "",
        sgst: "",
        igst: "",
        withholdingTax: "",
        subtotal: "",
        shippingFees: "",
        surcharges: "",
        totalInvoiceAmount: "",
        amountDue: "",
        notes: "",
        qrOrIrn: "",
        companyRegistrationNumber: "",
        gstEligibility: "",
        tdsApplicability: "",
        tdsRate: "",
        tdsSection: "",
        lineGrouping: "",
    },

    isDuplicate: false,
    setIsDuplicate: (isDuplicate) => set({ isDuplicate }),

    duplicateMessage: "",
    setDuplicateMessage: (msg) => set({ duplicateMessage: msg }),

    // ─────────────────────────────────────────────────────────────────────────
    // _syncSystemRows
    //
    // Rebuilds the GST and (conditionally) TDS system rows at the END of
    // the line-items list.
    //
    // GUARD: if isModified === true the invoice was already saved with
    // calculated values, so we preserve whatever is in the system rows
    // and do NOT recalculate.
    //
    // NOTE: This function never touches regular rows or applies line grouping.
    // Line grouping is handled exclusively in setQuickViewLineItems (load time).
    // ─────────────────────────────────────────────────────────────────────────
    _syncSystemRows: (formData, lineItems, isModified = false) => {
        if (!formData || !lineItems?.length) return lineItems ?? [];

        const regularItems = lineItems.filter(i => !i.isSystemRow);
        const existingGstRow = lineItems.find(i => i.type === "GST");
        const existingTdsRow = lineItems.find(i => i.type === "TDS");

        if (isModified) {
            // Preserve saved system rows exactly as-is
            const gstRow = existingGstRow ?? {
                id: "gst-row",
                type: "GST",
                description: "Total GST",
                qty: 1,
                unitPrice: 0,
                discount: 0,
                netAmount: 0,
                taxAmt: 0,
                isSystemRow: true,
                isNetAmountOverridden: false,
            };
            const systemRows = [gstRow, ...(existingTdsRow ? [existingTdsRow] : [])];
            return [...regularItems, ...systemRows];
        }

        // Recalculate from form fields
        const gstValue = parseFloat(formData?.totalTaxAmount || 0);
        const tdsRate = parseFloat(formData?.tdsRate || 0);
        const totalInvoiceAmount = parseFloat(
            formData?.totalInvoiceAmount || formData?.total_invoice_amount || 0
        );
        const tdsValue = -Math.abs(tdsRate * totalInvoiceAmount);
        const isTdsApplicable = formData?.tdsApplicability === "Yes";

        const gstRow = {
            id: "gst-row",
            type: "GST",
            description: "Total GST",
            qty: 1,
            unitPrice: gstValue,
            discount: 0,
            netAmount: gstValue,
            taxAmt: 0,
            isSystemRow: true,
            isNetAmountOverridden: false,
        };

        const tdsRow = {
            id: "tds-row",
            type: "TDS",
            description: "TDS Deduction",
            qty: 1,
            unitPrice: tdsValue,
            discount: 0,
            netAmount: tdsValue,
            taxAmt: 0,
            isSystemRow: true,
            isNetAmountOverridden: false,
        };

        const systemRows = [gstRow, ...(isTdsApplicable ? [tdsRow] : [])];
        return [...regularItems, ...systemRows];
    },

    originalLineItems: [],

    // ─────────────────────────────────────────────────────────────────────────
    // _applyLineGrouping
    //
    // Merges all regular rows into a single grouped row (first row's
    // description, summed numeric fields). Only called at initial load
    // when isModified === false and lineGrouping === "Yes".
    //
    // System rows are always passed through untouched.
    // ─────────────────────────────────────────────────────────────────────────
    _applyLineGrouping: (items, formData) => {
        const isLineGrouped = formData?.lineGrouping === "Yes";
        const isModified = formData?.isModified;

        // DO NOT group if already saved
        if (!isLineGrouped) return items;

        const regularItems = items.filter(i => !i.isSystemRow);
        const systemRows = items.filter(i => i.isSystemRow);

        if (regularItems.length === 0) return items;

        const firstRow = regularItems[0];

        const groupedRow = {
            ...firstRow,
            id: "grouped-1",
            description: firstRow.description, //  keep first row desc
            qty: regularItems.reduce((s, r) => s + (Number(r.qty) || 0), 0),
            unitPrice: regularItems.reduce((s, r) => s + (Number(r.unitPrice) || 0), 0),
            discount: regularItems.reduce((s, r) => s + (Number(r.discount) || 0), 0),
            netAmount: regularItems.reduce((s, r) => s + (Number(r.netAmount) || 0), 0),
            taxAmt: regularItems.reduce((s, r) => s + (Number(r.taxAmt) || 0), 0),
            isNetAmountOverridden: false,
        };

        return [groupedRow, ...systemRows];
    },

    // ── Update single field ──────────────────────────────────────────────────
    setQuickViewField: (key, value) =>
        set((state) => {
            const updatedFormData = {
                ...state.quickViewFormData,
                [key]: value,
            };

            const triggerKeys = [
                "totalTaxAmount",
                "tdsRate",
                "tdsApplicability",
                "totalInvoiceAmount",
                "total_invoice_amount",
            ];

            return { quickViewFormData: updatedFormData, };
        }),


    // ── Replace full form (used on initial load & vendor sync) ───────────────
    setQuickViewFormData: (dataOrUpdater) =>
        set((state) => {
            const updatedFormData =
                typeof dataOrUpdater === "function"
                    ? dataOrUpdater(state.quickViewFormData)
                    : dataOrUpdater;

            return { quickViewFormData: updatedFormData };
        }),


    setInvoiceData: (data) => {
        if (!data) return;

        const state = get();
        const currentFormData = state.quickViewFormData;
        const currentVendorId = state.selectedVendorId;

        const removeCurrencyFormat = (value) => {
            if (!value) return 0;
            return Number(value.toString().replace(/[^0-9.]/g, ""));
        };

        const isModified = !!data?.extracted_data?.isModified;

        const formData = {
            isModified,
            vendorId: data.extracted_data?.vendor_info?.vendor_id?.value ?? "",
            vendorName: data.extracted_data?.vendor_info?.name?.value ?? "",
            invoiceNumber: data.invoice_number ?? "",
            invoiceDate: data.extracted_data?.invoice_details?.invoice_date?.value ?? "",
            dueDate: data.extracted_data?.invoice_details?.due_date?.value ?? "",
            paymentTerms: data.extracted_data?.invoice_details?.payment_terms?.value ?? "",
            invoiceCurrency: data.extracted_data?.invoice_details?.currency?.value ?? "",
            exchangeRate: data.exchange_rate ?? "",

            totalAmount: data.extracted_data?.amounts?.total_invoice_amount?.value ?? "",
            totalPayable: data.extracted_data?.amounts?.amount_due?.value ?? "",
            amountPaid: data.extracted_data?.amounts?.amount_paid?.value ?? "",
            memo: data.extracted_data?.additional_info?.notes_terms?.value ?? "",

            invoiceType: data.extracted_data?.invoice_details?.type?.value ?? "",
            poNumber: data.extracted_data?.invoice_details?.po_number?.value ?? "",
            paymentMethod: data.extracted_data?.invoice_details?.payment_method?.value ?? "",
            costCenter: data.extracted_data?.invoice_details?.cost_center?.value ?? "",

            serviceStartDate: data.extracted_data?.service_period?.start_date?.value ?? "",
            serviceEndDate: data.extracted_data?.service_period?.end_date?.value ?? "",

            vendorAddress: data.extracted_data?.vendor_info?.address?.value ?? "",
            vendorCountry: data.extracted_data?.vendor_info?.country?.value ?? "",
            vendorTaxId: data.extracted_data?.vendor_info?.tax_id?.value ?? "",
            vendorEmail: data.extracted_data?.vendor_info?.contact_email?.value ?? "",
            vendorPhone: data.extracted_data?.vendor_info?.phone?.value ?? "",
            vendorBankName: data.extracted_data?.vendor_info?.bank_name?.value ?? "",
            vendorBankAccount: data.extracted_data?.vendor_info?.bank_account_number?.value ?? "",
            vendorContactPerson: data.extracted_data?.vendor_info?.contact_person?.value ?? "",

            clientName: data.extracted_data?.client_info?.name?.value ?? "",
            billingAddress: data.extracted_data?.client_info?.billing_address?.value ?? "",
            shippingAddress: data.extracted_data?.client_info?.shipping_address?.value ?? "",
            phoneNumber: data.extracted_data?.client_info?.phone?.value ?? "",
            email: data.extracted_data?.client_info?.email?.value ?? "",
            clientTaxId: data.extracted_data?.client_info?.tax_id?.value ?? "",
            contactPerson: data.extracted_data?.client_info?.contact_person?.value ?? "",

            totalTaxAmount: removeCurrencyFormat(data.extracted_data?.amounts?.total_tax_amount?.value),
            cgst: data.extracted_data?.amounts?.CGST?.value ?? "",
            sgst: data.extracted_data?.amounts?.SGST?.value ?? "",
            igst: data.extracted_data?.amounts?.IGST?.value ?? "",
            withholdingTax: data.extracted_data?.amounts?.withholding_tax?.value ?? "",

            subtotal: removeCurrencyFormat(data.extracted_data?.amounts?.subtotal?.value),
            shippingFees: data.extracted_data?.amounts?.shipping_handling_fees?.value ?? "",
            surcharges: data.extracted_data?.amounts?.surcharges?.value ?? "",
            totalInvoiceAmount: removeCurrencyFormat(data.extracted_data?.amounts?.total_invoice_amount?.value),
            amountDue: removeCurrencyFormat(data.extracted_data?.amounts?.amount_due?.value),

            notes: data.extracted_data?.additional_info?.notes_terms?.value ?? "",
            qrOrIrn: data.extracted_data?.additional_info?.qr_code_irn?.value ?? "",
            companyRegistrationNumber: data.extracted_data?.additional_info?.company_registration_number?.value ?? "",

            // Preserve derived fields if vendor is the same
            gstEligibility: (currentVendorId === data.vendor_id) ? (currentFormData.gstEligibility || "") : "",
            tdsApplicability: data.extracted_data?.amounts?.tds_applicability?.value ?? "",
            tdsRate: data.extracted_data?.amounts?.tds_rate?.value ?? "",
            tdsSection: data.extracted_data?.amounts?.tds_section?.value ?? "",
            lineGrouping: (currentVendorId === data.vendor_id) ? (currentFormData.lineGrouping || "") : "",
        };

        const items = data?.extracted_data?.Items?.value || [];
        const mappedItems = items.map((item, index) => {
            const desc = item.description?.value || "";
            const netAmount = Number(item.amount?.value) || 0;
            const qty = Number(item.qty?.value) || 1;
            const unitPrice = Number(item.unit_price?.value) || 0;
            const discount = Number(item.discount?.value) || 0;
            const taxAmt = Number(item.tax_amount?.value) || 0;

            const isGst = desc === "Total GST" || desc === "Total Tax";
            const isTds = desc === "TDS Deduction";

            return {
                id: isGst ? "gst-row" : isTds ? "tds-row" : index + 1,
                type: isGst ? "GST" : isTds ? "TDS" : undefined,
                description: desc,
                qty,
                unitPrice: isGst || isTds ? netAmount : unitPrice,
                discount,
                netAmount,
                taxAmt,
                isSystemRow: isGst || isTds,
                isNetAmountOverridden: false,
                glCode: item.gl_code?.value || "",
                lob: item.lob?.value || "",
                department: item.department?.value || "",
                customer: item.customer?.value || "",
                item: item.item?.value || "",
            };
        });

        const originalItems = data?.extracted_data?.OriginalItems?.value || [];
        const mappedOriginalItems = originalItems.length
            ? originalItems.map((item, index) => ({
                id: index + 1,
                description: item.description?.value || "",
                qty: Number(item.qty?.value) || 1,
                unitPrice: Number(item.unit_price?.value) || 0,
                discount: Number(item.discount?.value) || 0,
                netAmount: Number(item.amount?.value) || 0,
                taxAmt: Number(item.tax_amount?.value) || 0,
                isNetAmountOverridden: false,
            }))
            : mappedItems.filter(i => !i.isSystemRow);

        set({
            activeInvoiceData: data,
            selectedVendorId: data.vendor_id,
            quickViewFormData: formData,
            lineItems: mappedItems,
            originalLineItems: mappedOriginalItems,
        });
    },


    resetQuickView: () => set({
        quickViewFormData: {},
        originalLineItems: [],
        selectedVendorId: null,
        activeInvoiceData: null,
    }),



    // =============================
    // PDF HIGHLIGHT
    // =============================
    highlightedField: null,
    setHighlightedField: (field) => set({ highlightedField: field }),

    activeInvoiceData: null,
    setActiveInvoiceData: (data) => set({ activeInvoiceData: data }),

    entityMaster: {},
    setEntityMaster: (data) => set({ entityMaster: data }),

    lineItems: [],
    setLineItems: (itemsOrUpdater) =>
        set((state) => ({
            lineItems: typeof itemsOrUpdater === "function"
                ? itemsOrUpdater(state.lineItems)
                : itemsOrUpdater,
        })),
}));