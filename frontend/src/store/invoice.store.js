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

    isModalOpen: false,
    setIsModalOpen: (open) => set({ isModalOpen: open }),
}))