import React, { useState, useEffect } from 'react'
import { getActivity } from '../utils/api'
import { formatUSD } from '../utils/format'

const ACTION_LABELS = {
  create:    { label: 'Creó',      color: 'bg-blue-100 text-blue-700' },
  edit:      { label: 'Editó',     color: 'bg-amber-100 text-amber-700' },
  delete:    { label: 'Eliminó',   color: 'bg-red-100 text-red-600' },
  duplicate: { label: 'Duplicó',   color: 'bg-violet-100 text-violet-700' },
}

const ROLE_LABELS = {
  admin:   'Admin',
  manager: 'Manager',
  seller:  'Vendedor',
}

function ActionBadge({ action }) {
  const meta = ACTION_LABELS[action] || { label: action, color: 'bg-slate-100 text-slate-600' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${meta.color}`}>
      {meta.label}
    </span>
  )
}

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function StageChange({ prev, next }) {
  if (!prev || prev === next) return <span className="text-slate-600">{next}</span>
  return (
    <span className="flex items-center gap-1 flex-wrap">
      <span className="text-slate-400 line-through text-xs">{prev}</span>
      <span className="text-slate-400 text-xs">→</span>
      <span className="font-medium text-slate-700">{next}</span>
    </span>
  )
}

export default function ActivityPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterUser, setFilterUser] = useState('')
  const [filterAction, setFilterAction] = useState('')

  const users = [...new Set(logs.map(l => l.performed_by))].sort()

  useEffect(() => {
    setLoading(true)
    setError(null)
    getActivity({ limit: 300 })
      .then(setLogs)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = logs.filter(l => {
    if (filterUser && l.performed_by !== filterUser) return false
    if (filterAction && l.action !== filterAction) return false
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Actividad</h1>
        <span className="text-sm text-slate-400">{filtered.length} registros</span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los usuarios</option>
          {users.map(u => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>

        <select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas las acciones</option>
          <option value="create">Creó</option>
          <option value="edit">Editó</option>
          <option value="delete">Eliminó</option>
          <option value="duplicate">Duplicó</option>
        </select>

        {(filterUser || filterAction) && (
          <button
            onClick={() => { setFilterUser(''); setFilterAction('') }}
            className="text-sm text-slate-400 hover:text-slate-600"
          >
            Limpiar
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-[#E2E8F0] rounded-lg">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-50 last:border-0">
              <div className="h-4 bg-slate-100 rounded animate-pulse w-32" />
              <div className="h-4 bg-slate-100 rounded animate-pulse w-20" />
              <div className="h-4 bg-slate-100 rounded animate-pulse w-40 flex-1" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-slate-400 text-sm">Sin actividad registrada</p>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Fecha</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Usuario</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Acción</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cliente</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Brand</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Etapa</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">TCV</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => {
                const d = log.details || {}
                return (
                  <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-5 py-3 text-xs text-slate-400 whitespace-nowrap">{formatDate(log.created_at)}</td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-700">{log.performed_by}</div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wide">{ROLE_LABELS[log.performed_by_role] || log.performed_by_role}</div>
                    </td>
                    <td className="px-5 py-3">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-5 py-3 text-slate-700 max-w-[200px] truncate font-medium">
                      {d.client_name || '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-500">{d.brand_name || '—'}</td>
                    <td className="px-5 py-3">
                      {log.action === 'edit' && d.prev_stage
                        ? <StageChange prev={d.prev_stage} next={d.stage_label} />
                        : <span className="text-slate-600">{d.stage_label || '—'}</span>
                      }
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                      {d.tcv != null ? formatUSD(d.tcv) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
