import { motion } from "framer-motion";

const recommendations = [
  { name: "Sweet lime juice", delta: "+28%", stock: "120 cups" },
  { name: "Roasted corn", delta: "+18%", stock: "80 cobs" },
  { name: "Samosa plates", delta: "+12%", stock: "140 plates" },
  { name: "Cold coffee", delta: "+9%", stock: "70 cups" },
];

export default function Demo() {
  return (
    <section className="py-20 sm:py-24" id="demo">
      <div className="mx-auto w-full max-w-6xl px-6">
        <motion.div
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 sm:p-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.18),transparent_55%)]" />
          <div className="relative z-10 grid gap-10 lg:grid-cols-[1.1fr_1fr]">
            <div className="space-y-5">
              <p className="text-xs uppercase tracking-[0.35em] text-white/40">
                Live demo
              </p>
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">
                A real-time view of tomorrow&apos;s demand
              </h2>
              <p className="text-base text-white/60">
                See revenue signals, footfall confidence, and product-level guidance
                in one unified control room.
              </p>
              <div className="flex items-center gap-4">
                <div className="rounded-2xl border border-white/10 bg-black/40 px-5 py-3 text-sm text-white/70">
                  AI Confidence <span className="ml-2 text-white">93%</span>
                </div>
                <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 py-3 text-sm text-amber-200">
                  Forecast Locked
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 rounded-3xl bg-amber-300/10 blur-3xl" />
              <div className="relative grid gap-4 rounded-3xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                      Revenue
                    </p>
                    <p className="mt-2 text-xl font-semibold text-white">$1,420</p>
                    <svg className="mt-4 h-20 w-full" viewBox="0 0 160 60">
                      <defs>
                        <linearGradient id="rev" x1="0" x2="1" y1="0" y2="1">
                          <stop offset="0%" stopColor="rgba(251,191,36,0.7)" />
                          <stop offset="100%" stopColor="rgba(251,191,36,0.05)" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M0 45 L25 40 L50 42 L75 28 L100 32 L125 18 L160 24"
                        fill="none"
                        stroke="rgba(251,191,36,0.8)"
                        strokeWidth="3"
                      />
                      <path
                        d="M0 60 L0 45 L25 40 L50 42 L75 28 L100 32 L125 18 L160 24 L160 60 Z"
                        fill="url(#rev)"
                      />
                    </svg>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                      Demand
                    </p>
                    <p className="mt-2 text-xl font-semibold text-white">182</p>
                    <svg className="mt-4 h-20 w-full" viewBox="0 0 160 60">
                      <path
                        d="M0 50 L20 40 L40 46 L60 30 L80 34 L100 20 L120 25 L140 18 L160 22"
                        fill="none"
                        stroke="rgba(148,163,184,0.7)"
                        strokeWidth="3"
                      />
                      <circle cx="120" cy="25" r="4" fill="rgba(251,191,36,0.9)" />
                    </svg>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                      Weather insights
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <div>
                        <p className="text-lg font-semibold text-white">34C</p>
                        <p className="text-xs text-white/60">Clear · 4km/h wind</p>
                      </div>
                      <div className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs text-amber-200">
                        Heat spike
                      </div>
                    </div>
                    <div className="mt-4 h-2 w-full rounded-full bg-white/10">
                      <motion.div
                        animate={{ width: ["40%", "70%", "40%"] }}
                        className="h-2 rounded-full bg-amber-300"
                        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                      AI confidence
                    </p>
                    <div className="mt-4 flex items-center justify-center">
                      <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-white/10">
                        <span className="text-xl font-semibold text-white">93%</span>
                        <motion.span
                          animate={{ rotate: 360 }}
                          className="absolute inset-0 rounded-full border-2 border-amber-300/60 border-l-transparent"
                          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                    Product recommendations
                  </p>
                  <div className="mt-4 space-y-3 text-sm">
                    {recommendations.map((item) => (
                      <div
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-3 py-2"
                        key={item.name}
                      >
                        <span className="text-white/80">{item.name}</span>
                        <span className="text-amber-200">{item.delta}</span>
                        <span className="text-white/60">{item.stock}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
