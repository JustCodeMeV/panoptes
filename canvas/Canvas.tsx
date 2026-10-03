import { Builder } from './builder/Builder'

export function Canvas() {
  return (
    <div className="flex h-screen flex-col bg-[#05070c] text-[13px] text-[#d9dee8]">
      <header className="flex h-[49px] flex-none items-center gap-3 border-b border-white/[0.08] px-5">
        <span className="text-xs font-bold tracking-[0.3em] text-white">ATLAS</span>
        <span className="text-[11px] tracking-[0.15em] text-[#6b7385] uppercase">design editor</span>
      </header>
      <Builder />
    </div>
  )
}
