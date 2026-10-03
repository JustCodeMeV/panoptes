import { create } from 'zustand'

/** `tab` lets the replay drive the story detail's Timeline/Network switch. */
type D = { running: boolean; step: number; caption?: string; sub?: string; tab?: 'timeline' | 'network'; set(p: Partial<Omit<D, 'set'>>): void }
export const useDemo = create<D>((set) => ({ running: false, step: 0, set: (p) => set(p) }))
