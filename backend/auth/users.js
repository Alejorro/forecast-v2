// Hardcoded internal user registry for DOT4 Forecast V2.
// Not a public auth system — internal tool only.

const USERS = [
  { username: 'admin',   password: 'alejocapo', role: 'admin' },
  { username: 'Milton',  password: 'alejocapo', role: 'admin' },
  { username: 'Claudio', password: 'alejocapo', role: 'admin' },
  { username: 'Brian',   password: 'alejocapo', role: 'admin' },
  { username: 'Manuel',  password: 'alejocapo', role: 'admin' },
  { username: 'Mariano', password: 'alejocapo', role: 'admin' },
  { username: 'JC',      password: 'alejocapo', role: 'admin' },
];

/**
 * Authenticate a login attempt.
 * Returns a session user object on success, or null on failure.
 */
export function findUser(username, password) {
  const match = USERS.find(
    u => u.username.toLowerCase() === username.toLowerCase()
      && u.password === password
  );
  if (!match) return null;
  return { role: match.role };
}
