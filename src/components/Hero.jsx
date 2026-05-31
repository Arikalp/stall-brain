import { motion } from "framer-motion";
import { Link } from "react-router-dom";

export default function Hero() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
            initial={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <motion.span
              animate={{ opacity: 1, x: 0 }}
              className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-200"
              initial={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              Bazaar Brain Forecasting
            </motion.span>
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
              Stop Guessing Daily Sales
            </h1>
            <p className="text-lg text-white/70 sm:text-xl">
              AI Forecasts What Your Stall Should Sell Tomorrow
            </p>
            <p className="text-base text-white/60">
              Bazaar Brain analyzes weather, local events, seasonality and demand
              patterns to help vendors stock smarter and earn more.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                className="rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-black transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(251,191,36,0.35)]"
                to="/setup"
              >
                Get Today&apos;s Forecast
              </Link>
            </div>
          </motion.div>

          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="relative"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
          >
            <div className="absolute -inset-6 rounded-3xl bg-amber-300/10 blur-3xl" />
            <div className="absolute -right-6 top-6 h-32 w-32 rounded-full bg-amber-300/20 blur-3xl" />

            <div className="relative rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                    Forecast Dashboard
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    Hazratganj Hub
                  </p>
                </div>
                <div className="rounded-full border border-amber-300/40 bg-amber-300/15 px-3 py-1 text-xs font-semibold text-amber-200">
                  Live
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-white/50">
                    Weather
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-white">34C</p>
                  <p className="text-sm text-white/60">Clear skies · Low wind</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-white/50">
                    Confidence
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-amber-200">92%</p>
                  <div className="mt-2 h-2 w-full rounded-full bg-white/10">
                    <div className="h-2 w-5/6 rounded-full bg-amber-300" />
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-white/50">
                    Expected Customers
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-white">182</p>
                  <p className="text-sm text-white/60">+18% vs. last Friday</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-white/50">
                    Revenue Prediction
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-white">$1,240</p>
                  <p className="text-sm text-white/60">Peak at 7:30pm</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.25em] text-white/50">
                    Stock Recommendation
                  </p>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-200">
                    Restock
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-white/70">
                  <div className="flex items-center justify-between">
                    <span>Fresh juice cups</span>
                    <span className="text-white">+30</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Ice cubes</span>
                    <span className="text-white">+12 kg</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Snack packs</span>
                    <span className="text-white">+40</span>
                  </div>
                </div>
              </div>
            </div>

          </motion.div>
        </div>
      </div>
    </section>
  );
}
