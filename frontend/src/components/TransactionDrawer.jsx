import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAppContext } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { createTransaction, updateTransaction, deleteTransaction } from '../utils/api'
import { formatUSD } from '../utils/format'
import t from '../utils/t'

const STAGE_OPTIONS = [
  { value: 'Identified',  label: 'IDENTIFIED 10%',  pct: 0.10 },
  { value: 'Proposal 25', label: 'PROPOSAL 25%',     pct: 0.25 },
  { value: 'Proposal 50', label: 'PROPOSAL 50%',     pct: 0.50 },
  { value: 'Proposal 75', label: 'PROPOSAL 75%',     pct: 0.75 },
  { value: 'Won',         label: 'WON 100%',         pct: 1.00 },
  { value: 'LOSS',        label: 'LOSS',             pct: 0.00 },
]

const STAGE_PCT = Object.fromEntries(STAGE_OPTIONS.map((s) => [s.value, s.pct]))

const QUARTER_OPTIONS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q1-Q4']

/** Derive a single quarter label from existing allocation fields. */
function deriveQuarter(tx) {
  const q1 = tx.allocation_q1 ?? 0
  const q2 = tx.allocation_q2 ?? 0
  const q3 = tx.allocation_q3 ?? 0
  const q4 = tx.allocation_q4 ?? 0
  const near = (a, b) => Math.abs(a - b) < 0.001
  if (near(q1, 1) && near(q2, 0) && near(q3, 0) && near(q4, 0)) return 'Q1'
  if (near(q1, 0) && near(q2, 1) && near(q3, 0) && near(q4, 0)) return 'Q2'
  if (near(q1, 0) && near(q2, 0) && near(q3, 1) && near(q4, 0)) return 'Q3'
  if (near(q1, 0) && near(q2, 0) && near(q3, 0) && near(q4, 1)) return 'Q4'
  if (near(q1, 0.25) && near(q2, 0.25) && near(q3, 0.25) && near(q4, 0.25)) return 'Q1-Q4'
  return ''
}

const HIGHLIGHT_COLORS = [
  { value: 'green',  dot: 'bg-green-400',  ring: 'ring-green-500'  },
  { value: 'yellow', dot: 'bg-yellow-400', ring: 'ring-yellow-500' },
  { value: 'orange', dot: 'bg-orange-400', ring: 'ring-orange-500' },
  { value: 'red',    dot: 'bg-red-400',    ring: 'ring-red-500'    },
]

const TRANSACTION_TYPE_OPTIONS = [
  { value: 'BAU',        label: 'Business As Usual' },
  { value: 'EXPAND',     label: 'Expand the Base'   },
  { value: 'NEW CLIENT', label: 'New Client'         },
]

const EMPTY_FORM = {
  client_name: '',
  brand_id: '',
  seller_id: '',
  sub_brand: '',
  vendor_name: '',
  opportunity_odoo: '',
  brand_opportunity_number: '',
  tcv: '',
  stage_label: 'Identified',
  quarter: '',
  due_date: '',
  description: '',
  invoice_number: '',
  notes: '',
  highlight_color: '',
  transaction_type: '',
}

function buildFormFromTransaction(tx) {
  const derivedQ = deriveQuarter(tx)
  // Non-standard allocations (custom split) → treat as Q1-Q4 mode
  const quarter = derivedQ || (tx.stage_label !== 'LOSS' ? 'Q1-Q4' : '')
  return {
    client_name:              tx.client_name || '',
    brand_id:                 tx.brand_id != null ? String(tx.brand_id) : '',
    seller_id:                tx.seller_id != null ? String(tx.seller_id) : '',
    sub_brand:                tx.sub_brand || '',
    vendor_name:              tx.vendor_name || '',
    opportunity_odoo:         tx.opportunity_odoo || '',
    brand_opportunity_number: tx.brand_opportunity_number || '',
    tcv:                      tx.tcv != null ? String(tx.tcv) : '',
    stage_label:              tx.stage_label || 'Identified',
    quarter,
    due_date:                 tx.due_date ? tx.due_date.substring(0, 10) : '',
    description:              tx.description || '',
    invoice_number:           tx.invoice_number || '',
    notes:                    tx.notes || '',
    highlight_color:          tx.highlight_color || '',
    transaction_type:         tx.transaction_type || '',
  }
}

/** Derive initial custom amounts when editing a Q1-Q4 or non-standard transaction. */
function buildInitialCustomAmounts(tx) {
  if (!tx || tx.stage_label === 'LOSS') return { q1: '', q2: '', q3: '', q4: '' }
  const derivedQ = deriveQuarter(tx)
  if (derivedQ !== 'Q1-Q4' && derivedQ !== '') return { q1: '', q2: '', q3: '', q4: '' }
  const tcv = tx.tcv || 0
  return {
    q1: (tx.allocation_q1 ?? 0) > 0 ? String(Math.round(tx.allocation_q1 * tcv)) : '',
    q2: (tx.allocation_q2 ?? 0) > 0 ? String(Math.round(tx.allocation_q2 * tcv)) : '',
    q3: (tx.allocation_q3 ?? 0) > 0 ? String(Math.round(tx.allocation_q3 * tcv)) : '',
    q4: (tx.allocation_q4 ?? 0) > 0 ? String(Math.round(tx.allocation_q4 * tcv)) : '',
  }
}

function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#64748B] mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

const inputClass =
  'w-full border border-[#E2E8F0] rounded-md px-3 py-2 text-sm text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent placeholder-[#94A3B8]'

export default function TransactionDrawer({ transaction, onClose, onSaved }) {
  const { brands, sellers } = useAppContext()
  const { user } = useAuth()
  const isEdit = Boolean(transaction)
  const isSeller = user?.role === 'seller'

  // For seller role: pre-fill their own seller_id on create
  const initialForm = (() => {
    if (isEdit) return buildFormFromTransaction(transaction)
    if (isSeller) {
      const matched = sellers.find((s) => s.name === user.sellerName)
      return { ...EMPTY_FORM, seller_id: matched ? String(matched.id) : '' }
    }
    return { ...EMPTY_FORM }
  })()

  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [tcvFocused, setTcvFocused] = useState(false)
  const firstInputRef = useRef(null)

  // Custom Q1-Q4 distribution state
  const [customAmounts, setCustomAmounts] = useState(() =>
    isEdit ? buildInitialCustomAmounts(transaction) : { q1: '', q2: '', q3: '', q4: '' }
  )
  const [autoAdjustedQuarter, setAutoAdjustedQuarter] = useState(null)
  const lastEditedRef = useRef(null)

  useEffect(() => {
    const timer = setTimeout(() => firstInputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const set = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      if (prev[field]) {
        const next = { ...prev }
        delete next[field]
        return next
      }
      return prev
    })
  }, [])

  // Computed preview
  const tcvNum = parseFloat(form.tcv) || 0
  const stagePercent = STAGE_PCT[form.stage_label] || 0
  const weighted = tcvNum * stagePercent

  const isLossStage = form.stage_label === 'LOSS'
  const isQ1Q4Mode = form.quarter === 'Q1-Q4'

  // Custom amounts totals
  const customTotal = isQ1Q4Mode
    ? ['q1', 'q2', 'q3', 'q4'].reduce((s, k) => s + (parseFloat(customAmounts[k]) || 0), 0)
    : 0
  const customRemaining = tcvNum - customTotal

  // ─── Quarter change ────────────────────────────────────────────────────────

  function handleQuarterChange(value) {
    set('quarter', value)
    if (value === 'Q1-Q4') {
      // Pre-fill with TCV/4
      const tcv = parseFloat(form.tcv) || 0
      if (tcv > 0) {
        const q = Math.round(tcv / 4)
        setCustomAmounts({ q1: String(q), q2: String(q), q3: String(q), q4: String(q) })
      } else {
        setCustomAmounts({ q1: '', q2: '', q3: '', q4: '' })
      }
      setAutoAdjustedQuarter(null)
      lastEditedRef.current = null
    } else {
      setAutoAdjustedQuarter(null)
    }
    // Clear custom allocation error when switching modes
    setErrors((prev) => {
      if (!prev.custom_allocation) return prev
      const next = { ...prev }
      delete next.custom_allocation
      return next
    })
  }

  // ─── Custom amount handlers ────────────────────────────────────────────────

  function handleCustomAmountChange(key, rawValue) {
    const cleaned = rawValue.replace(/,/g, '')
    setCustomAmounts((prev) => ({ ...prev, [key]: cleaned }))
    setAutoAdjustedQuarter(null)
    const numVal = parseFloat(cleaned) || 0
    if (numVal > 0) lastEditedRef.current = key
    setErrors((prev) => {
      if (!prev.custom_allocation) return prev
      const next = { ...prev }
      delete next.custom_allocation
      return next
    })
  }

  function runAutoBalance() {
    const tcv = parseFloat(form.tcv) || 0
    if (!tcv) return

    const amounts = {
      q1: parseFloat(customAmounts.q1) || 0,
      q2: parseFloat(customAmounts.q2) || 0,
      q3: parseFloat(customAmounts.q3) || 0,
      q4: parseFloat(customAmounts.q4) || 0,
    }
    const total = amounts.q1 + amounts.q2 + amounts.q3 + amounts.q4
    const remaining = tcv - total

    if (Math.abs(remaining) < 0.01) {
      setAutoAdjustedQuarter(null)
      return
    }
    if (remaining < 0) return  // sum > tcv — user must fix manually
    if (remaining > 999) return // too large — user must fix manually

    // Find target: last edited non-zero quarter, fallback q4→q3→q2→q1
    let target = lastEditedRef.current
    if (!target || amounts[target] === 0) {
      for (const q of ['q4', 'q3', 'q2', 'q1']) {
        if (amounts[q] > 0) { target = q; break }
      }
      if (!target) target = 'q4'
    }

    const newAmount = amounts[target] + remaining
    setCustomAmounts((prev) => ({ ...prev, [target]: String(Math.round(newAmount)) }))
    setAutoAdjustedQuarter(target)
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  function validate() {
    const errs = {}
    if (!form.client_name.trim()) errs.client_name = t.drawer.validation.required
    if (!form.brand_id) errs.brand_id = t.drawer.validation.required
    if (!form.seller_id) errs.seller_id = t.drawer.validation.required
    if (!isEdit && !form.transaction_type) errs.transaction_type = t.drawer.validation.required
    if (!isLossStage) {
      if (!form.tcv || isNaN(parseFloat(form.tcv)) || parseFloat(form.tcv) < 0)
        errs.tcv = t.drawer.validation.invalidAmount
      if (!form.quarter) errs.quarter = t.drawer.validation.required
      if (!form.due_date) errs.due_date = t.drawer.validation.required
      if (isQ1Q4Mode) {
        const allZero = ['q1', 'q2', 'q3', 'q4'].every((k) => !(parseFloat(customAmounts[k]) > 0))
        if (allZero) {
          errs.custom_allocation = 'Ingresá al menos un monto'
        } else if (Math.abs(customTotal - tcvNum) > 0.01) {
          errs.custom_allocation = `El total (${formatUSD(customTotal)}) debe ser igual al TCV (${formatUSD(tcvNum)})`
        }
      }
    }
    if (!form.stage_label) errs.stage_label = t.drawer.validation.required
    return errs
  }

  const isFormValid = (() => {
    if (!form.client_name.trim()) return false
    if (!form.brand_id) return false
    if (!form.seller_id) return false
    if (!form.stage_label) return false
    if (!isEdit && !form.transaction_type) return false
    if (!isLossStage) {
      if (!form.tcv || isNaN(parseFloat(form.tcv)) || parseFloat(form.tcv) < 0) return false
      if (!form.quarter) return false
      if (!form.due_date) return false
      if (isQ1Q4Mode) {
        const allZero = ['q1', 'q2', 'q3', 'q4'].every((k) => !(parseFloat(customAmounts[k]) > 0))
        if (allZero) return false
        if (Math.abs(customTotal - tcvNum) > 0.01) return false
      }
    }
    return true
  })()

  // ─── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setSaving(true)
    try {
      const payload = {
        client_name:              form.client_name,
        brand_id:                 form.brand_id ? Number(form.brand_id) : null,
        seller_id:                form.seller_id ? Number(form.seller_id) : null,
        sub_brand:                form.sub_brand || null,
        vendor_name:              form.vendor_name || null,
        opportunity_odoo:         form.opportunity_odoo || null,
        brand_opportunity_number: form.brand_opportunity_number || null,
        tcv:                      isLossStage ? (parseFloat(form.tcv) || 0) : parseFloat(form.tcv),
        stage_label:              form.stage_label,
        due_date:                 form.due_date || null,
        description:              form.description || null,
        invoice_number:           form.invoice_number || null,
        notes:                    form.notes || null,
        highlight_color:          form.highlight_color || null,
        transaction_type:         form.transaction_type || null,
      }

      if (!isLossStage) {
        if (isQ1Q4Mode) {
          // Send raw allocations — backend validates sum ≈ 1.0
          const tcv = parseFloat(form.tcv)
          payload.allocation_q1 = (parseFloat(customAmounts.q1) || 0) / tcv
          payload.allocation_q2 = (parseFloat(customAmounts.q2) || 0) / tcv
          payload.allocation_q3 = (parseFloat(customAmounts.q3) || 0) / tcv
          payload.allocation_q4 = (parseFloat(customAmounts.q4) || 0) / tcv
        } else {
          payload.quarter = form.quarter || null
        }
      }

      if (isEdit) {
        await updateTransaction(transaction.id, payload)
      } else {
        await createTransaction(payload)
      }
      onSaved()
    } catch (err) {
      setErrors({ _global: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await deleteTransaction(transaction.id)
      onSaved()
    } catch (err) {
      setErrors({ _global: err.message })
      setSaving(false)
    }
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  // TCV display value: formatted when blurred, raw when focused
  const tcvDisplayValue = tcvFocused
    ? form.tcv
    : form.tcv !== '' && !isNaN(parseFloat(form.tcv))
    ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(parseFloat(form.tcv))
    : ''

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={handleBackdropClick}
    >
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />

      <div
        className="relative w-full max-w-[480px] h-full bg-white shadow-xl flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? t.drawer.ariaEdit : t.drawer.ariaNew}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] flex-shrink-0">
          <h2 className="text-base font-semibold text-[#0F172A]">
            {isEdit ? t.drawer.titleEdit : t.drawer.titleNew}
          </h2>
          <button
            onClick={onClose}
            className="text-[#64748B] hover:text-[#0F172A] p-1 rounded-md hover:bg-slate-100 transition-colors"
            aria-label={t.drawer.close}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-6 space-y-5">
          {errors._global && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">
              {errors._global}
            </div>
          )}

          {/* ── Primary fields ─────────────────────────────── */}

          {/* Client + highlight dots */}
          <div className="space-y-2">
            <Field label={t.drawer.fields.clientName} required error={errors.client_name}>
              <input
                ref={firstInputRef}
                type="text"
                className={inputClass}
                placeholder={t.drawer.placeholders.clientName}
                value={form.client_name}
                onChange={(e) => set('client_name', e.target.value)}
              />
            </Field>
            <div className="flex items-center gap-2.5 pl-0.5">
              {HIGHLIGHT_COLORS.map(({ value, dot, ring }) => (
                <button
                  key={value}
                  type="button"
                  title={value}
                  onClick={() => set('highlight_color', form.highlight_color === value ? '' : value)}
                  className={[
                    'w-4 h-4 rounded-full transition-all',
                    dot,
                    form.highlight_color === value
                      ? `ring-2 ring-offset-2 ${ring} scale-110`
                      : 'opacity-40 hover:opacity-80 hover:scale-105',
                  ].join(' ')}
                />
              ))}
            </div>
          </div>

          {/* Brand / Seller */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.drawer.fields.brand} required error={errors.brand_id}>
              <select
                className={inputClass}
                value={form.brand_id}
                onChange={(e) => set('brand_id', e.target.value)}
              >
                <option value="">{t.drawer.placeholders.selectBrand}</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </Field>

            <Field label={t.drawer.fields.seller} required error={errors.seller_id}>
              {isSeller ? (
                <div className={`${inputClass} bg-slate-50 text-slate-500 cursor-not-allowed`}>
                  {isEdit ? (transaction.seller_name || user.sellerName) : user.sellerName}
                </div>
              ) : (
                <select
                  className={inputClass}
                  value={form.seller_id}
                  onChange={(e) => set('seller_id', e.target.value)}
                >
                  <option value="">{t.drawer.placeholders.selectSeller}</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          {/* Type */}
          <Field label={t.drawer.fields.transactionType} required={!isEdit} error={errors.transaction_type}>
            <select
              className={inputClass}
              value={form.transaction_type}
              onChange={(e) => set('transaction_type', e.target.value)}
            >
              <option value="">Seleccioná un tipo...</option>
              {TRANSACTION_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Field>

          {/* Sub Brand */}
          <Field label={t.drawer.fields.subBrand} error={errors.sub_brand}>
            <input
              type="text"
              className={inputClass}
              placeholder={t.drawer.placeholders.optional}
              value={form.sub_brand}
              onChange={(e) => set('sub_brand', e.target.value)}
            />
          </Field>

          {/* ── Financial fields ───────────────────────────── */}
          <div className="border-t border-[#E2E8F0] pt-5 space-y-5">

            {/* TCV / Due Date */}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.drawer.fields.tcv} required error={errors.tcv}>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-sm text-[#94A3B8] pointer-events-none">
                    $
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`${inputClass} pl-6`}
                    placeholder="0"
                    value={tcvDisplayValue}
                    onFocus={() => setTcvFocused(true)}
                    onBlur={() => setTcvFocused(false)}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, '')
                      set('tcv', raw)
                    }}
                  />
                </div>
              </Field>

              <Field label={t.drawer.fields.dueDate} required error={errors.due_date}>
                <input
                  type="date"
                  className={inputClass}
                  value={form.due_date}
                  onChange={(e) => set('due_date', e.target.value)}
                />
              </Field>
            </div>

            {/* Stage / Quarter */}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.drawer.fields.stage} required error={errors.stage_label}>
                <select
                  className={inputClass}
                  value={form.stage_label}
                  onChange={(e) => set('stage_label', e.target.value)}
                >
                  {STAGE_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </Field>

              <Field label={t.drawer.fields.quarter} required error={errors.quarter}>
                <select
                  className={inputClass}
                  value={form.quarter}
                  onChange={(e) => handleQuarterChange(e.target.value)}
                >
                  <option value="">{t.drawer.placeholders.selectQuarter}</option>
                  {QUARTER_OPTIONS.map((q) => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Q1-Q4 custom distribution */}
            {isQ1Q4Mode && !isLossStage && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[['q1', 'Q1'], ['q2', 'Q2'], ['q3', 'Q3'], ['q4', 'Q4']].map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-[#64748B] mb-1">{label}</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-3 flex items-center text-sm text-[#94A3B8] pointer-events-none">
                          $
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className={`${inputClass} pl-6 ${
                            autoAdjustedQuarter === key
                              ? 'border-amber-400 bg-amber-50 focus:ring-amber-400'
                              : ''
                          }`}
                          placeholder="0"
                          value={customAmounts[key]}
                          onChange={(e) => handleCustomAmountChange(key, e.target.value)}
                          onBlur={runAutoBalance}
                        />
                      </div>
                      {autoAdjustedQuarter === key && (
                        <p className="text-xs text-amber-600 mt-0.5">Ajustado automáticamente</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Total row */}
                <div className="flex items-center justify-between bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2">
                  <span className="text-xs text-[#64748B]">
                    Total:{' '}
                    <span className={`font-semibold tabular-nums ${
                      Math.abs(customRemaining) < 0.01
                        ? 'text-green-600'
                        : customRemaining < 0
                        ? 'text-red-500'
                        : 'text-amber-600'
                    }`}>
                      {formatUSD(customTotal)}
                    </span>
                    <span className="text-[#94A3B8] tabular-nums"> / {formatUSD(tcvNum)}</span>
                  </span>
                  {customRemaining > 0.01 && customRemaining <= 999 && (
                    <button
                      type="button"
                      onClick={runAutoBalance}
                      className="text-xs text-[#2563EB] hover:underline"
                    >
                      Auto completar
                    </button>
                  )}
                </div>

                {customRemaining > 999 && (
                  <p className="text-xs text-amber-600">
                    Diferencia de {formatUSD(customRemaining)} — ajuste manualmente
                  </p>
                )}
                {customRemaining < -0.01 && (
                  <p className="text-xs text-red-500">
                    El total excede el TCV por {formatUSD(-customRemaining)}
                  </p>
                )}
                {errors.custom_allocation && (
                  <p className="text-xs text-red-500">{errors.custom_allocation}</p>
                )}
              </div>
            )}

            {/* Weighted preview */}
            {isLossStage ? (
              <div className="bg-red-50 border border-red-100 rounded-md px-3 py-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-red-400">Weighted forecast</span>
                  <span className="text-sm font-semibold text-red-400 tabular-nums">$0 — LOSS</span>
                </div>
              </div>
            ) : tcvNum > 0 && (
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-[#64748B]">
                    Weighted{' '}
                    <span className="text-[#94A3B8]">
                      ({(stagePercent * 100).toFixed(0)}% × {formatUSD(tcvNum)})
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-[#0F172A] tabular-nums">
                    {formatUSD(weighted)}
                  </span>
                </div>
                {isQ1Q4Mode && (
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    {['q1', 'q2', 'q3', 'q4'].map((key, i) => {
                      const amt = parseFloat(customAmounts[key]) || 0
                      if (!amt) return null
                      return (
                        <span key={key} className="text-xs text-[#94A3B8] tabular-nums">
                          Q{i + 1}: {formatUSD(amt * stagePercent)}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ── Secondary fields ───────────────────────────── */}
          <div className="border-t border-[#E2E8F0] pt-5 space-y-5">

            <Field label={t.drawer.fields.vendorName} error={errors.vendor_name}>
              <input
                type="text"
                className={inputClass}
                placeholder={t.drawer.placeholders.optional}
                value={form.vendor_name}
                onChange={(e) => set('vendor_name', e.target.value)}
              />
            </Field>

            <Field label={t.drawer.fields.notes} error={errors.notes}>
              <textarea
                rows={3}
                className={`${inputClass} resize-none`}
                placeholder={t.drawer.placeholders.optionalNotes}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t.drawer.fields.odooOpportunity} error={errors.opportunity_odoo}>
                <input
                  type="text"
                  className={inputClass}
                  placeholder={t.drawer.placeholders.optional}
                  value={form.opportunity_odoo}
                  onChange={(e) => set('opportunity_odoo', e.target.value)}
                />
              </Field>
              <Field label={t.drawer.fields.brandOpp} error={errors.brand_opportunity_number}>
                <input
                  type="text"
                  className={inputClass}
                  placeholder={t.drawer.placeholders.optional}
                  value={form.brand_opportunity_number}
                  onChange={(e) => set('brand_opportunity_number', e.target.value)}
                />
              </Field>
            </div>

            <Field label={t.drawer.fields.invoiceNumber} error={errors.invoice_number}>
              <input
                type="text"
                className={inputClass}
                placeholder={t.drawer.placeholders.optional}
                value={form.invoice_number}
                onChange={(e) => set('invoice_number', e.target.value)}
              />
            </Field>

          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-[#E2E8F0] px-6 py-4">
          {isEdit && showDeleteConfirm && (
            <div className="mb-3 bg-red-50 border border-red-200 rounded-md px-3 py-2.5 flex items-center justify-between">
              <p className="text-xs text-red-700">{t.drawer.delete.question}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-xs text-[#64748B] hover:text-[#0F172A] px-2 py-1 rounded hover:bg-white transition-colors"
                >
                  {t.drawer.delete.cancel}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {t.drawer.delete.confirm}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              {isEdit && !showDeleteConfirm && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-sm text-red-500 hover:text-red-700 transition-colors"
                >
                  {t.drawer.delete.button}
                </button>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-[#64748B] bg-white border border-[#E2E8F0] rounded-md hover:bg-slate-50 transition-colors"
              >
                {t.drawer.cancel}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !isFormValid}
                className="px-4 py-2 text-sm font-medium text-white bg-[#2563EB] rounded-md hover:bg-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? t.drawer.saving : t.drawer.save}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
