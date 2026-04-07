import React, { createContext, useContext, useState, useEffect } from 'react'
import { getBrands, getSellers } from '../utils/api'

const AppContext = createContext(null)

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = [2024, 2025, 2026, 2027]

export function AppProvider({ children }) {
  const [year, setYear] = useState(CURRENT_YEAR)
  const [brands, setBrands] = useState([])
  const [sellers, setSellers] = useState([])
  const [loadingMeta, setLoadingMeta] = useState(true)

  useEffect(() => {
    async function loadMeta() {
      try {
        const [brandsData, sellersData] = await Promise.all([
          getBrands(),
          getSellers(),
        ])
        setBrands(brandsData || [])
        setSellers(sellersData || [])
      } catch (err) {
        console.error('Failed to load brands/sellers:', err)
      } finally {
        setLoadingMeta(false)
      }
    }
    loadMeta()
  }, [])

  return (
    <AppContext.Provider
      value={{
        year,
        setYear,
        yearOptions: YEAR_OPTIONS,
        brands,
        sellers,
        loadingMeta,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
