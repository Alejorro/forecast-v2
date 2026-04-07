import React from 'react'
import { useAppContext } from '../context/AppContext'

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'plans', label: 'Plans' },
  { id: 'brands', label: 'Brands' },
  { id: 'sellers', label: 'Sellers' },
  { id: 'import', label: 'Import' },
]

export default function AppLayout({ currentPage, onNavigate, children }) {
  const { year, setYear, yearOptions } = useAppContext()

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Top nav */}
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-40">
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center gap-8">
          {/* Left: logo/title */}
          <div className="flex-shrink-0">
            <span className="text-[#0F172A] font-bold text-base tracking-tight">
              DOT4 Forecast
            </span>
          </div>

          {/* Center: nav links */}
          <nav className="flex items-center gap-1 flex-1">
            {NAV_ITEMS.map((item) => {
              const isActive = currentPage === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={[
                    'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                    isActive
                      ? 'text-[#2563EB] bg-blue-50'
                      : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-50',
                  ].join(' ')}
                >
                  {item.label}
                </button>
              )
            })}
          </nav>

          {/* Right: year selector */}
          <div className="flex-shrink-0 flex items-center gap-2">
            <label className="text-xs text-[#64748B] font-medium">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="text-sm border border-[#E2E8F0] rounded-md px-2.5 py-1.5 bg-white text-[#0F172A] font-medium focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        {children}
      </main>
    </div>
  )
}
