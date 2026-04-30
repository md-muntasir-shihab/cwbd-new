import { useCallback } from 'react';
import { useAuth } from './useAuth';

/**
 * Module aliases map frontend module names to their backend equivalents.
 * IMPORTANT: Aliases must ONLY map to alternative names for the SAME module,
 * never to different modules. Cross-module aliases cause permission leakage
 * where access to one module incorrectly grants access to another.
 *
 * Synced with backend PERMISSION_MODULES in permissionsMatrix.ts.
 */
const MODULE_ALIASES: Record<string, string[]> = {
  home_control: ['banner_manager'],
  exams: ['exam_center'],
  exam_center: ['exams'],
  students_groups: ['student_groups'],
  subscription_plans: ['subscriptions'],
  finance_center: ['finance'],
  support_center: ['support'],
  reports_analytics: ['reports'],
  security_logs: ['security_center'],
};

function resolveModuleKeys(module: string): string[] {
  const normalized = String(module || '').trim();
  if (!normalized) return [];
  return [normalized, ...(MODULE_ALIASES[normalized] || [])];
}

/**
 * Module-level access control hook.
 * Checks user.permissionsV2 (merged team role + platform permissions) to determine
 * whether the current user can perform a given action on a given module.
 *
 * Superadmin always has access to everything.
 */
export function useModuleAccess() {
  const { user } = useAuth();

  const hasAccess = useCallback(
    (module: string, action: string = 'view'): boolean => {
      if (!user) return false;
      if (user.role === 'superadmin') return true;
      const moduleKeys = resolveModuleKeys(module);
      return moduleKeys.some((moduleKey) => !!user.permissionsV2?.[moduleKey]?.[action]);
    },
    [user],
  );

  const hasAnyAccess = useCallback(
    (module: string): boolean => {
      if (!user) return false;
      if (user.role === 'superadmin') return true;
      const moduleKeys = resolveModuleKeys(module);
      return moduleKeys.some((moduleKey) => {
        const modPerms = user.permissionsV2?.[moduleKey];
        if (!modPerms) return false;
        return Object.values(modPerms).some(Boolean);
      });
    },
    [user],
  );

  return { hasAccess, hasAnyAccess, user };
}
