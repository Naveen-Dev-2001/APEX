import { create } from "zustand";

export const useInvoiceStore = create((set) => ({

    rightPanelWidth: 500,

    setRightPanelWidth: (width) => set({ rightPanelWidth: width }),
}))