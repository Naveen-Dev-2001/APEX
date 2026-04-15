import { create } from "zustand";

export const useSettingsStore = create((set) => ({

    activeSettingsTab: 'Vendor Based Workflow',
    setActiveSettingsTab: (tab) => set({ activeSettingsTab: tab }),

    addRule: false,
    setAddRule: (val) => set({ addRule: val }),

}))