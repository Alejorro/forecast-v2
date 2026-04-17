import React, { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppProvider } from './context/AppContext'
import AppLayout from './components/AppLayout'
import LoginPage from './pages/LoginPage'
import TransactionsPage from './pages/TransactionsPage'
import OverviewPage from './pages/OverviewPage'
import PlansPage from './pages/PlansPage'
import ImportPage from './pages/ImportPage'
import BrandsPage from './pages/BrandsPage'
import SellersPage from './pages/SellersPage'
import PerformancePage from './pages/PerformancePage'

function AppContent() {
  const [currentPage, setCurrentPage] = useState('transactions')

  function renderPage() {
    switch (currentPage) {
      case 'overview':
        return <OverviewPage />
      case 'transactions':
        return <TransactionsPage />
      case 'plans':
        return <PlansPage />
      case 'brands':
        return <BrandsPage />
      case 'sellers':
        return <SellersPage />
      case 'import':
        return <ImportPage />
      case 'performance':
        return <PerformancePage />
      default:
        return <TransactionsPage />
    }
  }

  return (
    <AppLayout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </AppLayout>
  )
}

function AppRoot() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <span className="text-sm text-[#64748B]">Cargando...</span>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoot />
    </AuthProvider>
  )
}
