import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const stats = [
  { label: "Active Vendors", value: 500, suffix: "+" },
  { label: "Forecast Accuracy", value: 95, suffix: "%" },
  { label: "Less Waste", value: 20, suffix: "%" },
  { label: "Higher Revenue", value: 15, suffix: "%" },
];

export default function Stats() {
  const [counts, setCounts] = useState(() => stats.map(() => 0));

  useEffect(() => {
    const duration = 1200;
    const start = performance.now();

    let frameId = 0;
    const animate = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      setCounts(stats.map((stat) => Math.round(stat.value * progress)));
      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto w-full max-w-6xl px-6">
        <motion.div
          className="grid gap-6 rounded-3xl border border-white/10 bg-white/5 p-6 sm:grid-cols-2 lg:grid-cols-4"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          {stats.map((stat, index) => (
            <motion.div
              className="group space-y-3 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-amber-300/40 hover:bg-white/10"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 * index }}
              key={stat.label}
            >
              <div className="text-3xl font-semibold text-white transition duration-300 group-hover:text-amber-200">
                {counts[index]}
                {stat.suffix}
              </div>
              <p className="text-sm text-white/60">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
