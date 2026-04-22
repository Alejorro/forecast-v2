import React, { useState, useEffect, useCallback } from 'react'
import { useAppContext } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { getVentas, syncVentas, getVentasSellers, getVentasBrands } from '../utils/api'
import { formatUSD } from '../utils/format'
import VentasDrawer from '../components/VentasDrawer'
import t from '../utils/t'

const tv = t.ventas
const INVOICE_STATUS_OPTIONS = [
  { value: 'invoiced',   label: tv.invoiceStatus.invoiced },
  { value: 'to invoice', label: tv.invoiceStatus.to_invoice },
]

const HIGHLIGHT_BG = {
  green:  'bg-green-100',
  yellow: 'bg-yellow-100',
  orange: 'bg-orange-100',
  red:    'bg-red-100',
}

function FilterSelect({ value, onChange, placeholder, children }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`border border-slate-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
        value ? 'text-slate-900' : 'text-slate-400'
      }`}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  )
}

function InvoiceStatusBadge({ status }) {
  if (!status) return <span className="text-slate-400 text-xs">—</span>
  const isInvoiced = status === 'invoiced'
  return (
    <span className={[
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
      isInvoiced ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700',
    ].join(' ')}>
      {isInvoiced ? tv.invoiceStatus.invoiced : tv.invoiceStatus.to_invoice}
    </span>
  )
}

function KpiCard({ label, value, color }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color || 'text-slate-900'}`}>
        {formatUSD(value)}
      </p>
    </div>
  )
}

function IconInbox() {
  return (
    <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />
    </svg>
  )
}

function IconSearch() {
  return (
    <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
    </svg>
  )
}

function SyncIcon({ spinning }) {
  return (
    <svg
      className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

function formatSaleDate(dateStr) {
  if (!dateStr) return '—'
  // Postgres DATE comes as "2026-01-02T03:00:00.000Z" — parse as UTC to avoid timezone shift
  const d = new Date(typeof dateStr === 'string' && dateStr.length === 10
    ? dateStr + 'T00:00:00Z'
    : dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
}

export default function VentasPage() {
  const { year } = useAppContext()
  const { user } = useAuth()
  const canSync = user?.role === 'admin' || user?.role === 'manager'

  // Top-level seller selector (like Performance)
  const [sellerFilter, setSellerFilter] = useState('')

  // Filter bar
  const [search, setSearch]           = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [sales, setSales]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [syncing, setSyncing]       = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [drawerSale, setDrawerSale] = useState(null)

  // Static option lists — loaded once, independent of filters
  const [ventasSellers, setVentasSellers] = useState([])
  const [ventasBrands, setVentasBrands]   = useState([])

  const hasFilters = search || brandFilter || statusFilter

  useEffect(() => {
    getVentasSellers().then(setVentasSellers).catch(() => {})
    getVentasBrands().then(setVentasBrands).catch(() => {})
  }, [])

  const fetchSales = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = { year }
      if (sellerFilter) params.seller_id      = sellerFilter
      if (brandFilter)  params.brand          = brandFilter
      if (statusFilter) params.invoice_status = statusFilter
      if (search)       params.search         = search
      const data = await getVentas(params)
      setSales(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [year, sellerFilter, brandFilter, statusFilter, search])

  useEffect(() => {
    const timer = setTimeout(fetchSales, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchSales, search])

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await syncVentas()
      setSyncResult(result)
      await fetchSales()
    } catch (err) {
      setSyncResult({ error: err.message })
    } finally {
      setSyncing(false)
    }
  }

  function clearFilters() {
    setSearch('')
    setBrandFilter('')
    setStatusFilter('')
  }

  async function handleDrawerSaved() {
    setDrawerSale(null)
    await fetchSales()
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const totalEmpresa     = sales.filter(x => x.order_state === 'sale' || x.order_state === 'done')
                                .reduce((s, x) => s + (x.amount_usd_official || 0), 0)
  const totalFacturado   = sales.filter(x => x.invoice_status === 'invoiced')
                                .reduce((s, x) => s + (x.amount_usd_official || 0), 0)
  const totalPorFacturar = sales.filter(x => x.invoice_status === 'to invoice')
                                .reduce((s, x) => s + (x.amount_usd_official || 0), 0)
  const totalCotizado    = sales.filter(x => x.order_state === 'draft' || x.order_state === 'sent')
                                .reduce((s, x) => s + (x.amount_usd_official || 0), 0)

  const brandMap = {}
  for (const s of sales) {
    const key = s.brand || '(sin brand)'
    if (!brandMap[key]) brandMap[key] = { brand: key, facturado: 0, porFacturar: 0 }
    if (s.invoice_status === 'invoiced')   brandMap[key].facturado   += s.amount_usd_official || 0
    if (s.invoice_status === 'to invoice') brandMap[key].porFacturar += s.amount_usd_official || 0
  }
  const brandSummary = Object.values(brandMap).sort((a, b) => (b.facturado + b.porFacturar) - (a.facturado + a.porFacturar))

  const TH = 'px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider'
  const TH_SEP = TH + ' border-l border-slate-200'

  return (
    <div>
      {/* Title + seller selector */}
      <div className="space-y-2 mb-5">
        <h1 className="text-xl font-semibold text-slate-900">{tv.title}</h1>
        <select
          value={sellerFilter}
          onChange={(e) => setSellerFilter(e.target.value)}
          className="border border-slate-300 rounded-md px-2.5 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
        >
          <option value="">Todos</option>
          {ventasSellers.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* KPI cards */}
      {!loading && sales.length > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <KpiCard label={tv.kpi.totalEmpresa}     value={totalEmpresa} />
          <KpiCard label={tv.kpi.totalFacturado}   value={totalFacturado}   color="text-green-700" />
          <KpiCard label={tv.kpi.totalPorFacturar} value={totalPorFacturar} color="text-amber-600" />
          <KpiCard label={tv.kpi.totalCotizado}    value={totalCotizado}    color="text-blue-600" />
        </div>
      )}

      {/* Brand summary */}
      {!loading && brandSummary.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm mb-6 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {tv.brandSummary.title}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className={TH + ' text-left'}>{tv.brandSummary.brand}</th>
                  <th className={TH_SEP + ' text-right'}>{tv.brandSummary.facturado}</th>
                  <th className={TH_SEP + ' text-right'}>{tv.brandSummary.porFacturar}</th>
                  <th className={TH_SEP + ' text-right'}>Total</th>
                </tr>
              </thead>
              <tbody>
                {brandSummary.map((row, i) => (
                  <tr key={row.brand} className={`border-b border-slate-100 last:border-0 ${i % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}`}>
                    <td className="px-3 py-2 text-sm text-slate-700 font-medium">{row.brand}</td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums text-green-700 font-medium border-l border-slate-200">
                      {formatUSD(row.facturado)}
                    </td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums text-amber-600 font-medium border-l border-slate-200">
                      {formatUSD(row.porFacturar)}
                    </td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-800 font-semibold border-l border-slate-200">
                      {formatUSD(row.facturado + row.porFacturar)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filter bar + Sync button (same container) */}
      <div className="bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              placeholder={tv.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-slate-300 rounded-md pl-9 pr-3 py-2 text-sm bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <FilterSelect value={brandFilter} onChange={setBrandFilter} placeholder={tv.allBrands}>
            {ventasBrands.map(b => <option key={b} value={b}>{b}</option>)}
          </FilterSelect>

          <FilterSelect value={statusFilter} onChange={setStatusFilter} placeholder={tv.allStatuses}>
            {INVOICE_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </FilterSelect>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-md hover:bg-white transition-colors flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              {tv.clearFilters}
            </button>
          )}

          {/* Separator + Sync (right side) */}
          <div className="flex-1" />
          <div className="flex items-center gap-3 flex-shrink-0">
            {syncResult && !syncResult.error && (
              <span className="text-xs text-slate-500">
                Sincronizado: {syncResult.upserted} ventas
                {syncResult.warnings?.length > 0 && ` · ${syncResult.warnings.length} avisos`}
              </span>
            )}
            {syncResult?.error && (
              <span className="text-xs text-red-500">{syncResult.error}</span>
            )}
            {canSync && (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                <SyncIcon spinning={syncing} />
                {syncing ? tv.syncing : tv.syncButton}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Count */}
      <div className="mb-3">
        <p className="text-sm text-slate-500">
          {loading ? t.loading : tv.count(sales.length)}
        </p>
      </div>

      {/* Main table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {error ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-red-500">{error}</p>
            <button onClick={fetchSales} className="mt-3 text-sm text-blue-600 hover:underline">
              {t.retry}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed min-w-[900px]">
              <colgroup>
                <col style={{ width: '18%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '7%'  }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className={TH + ' text-left'}>{tv.columns.client}</th>
                  <th className={TH_SEP + ' text-left'}>{tv.columns.brand}</th>
                  <th className={TH_SEP + ' text-left'}>{tv.columns.seller}</th>
                  <th className={TH_SEP + ' text-center'}>{tv.columns.invoiceStatus}</th>
                  <th className={TH_SEP + ' text-right'}>{tv.columns.amountOriginal}</th>
                  <th className={TH_SEP + ' text-center'}>{tv.columns.currency}</th>
                  <th className={TH_SEP + ' text-right'}>{tv.columns.amountUsd}</th>
                  <th className={TH_SEP + ' text-center'}>{tv.columns.date}</th>
                  <th className={TH_SEP + ' text-left'}>{tv.columns.reference}</th>
                </tr>
              </thead>
              <tbody>
                {loading && sales.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-20 text-center text-sm text-slate-400">
                      {tv.loadingList}
                    </td>
                  </tr>
                ) : sales.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-14 text-center">
                      <div className="flex flex-col items-center gap-3">
                        {hasFilters ? <IconSearch /> : <IconInbox />}
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {hasFilters ? tv.noMatchFilters : tv.emptyTitle}
                          </p>
                          <p className="text-sm text-slate-400 mt-1">
                            {hasFilters ? tv.noMatchHint : tv.emptyHint}
                          </p>
                        </div>
                        {hasFilters && (
                          <button onClick={clearFilters} className="text-sm text-blue-600 hover:underline mt-1">
                            {tv.clearFilters}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  sales.map((sale, idx) => {
                    const isOdd = idx % 2 === 1
                    const hlBg  = sale.highlight_color && HIGHLIGHT_BG[sale.highlight_color]
                    const rowBg = hlBg || (isOdd ? 'bg-slate-50/70' : 'bg-white')

                    return (
                      <tr
                        key={sale.id}
                        onClick={() => setDrawerSale(sale)}
                        className={`border-b border-slate-100 last:border-0 cursor-pointer hover:bg-blue-50/50 transition-colors duration-100 ${rowBg}`}
                      >
                        <td className="px-3 py-2 text-sm font-medium text-slate-900">
                          <span className="block truncate" title={sale.client_name}>{sale.client_name || '—'}</span>
                        </td>
                        <td className="px-3 py-2 text-sm text-slate-500 border-l border-slate-200">
                          <span className="block truncate" title={sale.brand}>{sale.brand || '—'}</span>
                        </td>
                        <td className="px-3 py-2 text-sm text-slate-500 border-l border-slate-200">
                          <span className="block truncate" title={sale.seller_name || sale.seller_name_raw}>
                            {sale.seller_name || sale.seller_name_raw || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center border-l border-slate-200">
                          <InvoiceStatusBadge status={sale.invoice_status} />
                        </td>
                        <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-600 font-medium border-l border-slate-200">
                          {sale.amount_original != null
                            ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(sale.amount_original)
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-center text-slate-500 border-l border-slate-200">
                          {sale.currency_original || '—'}
                        </td>
                        <td className="px-3 py-2 text-sm text-right font-bold tabular-nums text-slate-800 border-l border-slate-200">
                          {sale.amount_usd_official != null
                            ? formatUSD(sale.amount_usd_official)
                            : <span className="text-slate-400 font-normal">Sin TC</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-center text-slate-500 border-l border-slate-200 tabular-nums">
                          {formatSaleDate(sale.sale_date)}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500 border-l border-slate-200">
                          <span className="block truncate" title={sale.reference}>{sale.reference || '—'}</span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawerSale && (
        <VentasDrawer
          sale={drawerSale}
          onClose={() => setDrawerSale(null)}
          onSaved={handleDrawerSaved}
        />
      )}
    </div>
  )
}
