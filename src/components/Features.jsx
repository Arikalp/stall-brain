import { motion } from "framer-motion";
import {
  Activity,
  CalendarCheck,
  CloudSun,
  Languages,
  LineChart,
  PackageSearch,
} from "lucide-react";

const features = [
  {
    title: "AI Demand Forecasting",
    description: "Predict tomorrow's footfall and demand with precision signals.",
    icon: LineChart,
  },
  {
    title: "Weather Intelligence",
    description: "Blend local weather shifts into your stocking plan instantly.",
    icon: CloudSun,
  },
  {
    title: "Inventory Suggestions",
    description: "Get optimal stock quantities based on patterns and margins.",
    icon: PackageSearch,
  },
  {
    title: "Event Awareness",
    description: "Stay ahead of festivals, rush hours, and neighborhood surges.",
    icon: CalendarCheck,
  },
  {
    title: "Profit Optimization",
    description: "Balance demand and margin to capture more profit daily.",
    icon: Activity,
  },
  {
    title: "Hindi + English Support",
    description: "Serve insights in the language your team moves fastest with.",
    icon: Languages,
  },
];

export default function Features() {
  return (
    <section className="py-20 sm:py-24" id="features">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="space-y-10">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.35em] text-white/40">
              Features
            </p>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">
              Built for vendors who need confidence daily
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  className="group relative rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition duration-300 hover:-translate-y-1"
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  key={feature.title}
                >
                  <div className="pointer-events-none absolute inset-0 rounded-2xl border border-transparent bg-gradient-to-br from-amber-300/30 via-white/5 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
                  <div className="relative z-10">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-amber-200 transition duration-300 group-hover:scale-105">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-white">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-sm text-white/60">
                      {feature.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
