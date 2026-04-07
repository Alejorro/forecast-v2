import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAppContext } from '../context/AppContext'
import { createTransaction, updateTransaction, deleteTransaction } from '../utils/api'
import { formatUSD } from '../utils/format'

const STAGE_OPTIONS = [
  'Identified',
  'Proposal 25',
  'Proposal 50',
  'Proposal 75',
  'Won',
]

const STAGE_PERCENT = {
  'Identified': 0.10,
  'Proposal 25': 0.25,
  'Proposal 50': 0.50,
  'Proposal 75': 0.75,
  'Won': 1.00,
}

const EMPTY_FORM = {
  client_name: '',
  project_name: '',
  brand_id: '',
  seller_id: '',
  sub_brand: '',
  vendor_name: '',
  opportunity_odoo: '',
  brand_opportunity_number: '',
  tcv: '',
  stage_label: 'Identified',
  status_label: '',
  due_date: '',
  allocation_q1: '',
  allocation_q2: '',
  allocation_q3: '',
  allocation_q4: '',
  description: '',
  invoice_number: '',
  notes: '',
}

function buildFormFromTransaction(tx) {
  return {
    client_name: tx.client_name || '',
    project_name: tx.project_name || '',
    brand_id: tx.brand_id != null ? String(tx.brand_id) : '',
    seller_id: tx.seller_id != null ? String(tx.seller_id) : '',
    sub_brand: tx.sub_brand || '',
    vendor_name: tx.vendor_name || '',
    opportunity_odoo: tx.opportunity_odoo || '',
    brand_opportunity_number: tx.brand_opportunity_number || '',
    tcv: tx.tcv != null ? String(tx.tcv) : '',
    stage_label: tx.stage_label || 'Identified',
    status_label: tx.status_label || '',
    due_date: tx.due_date ? tx.due_date.substring(0, 10) : '',
    allocation_q1: tx.allocation_q1 != null ? String(tx.allocation_q1) : '',
    allocation_q2: tx.allocation_q2 != null ? String(tx.allocation_q2) : '',
    allocation_q3: tx.allocation_q3 != null ? String(tx.allocation_q3) : '',
    allocation_q4: tx.allocation_q4 != null ? String(tx.allocation_q4) : '',
    description: tx.description || '',
    invoice_number: tx.invoice_number || '',
    notes: tx.notes || '',
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
  const isEdit = Boolean(transaction)

  const [form, setForm] = useState(
    isEdit ? buildFormFromTransaction(transaction) : { ...EMPTY_FORM }
  )
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const firstInputRef = useRef(null)

  // Focus first input on open
  useEffect(() => {
    const timer = setTimeout(() => firstInputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [])

  // Keyboard handler
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

  // Computed preview values
  const tcvNum = parseFloat(form.tcv) || 0
  const stagePercent = STAGE_PERCENT[form.stage_label] || 0
  const weighted = tcvNum * stagePercent
  const q1Val = weighted * (parseFloat(form.allocation_q1) || 0)
  const q2Val = weighted * (parseFloat(form.allocation_q2) || 0)
  const q3Val = weighted * (parseFloat(form.allocation_q3) || 0)
  const q4Val = weighted * (parseFloat(form.allocation_q4) || 0)
  const allocTotal =
    (parseFloat(form.allocation_q1) || 0) +
    (parseFloat(form.allocation_q2) || 0) +
    (parseFloat(form.allocation_q3) || 0) +
    (parseFloat(form.allocation_q4) || 0)

  function validate() {
    const errs = {}
    if (!form.client_name.trim()) errs.client_name = 'Required'
    if (!form.brand_id) errs.brand_id = 'Required'
    if (!form.seller_id) errs.seller_id = 'Required'
    if (!form.tcv || isNaN(parseFloat(form.tcv)) || parseFloat(form.tcv) < 0)
      errs.tcv = 'Enter a valid amount'
    if (!form.stage_label) errs.stage_label = 'Required'
    if (!form.due_date) errs.due_date = 'Required'

    // Allocations must sum to 1.0 if any are provided
    const allocs = [form.allocation_q1, form.allocation_q2, form.allocation_q3, form.allocation_q4]
    const hasAlloc = allocs.some((a) => a !== '' && a !== null)
    if (hasAlloc) {
      const sum = allocs.reduce((acc, a) => acc + (parseFloat(a) || 0), 0)
      if (Math.abs(sum - 1.0) > 0.001) {
        errs.allocations = `Allocations sum to ${(sum * 100).toFixed(1)}% — must equal 100%`
      }
    }

    return errs
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...form,
        brand_id: form.brand_id ? Number(form.brand_id) : null,
        seller_id: form.seller_id ? Number(form.seller_id) : null,
        tcv: parseFloat(form.tcv),
        allocation_q1: form.allocation_q1 !== '' ? parseFloat(form.allocation_q1) : null,
        allocation_q2: form.allocation_q2 !== '' ? parseFloat(form.allocation_q2) : null,
        allocation_q3: form.allocation_q3 !== '' ? parseFloat(form.allocation_q3) : null,
        allocation_q4: form.allocation_q4 !== '' ? parseFloat(form.allocation_q4) : null,
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

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />

      {/* Drawer panel */}
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

          <Field label="Project Name" error={errors.project_name}>
            <input
              type="text"
              className={inputClass}
              placeholder="e.g. Network Upgrade Phase 2"
              value={form.project_name}
              onChange={(e) => set('project_name', e.target.value)}
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
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Seller" required error={errors.seller_id}>
              <select
                className={inputClass}
                value={form.seller_id}
                onChange={(e) => set('seller_id', e.target.value)}
              >
                <option value="">Select seller...</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
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

          <div className="grid grid-cols-2 gap-3">
            <Field label="TCV (USD)" required error={errors.tcv}>
              <input
                type="number"
                min="0"
                step="1"
                className={inputClass}
                placeholder="0"
                value={form.tcv}
                onChange={(e) => set('tcv', e.target.value)}
              />
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

          <div className="grid grid-cols-2 gap-3">
            <Field label="Stage" required error={errors.stage_label}>
              <select
                className={inputClass}
                value={form.stage_label}
                onChange={(e) => set('stage_label', e.target.value)}
              >
                {STAGE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Status" error={errors.status_label}>
              <select
                className={inputClass}
                value={form.status_label}
                onChange={(e) => set('status_label', e.target.value)}
              >
                <option value="">—</option>
                <option value="LOSS">LOSS</option>
              </select>
            </Field>
          </div>

          {/* Allocations */}
          <div>
            <p className="text-xs font-medium text-[#64748B] mb-2">
              Quarter Allocations{' '}
              <span className="text-[#94A3B8] font-normal">(decimals, must sum to 1.0)</span>
            </p>
            <div className="grid grid-cols-4 gap-2">
              {['q1', 'q2', 'q3', 'q4'].map((q, i) => {
                const field = `allocation_${q}`
                return (
                  <div key={q}>
                    <label className="block text-xs text-[#94A3B8] mb-1 text-center">
                      Q{i + 1}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      className={`${inputClass} text-center`}
                      placeholder="0"
                      value={form[field]}
                      onChange={(e) => set(field, e.target.value)}
                    />
                  </div>
                )
              })}
            </div>
            {errors.allocations && (
              <p className="text-xs text-red-500 mt-1.5">{errors.allocations}</p>
            )}

            {/* Live preview */}
            {tcvNum > 0 && (
              <div className="mt-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-3 py-2.5">
                <p className="text-xs text-[#64748B] font-medium mb-1">
                  Weighted preview{' '}
                  <span className="text-[#94A3B8] font-normal">
                    ({(stagePercent * 100).toFixed(0)}% × {formatUSD(tcvNum)} = {formatUSD(weighted)})
                  </span>
                </p>
                <div className="flex gap-4 text-xs">
                  {[
                    { label: 'Q1', val: q1Val },
                    { label: 'Q2', val: q2Val },
                    { label: 'Q3', val: q3Val },
                    { label: 'Q4', val: q4Val },
                  ].map(({ label, val }) => (
                    <div key={label}>
                      <span className="text-[#94A3B8]">{label}: </span>
                      <span className="font-medium text-[#0F172A]">
                        {val > 0 ? formatUSD(val) : '—'}
                      </span>
                    </div>
                  ))}
                  <div className="ml-auto">
                    <span className="text-[#94A3B8]">Sum: </span>
                    <span
                      className={`font-medium ${
                        Math.abs(allocTotal - 1.0) < 0.001
                          ? 'text-green-600'
                          : allocTotal > 0
                          ? 'text-red-500'
                          : 'text-[#94A3B8]'
                      }`}
                    >
                      {(allocTotal * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

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
          {/* Delete confirmation */}
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
            {/* Left: delete link */}
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

            {/* Right: cancel + save */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-[#64748B] bg-white border border-[#E2E8F0] rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-[#2563EB] rounded-md hover:bg-[#1D4ED8] disabled:opacity-50 transition-colors"
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
