// Hardcoded internal user registry for DOT4 Forecast V2.
// Not a public auth system — internal tool only.

export const SELLERS = [
  { code: 'CB',  name: 'Christian Braun' },
  { code: 'MG',  name: 'Milton Gallo' },
  { code: 'CL',  name: 'Carlos Lopez' },
  { code: 'MV',  name: 'Mathias Villamayor' },
  { code: 'MB',  name: 'Mariano Basso' },
  { code: 'FVI', name: 'Fabio Villamayor' },
  { code: 'FV',  name: 'Florencia Vargas' },
  { code: 'NC',  name: 'NEW CLIENT' },
  { code: 'OO',  name: 'Oscar Ontano' },
  { code: 'AS',  name: 'Alejandro Simeone' },
  { code: 'ST',  name: 'Sandra Tedesco' },
  { code: 'BZ',  name: 'Brian Zino' },
  { code: 'CF',  name: 'Carlos Furnkorn' },
  { code: 'CG',  name: 'Claudio Guerra' },
  { code: 'JCR', name: 'Juan Carlos Romitelli' },
];

/**
 * Authenticate a login attempt.
 * Returns a session user object on success, or null on failure.
 */
export function findUser(username, password) {
  const u = username.toLowerCase();
  const p = password.toLowerCase();

  // Admin
  if (u === 'admin' && p === 'alejocapo') {
    return { role: 'admin' };
  }

  // Seller: username = code, password = code + '123'
  const seller = SELLERS.find(
    s => s.code.toLowerCase() === u && p === (s.code + '123').toLowerCase()
  );
  if (seller) {
    return { role: 'seller', sellerCode: seller.code, sellerName: seller.name };
  }

  return null;
}
