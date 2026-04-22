import React, { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from 'recharts'
import { useAppContext } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { getPerformance } from '../utils/api'
import { formatUSD } from '../utils/format'
import StageBadge from '../components/StageBadge'

const STAGE_COLORS = {
  'Identified':  '#94A3B8',
  'Proposal 25': '#60A5FA',
  'Proposal 50': '#3B82F6',
  'Proposal 75': '#2563EB',
  'Won':         '#16A34A',
}

function formatK(val) {
  if (val == null) return ''
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000)     return `$${(val / 1_000).toFixed(0)}K`
  return `$${val}`
}

function SummaryCard({ label, value, sub, color }) {
  const colors = {
    default: 'text-[#0F172A]',
    success: 'text-[#16A34A]',
    danger:  'text-[#DC2626]',
    warning: 'text-[#F59E0B]',
    muted:   'text-[#94A3B8]',
  }
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg px-5 py-4">
      <p className={`text-2xl font-bold tabular-nums ${colors[color] || colors.default}`}>{value}</p>
      <p className="text-sm text-[#64748B] mt-0.5 font-medium">{label}</p>
      {sub && <p className="text-xs text-[#94A3B8] mt-0.5">{sub}</p>}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg p-6">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-5">{title}</h2>
      {children}
    </div>
  )
}

export default function PerformancePage() {
  const { year, sellers } = useAppContext()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'manager'

  const [sellerFilter, setSellerFilter] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isAdmin && !sellerFilter) {
      setData(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const params = { year }
    if (isAdmin && sellerFilter) params.seller_id = sellerFilter
    getPerformance(params)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [year, sellerFilter, isAdmin])

  const s = data?.summary

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-slate-900">Performance</h1>
        {isAdmin && (
          <select
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
            className="border border-slate-300 rounded-md px-2.5 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
          >
            <option value="">Seleccioná un vendedor...</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {isAdmin && !sellerFilter && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-4xl mb-4">👤</div>
          <p className="text-slate-600 font-medium text-base">Seleccioná un vendedor para ver su performance</p>
          <p className="text-slate-400 text-sm mt-1">Usá el selector de arriba para elegir un vendedor</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-3">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {(!isAdmin || sellerFilter) && (loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white border border-[#E2E8F0] rounded-lg px-5 py-4">
              <div className="h-8 bg-slate-100 rounded animate-pulse w-3/4 mb-2" />
              <div className="h-4 bg-slate-100 rounded animate-pulse w-1/2" />
            </div>
          ))}
        </div>
      ) : s ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <SummaryCard label="Transacciones" value={s.total} />
          <SummaryCard label="TCV Total" value={formatK(s.total_tcv)} />
          <SummaryCard label="Ganadas" value={s.won_count} sub={formatK(s.won_tcv)} color="success" />
          <SummaryCard label="Abiertas" value={s.open_count} sub={formatK(s.open_tcv)} />
          <SummaryCard label="Win Rate" value={`${s.win_rate}%`} color={s.win_rate >= 50 ? 'success' : 'warning'} />
          <SummaryCard label="Perdidas" value={s.loss_count} sub={formatK(s.loss_tcv)} color="danger" />
        </div>
      ) : null)}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stage chart */}
          <Section title="Por etapa">
            {data.by_stage.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.by_stage} margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#F1F5F9" />
                  <XAxis
                    dataKey="stage_label"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={formatK}
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                  />
                  <Tooltip
                    formatter={(val) => [formatUSD(val), 'TCV']}
                    contentStyle={{ fontSize: 12, border: '1px solid #E2E8F0', borderRadius: 6 }}
                  />
                  <Bar dataKey="tcv" radius={[4, 4, 0, 0]}>
                    {data.by_stage.map((entry) => (
                      <Cell
                        key={entry.stage_label}
                        fill={STAGE_COLORS[entry.stage_label] || '#CBD5E1'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Section>

          {/* By brand */}
          <Section title="Por brand">
            {data.by_brand.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Sin datos</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Brand</th>
                      <th className="text-right py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cotizado</th>
                      <th className="text-right py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ganado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_brand.map((row) => (
                      <tr key={row.brand_name} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 font-medium text-slate-700">{row.brand_name}</td>
                        <td className="py-2 text-right tabular-nums text-slate-600">{formatUSD(row.quoted_tcv)}</td>
                        <td className="py-2 text-right tabular-nums text-green-700 font-medium">{row.won_tcv > 0 ? formatUSD(row.won_tcv) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}

      {/* Top open transactions */}
      {data?.top_open?.length > 0 && (
        <Section title="Top oportunidades abiertas">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cliente</th>
                  <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Brand</th>
                  <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Etapa</th>
                  <th className="text-right py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">TCV</th>
                  <th className="text-right py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ponderado</th>
                </tr>
              </thead>
              <tbody>
                {data.top_open.map((tx) => (
                  <tr key={tx.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 font-medium text-slate-700 max-w-[200px] truncate">{tx.client_name}</td>
                    <td className="py-2 text-slate-500">{tx.brand_name}</td>
                    <td className="py-2"><StageBadge stage={tx.stage_label} /></td>
                    <td className="py-2 text-right tabular-nums text-slate-700">{formatUSD(tx.tcv)}</td>
                    <td className="py-2 text-right tabular-nums text-blue-700 font-medium">{formatUSD(tx.weighted_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  )
}
