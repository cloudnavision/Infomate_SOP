import { create } from 'zustand'

interface SOPState {
  selectedStepId: string | null
  editMode: boolean
  isPlaying: boolean
  videoMode: 'clip' | 'full'
  currentVideoTime: number

  setSelectedStep: (id: string | null) => void
  toggleEditMode: () => void
  setIsPlaying: (v: boolean) => void
  setVideoMode: (m: 'clip' | 'full') => void
  setCurrentVideoTime: (t: number) => void
}

export const useSOPStore = create<SOPState>((set) => ({
  selectedStepId: null,
  editMode: false,
  isPlaying: false,
  videoMode: 'clip',
  currentVideoTime: 0,

  setSelectedStep: (id) => set({ selectedStepId: id }),
  toggleEditMode: () => set((state) => ({ editMode: !state.editMode })),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setVideoMode: (m) => set({ videoMode: m }),
  setCurrentVideoTime: (t) => set({ currentVideoTime: t }),
}))
