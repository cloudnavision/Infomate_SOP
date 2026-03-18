import { create } from 'zustand'

interface SOPState {
  selectedStepId: string | null
  editMode: boolean
  setSelectedStep: (id: string | null) => void
  toggleEditMode: () => void
}

export const useSOPStore = create<SOPState>((set) => ({
  selectedStepId: null,
  editMode: false,
  setSelectedStep: (id) => set({ selectedStepId: id }),
  toggleEditMode: () => set((state) => ({ editMode: !state.editMode })),
}))
