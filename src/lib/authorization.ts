export type UserRole = 'user' | 'manager' | 'admin' | 'owner';

export type Permission =
  | 'settings.protocols.read'
  | 'settings.notifications.read'
  | 'settings.integration.read'
  | 'settings.security.read';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  user: [],
  manager: [
    'settings.protocols.read',
    'settings.notifications.read',
  ],
  admin: [
    'settings.protocols.read',
    'settings.notifications.read',
    'settings.integration.read',
    'settings.security.read',
  ],
  owner: [
    'settings.protocols.read',
    'settings.notifications.read',
    'settings.integration.read',
    'settings.security.read',
  ],
};

export function normalizeUserRole(role: string | null | undefined): UserRole {
  const normalized = (role || 'user').toLowerCase();
  if (normalized === 'manager') return 'manager';
  if (normalized === 'admin' || normalized === 'administrator') return 'admin';
  if (normalized === 'owner') return 'owner';
  return 'user';
}

export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  const normalizedRole = normalizeUserRole(role);
  return ROLE_PERMISSIONS[normalizedRole].includes(permission);
}

export function canAccessPermission(role: string | null | undefined, permission?: Permission): boolean {
  if (!permission) return true;
  return hasPermission(role, permission);
}
