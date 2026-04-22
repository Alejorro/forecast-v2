const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  // Handle 204 No Content
  if (res.status === 204) return null
  return res.json()
}

// --- Auth ---
export function getMe() {
  return request('/api/auth/me')
}

export function login(username, password) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function logout() {
  return request('/api/auth/logout', { method: 'POST' })
}

// --- Brands ---
export function getBrands() {
  return request('/api/brands')
}

// --- Sellers ---
export function getSellers() {
  return request('/api/sellers')
}

// --- Transactions ---
export function getTransactions(params = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      qs.set(k, v)
    }
  })
  const query = qs.toString()
  return request(`/api/transactions${query ? `?${query}` : ''}`)
}

export function createTransaction(data) {
  return request('/api/transactions', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateTransaction(id, data) {
  return request(`/api/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteTransaction(id) {
  return request(`/api/transactions/${id}`, {
    method: 'DELETE',
  })
}

export function duplicateTransaction(id) {
  return request(`/api/transactions/${id}/duplicate`, {
    method: 'POST',
  })
}

// --- Brand summary ---
export function getBrandSummary(brandId, year) {
  return request(`/api/brands/${brandId}/summary?year=${year}`)
}

// --- Sellers summary ---
export function getSellersSummary(year) {
  return request(`/api/sellers/summary?year=${year}`)
}

// --- Overview ---
export function getOverview(year) {
  return request(`/api/overview?year=${year}`)
}

// --- Performance ---
export function getPerformance(params = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v)
  })
  const query = qs.toString()
  return request(`/api/performance${query ? `?${query}` : ''}`)
}

// --- Plans ---
export function getPlans(year) {
  return request(`/api/plans?year=${year}`)
}

export function updatePlan(brand_id, data) {
  return request(`/api/plans/${brand_id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// --- Activity log ---
export function getActivity(params = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v)
  })
  const query = qs.toString()
  return request(`/api/activity${query ? `?${query}` : ''}`)
}
