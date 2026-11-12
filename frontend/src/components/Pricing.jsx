import { motion } from "framer-motion";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "₹0/month",
    description: "Perfect for testing daily signals and basic insights.",
    features: ["1 stall profile", "Basic demand forecast", "Daily weather sync"],
    cta: "Start for free",
  },
  {
    name: "Pro",
    price: "₹199/month",
    description: "For vendors who want confident stocking every day.",
    features: [
      "Unlimited stall setups",
      "AI revenue forecast",
      "Event-based demand alerts",
      "Inventory recommendations",
    ],
    cta: "Go Pro",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom Pricing",
    description: "Multi-location support and white-glove onboarding.",
    features: ["Custom integrations", "Team access", "Dedicated success"],
    cta: "Talk to sales",
  },
];

export default function Pricing() {
  return (
    <section className="py-20 sm:py-24" id="pricing">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="space-y-10">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.35em] text-white/40">
              Pricing
            </p>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">
              Plans built for every vendor scale
            </h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {plans.map((plan, index) => (
              <motion.div
                className={`relative rounded-2xl border p-6 backdrop-blur-xl transition duration-300 hover:-translate-y-1 ${
                  plan.highlight
                    ? "border-amber-300/60 bg-amber-300/10"
                    : "border-white/10 bg-white/5"
                }`}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, ease: "easeOut", delay: 0.06 * index }}
                key={plan.name}
              >
                {plan.highlight ? (
                  <span className="absolute right-6 top-6 rounded-full border border-amber-300/40 bg-amber-300/20 px-3 py-1 text-xs font-semibold text-amber-200">
                    Popular
                  </span>
                ) : null}
                <p className="text-lg font-semibold text-white">{plan.name}</p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {plan.price}
                </p>
                <p className="mt-3 text-sm text-white/60">{plan.description}</p>
                <ul className="mt-6 space-y-3 text-sm text-white/70">
                  {plan.features.map((feature) => (
                    <li className="flex items-center gap-2" key={feature}>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-amber-300/30 bg-amber-300/10 text-amber-200">
                        <Check className="h-3 w-3" />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  className={`mt-8 w-full rounded-full px-4 py-2 text-sm font-semibold transition duration-300 hover:-translate-y-0.5 ${
                    plan.highlight
                      ? "bg-amber-300 text-black hover:shadow-[0_12px_24px_rgba(251,191,36,0.35)]"
                      : "border border-white/20 text-white/80 hover:border-white/40"
                  }`}
                  type="button"
                >
                  {plan.cta}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
