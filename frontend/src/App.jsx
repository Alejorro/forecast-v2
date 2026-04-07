import React, { useState } from 'react'
import { AppProvider } from './context/AppContext'
import AppLayout from './components/AppLayout'
import TransactionsPage from './pages/TransactionsPage'
import OverviewPage from './pages/OverviewPage'
import PlansPage from './pages/PlansPage'
import ImportPage from './pages/ImportPage'
import BrandsPage from './pages/BrandsPage'
import SellersPage from './pages/SellersPage'

function PlaceholderPage({ title }) {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[#0F172A]">{title}</h2>
        <p className="text-sm text-[#94A3B8] mt-1">Coming soon</p>
      </div>
    </div>
  )
}

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

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
