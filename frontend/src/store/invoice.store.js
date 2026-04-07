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
    // Rebuilds the GST and (conditionally) TDS system rows at the bottom of
    // the line-items list.
    //
    // GUARD: if isModified === true the invoice was already saved with
    // calculated values, so we preserve whatever is already in the system
    // rows and do NOT recalculate. Recalculation only happens when the user
    // explicitly edits a relevant field (isModified will be false/undefined
    // in that path because we strip the flag on first user edit — see
    // setQuickViewField / batchUpdateQuickViewFields).
    // ─────────────────────────────────────────────────────────────────────────
    _syncSystemRows: (formData, lineItems, isModified = false) => {
        if (isModified) return lineItems;
        if (!formData || !lineItems?.length) return lineItems;
        const regularItems = lineItems.filter(i => !i.isSystemRow);

        const existingGstRow = lineItems.find(i => i.type === "GST");
        const existingTdsRow = lineItems.find(i => i.type === "TDS");

        let gstRow;
        let tdsRow;
        let isTdsApplicable;
        if (isModified) {

            // ── Preserve the entire saved row as-is — no reconstruction ──────
            // User may have manually edited qty / unitPrice / netAmount / taxAmt,
            // so we keep the full existing object instead of rebuilding it.
            gstRow = existingGstRow ?? {
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

            // TDS row: keep if it existed in the saved data
            tdsRow = existingTdsRow ?? null;
            isTdsApplicable = !!existingTdsRow;

        } else {
            // ── Recalculate from form fields ──────────────────────────────────
            const gstValue = parseFloat(formData?.totalTaxAmount || 0);

            const tdsRate = parseFloat(formData?.tdsRate || 0);
            const totalInvoiceAmount = parseFloat(
                formData?.totalInvoiceAmount || formData?.total_invoice_amount || 0
            );
            const tdsValue = -Math.abs(tdsRate * totalInvoiceAmount);
            isTdsApplicable = formData?.tdsApplicability === "Yes";

            gstRow = {
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

            tdsRow = {
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
        }

        const systemRows = [gstRow, ...(isTdsApplicable && tdsRow ? [tdsRow] : [])];
        return [...regularItems, ...systemRows];
    },

    // ── Update single field ──────────────────────────────────────────────────
    // Any user edit clears the isModified guard so recalculation runs.
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


            const updatedLineItems = triggerKeys.includes(key)
                // User edited a relevant field → always recalculate (isModified = false)
                ? get()._syncSystemRows(updatedFormData, state.quickViewLineItems, false)
                : state.quickViewLineItems;

            return { quickViewFormData: updatedFormData, quickViewLineItems: updatedLineItems };
        }),

    // ── Batch update multiple fields ─────────────────────────────────────────
    batchUpdateQuickViewFields: (updates) =>
        set((state) => {
            const updatedFormData = {
                ...state.quickViewFormData,
                ...updates,
            };

            const triggerKeys = [
                "totalTaxAmount",
                "tdsRate",
                "tdsApplicability",
                "totalInvoiceAmount",
                "total_invoice_amount",
            ];

            const hasTrigger = Object.keys(updates).some(k => triggerKeys.includes(k));

            // Get isModified from form
            const isModified = updatedFormData?.isModified;

            const updatedLineItems = hasTrigger
                ? get()._syncSystemRows(updatedFormData, state.quickViewLineItems, isModified)
                : state.quickViewLineItems;

            return {
                quickViewFormData: updatedFormData,
                quickViewLineItems: updatedLineItems
            };
        }),
    // ── Replace full form (used on initial load & vendor sync) ───────────────
    // Passes isModified through so the guard is respected on initial load.
    setQuickViewFormData: (dataOrUpdater, isModified = false) =>
        set((state) => {
            const updatedFormData =
                typeof dataOrUpdater === "function"
                    ? dataOrUpdater(state.quickViewFormData)
                    : dataOrUpdater;

            // Read isModified from the incoming formData.
            // On initial load this comes from extracted_data.isModified (set by
            // the caller in Invoice.jsx → handleView). On vendor-sync updates
            // (useEffect in QuickViewTab) the functional updater preserves
            // whatever isModified value was already in state, so the guard
            // stays active until the user edits a trigger field.
            const triggerKeys = [
                "totalTaxAmount",
                "tdsRate",
                "tdsApplicability",
                "totalInvoiceAmount",
                "total_invoice_amount",
            ];

            const hasTrigger = Object.keys(updatedFormData).some(key =>
                triggerKeys.includes(key)
            );

            // const updatedLineItems = hasTrigger
            //     ? get()._syncSystemRows(updatedFormData, state.quickViewLineItems, isModified)
            //     : state.quickViewLineItems;

            return { quickViewFormData: updatedFormData, quickViewLineItems: state.quickViewLineItems };
        }),

    // =============================
    //  QUICK VIEW - LINE ITEMS
    // Default includes GST system row only (TDS hidden until applicable)
    // =============================
    quickViewLineItems: [
        {
            id: 1,
            description: "SVC: TOLL FREE USAGE NO RRF",
            qty: 1,
            unitPrice: 16,
            discount: 0,
            netAmount: 16,
            taxAmt: 0,
            isNetAmountOverridden: false,
        },
        {
            id: 2,
            description: "Additional Local Number",
            qty: 21,
            unitPrice: 1.1,
            discount: 0,
            netAmount: 23.1,
            taxAmt: 0,
            isNetAmountOverridden: false,
        },
        {
            id: 3,
            description: "Local Number - Included",
            qty: 233,
            unitPrice: 0,
            discount: 0,
            netAmount: 0,
            taxAmt: 0,
            isNetAmountOverridden: false,
        },
        // ── System rows ──────────────────────────────────────────────────────
        {
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
        },
        // TDS row is NOT in the default list — it is added dynamically by
        // _syncSystemRows only when tdsApplicability === "Yes" && tdsRate > 0
    ],

    // ── Update table cell + auto-calculation ─────────────────────────────────
    updateQuickViewLineItem: (id, key, value) =>
        set((state) => {
            const updatedItems = state.quickViewLineItems.map((item) => {
                if (item.id !== id) return item;

                let updated = { ...item, [key]: value };

                if (!item.isSystemRow) {
                    // ── Regular row ───────────────────────────────────────
                    if (key === "netAmount") {
                        updated.isNetAmountOverridden = true;
                    }
                    if (["qty", "unitPrice", "discount"].includes(key)) {
                        updated.isNetAmountOverridden = false;
                    }
                    if (!updated.isNetAmountOverridden) {
                        const qty = Number((updated.qty || 0).toString().replace(/,/g, ""));
                        const price = Number((updated.unitPrice || 0).toString().replace(/,/g, ""));
                        const discount = Number((updated.discount || 0).toString().replace(/,/g, ""));
                        updated.netAmount = qty * price - discount;
                    }
                } else {
                    // ── System row (GST / TDS) ────────────────────────────
                    // Keep unitPrice and netAmount in sync whichever is edited
                    if (key === "unitPrice") {
                        updated.netAmount = Number((value || 0).toString().replace(/,/g, ""));
                    } else if (key === "netAmount") {
                        updated.unitPrice = Number((value || 0).toString().replace(/,/g, ""));
                    }
                }

                return updated;
            });

            return { quickViewLineItems: updatedItems };
        }),

    // ── Delete row (only regular rows; system rows are not deletable from UI) ─
    deleteQuickViewLineItem: (id) =>
        set((state) => ({
            quickViewLineItems: state.quickViewLineItems.filter(i => i.id !== id),
        })),

    // ── Add new regular row — always inserted before system rows ─────────────
    addQuickViewLineItem: () =>
        set((state) => {
            const newItem = {
                id: Date.now(),
                description: "",
                qty: 1,
                unitPrice: 0,
                discount: 0,
                netAmount: 0,
                taxAmt: 0,
                lineType: "Expense",
                glCode: "",
                lob: "",
                department: "",
                customer: "",
                item: "",
                isNetAmountOverridden: false,
            };
            const regularItems = state.quickViewLineItems.filter(row => !row.isSystemRow);
            const systemRows = state.quickViewLineItems.filter(row => row.isSystemRow);
            return { quickViewLineItems: [...regularItems, newItem, ...systemRows] };
        }),

    // ── Replace all line items (called from Invoice.jsx on initial load) ──────
    // isModified is passed so the guard is respected.
    setQuickViewLineItems: (items, isModified = false) =>
        set((state) => ({
            quickViewLineItems: get()._syncSystemRows(
                state.quickViewFormData,
                items,
                isModified
            ),
        })),

    // =============================
    // TOTAL CALCULATION
    // =============================
    recalculateQuickViewTotals: () => {
        const { quickViewLineItems } = get();
        const total = quickViewLineItems
            .filter(item => !item.isSystemRow)
            .reduce((sum, item) => sum + (Number(item.netAmount) || 0), 0);
        set((state) => ({
            quickViewFormData: {
                ...state.quickViewFormData,
                totalAmount: total.toFixed(2),
                totalPayable: total.toFixed(2),
            },
        }));
    },

    resetQuickView: () => set({
        quickViewFormData: {},
        quickViewLineItems: [],
        selectedVendorId: null,
        activeInvoiceData: null
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
}));