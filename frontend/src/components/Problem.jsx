import { motion } from "framer-motion";
import { CalendarDays, CloudRain, PackageX, TriangleAlert } from "lucide-react";

const problems = [
  {
    title: "Overstocking",
    description:
      "Cash gets locked in slow-moving items, leaving less room for high-demand stock.",
    icon: PackageX,
  },
  {
    title: "Understocking",
    description:
      "Best-sellers run out early, turning eager buyers into missed revenue.",
    icon: TriangleAlert,
  },
  {
    title: "Weather Changes",
    description:
      "Sudden heat or rain shifts footfall and demand without warning.",
    icon: CloudRain,
  },
  {
    title: "Local Events",
    description:
      "Festivals and rush hours spike demand, but signals are hard to track.",
    icon: CalendarDays,
  },
];

export default function Problem() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">
              Every Vendor Faces The Same Problem
            </h2>
            <p className="text-base text-white/60">
              Demand shifts daily, but most stalls still make decisions with guesswork
              and yesterday&apos;s intuition.
            </p>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2">
            {problems.map((problem, index) => {
              const Icon = problem.icon;
              return (
                <motion.div
                  className="group rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-amber-300/40 hover:bg-white/10"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 * index }}
                  key={problem.title}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-amber-200 transition duration-300 group-hover:scale-105">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-white">
                    {problem.title}
                  </h3>
                  <p className="mt-2 text-sm text-white/60">
                    {problem.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
