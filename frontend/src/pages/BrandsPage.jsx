import React, { useState, useEffect, useCallback } from 'react'
import { useAppContext } from '../context/AppContext'
import { getBrands, getBrandSummary } from '../utils/api'
import { formatUSD } from '../utils/format'
import StageBadge from '../components/StageBadge'

// ─── Shared helpers ───────────────────────────────────────────────────────────

const STAGE_COLORS = {
  'Identified':  '#E5E7EB',
  'Proposal 25': '#93C5FD',
  'Proposal 50': '#3B82F6',
  'Proposal 75': '#1D4ED8',
  'Won':         '#16A34A',
}

function GapCell({ gap, className = '' }) {
  if (gap == null) return <span className={`text-slate-300 ${className}`}>—</span>
  if (gap > 0)     return <span className={`font-semibold text-red-700 tabular-nums ${className}`}>{formatUSD(gap)}</span>
  return               <span className={`font-semibold text-green-700 tabular-nums ${className}`}>{formatUSD(gap)}</span>
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({ label, value, color = 'text-[#0F172A]', loading }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg px-6 py-5">
      {loading ? (
        <div className="space-y-2">
          <div className="h-8 bg-slate-100 rounded animate-pulse w-3/4" />
          <div className="h-4 bg-slate-100 rounded animate-pulse w-1/2" />
        </div>
      ) : (
        <>
          <p className={`text-2xl font-bold tabular-nums ${color}`}>
            {value != null ? formatUSD(value) : '—'}
          </p>
          <p className="text-sm text-[#64748B] mt-1 font-medium">{label}</p>
        </>
      )}
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg p-6">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-5">
        {title}
      </h2>
      {children}
    </div>
  )
}

// ─── Quarterly Breakdown Table ────────────────────────────────────────────────

const TH       = 'px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right border-l border-slate-200'
const TH_FIRST = 'px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 text-left w-16'
const TD       = 'px-4 py-2 text-sm tabular-nums text-right text-slate-800 border-l border-slate-200'
const TD_FIRST = 'px-4 py-2 text-sm font-semibold text-slate-700 w-16'

function Dash() {
  return <span className="text-slate-300 font-normal">—</span>
}

function QuarterlyTable({ rows, fy, loading }) {
  if (loading) {
    return (
      <div className="space-y-1.5">
        {[1,2,3,4].map(i => <div key={i} className="h-8 bg-slate-50 rounded animate-pulse" />)}
      </div>
    )
  }

  const fyForecast = fy?.forecast ?? 0
  const fyPlan     = fy?.plan ?? null
  const fyWon      = fy?.won ?? 0
  const fyGap      = fy?.gap ?? null

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px]">
        <colgroup>
          <col className="w-16" />
          <col />
          <col />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className={TH_FIRST}>Q</th>
            <th className={TH}>Plan</th>
            <th className={TH}>Forecast</th>
            <th className={TH}>Won</th>
            <th className={TH}>Gap</th>
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((r, i) => (
            <tr key={r.quarter} className={`border-b border-slate-100 ${i % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
              <td className={TD_FIRST}>Q{r.quarter}</td>
              <td className={TD + ' text-slate-600'}>{r.plan != null ? formatUSD(r.plan) : <Dash />}</td>
              <td className={TD + ' font-medium text-slate-900'}>{r.forecast > 0 ? formatUSD(r.forecast) : <Dash />}</td>
              <td className={TD + ' text-green-700'}>{r.won > 0 ? formatUSD(r.won) : <Dash />}</td>
              <td className={TD}><GapCell gap={r.gap} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {/* FY summary row */}
          <tr className="border-t-2 border-slate-300 bg-slate-50/80">
            <td className={TD_FIRST + ' text-slate-900'}>FY</td>
            <td className={TD + ' font-semibold text-slate-700'}>{fyPlan != null ? formatUSD(fyPlan) : <Dash />}</td>
            <td className={TD + ' font-semibold text-slate-900'}>{fyForecast > 0 ? formatUSD(fyForecast) : <Dash />}</td>
            <td className={TD + ' font-semibold text-green-700'}>{fyWon > 0 ? formatUSD(fyWon) : <Dash />}</td>
            <td className={TD}><GapCell gap={fyGap} /></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── Pipeline by Stage (list) ─────────────────────────────────────────────────

function PipelineList({ stages, loading }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1,2,3].map(i => <div key={i} className="h-7 bg-slate-50 rounded animate-pulse" />)}
      </div>
    )
  }
  if (!stages || stages.length === 0) {
    return <p className="text-sm text-slate-400 py-4">No pipeline data.</p>
  }

  const total = stages.reduce((s, d) => s + d.weighted_total, 0)

  return (
    <div className="space-y-3">
      {stages.map(d => {
        const pct = total > 0 ? (d.weighted_total / total) * 100 : 0
        return (
          <div key={d.stage_label}>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: STAGE_COLORS[d.stage_label] || '#CBD5E1' }}
                />
                <span className="text-sm text-slate-700">{d.stage_label}</span>
              </div>
              <div className="text-right flex items-baseline gap-2">
                <span className="text-xs text-slate-400 tabular-nums">{formatUSD(d.weighted_total)}</span>
                <span className="text-sm font-medium text-slate-700 tabular-nums w-10 text-right">
                  {pct.toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: STAGE_COLORS[d.stage_label] || '#CBD5E1' }}
              />
            </div>
          </div>
        )
      })}
      <div className="pt-2 border-t border-slate-100 flex justify-between">
        <span className="text-xs text-slate-500">Total weighted</span>
        <span className="text-xs font-semibold text-slate-800 tabular-nums">{formatUSD(total)}</span>
      </div>
    </div>
  )
}

// ─── Top Transactions Table ───────────────────────────────────────────────────

function TopTransactionsTable({ rows, loading }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-slate-50 rounded animate-pulse" />)}
      </div>
    )
  }
  if (!rows || rows.length === 0) {
    return <p className="text-sm text-slate-400 py-4">No active transactions.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px]">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="pb-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Client</th>
            <th className="pb-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Seller</th>
            <th className="pb-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Stage</th>
            <th className="pb-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">TCV</th>
            <th className="pb-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Weighted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tx) => (
            <tr key={tx.id} className="border-b border-slate-100 last:border-0">
              <td className="py-3 pr-4 text-sm font-semibold text-slate-900 max-w-[180px]">
                <span className="block truncate" title={tx.client_name}>{tx.client_name}</span>
              </td>
              <td className="py-3 pr-4 text-sm text-slate-500">{tx.seller_name || '—'}</td>
              <td className="py-3 pr-4">
                <StageBadge stage={tx.stage_label} />
              </td>
              <td className="py-3 pr-4 text-sm text-right text-slate-700 tabular-nums font-medium">
                {formatUSD(tx.tcv)}
              </td>
              <td className="py-3 text-sm text-right font-semibold text-slate-900 tabular-nums">
                {formatUSD(tx.weighted_total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrandsPage() {
  const { year } = useAppContext()

  const [brands, setBrands]         = useState([])
  const [activeBrand, setActiveBrand] = useState(null)
  const [summary, setSummary]       = useState(null)
  const [loadingBrands, setLoadingBrands] = useState(true)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [error, setError]           = useState(null)

  // Load brand list once
  useEffect(() => {
    setLoadingBrands(true)
    getBrands()
      .then(data => {
        setBrands(data)
        if (data.length > 0) setActiveBrand(data[0].id)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoadingBrands(false))
  }, [])

  // Load summary whenever brand or year changes
  const fetchSummary = useCallback(() => {
    if (!activeBrand) return
    setLoadingSummary(true)
    setSummary(null)
    getBrandSummary(activeBrand, year)
      .then(setSummary)
      .catch(err => setError(err.message))
      .finally(() => setLoadingSummary(false))
  }, [activeBrand, year])

  useEffect(() => { fetchSummary() }, [fetchSummary])

  const loading = loadingSummary
  const gapColor = summary?.gap == null ? 'text-[#0F172A]'
    : summary.gap > 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[#0F172A]">Brands</h1>
        <p className="text-sm text-[#64748B] mt-0.5">Forecast performance by brand for {year}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Brand selector */}
      {!loadingBrands && (
        <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-0">
          {brands.map(b => {
            const isActive = b.id === activeBrand
            return (
              <button
                key={b.id}
                onClick={() => setActiveBrand(b.id)}
                className={[
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300',
                ].join(' ')}
              >
                {b.name}
              </button>
            )
          })}
        </div>
      )}

      {loadingBrands && (
        <div className="h-9 bg-slate-100 rounded animate-pulse w-64" />
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="FY Plan"             value={summary?.plan}     loading={loading} />
        <KPICard label="Weighted Forecast"   value={summary?.forecast} loading={loading} />
        <KPICard label="Won"                 value={summary?.won}      loading={loading} color="text-[#16A34A]" />
        <KPICard label="Gap (Plan − Forecast)" value={summary?.gap}   loading={loading} color={gapColor} />
      </div>

      {/* Quarterly breakdown — full width */}
      <Section title="Quarterly breakdown">
        <QuarterlyTable
          rows={summary?.quarterly_breakdown}
          fy={summary}
          loading={loading}
        />
      </Section>

      {/* Pipeline + Top transactions — two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2">
          <Section title="Pipeline by stage">
            <PipelineList stages={summary?.pipeline_by_stage} loading={loading} />
          </Section>
        </div>

        <div className="lg:col-span-3">
          <Section title="Top transactions">
            <TopTransactionsTable rows={summary?.top_transactions} loading={loading} />
          </Section>
        </div>
      </div>
    </div>
  )
}
