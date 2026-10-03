import { create } from 'zustand'

/** Globe view state shared between the control stack and the layer renderer. */
export const useGlobeUi = create<{ pinsHidden: boolean; togglePins: () => void }>((set) => ({
  pinsHidden: false,
  togglePins: () => set((s) => ({ pinsHidden: !s.pinsHidden })),
}))
