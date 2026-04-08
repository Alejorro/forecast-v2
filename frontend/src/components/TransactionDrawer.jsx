import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAppContext } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { createTransaction, updateTransaction, deleteTransaction } from '../utils/api'
import { formatUSD } from '../utils/format'

const STAGE_OPTIONS = [
  { value: 'Identified',  label: 'IDENTIFIED 10%',  pct: 0.10 },
  { value: 'Proposal 25', label: 'PROPOSAL 25%',     pct: 0.25 },
  { value: 'Proposal 50', label: 'PROPOSAL 50%',     pct: 0.50 },
  { value: 'Proposal 75', label: 'PROPOSAL 75%',     pct: 0.75 },
  { value: 'Won',         label: 'WON 100%',         pct: 1.00 },
  { value: 'LOSS',        label: 'LOSS',             pct: 0.00 },
]

const STAGE_PCT = Object.fromEntries(STAGE_OPTIONS.map((s) => [s.value, s.pct]))

const QUARTER_OPTIONS = ['Q1', 'Q2', 'Q3', 'Q4', '1Q-4Q']

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
  if (near(q1, 0.25) && near(q2, 0.25) && near(q3, 0.25) && near(q4, 0.25)) return '1Q-4Q'
  return ''
}

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
}

function buildFormFromTransaction(tx) {
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
    quarter:                  deriveQuarter(tx),
    due_date:                 tx.due_date ? tx.due_date.substring(0, 10) : '',
    description:              tx.description || '',
    invoice_number:           tx.invoice_number || '',
    notes:                    tx.notes || '',
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

  function validate() {
    const errs = {}
    if (!form.client_name.trim()) errs.client_name = 'Required'
    if (!form.brand_id) errs.brand_id = 'Required'
    if (!form.seller_id) errs.seller_id = 'Required'
    if (!isLossStage) {
      if (!form.tcv || isNaN(parseFloat(form.tcv)) || parseFloat(form.tcv) < 0)
        errs.tcv = 'Enter a valid amount'
      if (!form.quarter) errs.quarter = 'Required'
      if (!form.due_date) errs.due_date = 'Required'
    }
    if (!form.stage_label) errs.stage_label = 'Required'
    return errs
  }

  const isFormValid = (() => {
    if (!form.client_name.trim()) return false
    if (!form.brand_id) return false
    if (!form.seller_id) return false
    if (!form.stage_label) return false
    if (!isLossStage) {
      if (!form.tcv || isNaN(parseFloat(form.tcv)) || parseFloat(form.tcv) < 0) return false
      if (!form.quarter) return false
      if (!form.due_date) return false
    }
    return true
  })()

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
        quarter:                  form.quarter || null,
        due_date:                 form.due_date || null,
        description:              form.description || null,
        invoice_number:           form.invoice_number || null,
        notes:                    form.notes || null,
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
        aria-label={isEdit ? 'Edit Transaction' : 'New Transaction'}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] flex-shrink-0">
          <h2 className="text-base font-semibold text-[#0F172A]">
            {isEdit ? 'Edit Transaction' : 'New Transaction'}
          </h2>
          <button
            onClick={onClose}
            className="text-[#64748B] hover:text-[#0F172A] p-1 rounded-md hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-4">
          {errors._global && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">
              {errors._global}
            </div>
          )}

          <Field label="Client Name" required error={errors.client_name}>
            <input
              ref={firstInputRef}
              type="text"
              className={inputClass}
              placeholder="e.g. Acme Corp"
              value={form.client_name}
              onChange={(e) => set('client_name', e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand" required error={errors.brand_id}>
              <select
                className={inputClass}
                value={form.brand_id}
                onChange={(e) => set('brand_id', e.target.value)}
              >
                <option value="">Select brand...</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Seller" required error={errors.seller_id}>
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
                  <option value="">Select seller...</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          <Field label="Sub Brand" error={errors.sub_brand}>
            <input
              type="text"
              className={inputClass}
              placeholder="Optional"
              value={form.sub_brand}
              onChange={(e) => set('sub_brand', e.target.value)}
            />
          </Field>

          {/* TCV + Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="TCV (USD)" required error={errors.tcv}>
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

            <Field label="Due Date" required error={errors.due_date}>
              <input
                type="date"
                className={inputClass}
                value={form.due_date}
                onChange={(e) => set('due_date', e.target.value)}
              />
            </Field>
          </div>

          {/* Stage + Quarter */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stage" required error={errors.stage_label}>
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

            <Field label="Quarter" required error={errors.quarter}>
              <select
                className={inputClass}
                value={form.quarter}
                onChange={(e) => set('quarter', e.target.value)}
              >
                <option value="">Select quarter...</option>
                {QUARTER_OPTIONS.map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </Field>
          </div>

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
              {form.quarter === '1Q-4Q' && (
                <p className="text-xs text-[#94A3B8] mt-1">
                  Distributed equally across Q1–Q4 ({formatUSD(weighted / 4)} each)
                </p>
              )}
            </div>
          )}

          {/* Optional fields */}
          <Field label="Vendor Name" error={errors.vendor_name}>
            <input
              type="text"
              className={inputClass}
              placeholder="Optional"
              value={form.vendor_name}
              onChange={(e) => set('vendor_name', e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Odoo Opportunity" error={errors.opportunity_odoo}>
              <input
                type="text"
                className={inputClass}
                placeholder="Optional"
                value={form.opportunity_odoo}
                onChange={(e) => set('opportunity_odoo', e.target.value)}
              />
            </Field>
            <Field label="Brand Opp #" error={errors.brand_opportunity_number}>
              <input
                type="text"
                className={inputClass}
                placeholder="Optional"
                value={form.brand_opportunity_number}
                onChange={(e) => set('brand_opportunity_number', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Invoice Number" error={errors.invoice_number}>
            <input
              type="text"
              className={inputClass}
              placeholder="Optional"
              value={form.invoice_number}
              onChange={(e) => set('invoice_number', e.target.value)}
            />
          </Field>

          <Field label="Notes" error={errors.notes}>
            <textarea
              rows={3}
              className={`${inputClass} resize-none`}
              placeholder="Optional notes..."
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </Field>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-[#E2E8F0] px-6 py-4">
          {isEdit && showDeleteConfirm && (
            <div className="mb-3 bg-red-50 border border-red-200 rounded-md px-3 py-2.5 flex items-center justify-between">
              <p className="text-xs text-red-700">Delete this transaction?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-xs text-[#64748B] hover:text-[#0F172A] px-2 py-1 rounded hover:bg-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  Confirm Delete
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
                  Delete transaction
                </button>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-[#64748B] bg-white border border-[#E2E8F0] rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !isFormValid}
                className="px-4 py-2 text-sm font-medium text-white bg-[#2563EB] rounded-md hover:bg-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
