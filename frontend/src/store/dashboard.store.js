import { create } from "zustand";

export const useDashboardStore = create((set) => ({

    rightPanelWidth: 500,

    setRightPanelWidth: (width) => set({ rightPanelWidth: width }),
}))