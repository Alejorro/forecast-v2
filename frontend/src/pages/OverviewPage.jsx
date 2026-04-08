import React, { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, CartesianGrid,
} from 'recharts'
import { useAppContext } from '../context/AppContext'
import { getOverview } from '../utils/api'
import { formatUSD } from '../utils/format'
import StageBadge from '../components/StageBadge'

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({ label, value, loading, color }) {
  const colorMap = {
    default: 'text-[#0F172A]',
    success: 'text-[#16A34A]',
    warning: 'text-[#F59E0B]',
    danger:  'text-[#DC2626]',
    neutral: 'text-[#94A3B8]',
  }
  const textColor = colorMap[color] || colorMap.default

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg px-6 py-5">
      {loading ? (
        <div className="space-y-2">
          <div className="h-8 bg-slate-100 rounded animate-pulse w-3/4" />
          <div className="h-4 bg-slate-100 rounded animate-pulse w-1/2" />
        </div>
      ) : (
        <>
          <p className={`text-2xl font-bold tabular-nums ${textColor}`}>
            {value != null ? formatUSD(value) : '—'}
          </p>
          <p className="text-sm text-[#64748B] mt-1 font-medium">{label}</p>
        </>
      )}
    </div>
  )
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({ title, subtitle, children }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg p-6">
      <div className="mb-5">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// ─── Chart: Plan vs Forecast vs Won by Quarter ────────────────────────────────

const QUARTERLY_COLORS = {
  plan:     '#FB923C', // orange-400 — neutral but distinct from forecast/won
  forecast: '#2563EB', // blue-600
  won:      '#16A34A', // green-600
}

function formatK(val) {
  if (val == null) return ''
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000)     return `$${(val / 1_000).toFixed(0)}K`
  return `$${val}`
}

function QuarterlyLegend({ payload }) {
  if (!payload?.length) return null
  return (
    <div className="flex items-center justify-center gap-7 pt-5">
      {payload.map(entry => (
        <div key={entry.value} className="flex items-center gap-2.5">
          <div
            className="rounded-sm shrink-0"
            style={{ width: 14, height: 14, backgroundColor: entry.color }}
          />
          <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

function QuarterlyChart({ data }) {
  if (!data || data.length === 0) return (
    <p className="text-sm text-slate-400 text-center py-8">No data available.</p>
  )
  const chartData = data.map(d => ({
    name: `Q${d.quarter}`,
    Plan:     d.plan     ?? 0,
    Forecast: d.forecast ?? 0,
    Won:      d.won      ?? 0,
  }))

  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart data={chartData} barGap={3} barCategoryGap="10%">
        <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="0" />
        <XAxis
          dataKey="name"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: '#64748B', fontWeight: 600 }}
        />
        <YAxis
          tickFormatter={formatK}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: '#94A3B8' }}
          width={56}
        />
        <Tooltip
          formatter={(val, name) => [formatUSD(val), name]}
          labelStyle={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}
          itemStyle={{ fontSize: 13, color: '#334155', padding: '1px 0' }}
          contentStyle={{
            border: '1px solid #CBD5E1',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
            padding: '10px 14px',
            backgroundColor: '#fff',
          }}
          cursor={{ fill: 'rgba(148, 163, 184, 0.07)' }}
        />
        <Legend content={<QuarterlyLegend />} />
        <Bar dataKey="Plan"     fill={QUARTERLY_COLORS.plan}     radius={[3,3,0,0]} />
        <Bar dataKey="Forecast" fill={QUARTERLY_COLORS.forecast} radius={[3,3,0,0]} />
        <Bar dataKey="Won"      fill={QUARTERLY_COLORS.won}      radius={[3,3,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Chart: Gap by Brand (horizontal bars) ────────────────────────────────────

function GapByBrandChart({ data }) {
  if (!data || data.length === 0) return (
    <p className="text-sm text-slate-400 text-center py-8">No data available.</p>
  )

  // Sort: most behind (highest positive gap) first, no-plan rows last
  const sorted = [...data].sort((a, b) => {
    if (a.gap == null && b.gap == null) return 0
    if (a.gap == null) return 1
    if (b.gap == null) return -1
    return b.gap - a.gap
  })

  return (
    <div className="space-y-5">
      {sorted.map(d => {
        const noPlan   = d.plan == null
        const forecast = (!noPlan && d.gap != null) ? d.plan - d.gap : null
        const progressPct = (!noPlan && forecast != null && d.plan > 0)
          ? Math.max(0, Math.min((forecast / d.plan) * 100, 100))
          : 0
        const behind = d.gap != null && d.gap > 0
        const ahead  = d.gap != null && d.gap <= 0

        return (
          <div key={d.brand_id} className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-700 font-medium w-24 shrink-0 truncate" title={d.brand_name}>
                {d.brand_name}
              </span>
              {noPlan ? (
                <span className="text-xs text-slate-400 italic flex-1">No plan</span>
              ) : (
                <>
                  <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${ahead ? 'bg-green-500' : 'bg-blue-500'}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums font-medium w-9 text-right shrink-0">
                    {Math.round(progressPct)}%
                  </span>
                </>
              )}
              <span className={`text-sm tabular-nums font-semibold w-28 text-right shrink-0 ${
                noPlan ? 'text-slate-300' : behind ? 'text-red-600' : 'text-green-700'
              }`}>
                {noPlan ? '—' : formatUSD(d.gap)}
              </span>
            </div>
            {!noPlan && forecast != null && (
              <p className="text-xs text-slate-500 tabular-nums pl-[6.75rem]">
                {formatUSD(forecast)} forecast · {formatUSD(d.plan)} plan
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Chart: Pipeline by Stage (donut) ────────────────────────────────────────

const STAGE_COLORS = {
  'Identified':  '#FED7AA', // orange-200 — softest, early stage
  'Proposal 25': '#FB923C', // orange-400
  'Proposal 50': '#60A5FA', // blue-400
  'Proposal 75': '#2563EB', // blue-600
  'Won':         '#16A34A', // green-600 — always distinct
}

// Display-only label normalization — scoped to this card only
function formatStageLabel(label) {
  if (label === 'Won')        return 'Won 100%'
  if (label === 'Identified') return 'Identified 10%'
  if (label.startsWith('Proposal ')) return label + '%'
  return label
}

const STAGE_ORDER = { 'Won': 0, 'Proposal 75': 1, 'Proposal 50': 2, 'Proposal 25': 3, 'Identified': 4 }

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-md px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-slate-800">{formatStageLabel(name)}</p>
      <p className="text-slate-600 mt-0.5">{formatUSD(value)}</p>
    </div>
  )
}

function PipelineDonut({ data }) {
  if (!data || data.length === 0) return (
    <p className="text-sm text-slate-400 text-center py-8">No pipeline data.</p>
  )
  const chartData = data.map(d => ({
    name:  d.stage_label,
    value: d.weighted_total,
  }))
  const total = chartData.reduce((s, d) => s + d.value, 0)
  const sortedData = [...chartData].sort((a, b) =>
    (STAGE_ORDER[a.name] ?? 99) - (STAGE_ORDER[b.name] ?? 99)
  )

  return (
    <div className="flex items-center gap-3">
      <div className="shrink-0" style={{ width: 240, height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={74}
              outerRadius={108}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={STAGE_COLORS[entry.name] || '#CBD5E1'} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex-1 min-w-0">
        <div className="space-y-2">
          {sortedData.map(d => {
            const pct = total > 0 ? ((d.value / total) * 100).toFixed(0) : 0
            return (
              <div key={d.name} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: STAGE_COLORS[d.name] || '#CBD5E1' }}
                  />
                  <span className="text-[13px] text-slate-500 font-medium truncate">
                    {formatStageLabel(d.name)}
                  </span>
                </div>
                <div className="flex items-baseline gap-2.5 shrink-0">
                  <span className="text-sm font-bold text-slate-900 tabular-nums">{pct}%</span>
                  <span className="text-[13px] text-slate-400 tabular-nums w-24 text-right">{formatUSD(d.value)}</span>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-between items-baseline">
          <span className="text-[13px] text-slate-500">Total</span>
          <span className="text-sm font-semibold text-slate-800 tabular-nums">{formatUSD(total)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Top Opportunities Table ──────────────────────────────────────────────────

function TopOpportunitiesTable({ rows, onEdit }) {
  const [hovered, setHovered] = useState(null)

  if (!rows || rows.length === 0) return (
    <p className="text-sm text-slate-400 text-center py-6">No active opportunities.</p>
  )

  return (
    <div className="overflow-x-auto -mx-6 px-6">
      <table className="w-full min-w-[560px]">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="pb-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Client</th>
            <th className="pb-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Brand</th>
            <th className="pb-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Stage</th>
            <th className="pb-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">TCV</th>
            <th className="pb-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Weighted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tx) => (
            <tr
              key={tx.id}
              onMouseEnter={() => setHovered(tx.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onEdit?.(tx)}
              className={`border-b border-slate-100 last:border-0 cursor-pointer transition-colors ${
                hovered === tx.id ? 'bg-slate-50' : ''
              }`}
            >
              <td className="py-3 pr-4 text-sm font-semibold text-slate-900 max-w-[180px]">
                <span className="block truncate" title={tx.client_name}>{tx.client_name}</span>
              </td>
              <td className="py-3 pr-4 text-sm text-slate-500">{tx.brand_name || '—'}</td>
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

export default function OverviewPage() {
  const { year } = useAppContext()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getOverview(year)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [year])

  const gap = data?.total_gap
  const gapColor = gap == null ? 'default' : gap > 0 ? 'danger' : 'success'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[#0F172A]">Overview</h1>
        <p className="text-sm text-[#64748B] mt-0.5">Forecast summary for {year}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Plan"           value={data?.total_plan}               loading={loading} color="default" />
        <KPICard label="FY Forecast"           value={data?.total_weighted_forecast}  loading={loading} color="default" />
        <KPICard label="Total Won"            value={data?.total_won}                loading={loading} color="success" />
        <KPICard label="Gap (Plan − Forecast)" value={gap}                           loading={loading} color={gapColor} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Plan vs Forecast vs Won by Quarter">
          {loading ? (
            <div className="h-48 bg-slate-50 rounded animate-pulse" />
          ) : (
            <QuarterlyChart data={data?.quarterly_breakdown} />
          )}
        </Section>

        <Section title="Pipeline by Stage">
          {loading ? (
            <div className="h-48 bg-slate-50 rounded animate-pulse" />
          ) : (
            <PipelineDonut data={data?.pipeline_by_stage} />
          )}
        </Section>
      </div>

      {/* Gap by brand — full width */}
      <Section title="Gap by Brand" subtitle={`FY ${year}`}>
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-5 bg-slate-50 rounded animate-pulse" />)}
          </div>
        ) : (
          <GapByBrandChart data={data?.gap_by_brand} />
        )}
      </Section>

      {/* Top Opportunities */}
      <Section title="Top 5 Active Opportunities">
        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-slate-50 rounded animate-pulse" />)}
          </div>
        ) : (
          <TopOpportunitiesTable rows={data?.top_opportunities} />
        )}
      </Section>
    </div>
  )
}
