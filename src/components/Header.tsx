export default function Header() {
  return (
    <div className="glass-panel pointer-events-none fixed left-6 top-6 z-10 flex select-none items-center gap-2.5 rounded-full px-3 py-2 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-white to-white/60 shadow-[0_2px_10px_rgba(255,255,255,0.2)]">
        <img src={`${import.meta.env.BASE_URL}fmhy.ico`} alt="" className="h-full w-full object-cover" />
      </div>
      <h1 className="text-lg font-extrabold tracking-tight text-white">
        Nev<span className="font-medium text-white/55">Atlas</span>
      </h1>
    </div>
  )
}
