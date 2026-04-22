/**
 * Minimal Odoo JSON-RPC client using Node native fetch (Node 18+).
 * Handles session authentication and search_read calls.
 */

export class OdooClient {
  constructor({ url, db, username, password }) {
    this.baseUrl = url.replace(/\/$/, '');
    this.db = db;
    this.username = username;
    this.password = password;
    this.sessionId = null;
  }

  async _rpc(endpoint, params) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.sessionId) headers['Cookie'] = `session_id=${this.sessionId}`;

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: 1, params }),
    });

    if (!res.ok) throw new Error(`Odoo HTTP ${res.status} at ${endpoint}`);

    // Capture session cookie on authenticate
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const m = setCookie.match(/session_id=([^;,\s]+)/);
      if (m) this.sessionId = m[1];
    }

    const data = await res.json();
    if (data.error) {
      const msg = data.error.data?.message || JSON.stringify(data.error);
      throw new Error(`Odoo RPC error: ${msg}`);
    }
    return data.result;
  }

  async authenticate() {
    const result = await this._rpc('/web/session/authenticate', {
      db: this.db,
      login: this.username,
      password: this.password,
    });
    if (!result?.uid) throw new Error('Odoo authentication failed — check credentials');
    return result.uid;
  }

  async searchRead(model, domain, fields, { limit = 500, offset = 0 } = {}) {
    if (!this.sessionId) await this.authenticate();
    return this._rpc('/web/dataset/call_kw', {
      model,
      method: 'search_read',
      args: [domain],
      kwargs: { fields, limit, offset, context: {} },
    });
  }
}

export function createOdooClient() {
  const { ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASSWORD } = process.env;
  if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !ODOO_PASSWORD) {
    throw new Error('Odoo env vars not configured: ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASSWORD');
  }
  return new OdooClient({ url: ODOO_URL, db: ODOO_DB, username: ODOO_USER, password: ODOO_PASSWORD });
}
