import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { auth } from "../utils/firebase";

function GoogleIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function getPostAuthRoute(user) {
  if (!user) return "/signup";
  const { creationTime, lastSignInTime } = user.metadata ?? {};
  const isFirstLogin =
    Boolean(creationTime && lastSignInTime) && creationTime === lastSignInTime;
  return isFirstLogin ? "/profile" : "/forecast";
}

export default function SignupPage() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    let active = true;
    getRedirectResult(auth)
      .then((result) => {
        if (!active) return;
        if (result?.user) {
          navigateRef.current(getPostAuthRoute(result.user));
        }
      })
      .catch((authError) => {
        if (!active) return;
        setError(authError.message || "Google sign-up failed.");
      });

    return () => {
      active = false;
    };
  }, []);

  const handleGoogleSignup = async () => {
    setError("");
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(auth, provider);
      navigate(getPostAuthRoute(credential.user));
    } catch (authError) {
      if (authError?.code === "auth/popup-closed-by-user") {
        setIsLoading(false);
        return;
      }
      const shouldRedirect =
        authError?.code === "auth/popup-blocked" ||
        authError?.code === "auth/operation-not-supported-in-this-environment" ||
        authError?.message?.includes("Pending promise");

      if (shouldRedirect) {
        try {
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: "select_account" });
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectError) {
          setError(redirectError.message || "Google sign-up failed.");
        }
      } else {
        if (authError?.code === "auth/unauthorized-domain") {
          setError(
            `Domain "${window.location.hostname}" is not authorized in Firebase Console. Add it under Authentication -> Settings -> Authorized Domains.`
          );
        } else {
          setError(authError.message || "Google sign-up failed.");
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      navigate(getPostAuthRoute(credential.user));
    } catch (authError) {
      setError(authError.message || "Unable to sign up.");
    } finally {
      setIsLoading(false);
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
              Create Your Account
            </h1>
            <p className="text-sm text-white/60">
              Join Bazaar Brain for intelligent stall procurement and profit optimization
            </p>
          </div>

          {error ? (
            <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-200">
              {error}
            </div>
          ) : null}

          {/* Primary Action: Google OAuth */}
          <div className="space-y-4">
            <button
              className="group relative flex w-full items-center justify-center gap-3.5 rounded-2xl bg-white px-6 py-4 text-sm font-semibold text-gray-900 shadow-xl transition-all duration-300 hover:bg-gray-100 hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isLoading}
              onClick={handleGoogleSignup}
              type="button"
            >
              <GoogleIcon className="h-5 w-5 shrink-0" />
              <span>{isLoading ? "Connecting to Google..." : "Continue with Google"}</span>
            </button>

            <div className="flex items-center justify-center gap-2 text-xs text-white/40">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Instant 1-click registration • Secure OAuth 2.0</span>
            </div>
          </div>

          {/* Fallback Email/Password Toggle */}
          <div className="mt-8 border-t border-white/10 pt-6">
            {!showEmailForm ? (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setShowEmailForm(true)}
                  className="text-xs text-white/40 transition hover:text-white/70"
                >
                  Or register with email and password →
                </button>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleEmailSubmit}>
                <div className="space-y-1.5">
                  <label
                    className="text-xs uppercase tracking-[0.2em] text-white/50"
                    htmlFor="email"
                  >
                    Email
                  </label>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300/50 focus:ring-2 focus:ring-amber-300/20"
                    id="email"
                    name="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="vendor@bazaar.in"
                    type="email"
                    value={email}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    className="text-xs uppercase tracking-[0.2em] text-white/50"
                    htmlFor="password"
                  >
                    Password
                  </label>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300/50 focus:ring-2 focus:ring-amber-300/20"
                    id="password"
                    name="password"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Create a password (min 6 chars)"
                    type="password"
                    value={password}
                    required
                  />
                </div>

                <button
                  className="w-full rounded-2xl bg-amber-300/20 border border-amber-300/40 px-4 py-3 text-sm font-semibold text-amber-200 transition hover:bg-amber-300/30 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isLoading}
                  type="submit"
                >
                  {isLoading ? "Creating account..." : "Sign Up with Email"}
                </button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setShowEmailForm(false)}
                    className="text-xs text-white/40 hover:text-white/60"
                  >
                    ← Back to Google sign up
                  </button>
                </div>
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-white/40">
            Already have an account?{" "}
            <Link className="text-amber-200 transition hover:text-amber-100" to="/login">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
