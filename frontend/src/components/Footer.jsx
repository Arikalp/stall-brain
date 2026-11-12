const productLinks = ["Forecast", "Dashboard", "Pricing", "Support"];
const companyLinks = ["About", "Careers", "Partners", "Contact"];
const socialLinks = ["LinkedIn", "Twitter", "YouTube", "Instagram"];

export default function Footer() {
  return (
    <footer className="pb-4 pt-10">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
          <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-white">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-300/40 bg-amber-300/10 text-xs font-semibold text-amber-200">
                  BB
                </span>
                <span className="text-lg font-semibold">Bazaar Brain</span>
              </div>
              <p className="max-w-xs text-sm text-white/60">
                AI forecasting to help vendors plan, stock, and sell smarter every day.
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-3">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                  Product
                </p>
                <ul className="space-y-2 text-sm text-white/60">
                  {productLinks.map((item) => (
                    <li key={item}>
                      <a className="transition hover:text-white" href="#">
                        {item}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                  Company
                </p>
                <ul className="space-y-2 text-sm text-white/60">
                  {companyLinks.map((item) => (
                    <li key={item}>
                      <a className="transition hover:text-white" href="#">
                        {item}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                  Social
                </p>
                <ul className="space-y-2 text-sm text-white/60">
                  {socialLinks.map((item) => (
                    <li key={item}>
                      <a className="transition hover:text-white" href="#">
                        {item}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-10 h-px w-full bg-white/10" />
          <p className="mt-6 text-xs uppercase tracking-[0.3em] text-white/40">
            © 2026 Bazaar Brain. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
