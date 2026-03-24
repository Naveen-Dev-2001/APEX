import { create } from "zustand";

export const useCommonStore = create((set) => ({

    entity: null,

    setEntity: (entity) => set({ entity })
}))