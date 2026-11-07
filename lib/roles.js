export const ROLES = ['admin', 'user', 'supervisor']

export function homeForRole(role) {
  if (role === 'admin') return '/admin'
  if (role === 'supervisor') return '/supervisor'
  return '/user'
}
