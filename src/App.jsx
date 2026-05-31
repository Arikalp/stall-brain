import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './utils/firebase'
import HomePage from './pages/HomePage'
import LandingPage from './pages/LandingPage'
import SetupPage from './pages/SetupPage'
import ForecastPage from './pages/ForecastPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'

export default function App() {
  const location = useLocation()
  const [authReady, setAuthReady] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsLoggedIn(Boolean(user))
      setAuthReady(true)
    })

    return () => unsubscribe()
  }, [])

  const RequireAuth = ({ children }) => {
    if (!authReady) return null
    if (!isLoggedIn) return <Navigate to="/login" replace />
    return children
  }

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
              <Route
                path="/setup"
                element={
                  <RequireAuth>
                    <SetupPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/forecast"
                element={
                  <RequireAuth>
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
