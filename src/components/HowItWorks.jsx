import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const steps = [
  {
    title: "Choose Stall Type",
    description:
      "Select the stall profile that matches your daily inventory and demand patterns.",
  },
  {
    title: "Add Products",
    description:
      "Customize your stock list so the model knows exactly what you sell.",
  },
  {
    title: "Get AI Forecast",
    description:
      "Receive tomorrow's demand signal with revenue, footfall, and stock guidance.",
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 sm:py-24" id="how-it-works">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="space-y-10">
          <motion.div
            className="space-y-3"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <p className="text-xs uppercase tracking-[0.35em] text-white/40">
              How it works
            </p>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">
              From stall setup to AI forecasts in minutes
            </h2>
          </motion.div>

          <div className="relative">
            <div className="absolute left-6 top-10 hidden h-[calc(100%-3rem)] w-px bg-white/10 lg:block" />
            <div className="grid gap-6 lg:grid-cols-3">
              {steps.map((step, index) => (
                <motion.div
                  className="group relative rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-amber-300/40 hover:bg-white/10"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 * index }}
                  key={step.title}
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-amber-200">
                      0{index + 1}
                    </span>
                    <motion.span
                      animate={{ x: [0, 6, 0] }}
                      className="hidden h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/70 lg:flex"
                      transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </motion.span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-white">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-white/60">
                    {step.description}
                  </p>
                  {index < steps.length - 1 ? (
                    <div className="pointer-events-none absolute -right-4 top-1/2 hidden h-px w-8 -translate-y-1/2 bg-gradient-to-r from-amber-300/60 to-transparent lg:block" />
                  ) : null}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
