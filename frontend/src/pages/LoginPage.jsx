import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAuthenticated, startDemoAuth, startGoogleAuth } from "../utils/auth";

/**
 * Real Google OAuth sign-in. "Continue with Google" sends the browser to the
 * backend's /api/auth/google/start, and Google returns the user to
 * /auth/callback which completes the session.
 *
 * A demo fallback remains for when Google OAuth isn't configured on the
 * backend (it returns 503 AUTH_NOT_CONFIGURED in that case).
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  const [error, setError] = useState("");
  const [demoBusy, setDemoBusy] = useState(false);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  // Already signed in? Continue straight to the app.
  useEffect(() => {
    if (isAuthenticated()) navigateRef.current("/forecast", { replace: true });
  }, []);

  const handleDemo = async () => {
    setDemoBusy(true);
    try {
      await startDemoAuth();
      navigateRef.current("/profile", { replace: true });
    } catch {
      setError("Could not start the demo session. Make sure the backend is running, then retry.");
      setDemoBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="relative flex min-h-screen items-center justify-center px-6 py-16">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:40px_40px]" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-[28rem] w-[40rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.2),transparent_70%)] blur-3xl" />

        <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
          {/* Header */}
          <div className="mb-8 space-y-3 text-center">
            <img
              src="/logo-icon.png"
              alt="Bazaar Brain"
              className="mx-auto h-16 w-16 drop-shadow-[0_0_24px_rgba(251,191,36,0.35)]"
            />
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Welcome to Bazaar Brain
            </h1>
            <p className="text-sm text-white/60">
              Daily AI procurement intelligence for Hazratganj street vendors
            </p>
          </div>

          {error ? (
            <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-200">
              {error}
            </div>
          ) : null}

          {/* Primary Action: Google sign-in */}
          <button
            className="group relative flex w-full items-center justify-center gap-3.5 rounded-2xl bg-white px-6 py-4 text-sm font-semibold text-gray-900 shadow-xl transition-all duration-300 hover:bg-gray-100 hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99]"
            onClick={startGoogleAuth}
            type="button"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.97 11.97 0 0 0 0 10.76l3.98-3.09Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Secondary: demo fallback */}
          <button
            className="mt-4 block w-full text-center text-xs font-medium text-white/50 transition hover:text-amber-200 disabled:opacity-50"
            disabled={demoBusy}
            onClick={handleDemo}
            type="button"
          >
            {demoBusy ? "Starting demo session..." : "Or explore with a demo account"}
          </button>

          <div className="mt-8 flex items-center justify-center gap-2 border-t border-white/10 pt-6 text-xs text-white/40">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>Your Google account stays private — we only read your name, email and avatar</span>
          </div>
        </div>
      </div>
    </div>
  );
}
