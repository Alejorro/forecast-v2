import React, { useState, useEffect, useCallback } from 'react'
import { useAppContext } from '../context/AppContext'
import { getSellersSummary, getTransactions } from '../utils/api'
import { formatUSD } from '../utils/format'
import StageBadge from '../components/StageBadge'

// ─── Column style constants ───────────────────────────────────────────────────

const TH_LEFT  = 'px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 text-left'
const TH_RIGHT = 'px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right border-l border-slate-200'

// ─── Chevron icon ─────────────────────────────────────────────────────────────

function Chevron({ open }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform duration-150 shrink-0 ${open ? 'rotate-90 text-blue-500' : 'text-slate-400'}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

// ─── Expanded transactions sub-table ─────────────────────────────────────────

function SellerTransactions({ sellerId, year }) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    setLoading(true)
    getTransactions({ seller_id: sellerId, year })
      .then(data => setRows(Array.isArray(data) ? data : data?.transactions || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [sellerId, year])

  return (
    <div className="bg-slate-50 border-t border-slate-200 px-6 py-4">
      {error && <p className="text-sm text-red-500 py-2">{error}</p>}

      {loading ? (
        <div className="space-y-2 py-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-7 bg-slate-200/60 rounded animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-2">No transactions for this year.</p>
      ) : (
        <table className="w-full min-w-[540px]">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="pb-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Client</th>
              <th className="pb-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pl-4">Brand</th>
              <th className="pb-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pl-4">Stage</th>
              <th className="pb-2 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">TCV</th>
              <th className="pb-2 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider pl-4">Weighted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(tx => (
              <tr key={tx.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 text-sm font-medium text-slate-800 max-w-[180px]">
                  <span className="block truncate" title={tx.client_name}>{tx.client_name}</span>
                </td>
                <td className="py-2 pl-4 text-sm text-slate-500">{tx.brand_name || '—'}</td>
                <td className="py-2 pl-4">
                  <StageBadge stage={tx.stage_label} />
                </td>
                <td className="py-2 text-sm text-right tabular-nums text-slate-600 font-medium">
                  {formatUSD(tx.tcv)}
                </td>
                <td className="py-2 pl-4 text-sm text-right tabular-nums font-semibold text-slate-900">
                  {formatUSD(tx.weighted_total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Summary row ─────────────────────────────────────────────────────────────

function SummaryRow({ seller, expanded, onToggle }) {
  const { seller_name, deal_count, tcv_total, weighted_forecast, won, contribution_pct } = seller

  return (
    <tr
      onClick={onToggle}
      className={[
        'border-b border-slate-100 cursor-pointer transition-colors duration-100',
        expanded ? 'bg-blue-50/50' : 'hover:bg-slate-50/80',
      ].join(' ')}
    >
      {/* Seller */}
      <td className="px-4 py-3 text-sm font-semibold text-slate-900">
        <div className="flex items-center gap-2.5">
          <Chevron open={expanded} />
          {seller_name}
        </div>
      </td>

      {/* Deal count — lighter, secondary info */}
      <td className="px-4 py-3 text-sm text-right tabular-nums text-slate-400 border-l border-slate-200">
        {deal_count}
      </td>

      {/* TCV total — neutral */}
      <td className="px-4 py-3 text-sm text-right tabular-nums text-slate-600 border-l border-slate-200">
        {tcv_total > 0 ? formatUSD(tcv_total) : <span className="text-slate-300">—</span>}
      </td>

      {/* Weighted forecast — primary signal */}
      <td className="px-4 py-3 text-sm text-right tabular-nums font-bold text-slate-900 border-l border-slate-200">
        {weighted_forecast > 0 ? formatUSD(weighted_forecast) : <span className="text-slate-300 font-normal">—</span>}
      </td>

      {/* Won — green, strong */}
      <td className="px-4 py-3 text-sm text-right tabular-nums border-l border-slate-200">
        {won > 0
          ? <span className="font-semibold text-green-700">{formatUSD(won)}</span>
          : <span className="text-slate-300">—</span>
        }
      </td>

      {/* Contribution % — bar + number */}
      <td className="px-4 py-3 border-l border-slate-200">
        <div className="flex items-center justify-end gap-3">
          <div className="w-20 h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full"
              style={{ width: `${Math.min(contribution_pct, 100)}%` }}
            />
          </div>
          <span className="text-sm tabular-nums text-slate-700 font-medium w-10 text-right">
            {contribution_pct.toFixed(1)}%
          </span>
        </div>
      </td>
    </tr>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SellersPage() {
  const { year } = useAppContext()

  const [sellers, setSellers]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  const fetchSummary = useCallback(() => {
    setLoading(true)
    setError(null)
    getSellersSummary(year)
      .then(setSellers)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [year])

  useEffect(() => {
    setExpandedId(null)
    fetchSummary()
  }, [fetchSummary])

  function toggleExpand(id) {
    setExpandedId(prev => prev === id ? null : id)
  }

  // Sort: weighted forecast DESC (ranking table)
  const sorted = [...sellers].sort((a, b) => b.weighted_forecast - a.weighted_forecast)

  // Totals
  const totals = sellers.reduce(
    (acc, s) => ({
      deals:    acc.deals    + s.deal_count,
      tcv:      acc.tcv      + s.tcv_total,
      forecast: acc.forecast + s.weighted_forecast,
      won:      acc.won      + s.won,
    }),
    { deals: 0, tcv: 0, forecast: 0, won: 0 }
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#0F172A]">Sellers</h1>
        <p className="text-sm text-[#64748B] mt-0.5">Seller contribution for {year}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Table card */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className={TH_LEFT}>Seller</th>
              <th className={TH_RIGHT}>Deals</th>
              <th className={TH_RIGHT}>TCV Total</th>
              <th className={TH_RIGHT}>Weighted Forecast</th>
              <th className={TH_RIGHT}>Won</th>
              <th className={TH_RIGHT}>Contribution</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center text-sm text-slate-400">
                  Loading sellers...
                </td>
              </tr>
            ) : sellers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-14 text-center text-sm text-slate-400">
                  No sellers found.
                </td>
              </tr>
            ) : (
              sorted.map(seller => (
                <React.Fragment key={seller.seller_id}>
                  <SummaryRow
                    seller={seller}
                    expanded={expandedId === seller.seller_id}
                    onToggle={() => toggleExpand(seller.seller_id)}
                  />
                  {expandedId === seller.seller_id && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <SellerTransactions sellerId={seller.seller_id} year={year} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>

          {/* Totals footer */}
          {!loading && sellers.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-400 bg-slate-100">
                <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Total
                </td>
                <td className="px-4 py-3 text-sm text-right tabular-nums font-semibold text-slate-500 border-l border-slate-200">
                  {totals.deals}
                </td>
                <td className="px-4 py-3 text-sm text-right tabular-nums font-semibold text-slate-700 border-l border-slate-200">
                  {formatUSD(totals.tcv)}
                </td>
                <td className="px-4 py-3 text-sm text-right tabular-nums font-bold text-slate-900 border-l border-slate-200">
                  {formatUSD(totals.forecast)}
                </td>
                <td className="px-4 py-3 text-sm text-right tabular-nums font-bold text-green-700 border-l border-slate-200">
                  {totals.won > 0 ? formatUSD(totals.won) : <span className="text-slate-300 font-normal">—</span>}
                </td>
                <td className="px-4 py-3 text-sm text-right tabular-nums font-semibold text-slate-500 border-l border-slate-200">
                  100%
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {!loading && sellers.length > 0 && (
        <p className="mt-3 text-xs text-slate-400">
          Click a row to see that seller's transactions.
        </p>
      )}
    </div>
  )
}
