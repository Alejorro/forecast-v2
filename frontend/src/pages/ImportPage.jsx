import React, { useState, useRef } from 'react'
import t from '../utils/t'

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────

function StatBlock({ label, value, color = 'text-slate-900' }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={`text-2xl font-bold tabular-nums ${color}`}>{value}</span>
      <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">{label}</span>
    </div>
  )
}

function LogRow({ type, message }) {
  const styles = {
    success: 'text-green-700 bg-green-50 border-green-200',
    warning: 'text-amber-700 bg-amber-50 border-amber-200',
    error: 'text-red-700 bg-red-50 border-red-200',
    info: 'text-slate-600 bg-slate-50 border-slate-200',
  }
  const icons = {
    success: '✓',
    warning: '!',
    error: '✕',
    info: '·',
  }
  return (
    <div className={`flex items-start gap-2.5 px-3 py-2 text-sm border rounded-md ${styles[type] ?? styles.info}`}>
      <span className="font-bold mt-px text-xs">{icons[type] ?? '·'}</span>
      <span>{message}</span>
    </div>
  )
}

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────

export default function ImportPage() {
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState(null)
  const fileInputRef = useRef(null)

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  function handleFileChange(e) {
    const picked = e.target.files[0]
    if (picked) setFile(picked)
  }

  function handleClear() {
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Placeholder state — import not wired yet
  const isReady = !!file
  const hasResults = false // flip to true once backend is connected

  return (
    <div className="max-w-4xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">{t.import.title}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t.import.subtitle}
        </p>
      </div>

      {/* ── Upload card ── */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
          {t.import.fileSection}
        </h2>

        {file ? (
          /* File selected state */
          <div className="flex items-center justify-between gap-4 px-4 py-3 bg-slate-50 border border-slate-200 rounded-md">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-slate-400 text-base">📄</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                <p className="text-xs text-slate-400">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <button
              onClick={handleClear}
              className="flex-shrink-0 text-xs text-slate-400 hover:text-red-500 transition-colors"
            >
              {t.import.remove}
            </button>
          </div>
        ) : (
          /* Drop zone */
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={[
              'flex flex-col items-center justify-center gap-3 px-6 py-10',
              'border-2 border-dashed rounded-lg cursor-pointer transition-colors',
              dragOver
                ? 'border-blue-400 bg-blue-50'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
            ].join(' ')}
          >
            <span className="text-2xl text-slate-300">↑</span>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">
                {t.import.dropPrompt}{' '}
                <span className="text-blue-600">{t.import.browse}</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">{t.import.acceptedFormat}</p>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Action row */}
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-slate-400">
            {t.import.validationNote}
          </p>
          <button
            disabled={!isReady}
            className={[
              'px-4 py-2 text-sm font-medium rounded-md transition-colors',
              isReady
                ? 'text-white bg-blue-600 hover:bg-blue-700 shadow-sm'
                : 'text-slate-300 bg-slate-100 cursor-not-allowed',
            ].join(' ')}
          >
            {t.import.validateButton}
          </button>
        </div>
      </div>

      {/* ── Validation summary card ── */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-5">
          {t.import.validationTitle}
        </h2>

        {hasResults ? (
          /* Populated state — shown after backend validates */
          <div className="grid grid-cols-4 gap-6 pb-5 mb-5 border-b border-slate-100">
            <StatBlock label={t.import.statLabels.plans}        value="12" color="text-slate-900" />
            <StatBlock label={t.import.statLabels.transactions}  value="84" color="text-slate-900" />
            <StatBlock label={t.import.statLabels.skipped}      value="3"  color="text-amber-600" />
            <StatBlock label={t.import.statLabels.errors}       value="1"  color="text-red-600" />
          </div>
        ) : (
          /* Empty state */
          <div className="grid grid-cols-4 gap-6 pb-5 mb-5 border-b border-slate-100">
            <StatBlock label={t.import.statLabels.plans}       value="—" color="text-slate-300" />
            <StatBlock label={t.import.statLabels.transactions} value="—" color="text-slate-300" />
            <StatBlock label={t.import.statLabels.skipped}     value="—" color="text-slate-300" />
            <StatBlock label={t.import.statLabels.errors}      value="—" color="text-slate-300" />
          </div>
        )}

        {/* Import action row */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {hasResults ? t.import.importNote : t.import.runFirst}
          </p>
          <button
            disabled={!hasResults}
            className={[
              'px-4 py-2 text-sm font-medium rounded-md transition-colors',
              hasResults
                ? 'text-white bg-green-600 hover:bg-green-700 shadow-sm'
                : 'text-slate-300 bg-slate-100 cursor-not-allowed',
            ].join(' ')}
          >
            {t.import.importAction}
          </button>
        </div>
      </div>

      {/* ── Import log card ── */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
          {t.import.logTitle}
        </h2>

        {hasResults ? (
          <div className="flex flex-col gap-2">
            <LogRow type="success" message="84 transactions validated successfully." />
            <LogRow type="warning" message="Row 12: missing seller — row skipped." />
            <LogRow type="warning" message="Row 31: missing seller — row skipped." />
            <LogRow type="warning" message="Row 58: unknown stage label 'Pending' — row skipped." />
            <LogRow type="error" message="Row 74: TCV value is not a number — row skipped." />
          </div>
        ) : (
          <p className="text-sm text-slate-400 py-6 text-center">
            {t.import.noResultsYet}
          </p>
        )}
      </div>
    </div>
  )
}
