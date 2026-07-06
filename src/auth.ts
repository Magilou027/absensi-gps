export interface AuthUser {
  id: string;
  username: string;
  password: string;
  role: 'admin' | 'hr' | 'employee';
  name: string;
  employeeId?: string;
  department: string;
  position: string;
}

export interface Session {
  userId: string;
  username: string;
  role: 'admin' | 'hr' | 'employee';
  name: string;
  employeeId?: string;
  loginTime: string;
}

const USERS_KEY = 'absensi_users';
const SESSION_KEY = 'absensi_session';

export const DEFAULT_USERS: AuthUser[] = [
  {
    id: 'admin-01',
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    name: 'Super Administrator',
    department: 'Management',
    position: 'System Administrator',
  },
  {
    id: 'emp-001',
    username: 'rhein',
    password: 'rhein123',
    role: 'employee',
    name: 'Rhein',
    employeeId: 'EMP001',
    department: 'IT',
    position: 'Developer',
  },
  {
    id: 'hr-001',
    username: 'budi',
    password: 'budi123',
    role: 'hr',
    name: 'Budi Santoso',
    department: 'Human Resources',
    position: 'HR Manager',
  },
  {
    id: 'emp-003',
    username: 'sari',
    password: 'sari123',
    role: 'employee',
    name: 'Sari Dewi',
    employeeId: 'EMP003',
    department: 'Finance',
    position: 'Accountant',
  },
];

export function initAuth(): void {
  const stored = localStorage.getItem(USERS_KEY);
  if (!stored) {
    localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
    return;
  }

  // Migrate: ensure default users have correct roles (fix stale data)
  try {
    const existing: AuthUser[] = JSON.parse(stored);
    let changed = false;

    DEFAULT_USERS.forEach(def => {
      const idx = existing.findIndex(u => u.id === def.id || u.username === def.username);
      if (idx === -1) {
        // Default user not in storage → add them
        existing.push(def);
        changed = true;
      } else if (existing[idx].role !== def.role || existing[idx].password !== def.password) {
        // Role or password mismatch → update to correct values from defaults
        existing[idx].role = def.role;
        existing[idx].password = def.password;
        existing[idx].name = existing[idx].name || def.name;
        changed = true;
      }
    });

    if (changed) {
      localStorage.setItem(USERS_KEY, JSON.stringify(existing));
    }
  } catch {
    // Corrupt data → reset
    localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
  }
}

export function getUsers(): AuthUser[] {
  try {
    const s = localStorage.getItem(USERS_KEY);
    return s ? JSON.parse(s) : [...DEFAULT_USERS];
  } catch {
    return [...DEFAULT_USERS];
  }
}

export function saveUsers(users: AuthUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function login(username: string, password: string): Session | null {
  const users = getUsers();
  const user = users.find(
    u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );
  if (!user) return null;

  const session: Session = {
    userId: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
    employeeId: user.employeeId,
    loginTime: new Date().toISOString(),
  };

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function logout(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function getCurrentSession(): Session | null {
  try {
    const s = sessionStorage.getItem(SESSION_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return getCurrentSession() !== null;
}
