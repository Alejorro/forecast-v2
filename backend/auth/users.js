// Hardcoded internal user registry for DOT4 Forecast V2.
// Not a public auth system — internal tool only.

const USERS = [
  { username: 'admin',     password: 'alejocapo',     role: 'admin' },
  { username: 'Alejorro',  password: 'alejorro97',    role: 'manager' },
  { username: 'Alejandro', password: 'alejandro3847', role: 'seller', sellerName: 'Alejandro Simeone' },
  { username: 'Brian',     password: 'brian7293',     role: 'admin',  sellerName: 'Brian Zino' },
  { username: 'CarlosF',   password: 'carlosf5621',   role: 'seller', sellerName: 'Carlos Furnkorn' },
  { username: 'CarlosL',   password: 'carlosl8274',   role: 'seller', sellerName: 'Carlos Lopez' },
  { username: 'Christian', password: 'christian4519', role: 'seller', sellerName: 'Christian Braun' },
  { username: 'Claudio',   password: 'claudio6382',   role: 'admin',  sellerName: 'Claudio Guerra' },
  { username: 'Fabio',     password: 'fabio2947',     role: 'seller', sellerName: 'Fabio Villamayor' },
  { username: 'Florencia', password: 'florencia8163', role: 'seller', sellerName: 'Florencia Vargas' },
  { username: 'JC',        password: 'jc4728',        role: 'admin',  sellerName: 'Juan Carlos Romitelli' },
  { username: 'Mariano',   password: 'mariano3651',   role: 'admin',  sellerName: 'Mariano Basso' },
  { username: 'Mathias',   password: 'mathias9274',   role: 'seller', sellerName: 'Mathias Villamayor' },
  { username: 'Milton',    password: 'milton5839',    role: 'seller', sellerName: 'Milton Gallo' },
  { username: 'Oscar',     password: 'oscar7162',     role: 'seller', sellerName: 'Oscar Ontano' },
  { username: 'Sandra',    password: 'sandra4803',    role: 'seller', sellerName: 'Sandra Tedesco' },
];

export function findUser(username, password) {
  const match = USERS.find(
    u => u.username.toLowerCase() === username.toLowerCase()
      && u.password === password
  );
  if (!match) return null;
  return { username: match.username, role: match.role, sellerName: match.sellerName ?? null };
}
