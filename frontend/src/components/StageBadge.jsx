import React from 'react'

const STAGE_STYLES = {
  'Identified':  'bg-slate-100 text-slate-600',
  'Proposal 25': 'bg-amber-50 text-amber-600',
  'Proposal 50': 'bg-amber-100 text-amber-700',
  'Proposal 75': 'bg-orange-100 text-orange-700',
  'Won':         'bg-green-100 text-green-700',
  'LOSS':        'bg-slate-100 text-slate-500',
}

const STAGE_DISPLAY = {
  'Identified':  'Identified 10%',
  'Proposal 25': 'Proposal 25%',
  'Proposal 50': 'Proposal 50%',
  'Proposal 75': 'Proposal 75%',
  'Won':         'Won',
  'LOSS':        'LOSS',
}

export default function StageBadge({ stage }) {
  const styles = STAGE_STYLES[stage] || 'bg-slate-100 text-slate-500'
  const label = STAGE_DISPLAY[stage] || stage
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${styles}`}>
      {label}
    </span>
  )
}
