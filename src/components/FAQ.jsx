import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    question: "How accurate is the forecast?",
    answer:
      "Forecasts typically land within 90-95% accuracy when enough historical signals are available.",
  },
  {
    question: "How does weather affect predictions?",
    answer:
      "We blend local temperature, rain, and wind shifts into demand signals to adjust stocking.",
  },
  {
    question: "Can I edit products?",
    answer:
      "Yes, you can adjust items and quantities any time before generating a forecast.",
  },
  {
    question: "Does it support all vendors?",
    answer:
      "Bazaar Brain supports most street food and goods vendors. We keep adding profiles monthly.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Your data is encrypted in transit and access is limited to your account only.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="py-20 sm:py-24" id="faq">
      <div className="mx-auto w-full max-w-4xl px-6">
        <div className="space-y-10">
          <motion.div
            className="space-y-3"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <p className="text-xs uppercase tracking-[0.35em] text-white/40">
              FAQ
            </p>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">
              Answers to common questions
            </h2>
          </motion.div>
          <div className="space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = index === openIndex;
              return (
                <div
                  className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl"
                  key={faq.question}
                >
                  <button
                    className="flex w-full items-center justify-between text-left"
                    onClick={() =>
                      setOpenIndex(isOpen ? -1 : index)
                    }
                    type="button"
                  >
                    <span className="text-base font-semibold text-white">
                      {faq.question}
                    </span>
                    <ChevronDown
                      className={`h-5 w-5 text-white/60 transition duration-300 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <div
                    className={`overflow-hidden text-sm text-white/60 transition-all duration-300 ${
                      isOpen ? "max-h-32 opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <p className="pt-3">{faq.answer}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
