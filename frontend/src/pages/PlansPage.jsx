import React, { useState, useEffect, useCallback } from 'react'
import { useAppContext } from '../context/AppContext'
import { getPlans, updatePlan } from '../utils/api'
import { formatUSD, formatNumber } from '../utils/format'

// Column header variants
const TH_BASE = 'px-3 py-2.5 text-xs font-semibold uppercase tracking-wider'
const TH_LEFT  = TH_BASE + ' text-left text-slate-500'
const TH_RIGHT = TH_BASE + ' text-right text-slate-500 border-l border-slate-200'
// FY section: slightly stronger header text + thicker left border on first FY col
const TH_FY_FIRST = TH_BASE + ' text-right text-slate-600 border-l-2 border-slate-300'
const TH_FY       = TH_BASE + ' text-right text-slate-600 border-l border-slate-200'

const QUARTER_FIELDS = ['q1_plan', 'q2_plan', 'q3_plan', 'q4_plan']

function parseValue(str) {
  if (str === '' || str === null || str === undefined) return null
  const n = Number(String(str).replace(/,/g, '').trim())
  return isNaN(n) ? null : n
}

// Display with thousands separators for read/clean state
function displayValue(val) {
  if (val === null || val === undefined) return ''
  return formatNumber(Math.round(val))
}

function GapCell({ gap }) {
  if (gap === null || gap === undefined) {
    return <span className="text-slate-300">—</span>
  }
  if (gap >= 0) {
    return <span className="font-semibold text-green-600">{formatUSD(gap)}</span>
  }
  return <span className="font-semibold text-red-600">{formatUSD(gap)}</span>
}

export default function PlansPage() {
  const { year } = useAppContext()

  const [rows, setRows] = useState([])
  const [edits, setEdits] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const fetchPlans = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getPlans(year)
      setRows(data)
      setEdits({})
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    fetchPlans()
  }, [fetchPlans])

  function handleCellChange(brand_id, field, value) {
    setEdits(prev => ({
      ...prev,
      [brand_id]: { ...(prev[brand_id] || {}), [field]: value },
    }))
  }

  function isDirty(brand_id, field) {
    return edits[brand_id]?.[field] !== undefined
  }

  const dirtyBrandCount = Object.keys(edits).length
  const hasChanges = dirtyBrandCount > 0

  function effectiveValue(row, field) {
    const e = edits[row.brand_id]
    if (e && e[field] !== undefined) return parseValue(e[field])
    return row[field]
  }

  function computedFYPlan(row) {
    const vals = QUARTER_FIELDS.map(f => effectiveValue(row, f))
    if (vals.some(v => v === null)) return null
    return vals.reduce((a, b) => a + b, 0)
  }

  function computedFYGap(row) {
    const plan = computedFYPlan(row)
    if (plan === null) return null
    return row.fy_forecast - plan
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const promises = Object.entries(edits).map(([brand_id, changes]) => {
        const row = rows.find(r => r.brand_id === Number(brand_id))
        if (!row) return Promise.resolve()
        const payload = {
          year,
          q1_plan: parseValue(changes.q1_plan !== undefined ? changes.q1_plan : displayValue(row.q1_plan)),
          q2_plan: parseValue(changes.q2_plan !== undefined ? changes.q2_plan : displayValue(row.q2_plan)),
          q3_plan: parseValue(changes.q3_plan !== undefined ? changes.q3_plan : displayValue(row.q3_plan)),
          q4_plan: parseValue(changes.q4_plan !== undefined ? changes.q4_plan : displayValue(row.q4_plan)),
        }
        return updatePlan(Number(brand_id), payload)
      })
      await Promise.all(promises)
      await fetchPlans()
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-slate-900">Plans</h1>
        <div className="flex items-center gap-3">
          {saveError && (
            <span className="text-sm text-red-500">{saveError}</span>
          )}
          {hasChanges && !saving && (
            <span className="text-sm text-slate-400">
              {dirtyBrandCount} brand{dirtyBrandCount !== 1 ? 's' : ''} modified
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className={[
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              hasChanges && !saving
                ? 'text-white bg-blue-600 hover:bg-blue-700 shadow-sm'
                : saving
                  ? 'text-blue-300 bg-blue-100 cursor-not-allowed'
                  : 'text-blue-300 bg-blue-50 cursor-not-allowed',
            ].join(' ')}
          >
            {saving ? 'Saving...' : 'Save all changes'}
          </button>
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {error ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-red-500">{error}</p>
            <button onClick={fetchPlans} className="mt-3 text-sm text-blue-600 hover:underline">
              Retry
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed min-w-[800px]">
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className={TH_LEFT}>Brand</th>
                  <th className={TH_RIGHT}>Q1 Plan</th>
                  <th className={TH_RIGHT}>Q2 Plan</th>
                  <th className={TH_RIGHT}>Q3 Plan</th>
                  <th className={TH_RIGHT}>Q4 Plan</th>
                  <th className={TH_FY_FIRST}>FY Plan</th>
                  <th className={TH_FY}>FY Forecast</th>
                  <th className={TH_FY}>FY Gap</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-20 text-center text-sm text-slate-400">
                      Loading plans...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-14 text-center text-sm text-slate-400">
                      No brands found
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => {
                    const isOdd = idx % 2 === 1
                    const fyPlan = computedFYPlan(row)
                    const fyGap = computedFYGap(row)

                    return (
                      <tr
                        key={row.brand_id}
                        className={[
                          'border-b border-slate-100 last:border-0',
                          isOdd ? 'bg-slate-50/70' : 'bg-white',
                        ].join(' ')}
                      >
                        {/* Brand — read only */}
                        <td className="px-3 py-2.5 text-sm font-medium text-slate-900">
                          {row.brand_name}
                        </td>

                        {/* Q1–Q4 — editable */}
                        {QUARTER_FIELDS.map(field => {
                          const dirty = isDirty(row.brand_id, field)
                          const val = dirty
                            ? edits[row.brand_id][field]
                            : displayValue(row[field])

                          return (
                            <td
                              key={field}
                              className={[
                                'border-l border-slate-200 p-0',
                                'transition-colors',
                                dirty
                                  ? 'bg-amber-50'
                                  : 'hover:bg-blue-50/40',
                              ].join(' ')}
                            >
                              <input
                                type="text"
                                inputMode="numeric"
                                value={val}
                                placeholder="—"
                                onChange={e => handleCellChange(row.brand_id, field, e.target.value)}
                                className={[
                                  'w-full px-3 py-2.5 text-sm text-right tabular-nums bg-transparent',
                                  'placeholder-slate-300 cursor-text',
                                  'focus:outline-none focus:bg-white focus:ring-1 focus:ring-inset focus:ring-blue-400',
                                  dirty ? 'text-slate-900 font-medium' : 'text-slate-600',
                                ].join(' ')}
                              />
                            </td>
                          )
                        })}

                        {/* FY Plan — derived, read only */}
                        <td className="px-3 py-2.5 text-sm text-right tabular-nums font-semibold text-slate-800 border-l-2 border-slate-300">
                          {fyPlan !== null
                            ? formatUSD(fyPlan)
                            : <span className="text-slate-300 font-normal">—</span>
                          }
                        </td>

                        {/* FY Forecast — read only */}
                        <td className="px-3 py-2.5 text-sm text-right tabular-nums font-medium text-slate-700 border-l border-slate-200">
                          {formatUSD(row.fy_forecast)}
                        </td>

                        {/* FY Gap — read only, colored */}
                        <td className="px-3 py-2.5 text-sm text-right tabular-nums border-l border-slate-200">
                          <GapCell gap={fyGap} />
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

      {/* Editing hint */}
      {!loading && rows.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Click any Q1–Q4 cell to edit. Unsaved changes are highlighted in amber.
        </p>
      )}
    </div>
  )
}
