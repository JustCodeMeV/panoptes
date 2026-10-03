import { create } from 'zustand'

type D = { running: boolean; step: number; caption?: string; sub?: string; set(p: Partial<Omit<D, 'set'>>): void }
export const useDemo = create<D>((set) => ({ running: false, step: 0, set: (p) => set(p) }))
