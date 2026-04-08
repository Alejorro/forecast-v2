import React, { useState, useEffect, useCallback } from 'react'
import { useAppContext } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { getTransactions } from '../utils/api'
import { formatUSD } from '../utils/format'
import StageBadge from '../components/StageBadge'
import TransactionDrawer from '../components/TransactionDrawer'

const STAGE_OPTIONS = [
  { value: 'Identified',  label: 'IDENTIFIED 10%' },
  { value: 'Proposal 25', label: 'PROPOSAL 25%'   },
  { value: 'Proposal 50', label: 'PROPOSAL 50%'   },
  { value: 'Proposal 75', label: 'PROPOSAL 75%'   },
  { value: 'Won',         label: 'WON 100%'       },
  { value: 'LOSS',        label: 'LOSS'           },
]
const QUARTER_OPTIONS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q1-Q4']

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

function FilterSelect({ value, onChange, children, placeholder }) {
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

const STAGE_PERCENT = {
  'LOSS':        0,
  'Identified':  10,
  'Proposal 25': 25,
  'Proposal 50': 50,
  'Proposal 75': 75,
  'Won':         100,
}

function stagePercent(tx) {
  return STAGE_PERCENT[tx.status_label === 'LOSS' ? 'LOSS' : tx.stage_label] ?? 0
}

const TH_BASE = 'px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center'
const TH      = TH_BASE
const TH_SEP  = TH_BASE + ' border-l border-slate-200'
const SEP     = ' border-l border-slate-200'

function SortArrow({ active, dir }) {
  if (active) {
    return (
      <span className="ml-1 inline-block text-blue-500">
        {dir === 'asc' ? '↑' : '↓'}
      </span>
    )
  }
  return (
    <span className="ml-1 inline-block text-slate-300">↑↓</span>
  )
}

function SortableTH({ col, label, sortState, onSort, className }) {
  const active = sortState.col === col
  return (
    <th
      className={`${className} cursor-pointer select-none hover:text-slate-800 hover:bg-slate-100 transition-colors`}
      onClick={() => onSort(col)}
    >
      {label}
      <SortArrow active={active} dir={sortState.dir} />
    </th>
  )
}

export default function TransactionsPage() {
  const { year, brands, sellers } = useAppContext()
  const { user } = useAuth()
  const canWrite = user?.role === 'admin' || user?.role === 'seller'

  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [sellerFilter, setSellerFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [quarterFilter, setQuarterFilter] = useState('')
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [sort, setSort] = useState({ col: null, dir: null })

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState(null)

  const hasFilters = search || brandFilter || sellerFilter || stageFilter || quarterFilter

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = { year }
      if (stageFilter === 'LOSS') {
        params.include_loss = 'true'
      } else {
        if (brandFilter) params.brand_id = brandFilter
        if (sellerFilter) params.seller_id = sellerFilter
        if (stageFilter) params.stage_label = stageFilter
        if (quarterFilter) params.quarter = quarterFilter
        if (search) params.search = search
      }
      const data = await getTransactions(params)
      setTransactions(Array.isArray(data) ? data : data?.transactions || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [year, brandFilter, sellerFilter, stageFilter, quarterFilter, search])

  useEffect(() => {
    const timer = setTimeout(fetchTransactions, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchTransactions, search])

  function clearFilters() {
    setSearch('')
    setBrandFilter('')
    setSellerFilter('')
    setStageFilter('')
    setQuarterFilter('')
  }

  function openNewDrawer() { setEditingTransaction(null); setDrawerOpen(true) }
  function openEditDrawer(tx) { setEditingTransaction(tx); setDrawerOpen(true) }
  function closeDrawer() { setDrawerOpen(false); setEditingTransaction(null) }
  async function handleSaved() { closeDrawer(); await fetchTransactions() }

  const isLoss = (tx) => tx.status_label === 'LOSS'

  function handleSort(col) {
    setSort((prev) => {
      if (prev.col !== col) return { col, dir: 'asc' }
      if (prev.dir === 'asc') return { col, dir: 'desc' }
      return { col: null, dir: null }
    })
  }

  const SORT_VALUE = {
    client:   (tx) => (tx.client_name || '').toLowerCase(),
    brand:    (tx) => (tx.brand_name  || '').toLowerCase(),
    seller:   (tx) => (tx.seller_name || '').toLowerCase(),
    tcv:      (tx) => tx.tcv          ?? 0,
    stage:    (tx) => stagePercent(tx),
    weighted: (tx) => tx.weighted_total ?? 0,
    q1:       (tx) => tx.q1_value ?? 0,
    q2:       (tx) => tx.q2_value ?? 0,
    q3:       (tx) => tx.q3_value ?? 0,
    q4:       (tx) => tx.q4_value ?? 0,
  }

  const displayedTransactions = (() => {
    if (!sort.col) return transactions
    const getValue = SORT_VALUE[sort.col]
    const mul = sort.dir === 'asc' ? 1 : -1
    return [...transactions].sort((a, b) => {
      const av = getValue(a)
      const bv = getValue(b)
      if (av < bv) return -1 * mul
      if (av > bv) return  1 * mul
      return 0
    })
  })()

  return (
    <div>
      {/* Page title */}
      <h1 className="text-xl font-semibold text-slate-900 mb-5">Transactions</h1>

      {/* Filter bar */}
      <div className="bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 mb-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search client or project..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-slate-300 rounded-md pl-9 pr-3 py-2 text-sm bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <FilterSelect value={brandFilter} onChange={setBrandFilter} placeholder="All brands">
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </FilterSelect>

          <FilterSelect value={sellerFilter} onChange={setSellerFilter} placeholder="All sellers">
            {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </FilterSelect>

          <FilterSelect value={stageFilter} onChange={setStageFilter} placeholder="All stages">
            {STAGE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </FilterSelect>

          <FilterSelect value={quarterFilter} onChange={setQuarterFilter} placeholder="All quarters">
            {QUARTER_OPTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
          </FilterSelect>

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-md hover:bg-white transition-colors flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-slate-500">
          {loading ? 'Loading...' : (
            <>
              <span className="font-semibold text-slate-800">{transactions.length}</span>
              {' transaction'}
              {transactions.length !== 1 ? 's' : ''}
            </>
          )}
        </p>
        {canWrite && (
          <button
            onClick={openNewDrawer}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Transaction
          </button>
        )}
      </div>

      {/* Table card */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {error ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-red-500">{error}</p>
            <button onClick={fetchTransactions} className="mt-3 text-sm text-blue-600 hover:underline">
              Retry
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed min-w-[900px]">
              <colgroup>
                <col style={{ width: '19%' }} />  {/* Client */}
                <col style={{ width: '11%' }} />  {/* Brand */}
                <col style={{ width: '11%' }} />  {/* Seller */}
                <col style={{ width: '11%' }} />  {/* TCV */}
                <col style={{ width: '13%' }} />  {/* Stage */}
                <col style={{ width: '11%' }} />  {/* Weighted */}
                <col style={{ width: '6%' }} />   {/* Q1 */}
                <col style={{ width: '6%' }} />   {/* Q2 */}
                <col style={{ width: '6%' }} />   {/* Q3 */}
                <col style={{ width: '6%' }} />   {/* Q4 */}
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <SortableTH col="client"   label="Client"   sortState={sort} onSort={handleSort} className={TH} />
                  <SortableTH col="brand"    label="Brand"    sortState={sort} onSort={handleSort} className={TH_SEP} />
                  <SortableTH col="seller"   label="Seller"   sortState={sort} onSort={handleSort} className={TH_SEP} />
                  <SortableTH col="tcv"      label="TCV"      sortState={sort} onSort={handleSort} className={TH_SEP} />
                  <SortableTH col="stage"    label="Stage"    sortState={sort} onSort={handleSort} className={TH_SEP} />
                  <SortableTH col="weighted" label="Weighted" sortState={sort} onSort={handleSort} className={TH_SEP} />
                  <SortableTH col="q1"       label="Q1"       sortState={sort} onSort={handleSort} className={TH_SEP} />
                  <SortableTH col="q2"       label="Q2"       sortState={sort} onSort={handleSort} className={TH_SEP} />
                  <SortableTH col="q3"       label="Q3"       sortState={sort} onSort={handleSort} className={TH_SEP} />
                  <SortableTH col="q4"       label="Q4"       sortState={sort} onSort={handleSort} className={TH_SEP} />
                </tr>
              </thead>
              <tbody>
                {loading && transactions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-20 text-center text-sm text-slate-400">
                      Loading transactions...
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-14 text-center">
                      <div className="flex flex-col items-center gap-3">
                        {hasFilters ? <IconSearch /> : <IconInbox />}
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {hasFilters ? 'No transactions match your filters.' : 'No transactions yet'}
                          </p>
                          <p className="text-sm text-slate-400 mt-1">
                            {hasFilters
                              ? 'Try adjusting your search or filter criteria.'
                              : 'Create your first transaction to start tracking forecast.'}
                          </p>
                        </div>
                        {hasFilters ? (
                          <button onClick={clearFilters} className="text-sm text-blue-600 hover:underline mt-1">
                            Clear filters
                          </button>
                        ) : canWrite ? (
                          <button
                            onClick={openNewDrawer}
                            className="mt-1 flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            New Transaction
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedTransactions.map((tx, idx) => {
                    const loss = isLoss(tx)
                    const isOdd = idx % 2 === 1
                    const qCell = 'px-2 py-2 text-xs text-right tabular-nums border-l border-slate-200'
                    return (
                      <tr
                        key={tx.id}
                        onClick={canWrite ? () => openEditDrawer(tx) : undefined}
                        className={[
                          'border-b border-slate-100 last:border-0 transition-colors duration-100',
                          canWrite ? 'cursor-pointer' : '',
                          loss ? 'bg-slate-50' : isOdd ? 'bg-slate-50/70' : 'bg-white',
                          canWrite ? 'hover:bg-blue-50/50' : '',
                        ].join(' ')}
                      >
                        <td className={`px-3 py-2 text-sm font-medium ${loss ? 'text-slate-400' : 'text-slate-900'}`}>
                          <span className="block truncate" title={tx.client_name}>{tx.client_name}</span>
                        </td>
                        <td className={`px-3 py-2 text-sm border-l border-slate-200 ${loss ? 'text-slate-300' : 'text-slate-400'}`}>
                          <span className="block truncate" title={tx.brand_name}>{tx.brand_name || ''}</span>
                        </td>
                        <td className={`px-3 py-2 text-sm border-l border-slate-200 ${loss ? 'text-slate-300' : 'text-slate-500'}`}>
                          <span className="block truncate" title={tx.seller_name}>{tx.seller_name || ''}</span>
                        </td>
                        <td className={`px-3 py-2 text-sm text-right font-medium tabular-nums border-l border-slate-200 ${loss ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
                          {formatUSD(tx.tcv)}
                        </td>
                        <td className="px-3 py-2 text-center border-l border-slate-200">
                          <StageBadge stage={loss ? 'LOSS' : tx.stage_label} />
                        </td>
                        <td className={`px-3 py-2 text-sm text-right font-bold tabular-nums border-l border-slate-200 ${loss ? 'text-slate-400' : 'text-slate-800'}`}>
                          {loss ? '—' : formatUSD(tx.weighted_total)}
                        </td>
                        <td className={qCell}>
                          {!loss && tx.q1_value ? <span className="text-slate-600">{formatUSD(tx.q1_value, false)}</span> : null}
                        </td>
                        <td className={qCell}>
                          {!loss && tx.q2_value ? <span className="text-slate-600">{formatUSD(tx.q2_value, false)}</span> : null}
                        </td>
                        <td className={qCell}>
                          {!loss && tx.q3_value ? <span className="text-slate-600">{formatUSD(tx.q3_value, false)}</span> : null}
                        </td>
                        <td className={qCell}>
                          {!loss && tx.q4_value ? <span className="text-slate-600">{formatUSD(tx.q4_value, false)}</span> : null}
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

      {drawerOpen && (
        <TransactionDrawer
          transaction={editingTransaction}
          onClose={closeDrawer}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
