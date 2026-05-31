import { motion } from "framer-motion";
import { Link } from "react-router-dom";

export default function CTA() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="relative overflow-hidden rounded-3xl border border-amber-300/30 bg-amber-300/10 p-10 sm:p-14">
          <motion.div
            animate={{ opacity: [0.2, 0.45, 0.2], scale: [0.9, 1.05, 0.9] }}
            className="pointer-events-none absolute -top-56 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.6),transparent_70%)] blur-[120px]"
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            animate={{ opacity: [0.2, 0.4, 0.2], x: [-20, 20, -20] }}
            className="pointer-events-none absolute -bottom-40 right-0 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.4),transparent_70%)] blur-[100px]"
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="relative z-10 max-w-3xl space-y-6">
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">
              Start Forecasting Smarter Today
            </h2>
            <p className="text-base text-white/70 sm:text-lg">
              Join hundreds of vendors making better decisions with AI.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                className="rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-black transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(251,191,36,0.35)]"
                to="/setup"
              >
                Get Forecast
              </Link>
              <a
                className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white/80 transition duration-300 hover:border-white/40 hover:text-white"
                href="#demo"
              >
                Watch Demo
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
