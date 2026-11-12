import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../utils/firebase";

const navItems = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsLoggedIn(Boolean(user));
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const handleNavClick = (event, href) => {
    event.preventDefault();
    const target = document.querySelector(href);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setIsOpen(false);
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-black/40 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <a
          className="group flex items-center gap-3 text-sm font-semibold tracking-wide text-white"
          href="#top"
          onClick={(event) => handleNavClick(event, "#top")}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-300/40 bg-amber-300/15 text-[0.7rem] font-bold text-amber-200 transition-transform duration-300 group-hover:scale-105">
            BB
          </span>
          <span className="text-base">Bazaar Brain</span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {navItems.map((item) => (
            <a
              className="text-sm text-white/70 transition duration-300 hover:text-white"
              href={item.href}
              key={item.href}
              onClick={(event) => handleNavClick(event, item.href)}
            >
              {item.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {authReady ? (
            isLoggedIn ? (
              <>
                <Link
                  className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition duration-300 hover:border-white/40 hover:text-white"
                  to="/profile"
                >
                  Profile
                </Link>
                <Link
                  className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-black transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(251,191,36,0.35)]"
                  to="/forecast"
                >
                  Get Forecast
                </Link>
              </>
            ) : (
              <Link
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 transition duration-300 hover:border-white/40 hover:text-white"
                to="/login"
              >
                Login
              </Link>
            )
          ) : null}
        </div>

        <button
          aria-expanded={isOpen}
          aria-label="Toggle navigation"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white transition duration-300 hover:border-white/40 md:hidden"
          onClick={() => setIsOpen((prev) => !prev)}
          type="button"
        >
          <span className="relative block h-4 w-5">
            <span
              className={`absolute left-0 top-0 h-0.5 w-full bg-white transition duration-300 ${
                isOpen ? "translate-y-[7px] rotate-45" : ""
              }`}
            />
            <span
              className={`absolute left-0 top-[7px] h-0.5 w-full bg-white transition duration-300 ${
                isOpen ? "opacity-0" : ""
              }`}
            />
            <span
              className={`absolute left-0 bottom-0 h-0.5 w-full bg-white transition duration-300 ${
                isOpen ? "-translate-y-[7px] -rotate-45" : ""
              }`}
            />
          </span>
        </button>
      </div>

      <div
        className={`border-t border-white/10 bg-black/70 px-6 pb-6 pt-4 backdrop-blur-xl transition-all duration-300 md:hidden ${
          isOpen ? "max-h-96 opacity-100" : "max-h-0 overflow-hidden opacity-0"
        }`}
      >
        <div className="flex flex-col gap-4">
          {navItems.map((item) => (
            <a
              className="text-sm text-white/70 transition duration-300 hover:text-white"
              href={item.href}
              key={item.href}
              onClick={(event) => handleNavClick(event, item.href)}
            >
              {item.label}
            </a>
          ))}
          <div className="flex flex-col gap-3 pt-2">
            {authReady ? (
              isLoggedIn ? (
                <>
                  <Link
                    className="w-full rounded-full border border-white/20 px-4 py-2 text-center text-sm font-semibold text-white/80 transition duration-300 hover:border-white/40 hover:text-white"
                    onClick={() => setIsOpen(false)}
                    to="/profile"
                  >
                    Profile
                  </Link>
                  <Link
                    className="w-full rounded-full bg-amber-300 px-4 py-2 text-center text-sm font-semibold text-black transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(251,191,36,0.35)]"
                    onClick={() => setIsOpen(false)}
                    to="/forecast"
                  >
                    Get Forecast
                  </Link>
                </>
              ) : (
                <Link
                  className="w-full rounded-full border border-white/10 px-4 py-2 text-center text-sm text-white/80 transition duration-300 hover:border-white/40 hover:text-white"
                  onClick={() => setIsOpen(false)}
                  to="/login"
                >
                  Login
                </Link>
              )
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
}
