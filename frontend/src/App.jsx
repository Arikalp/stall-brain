import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import HomePage from './pages/HomePage'
import LandingPage from './pages/LandingPage'
import ProfilePage from './pages/ProfilePage'
import ForecastPage from './pages/ForecastPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import { isAuthenticated } from './utils/auth'

// Defined outside App so its component identity stays stable across renders.
// Defining it inside App remounts the whole protected page on every render,
// which resets page state and can trigger effect/update loops.
function RequireAuth({ authReady, isLoggedIn, children }) {
  if (!authReady) return null
  if (!isLoggedIn) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const location = useLocation()
  const [authReady, setAuthReady] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Session lives in localStorage and is minted by the backend after Google
    // OAuth (or via the demo fallback endpoint); login/logout dispatch
    // 'bb-auth-changed' so all listeners stay in sync.
    const syncAuth = () => {
      setIsLoggedIn(isAuthenticated())
      setAuthReady(true)
    }

    syncAuth()
    window.addEventListener('bb-auth-changed', syncAuth)
    // Also re-check on focus so expired sessions drop out promptly.
    window.addEventListener('focus', syncAuth)

    return () => {
      cancelled = true
      window.removeEventListener('bb-auth-changed', syncAuth)
      window.removeEventListener('focus', syncAuth)
    }
  }, [])

  return (
    <div className="relative min-h-screen bg-(--color-bg-base) text-(--color-text-primary)">
      <div className="app-background" />
      <div className="app-grid" />
      <div className="relative z-10 min-h-screen">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <Routes location={location}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/home" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />
              <Route
                path="/setup"
                element={
                  <RequireAuth authReady={authReady} isLoggedIn={isLoggedIn}>
                    <Navigate to="/profile" replace />
                  </RequireAuth>
                }
              />
              <Route
                path="/profile"
                element={
                  <RequireAuth authReady={authReady} isLoggedIn={isLoggedIn}>
                    <ProfilePage />
                  </RequireAuth>
                }
              />
              <Route
                path="/forecast"
                element={
                  <RequireAuth authReady={authReady} isLoggedIn={isLoggedIn}>
                    <ForecastPage />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
