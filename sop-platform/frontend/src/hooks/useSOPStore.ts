import { create } from 'zustand'

interface SOPState {
  selectedStepId: string | null
  editMode: boolean
  isPlaying: boolean
  videoMode: 'clip' | 'full'

  setSelectedStep: (id: string | null) => void
  toggleEditMode: () => void
  setIsPlaying: (v: boolean) => void
  setVideoMode: (m: 'clip' | 'full') => void
}

export const useSOPStore = create<SOPState>((set) => ({
  selectedStepId: null,
  editMode: false,
  isPlaying: false,
  videoMode: 'clip',

  setSelectedStep: (id) => set({ selectedStepId: id }),
  toggleEditMode: () => set((state) => ({ editMode: !state.editMode })),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setVideoMode: (m) => set({ videoMode: m }),
}))
