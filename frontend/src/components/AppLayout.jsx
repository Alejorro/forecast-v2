import React from 'react'
import { useAppContext } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import t from '../utils/t'

const NAV_ITEMS = [
  { id: 'overview',     label: t.nav.overview },
  { id: 'transactions', label: t.nav.transactions },
  { id: 'plans',        label: t.nav.plans,    sellerHidden: true },
  { id: 'brands',       label: t.nav.brands },
  { id: 'sellers',      label: t.nav.sellers,  sellerHidden: true },
  { id: 'performance',  label: 'Performance' },
  { id: 'activity',     label: 'Actividad',    sellerHidden: true },
  { id: 'import',       label: t.nav.import,   adminOnly: true, hidden: true },
]

function UserBadge({ user, onLogout }) {
  const isSeller = user.role === 'seller'
  const isManager = user.role === 'manager'
  const name = isSeller ? user.sellerName : (user.username || 'Admin')

  const avatarClass = isSeller
    ? 'bg-blue-100 text-blue-700'
    : isManager
    ? 'bg-violet-100 text-violet-700'
    : 'bg-slate-200 text-slate-600'

  return (
    <div className="flex items-center gap-2.5 flex-shrink-0">
      <div className="flex items-center gap-2">
        <div className={['w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold', avatarClass].join(' ')}>
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold text-[#0F172A]">{name}</span>
          {isSeller && (
            <span className="text-[10px] text-[#64748B] font-medium uppercase tracking-wide">Vendedor</span>
          )}
          {isManager && (
            <span className="text-[10px] text-[#64748B] font-medium uppercase tracking-wide">Manager</span>
          )}
        </div>
      </div>
      <button
        onClick={onLogout}
        className="text-xs text-[#94A3B8] hover:text-[#64748B] px-2 py-1 rounded hover:bg-slate-100 transition-colors"
      >
        Salir
      </button>
    </div>
  )
}

export default function AppLayout({ currentPage, onNavigate, children }) {
  const { year, setYear, yearOptions } = useAppContext()
  const { user, logout } = useAuth()

  const isSeller = user?.role === 'seller'

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.hidden) return false
    if (item.sellerHidden && isSeller) return false
    return true
  })

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Top nav */}
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-40">
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center gap-8">
          {/* Left: logo/title */}
          <div className="flex-shrink-0 flex items-end gap-2">
            <img src="/dot4-logo.png" alt="DOT4" className="h-6 mb-0.5" />
            <span className="text-[#475569] text-sm font-semibold tracking-wide leading-none mb-1">Forecast</span>
          </div>

          {/* Center: nav links */}
          <nav className="flex items-center gap-1 flex-1">
            {visibleNav.map((item) => {
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

          {/* Right: year selector + user badge */}
          <div className="flex-shrink-0 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#64748B] font-medium">{t.year}</label>
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

            {user && (
              <>
                <div className="w-px h-5 bg-[#E2E8F0]" />
                <UserBadge user={user} onLogout={logout} />
              </>
            )}
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
