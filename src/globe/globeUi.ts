import { create } from 'zustand'

export type Sensor = 'eo' | 'nvg' | 'flir' | 'crt'
export const SENSORS: { id: Sensor; label: string; title: string }[] = [
  { id: 'eo', label: 'EO', title: 'Normal view' },
  { id: 'nvg', label: 'NVG', title: 'Night vision' },
  { id: 'flir', label: 'FLIR', title: 'Thermal (FLIR)' },
  { id: 'crt', label: 'CRT', title: 'CRT terminal' },
]

/** Globe view state shared between the control stack and the layer renderer. */
export const useGlobeUi = create<{ pinsHidden: boolean; togglePins: () => void; sensor: Sensor; setSensor: (s: Sensor) => void }>((set) => ({
  pinsHidden: false,
  togglePins: () => set((s) => ({ pinsHidden: !s.pinsHidden })),
  sensor: 'eo',
  setSensor: (sensor) => set({ sensor }),
}))
