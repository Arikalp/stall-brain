import { motion } from "framer-motion";

const testimonials = [
  {
    name: "Anita Verma",
    stall: "Chaat & Snacks",
    improvement: "Revenue increased by 18% after using Bazaar Brain.",
  },
  {
    name: "Ravi Singh",
    stall: "Fresh Juice Cart",
    improvement: "Stockouts dropped and my profits are up 15% weekly.",
  },
  {
    name: "Meera Joshi",
    stall: "Street Meals",
    improvement: "I plan inventory faster and waste 20% less every day.",
  },
];

export default function Testimonials() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="space-y-10">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.35em] text-white/40">
              Testimonials
            </p>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">
              Vendors who run smarter every morning
            </h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {testimonials.map((item, index) => (
              <motion.article
                className="group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-amber-300/40 hover:bg-white/10"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 * index }}
                key={item.name}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-xs font-semibold text-white/60">
                    Photo
                  </div>
                  <div>
                    <p className="text-base font-semibold text-white">
                      {item.name}
                    </p>
                    <p className="text-xs uppercase tracking-[0.25em] text-white/40">
                      {item.stall}
                    </p>
                  </div>
                </div>
                <p className="mt-5 text-sm text-white/70">“{item.improvement}”</p>
                <div className="mt-6 inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200">
                  Revenue improved
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
