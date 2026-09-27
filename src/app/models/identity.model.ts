/** Matches backend Identity.Models */

export interface ApplicationUser {
  id: string;
  userName: string;
  email: string;
  phoneNumber?: string | null;
  roleName?: string;
  lockoutEnd?: string | null;
}

/** Safe user projection returned by GetAllUsers / GetManageableUsers (no password hash etc.). */
export interface UserListItem extends ApplicationUser {
  emailConfirmed?: boolean;
  /** Disabled user kept out of the normal /identity/user-create list (shown under "Hidden users"). */
  isHidden?: boolean;
  hiddenAt?: string | null;
  /** Email of the admin who hid the user. */
  hiddenBy?: string | null;
}

export interface ApplicationRole {
  id: string;
  name: string;
  normalizedName?: string;
  /** When false, users in this role can't use the "Forgot Password" self-service flow. Default true. */
  canSelfResetPassword?: boolean;
}

// --- User management access rules (backend: RoleUserAccessRule) ---

/** Actions a role can be granted over the user accounts of another role. */
export type UserAccessAction = 'view' | 'create' | 'edit' | 'disable' | 'resetPassword' | 'forceLogout';

export interface UserAccessFlags {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDisable: boolean;
  canResetPassword: boolean;
  canForceLogout: boolean;
}

/** One rule: which actions are allowed on users of `targetRoleId` (`'*'` = all roles, incl. future ones). */
export interface UserAccessRule extends UserAccessFlags {
  targetRoleId: string;
}

export const ALL_ROLES_TARGET = '*';

/** Column order for the Roles page grid; also maps each action to its flag field. */
export const USER_ACCESS_ACTIONS: ReadonlyArray<{
  action: UserAccessAction;
  field: keyof UserAccessFlags;
  label: string;
  shortLabel: string;
}> = [
  { action: 'view', field: 'canView', label: 'View', shortLabel: 'View' },
  { action: 'create', field: 'canCreate', label: 'Create', shortLabel: 'Create' },
  { action: 'edit', field: 'canEdit', label: 'Edit', shortLabel: 'Edit' },
  { action: 'disable', field: 'canDisable', label: 'Disable / Enable', shortLabel: 'Disable' },
  { action: 'resetPassword', field: 'canResetPassword', label: 'Reset password', shortLabel: 'Reset pwd' },
  { action: 'forceLogout', field: 'canForceLogout', label: 'Force logout', shortLabel: 'Force logout' }
];

/** Every rule held by one role (GetRoleUserAccessRules). */
export interface RoleUserAccessRules {
  roleId: string;
  rules: UserAccessRule[];
}

/** The logged-in user's own rules (login response / GetMyUserAccessRules). */
export interface MyUserAccessRules {
  /** All six actions on all roles — may edit role permissions and the session policy. */
  hasFullUserAccess: boolean;
  rules: UserAccessRule[];
}

export function isFullAccessRule(rule: UserAccessRule): boolean {
  return rule.targetRoleId === ALL_ROLES_TARGET && USER_ACCESS_ACTIONS.every((a) => rule[a.field] === true);
}

/**
 * True when `rules` allow `action` on users of the role with id `targetRoleId`.
 * An "All roles" rule counts for every role. Mirrors UserAccessRuleService.CanAsync on the API.
 */
export function rulesAllow(
  rules: ReadonlyArray<UserAccessRule> | null | undefined,
  action: UserAccessAction,
  targetRoleId: string | null | undefined
): boolean {
  if (!rules?.length) return false;
  const field = USER_ACCESS_ACTIONS.find((a) => a.action === action)?.field;
  if (!field) return false;
  return rules.some(
    (r) => r[field] === true && (r.targetRoleId === ALL_ROLES_TARGET || (!!targetRoleId && r.targetRoleId === targetRoleId))
  );
}

export interface CreateRoleModel {
  name: string;
  /** Initial rules. Ignored by the API unless the caller has full access. */
  userAccessRules?: UserAccessRule[];
  canSelfResetPassword?: boolean;
}

export interface UserModel {
  email: string;
  userName?: string;
  phoneNumber?: string;
  password: string;
  roleName: string;
  confirmUrl: string;
}

export interface AdminResetPasswordModel {
  email: string;
  newPassword: string;
}

export interface SetUserActiveModel {
  email: string;
  isActive: boolean;
  /** Only used when disabling: also hide the user from the normal list. */
  hide?: boolean;
}

export interface SetUserHiddenModel {
  email: string;
  isHidden: boolean;
}

export interface UpdateRoleModel {
  id: string;
  name: string;
  /** Full replacement of the role's rules. Omit to leave them unchanged. Full-access callers only. */
  userAccessRules?: UserAccessRule[];
  canSelfResetPassword?: boolean;
}

export interface Responses {
  isSuccess: boolean;
  returnCode: string;
  message: string;
  success: string;
}
