import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { consumeOAuthResult, setSession } from "../utils/auth";

/**
 * Landing point for Google's OAuth redirect: <FRONTEND_URL>/auth/callback.
 *
 * The backend appends the session token in the URL fragment (#token=...),
 * or an error code (#error=CODE) when the flow fails. We consume it here,
 * persist the session, then route the user:
 *   - returning user (a session existed before) -> /forecast (dashboard)
 *   - brand-new user                            -> /profile setup
 */
const ERROR_MESSAGES = {
  OAUTH_MISSING_PARAMS: "Google didn't return the expected sign-in data. Please try again.",
  OAUTH_BAD_STATE: "The sign-in request could not be verified. Please try again.",
  OAUTH_STATE_EXPIRED: "The sign-in request timed out. Please try again.",
  OAUTH_TOKEN_EXCHANGE_FAILED: "Google sign-in could not be completed. Please try again.",
  OAUTH_PROFILE_FAILED: "Could not read your Google profile. Please try again.",
  AUTH_NOT_CONFIGURED: "Google sign-in is not configured on the server yet.",
  access_denied: "Google sign-in was cancelled.",
};

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const hadSession = Boolean(localStorage.getItem("bb_session"));
    const { token, error: oauthError } = consumeOAuthResult();

    if (oauthError) {
      setError(ERROR_MESSAGES[oauthError] ?? `Sign-in failed (${oauthError}).`);
      return;
    }

    try {
      setSession(token);
    } catch {
      setError("Google signed you in, but the session token was invalid. Please try again.");
      return;
    }

    navigate(hadSession ? "/forecast" : "/profile", { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="relative flex min-h-screen items-center justify-center px-6 py-16">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:40px_40px]" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-[28rem] w-[40rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.2),transparent_70%)] blur-3xl" />

        <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur-xl">
          <img
            src="/logo-icon.png"
            alt="Bazaar Brain"
            className="mx-auto mb-6 h-16 w-16 drop-shadow-[0_0_24px_rgba(251,191,36,0.35)]"
          />

          {error ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-200">
                {error}
              </div>
              <button
                className="block w-full rounded-full bg-amber-300 px-4 py-3 text-sm font-semibold text-black transition hover:-translate-y-0.5"
                onClick={() => navigate("/login", { replace: true })}
                type="button"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-amber-300" />
              <p className="text-sm text-white/60">Finishing Google sign-in...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
