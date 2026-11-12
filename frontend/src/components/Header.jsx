export default function Header() {
  return (
    <header className="relative overflow-hidden rounded-lg border border-(--color-border) bg-[radial-gradient(circle_at_top,#1a1400,#0D0D0D)] px-6 py-8 shadow-2xl shadow-black/40">
      <div className="absolute -top-24 right-6 h-40 w-40 rounded-lg bg-[rgba(245,158,11,0.22)] blur-3xl" />
      <div className="absolute -bottom-20 left-10 h-40 w-40 rounded-lg bg-[rgba(74,222,128,0.12)] blur-3xl" />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-(--color-text-secondary)">
          <span className="h-2.5 w-2.5 rounded-full bg-(--color-success) shadow-[0_0_12px_rgba(74,222,128,0.8)] animate-pulse" />
          Live
        </div>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl lg:text-6xl bg-linear-to-r from-[#F59E0B] to-[#FBBF24] bg-clip-text">
            Bazaar Brain
          </h1>
          <p className="mt-2 text-base text-(--color-text-secondary) sm:text-lg">
            रोज़ का हिसाब, AI का जवाब
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-(--color-border) bg-(--color-bg-card) px-4 py-1 text-sm font-semibold text-(--color-text-primary)">
            Lucknow / Hazratganj
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-(--color-border) bg-(--color-bg-input) px-4 py-1 text-sm font-medium text-(--color-text-secondary) float-slow">
            Hyperlocal Forecast Engine
          </span>
        </div>
      </div>
    </header>
  )
}
