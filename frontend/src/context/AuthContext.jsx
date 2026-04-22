import React, { createContext, useContext, useState, useEffect } from 'react'
import { getMe, login as apiLogin, logout as apiLogout } from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionMessage, setSessionMessage] = useState(null)

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    function handleExpired() {
      setUser(null)
      setSessionMessage('Tu sesión fue cerrada por el administrador. Por favor volvé a ingresar.')
    }
    window.addEventListener('session-expired', handleExpired)
    return () => window.removeEventListener('session-expired', handleExpired)
  }, [])

  async function login(username, password) {
    const u = await apiLogin(username, password)
    setUser(u)
    return u
  }

  async function logout() {
    await apiLogout()
    setUser(null)
    setSessionMessage(null)
  }

  function clearSessionMessage() {
    setSessionMessage(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, sessionMessage, clearSessionMessage }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
