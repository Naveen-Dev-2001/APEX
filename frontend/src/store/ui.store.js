import { create } from "zustand";

export const useUIStore = create((set) => ({

    rightPanelWidth: 500,

    setRightPanelWidth: (width) => set({ rightPanelWidth: width }),
}))