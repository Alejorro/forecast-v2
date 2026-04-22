import React, { useState } from 'react'
import { formatUSD } from '../utils/format'
import { updateVentaInternal } from '../utils/api'
import t from '../utils/t'

const tv = t.ventas.drawer

const HIGHLIGHT_COLORS = ['green', 'yellow', 'orange', 'red']
const HIGHLIGHT_DOT = {
  green:  { bg: 'rgb(34,197,94)',   ring: 'ring-green-400'  },
  yellow: { bg: 'rgb(234,179,8)',   ring: 'ring-yellow-400' },
  orange: { bg: 'rgb(249,115,22)',  ring: 'ring-orange-400' },
  red:    { bg: 'rgb(239,68,68)',   ring: 'ring-red-400'    },
}

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
      {children}
    </p>
  )
}

function ReadField({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div className="flex flex-col gap-0.5 mb-3">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm text-slate-800 font-medium">{value}</span>
    </div>
  )
}

function InvoiceStatusBadge({ status }) {
  if (!status) return <span className="text-sm text-slate-400">—</span>
  const isInvoiced = status === 'invoiced'
  return (
    <span className={[
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
      isInvoiced
        ? 'bg-green-50 text-green-700'
        : 'bg-amber-50 text-amber-700',
    ].join(' ')}>
      {isInvoiced ? t.ventas.invoiceStatus.invoiced : t.ventas.invoiceStatus.to_invoice}
    </span>
  )
}

export default function VentasDrawer({ sale, onClose, onSaved }) {
  const [notes, setNotes]             = useState(sale.notes          || '')
  const [provider, setProvider]       = useState(sale.provider       || '')
  const [internalTags, setInternalTags] = useState(sale.internal_tags || '')
  const [highlightColor, setHighlightColor] = useState(sale.highlight_color || null)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateVentaInternal(sale.id, {
        notes:          notes     || null,
        provider:       provider  || null,
        internal_tags:  internalTags || null,
        highlight_color: highlightColor,
      })
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function toggleColor(color) {
    setHighlightColor(prev => prev === color ? null : color)
  }

  const saleDate = sale.sale_date
    ? new Date(sale.sale_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  const fxRateDate = sale.fx_rate_date_used
    ? new Date(sale.fx_rate_date_used + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  const lastSync = sale.last_sync_at
    ? new Date(sale.last_sync_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-label={tv.title}
        className="fixed right-0 top-0 h-full w-[420px] bg-white shadow-xl z-50 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-900">{tv.title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label={tv.close}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* ── Section A: Odoo data (read-only) ── */}
          <section>
            <SectionLabel>{tv.sectionOdoo}</SectionLabel>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-4">
              <ReadField label={tv.fields.reference}     value={sale.reference} />
              <ReadField label={tv.fields.client}        value={sale.client_name} />
              <ReadField label={tv.fields.brand}         value={sale.brand} />
              <ReadField label={tv.fields.seller}        value={sale.seller_name_raw} />
              {sale.seller_name && (
                <ReadField label={tv.fields.sellerLinked} value={sale.seller_name} />
              )}
              <div className="flex flex-col gap-0.5 mb-3">
                <span className="text-xs text-slate-400">{tv.fields.invoiceStatus}</span>
                <InvoiceStatusBadge status={sale.invoice_status} />
              </div>
              <ReadField label={tv.fields.saleDate}      value={saleDate} />
              <ReadField label={tv.fields.quarter}       value={sale.quarter} />
              <ReadField label={tv.fields.year}          value={sale.year} />
              <div className="border-t border-slate-200 mt-3 pt-3">
                <ReadField label={tv.fields.currency}       value={sale.currency_original} />
                <ReadField
                  label={tv.fields.amountOriginal}
                  value={sale.amount_original != null
                    ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(sale.amount_original)
                    : null}
                />
                <ReadField label={tv.fields.amountUsd}      value={formatUSD(sale.amount_usd_official)} />
                <ReadField
                  label={tv.fields.fxRate}
                  value={sale.fx_rate_used != null ? sale.fx_rate_used.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null}
                />
                <ReadField label={tv.fields.fxRateDate}     value={fxRateDate} />
              </div>
              {lastSync && (
                <div className="border-t border-slate-200 mt-3 pt-3">
                  <ReadField label={tv.fields.lastSync} value={lastSync} />
                </div>
              )}
            </div>
          </section>

          {/* ── Section B: Editable internal fields ── */}
          <section>
            <SectionLabel>{tv.sectionInternal}</SectionLabel>
            <div className="space-y-4">

              {/* Highlight color */}
              <div>
                <label className="block text-xs text-slate-500 mb-2">{tv.fields.highlight}</label>
                <div className="flex items-center gap-2">
                  {HIGHLIGHT_COLORS.map((color) => {
                    const { bg, ring } = HIGHLIGHT_DOT[color]
                    const selected = highlightColor === color
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => toggleColor(color)}
                        style={{ backgroundColor: bg }}
                        className={[
                          'w-6 h-6 rounded-full transition-all ring-offset-1',
                          selected ? `ring-2 ${ring}` : 'ring-0 opacity-60 hover:opacity-100',
                        ].join(' ')}
                        aria-label={color}
                        aria-pressed={selected}
                      />
                    )
                  })}
                  {highlightColor && (
                    <button
                      type="button"
                      onClick={() => setHighlightColor(null)}
                      className="text-xs text-slate-400 hover:text-slate-600 ml-1"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">{tv.fields.notes}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Notas opcionales..."
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Provider */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">{tv.fields.provider}</label>
                <input
                  type="text"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  placeholder="Opcional"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Internal tags */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">{tv.fields.tags}</label>
                <input
                  type="text"
                  value={internalTags}
                  onChange={(e) => setInternalTags(e.target.value)}
                  placeholder="Ej: prioritario, seguimiento..."
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-slate-200 px-5 py-4">
          {error && (
            <p className="text-xs text-red-500 mb-3">{error}</p>
          )}
          <div className="flex items-center gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
            >
              {tv.cancel}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {saving ? tv.saving : tv.save}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
