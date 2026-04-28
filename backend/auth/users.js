import pool from '../db.js';

export async function findUser(username, password) {
  const { rows } = await pool.query(
    `SELECT username, password, role, seller_name
     FROM users
     WHERE LOWER(username) = LOWER($1) AND password = $2`,
    [String(username).trim(), String(password)]
  );
  if (!rows[0]) return null;
  return {
    username:   rows[0].username,
    role:       rows[0].role,
    sellerName: rows[0].seller_name ?? null,
  };
}
