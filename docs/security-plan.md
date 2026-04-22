# Security Plan — DOT4 Forecast V2

> Última actualización: 2026-04-22

---

## 1. Riesgos identificados

### Alta prioridad

| # | Riesgo | Estado |
|---|---|---|
| 1 | Contraseñas hardcodeadas en `backend/auth/users.js` | Pendiente |
| 2 | `SESSION_SECRET` con fallback inseguro en código | Pendiente |
| 3 | Sin rate limiting en `/api/auth/login` | Pendiente |
| 4 | Sin logs de intentos fallidos de login | Pendiente |

### Media prioridad

| # | Riesgo | Estado |
|---|---|---|
| 5 | Sesiones en memoria (pérdida al reiniciar servidor) | Aceptado por ahora |
| 6 | SSL/HTTPS depende de Vercel/Railway — a reconfigurar si se migra a servidor DOT4 | Pendiente (post-migración) |

### Pendiente de definir

| # | Riesgo | Estado |
|---|---|---|
| 7 | Credenciales de integración Odoo | A definir |

---

## 2. Plan de mejoras

### 2.1 Contraseñas de usuarios

**Problema:** Todas las contraseñas están en texto plano en `backend/auth/users.js` y en el repositorio git.

**Solución propuesta:**
- Hashear contraseñas con `bcrypt` en `users.js`
- Las contraseñas hasheadas pueden vivir en el código sin riesgo
- `findUser()` usa `bcrypt.compare()` en vez de comparación directa

**Implementación:**
```bash
npm install bcrypt
```
```js
import bcrypt from 'bcrypt'
// En findUser():
const match = USERS.find(u => u.username.toLowerCase() === username.toLowerCase())
if (!match) return null
const valid = await bcrypt.compare(password, match.passwordHash)
if (!valid) return null
```

### 2.2 SESSION_SECRET

**Problema:** Fallback a string hardcodeado si `SESSION_SECRET` no está definido.

**Solución:** Hacer que el backend falle al arrancar si `SESSION_SECRET` no está en el entorno.
```js
const secret = process.env.SESSION_SECRET
if (!secret) throw new Error('SESSION_SECRET env var is required')
```

### 2.3 Rate limiting en login

**Problema:** Sin límite de intentos, se puede hacer fuerza bruta.

**Solución:** `express-rate-limit` en la ruta de login.
```bash
npm install express-rate-limit
```
```js
import rateLimit from 'express-rate-limit'
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 })
app.use('/api/auth/login', loginLimiter)
```

### 2.4 Logs de intentos fallidos

**Problema:** No hay visibilidad sobre intentos de acceso no autorizados.

**Solución:** Loguear en `activity_logs` los intentos fallidos de login con IP y username intentado.

### 2.5 Credenciales Odoo

**A definir con el usuario antes de implementar la integración.**

Opciones:
- Variables de entorno en Railway/servidor (`ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_PASSWORD`)
- Nunca en el código ni en el repositorio

---

## 3. Contexto de riesgo

- La app es de uso interno. No está expuesta a internet masivo.
- No maneja pagos ni datos financieros críticos (es forecast, no facturación).
- El riesgo real es acceso no autorizado de un empleado a datos de otro, o exposición accidental del repositorio.
- Prioridad: contraseñas hasheadas > SESSION_SECRET > rate limiting > logs.
