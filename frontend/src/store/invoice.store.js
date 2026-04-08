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

        // ❌ DO NOT group if already saved
        if (!isLineGrouped || isModified) return items;

        const regularItems = items.filter(i => !i.isSystemRow);
        const systemRows = items.filter(i => i.isSystemRow);

        if (regularItems.length === 0) return items;

        const firstRow = regularItems[0];

        const groupedRow = {
            ...firstRow,
            id: "grouped-1",
            description: firstRow.description, // ✅ keep first row desc
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

            const updatedLineItems = triggerKeys.includes(key)
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
            const isModified = updatedFormData?.isModified;

            const updatedLineItems = hasTrigger
                ? get()._syncSystemRows(updatedFormData, state.quickViewLineItems, isModified)
                : state.quickViewLineItems;

            return {
                quickViewFormData: updatedFormData,
                quickViewLineItems: updatedLineItems,
            };
        }),

    // ── Replace full form (used on initial load & vendor sync) ───────────────
    setQuickViewFormData: (dataOrUpdater) =>
        set((state) => {
            const updatedFormData =
                typeof dataOrUpdater === "function"
                    ? dataOrUpdater(state.quickViewFormData)
                    : dataOrUpdater;

            return { quickViewFormData: updatedFormData, quickViewLineItems: state.quickViewLineItems };
        }),

    // =============================
    //  QUICK VIEW - LINE ITEMS
    // Default includes GST system row only
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
    ],

    // ── Replace all line items (called from Invoice.jsx on initial load) ──────
    //
    // Rules:
    //   • isModified === true  → saved invoice: store items exactly as-is,
    //                            only rebuild system rows to ensure GST/TDS
    //                            objects are correct, NO grouping.
    //   • isModified === false → fresh/unsaved invoice: apply line grouping
    //                            if lineGrouping === "Yes", then sync system rows.
    // ─────────────────────────────────────────────────────────────────────────
    setQuickViewLineItems: (items, isModified = false) =>
        set((state) => {

            const formData = {
                ...state.quickViewFormData,
                isModified
            };

            const grouped = get()._applyLineGrouping(items, formData);

            return {
                quickViewLineItems: get()._syncSystemRows(
                    formData,
                    grouped,
                    isModified
                ),
            };
        }),

    // ── Update table cell + auto-calculation ─────────────────────────────────
    // quickViewLineItems is always the source of truth.
    // Any edit (including on the grouped row) updates state directly.
    updateQuickViewLineItem: (id, key, value) =>
        set((state) => {
            const updatedItems = state.quickViewLineItems.map((item) => {
                if (item.id !== id) return item;

                let updated = { ...item, [key]: value };

                if (!item.isSystemRow) {
                    // ── Regular / grouped row ──────────────────────────────
                    if (key === "netAmount") {
                        updated.isNetAmountOverridden = true;
                        if (value === "") {
                            updated.netAmount = "";
                            return updated;
                        }
                    }
                    if (["qty", "unitPrice", "discount"].includes(key)) {
                        updated.isNetAmountOverridden = false;
                    }
                    if (!updated.isNetAmountOverridden) {
                        const qty = Number((updated.qty ?? "").toString().replace(/,/g, ""));
                        const price = Number((updated.unitPrice ?? "").toString().replace(/,/g, ""));
                        const discount = Number((updated.discount ?? "").toString().replace(/,/g, ""));
                        if (updated.qty === "" || updated.unitPrice === "" || updated.discount === "") {
                            updated.netAmount = "";
                        } else {
                            updated.netAmount = qty * price - discount;
                        }
                    }
                } else {
                    // ── System row (GST / TDS) ─────────────────────────────
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

    // ── Delete row (regular rows only) ────────────────────────────────────────
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
                isNewRow: true,
            };
            const regularItems = state.quickViewLineItems.filter(row => !row.isSystemRow);
            const systemRows = state.quickViewLineItems.filter(row => row.isSystemRow);
            return { quickViewLineItems: [...regularItems, newItem, ...systemRows] };
        }),

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
        activeInvoiceData: null,
    }),

    // ── Build final items for save ────────────────────────────────────────────
    // Returns exactly what is visible on screen — no re-grouping.
    // What the user sees is what gets saved.
    getLineItemsForSave: () => {
        const { quickViewLineItems } = get();
        // Return all items (regular + system) exactly as they are in state
        return quickViewLineItems;
    },

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