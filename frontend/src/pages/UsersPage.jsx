import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getUsers, createUser, updateUser, deleteUser } from '../utils/api'

const ROLES = ['admin', 'manager', 'seller']

const ROLE_BADGE = {
  manager: 'bg-violet-100 text-violet-700',
  admin:   'bg-blue-100 text-blue-700',
  seller:  'bg-green-100 text-green-700',
}

const ROLE_LABEL = {
  manager: 'Manager',
  admin:   'Admin',
  seller:  'Vendedor',
}

const EMPTY_FORM = { username: '', password: '', role: 'seller', seller_name: '' }

function RoleBadge({ role }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${ROLE_BADGE[role] || 'bg-slate-100 text-slate-600'}`}>
      {ROLE_LABEL[role] || role}
    </span>
  )
}

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [drawer, setDrawer]   = useState(null) // null | 'new' | { username, role, seller_name }
  const [form, setForm]       = useState(EMPTY_FORM)
  const [saving, setSaving]   = useState(false)
  const [formError, setFormError] = useState(null)

  async function fetchUsers() {
    setLoading(true)
    setError(null)
    try {
      setUsers(await getUsers())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  function openNew() {
    setForm(EMPTY_FORM)
    setFormError(null)
    setDrawer('new')
  }

  function openEdit(u) {
    setForm({ username: u.username, password: '', role: u.role, seller_name: u.seller_name || '' })
    setFormError(null)
    setDrawer(u)
  }

  function closeDrawer() {
    setDrawer(null)
    setFormError(null)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      if (drawer === 'new') {
        await createUser({ username: form.username, password: form.password, role: form.role, seller_name: form.seller_name || null })
      } else {
        const payload = { role: form.role, seller_name: form.seller_name || null }
        if (form.password.trim()) payload.password = form.password.trim()
        await updateUser(drawer.username, payload)
      }
      await fetchUsers()
      closeDrawer()
    } catch (e) {
      setFormError(e.message.replace(/^API error \d+: /, '').replace(/^{"error":"/, '').replace(/"}$/, ''))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(username) {
    if (!window.confirm(`¿Eliminar al usuario "${username}"? Esta acción no se puede deshacer.`)) return
    try {
      await deleteUser(username)
      await fetchUsers()
    } catch (e) {
      alert(e.message)
    }
  }

  const isEditing = drawer && drawer !== 'new'
  const isSelf    = isEditing && drawer.username === currentUser?.username

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Usuarios</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestión de cuentas y roles</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nuevo usuario
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {error ? (
          <div className="px-6 py-12 text-center text-sm text-red-500">{error}</div>
        ) : loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">Cargando...</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Usuario</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Rol</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Vendedor vinculado</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.username} className={`border-b border-slate-100 last:border-0 ${i % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}`}>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{u.username}</td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3 text-sm text-slate-500">{u.seller_name || <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(u)}
                        className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                      >
                        Editar
                      </button>
                      {u.username !== currentUser?.username && (
                        <button
                          onClick={() => handleDelete(u.username)}
                          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Drawer */}
      {drawer !== null && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={closeDrawer} />
          <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">
                {drawer === 'new' ? 'Nuevo usuario' : `Editar ${drawer.username}`}
              </h2>
              <button onClick={closeDrawer} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Username */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                  Usuario
                </label>
                {drawer === 'new' ? (
                  <input
                    type="text"
                    required
                    value={form.username}
                    onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="NombreUsuario"
                    autoFocus
                  />
                ) : (
                  <div className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-700 font-medium">
                    {drawer.username}
                    {isSelf && <span className="ml-2 text-xs text-slate-400">(vos)</span>}
                  </div>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                  Contraseña {isEditing && <span className="normal-case font-normal text-slate-400">(dejá vacío para no cambiar)</span>}
                </label>
                <input
                  type="text"
                  required={drawer === 'new'}
                  value={form.password}
                  onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={drawer === 'new' ? 'Contraseña' : '••••••••'}
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                  Rol
                </label>
                {isSelf ? (
                  <div className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md">
                    <RoleBadge role={form.role} />
                    <span className="ml-2 text-xs text-slate-400">No podés cambiar tu propio rol</span>
                  </div>
                ) : (
                  <select
                    value={form.role}
                    onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {ROLES.map(r => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Seller name */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                  Vendedor vinculado <span className="normal-case font-normal text-slate-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={form.seller_name}
                  onChange={(e) => setForm(f => ({ ...f, seller_name: e.target.value }))}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nombre exacto en la tabla sellers"
                />
                <p className="text-xs text-slate-400 mt-1">Necesario para que el rol Vendedor vea sus propias transacciones.</p>
              </div>

              {formError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {formError}
                </p>
              )}
            </form>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
              <button
                type="button"
                onClick={closeDrawer}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
