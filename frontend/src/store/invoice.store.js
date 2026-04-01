import { create } from "zustand";

export const useInvoiceStore = create((set) => ({

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

    isModalOpen: false,
    setIsModalOpen: (open) => set({ isModalOpen: open }),

    // Invoice View Screen State;
    tabList: ["Quick View", "All Fields", "GL Summary", "Workflow", "Audit Trail"],

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

        // Vendor Master
        gstEligibility: "",
        tdsApplicability: "",
        tdsRate: "",
        tdsSection: "",
        lineGrouping: "",
    },

    //  Update single field
    setQuickViewField: (key, value) =>
        set((state) => ({
            quickViewFormData: {
                ...state.quickViewFormData,
                [key]: value,
            },
        })),

    //  Replace full form (API)
    // invoice.store.js
    setQuickViewFormData: (dataOrUpdater) =>
        set((state) => ({
            quickViewFormData:
                typeof dataOrUpdater === "function"
                    ? dataOrUpdater(state.quickViewFormData)  // functional update
                    : dataOrUpdater,                          // direct replace
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
        },
        {
            id: 2,
            description: "Additional Local Number",
            qty: 21,
            unitPrice: 1.1,
            discount: 0,
            netAmount: 23.1,
            taxAmt: 0,
        },
        {
            id: 3,
            description: "Local Number - Included",
            qty: 233,
            unitPrice: 0,
            discount: 0,
            netAmount: 0,
            taxAmt: 0,
        },
    ],

    //  Update table cell + auto calculation
    updateQuickViewLineItem: (id, key, value) =>
        set((state) => ({
            quickViewLineItems: state.quickViewLineItems.map((item) => {

                if (item.id !== id) return item;

                const updated = {
                    ...item,
                    [key]: value,
                };

                // Auto calculation
                const qty = Number(updated.qty) || 0;
                const price = Number(updated.unitPrice) || 0;
                const discount = Number(updated.discount) || 0;

                updated.netAmount = (qty * price) - discount;

                return updated;
            }),
        })),

    //  Delete row
    deleteQuickViewLineItem: (id) =>
        set((state) => ({
            quickViewLineItems: state.quickViewLineItems.filter(i => i.id !== id),
        })),

    //  Add new row
    //  Add new row (always before Total GST row)
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
            };
            const regularItems = state.quickViewLineItems.filter(
                (row) => row.description !== "Total GST"
            );
            const gstRow = state.quickViewLineItems.filter(
                (row) => row.description === "Total GST"
            );
            return {
                quickViewLineItems: [...regularItems, newItem, ...gstRow],
            };
        }),

    setQuickViewLineItems: (items) =>
        set({ quickViewLineItems: items }),

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

    entityMaster: {},
    setEntityMaster: (data) => set({ entityMaster: data }),


}))