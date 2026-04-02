import { create } from "zustand";

export const useInvoiceStore = create((set, get) => ({

    invoiceSection: 1,
    setInvoiceSection: (section) => set({ invoiceSection: section }),

    entityList: [],
    setEntityList: (entities) => set({ entityList: entities }),

    selectedEntity: null,
    setSelectedEntity: (entity) => set({ selectedEntity: entity }),

    skip: 0,
    setSkip: (skip) => set({ skip }),

    limit: 10,
    setLimit: (limit) => set({ limit }),

    view: "condensed",
    setView: (view) => set({ view }),

    viewInvoiceId: null,
    setViewInvoiceId: (id) => set({ viewInvoiceId: id }),

    fileName: "",
    setFileName: (name) => set({ fileName: name }),


    isModalOpen: false,
    setIsModalOpen: (open) => set({ isModalOpen: open }),

    // Invoice View Screen State
    tabList: ["Quick View", "All Fields", "GL Summary", "Workflow", "Audit Trail", "Line Items"],

    invoiceActiveTab: "Quick View",
    setInvoiceActiveTab: (tab) => set({ invoiceActiveTab: tab }),

    selectedVendorId: null,
    setSelectedVendorId: (vendorId) => set({ selectedVendorId: vendorId }),

    // =============================
    //  QUICK VIEW - FORM DATA
    // =============================
    quickViewFormData: {
        // Header
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

        // Vendor Level
        vendorAddress: "",
        vendorCountry: "",
        vendorTaxId: "",
        vendorEmail: "",
        vendorPhone: "",
        vendorBankName: "",
        vendorBankAccount: "",
        vendorContactPerson: "",

        // Buyer
        clientName: "",
        billingAddress: "",
        shippingAddress: "",
        phoneNumber: "",
        email: "",
        clientTaxId: "",
        contactPerson: "",

        // Taxes
        totalTaxAmount: "",
        cgst: "",
        sgst: "",
        igst: "",
        withholdingTax: "",

        // Totals
        subtotal: "",
        shippingFees: "",
        surcharges: "",
        totalInvoiceAmount: "",
        amountDue: "",

        // Compliance
        notes: "",
        qrOrIrn: "",
        companyRegistrationNumber: "",

        // Vendor master
        gstEligibility: "",
        tdsApplicability: "",
        tdsRate: "",
        tdsSection: "",
        lineGrouping: "",
    },

    // ── Update single field (used by debounced FieldRenderer) ──────────────
    setQuickViewField: (key, value) =>
        set((state) => ({
            quickViewFormData: {
                ...state.quickViewFormData,
                [key]: value,
            },
        })),

    // ── Update multiple fields in ONE set() call (avoids cascading re-renders) ──
    batchUpdateQuickViewFields: (updates) =>
        set((state) => ({
            quickViewFormData: {
                ...state.quickViewFormData,
                ...updates,
            },
        })),

    // ── Replace full form or functional update (used by vendor sync) ────────
    setQuickViewFormData: (dataOrUpdater) =>
        set((state) => ({
            quickViewFormData:
                typeof dataOrUpdater === "function"
                    ? dataOrUpdater(state.quickViewFormData)
                    : dataOrUpdater,
        })),

    // =============================
    //  QUICK VIEW - LINE ITEMS
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
    ],

    // ── Update table cell + auto-calculation ────────────────────────────────
    updateQuickViewLineItem: (id, key, value) =>
        set((state) => ({
            quickViewLineItems: state.quickViewLineItems.map((item) => {
                if (item.id !== id) return item;   // ← unchanged items keep same reference

                let updated = { ...item, [key]: value };

                const qty = Number(updated.qty) || 0;
                const price = Number(updated.unitPrice) || 0;
                const discount = Number(updated.discount) || 0;

                if (key === "netAmount") {
                    updated.isNetAmountOverridden = true;
                }
                if (["qty", "unitPrice", "discount"].includes(key)) {
                    updated.isNetAmountOverridden = false;
                }
                if (!updated.isNetAmountOverridden) {
                    updated.netAmount = qty * price - discount;
                }

                return updated;
            }),
        })),

    // ── Delete row ───────────────────────────────────────────────────────────
    deleteQuickViewLineItem: (id) =>
        set((state) => ({
            quickViewLineItems: state.quickViewLineItems.filter(i => i.id !== id),
        })),

    // ── Add new row (always before Total GST row) ───────────────────────────
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
                isNetAmountOverridden: false,
            };
            const regularItems = state.quickViewLineItems.filter(
                row => row.description !== "Total GST"
            );
            const gstRow = state.quickViewLineItems.filter(
                row => row.description === "Total GST"
            );
            return { quickViewLineItems: [...regularItems, newItem, ...gstRow] };
        }),

    setQuickViewLineItems: (items) => set({ quickViewLineItems: items }),

    // =============================
    // TOTAL CALCULATION
    // =============================
    recalculateQuickViewTotals: () => {
        const { quickViewLineItems } = get();
        const total = quickViewLineItems.reduce(
            (sum, item) => sum + (Number(item.netAmount) || 0),
            0
        );
        set((state) => ({
            quickViewFormData: {
                ...state.quickViewFormData,
                totalAmount: total.toFixed(2),
                totalPayable: total.toFixed(2),
            },
        }));
    },

    // =============================
    // PDF HIGHLIGHT (FUTURE)
    // =============================
    highlightedField: null,
    setHighlightedField: (field) => set({ highlightedField: field }),

    activeInvoiceData: null,
    setActiveInvoiceData: (data) => set({ activeInvoiceData: data }),

    entityMaster: {},
    setEntityMaster: (data) => set({ entityMaster: data }),
}));