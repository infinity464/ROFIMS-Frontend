import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CheckboxModule } from 'primeng/checkbox';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TagModule } from 'primeng/tag';
import { Fluid } from 'primeng/fluid';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { IdentityService } from '@/services/identity.service';
import {
  ALL_ROLES_TARGET,
  USER_ACCESS_ACTIONS,
  isFullAccessRule,
  type ApplicationRole,
  type CreateRoleModel,
  type UpdateRoleModel,
  type UserAccessFlags,
  type UserAccessRule
} from '@/models/identity.model';

type AccessField = keyof UserAccessFlags;

/** One row of the access grid: a target role, or the "All roles" wildcard. */
interface AccessGridRow {
  targetRoleId: string;
  label: string;
  isAllRoles: boolean;
  /** The role being edited — a role may be allowed to manage its own members. */
  isSelf: boolean;
}

function emptyFlags(): UserAccessFlags {
  return { canView: false, canCreate: false, canEdit: false, canDisable: false, canResetPassword: false, canForceLogout: false };
}

@Component({
  selector: 'app-role-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    CheckboxModule,
    ToggleSwitchModule,
    TagModule,
    Fluid,
    Toast,
    ConfirmDialog,
    TooltipModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './role-list.component.html',
  styleUrl: './role-list.component.scss'
})
export class RoleListComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

  private fb = inject(FormBuilder);
  private identityService = inject(IdentityService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);

  readonly actions = USER_ACCESS_ACTIONS;

  form!: FormGroup;
  roles: ApplicationRole[] = [];
  editingRoleId: string | null = null;
  isSubmitting = false;

  /** Saved rules per holder role id (table column). */
  private rulesByRole = new Map<string, UserAccessRule[]>();
  /** Grid state being edited, keyed by target role id (`'*'` = all roles). */
  private grid: Record<string, UserAccessFlags> = {};
  gridRows: AccessGridRow[] = [];

  ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

    this.initForm();
    this.loadRoles();
    this.loadAccessRules();
  }

  /**
   * Access to this page is the only gate for role settings (incl. user management access):
   * adding needs the menu's Create permission, updating its Edit permission. The API checks the same.
   */
  get canSave(): boolean {
    return this.editingRoleId ? this.canUpdate : this.canInsert;
  }

  initForm(): void {
    this.form = this.fb.group({
      name: ['', Validators.required],
      canSelfResetPassword: [true]
    });
  }

  loadRoles(): void {
    this.identityService.getRoles().subscribe({
      next: (list) => {
        this.roles = Array.isArray(list) ? list : [];
        this.buildGridRows();
      },
      error: (err: any) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load roles' });
      }
    });
  }

  private loadAccessRules(): void {
    this.identityService.getRoleUserAccessRules().subscribe({
      next: (list) => {
        this.rulesByRole = new Map((Array.isArray(list) ? list : []).map((x) => [x.roleId, x.rules ?? []]));
      },
      error: (err: any) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load user management access' });
      }
    });
  }

  // --- access grid ---

  private buildGridRows(): void {
    this.gridRows = [
      { targetRoleId: ALL_ROLES_TARGET, label: 'All roles', isAllRoles: true, isSelf: false },
      ...this.roles.map((r) => ({ targetRoleId: r.id, label: r.name, isAllRoles: false, isSelf: r.id === this.editingRoleId }))
    ];
    for (const row of this.gridRows) {
      this.grid[row.targetRoleId] ??= emptyFlags();
    }
  }

  private loadGrid(rules: UserAccessRule[]): void {
    this.grid = {};
    this.buildGridRows();
    for (const rule of rules) {
      if (!this.grid[rule.targetRoleId]) continue; // target role no longer exists
      const flags = emptyFlags();
      for (const a of this.actions) flags[a.field] = rule[a.field] === true;
      this.grid[rule.targetRoleId] = flags;
    }
  }

  /** True when the "All roles" row already grants this action, so the per-role cell is locked on. */
  isInherited(targetRoleId: string, field: AccessField): boolean {
    return targetRoleId !== ALL_ROLES_TARGET && this.grid[ALL_ROLES_TARGET]?.[field] === true;
  }

  isChecked(targetRoleId: string, field: AccessField): boolean {
    return this.isInherited(targetRoleId, field) || this.grid[targetRoleId]?.[field] === true;
  }

  /** Any action also gives View; removing View removes every action for that row. */
  onCellChange(targetRoleId: string, field: AccessField, checked: boolean): void {
    const row = (this.grid[targetRoleId] ??= emptyFlags());
    row[field] = checked;
    if (checked && field !== 'canView') row.canView = true;
    if (!checked && field === 'canView') {
      for (const a of this.actions) row[a.field] = false;
    }
    this.form.markAsDirty();
  }

  /** Row select-all is ticked when every action in the row is ticked (inherited ticks count). */
  isRowChecked(targetRoleId: string): boolean {
    return this.actions.every((a) => this.isChecked(targetRoleId, a.field));
  }

  /** Nothing left to tick in this row: "All roles" already grants every action. */
  isRowFullyInherited(targetRoleId: string): boolean {
    return this.actions.every((a) => this.isInherited(targetRoleId, a.field));
  }

  /** Ticks or clears every action in the row, leaving cells inherited from "All roles" alone. */
  onRowToggle(targetRoleId: string, checked: boolean): void {
    const row = (this.grid[targetRoleId] ??= emptyFlags());
    for (const a of this.actions) {
      if (!this.isInherited(targetRoleId, a.field)) row[a.field] = checked;
    }
    this.form.markAsDirty();
  }

  get gridIsFullAccess(): boolean {
    const all = this.grid[ALL_ROLES_TARGET];
    return !!all && this.actions.every((a) => all[a.field]);
  }

  setNoAccess(): void {
    for (const row of this.gridRows) this.grid[row.targetRoleId] = emptyFlags();
    this.form.markAsDirty();
  }

  setFullAccess(): void {
    for (const row of this.gridRows) this.grid[row.targetRoleId] = emptyFlags();
    const all = this.grid[ALL_ROLES_TARGET];
    for (const a of this.actions) all[a.field] = true;
    this.form.markAsDirty();
  }

  /** Wire shape: one rule per row with any action. Actions already granted by "All roles" aren't repeated per role. */
  private buildUserAccessRules(): UserAccessRule[] {
    const all = this.grid[ALL_ROLES_TARGET] ?? emptyFlags();
    const rules: UserAccessRule[] = [];
    for (const row of this.gridRows) {
      const flags = this.grid[row.targetRoleId];
      if (!flags) continue;
      const out = { ...flags };
      if (!row.isAllRoles) {
        for (const a of this.actions) if (all[a.field]) out[a.field] = false;
      }
      if (this.actions.some((a) => out[a.field])) rules.push({ targetRoleId: row.targetRoleId, ...out });
    }
    return rules;
  }

  // --- form ---

  onSubmit(): void {
    if (this.isSubmitting || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const name = this.form.get('name')?.value?.trim();
    if (!name) return;
    const canSelfResetPassword = !!this.form.get('canSelfResetPassword')?.value;
    const userAccessRules = this.buildUserAccessRules();

    this.isSubmitting = true;
    const request$ = this.editingRoleId
      ? this.identityService.updateRole({ id: this.editingRoleId, name, userAccessRules, canSelfResetPassword } as UpdateRoleModel)
      : this.identityService.createRole({ name, userAccessRules, canSelfResetPassword } as CreateRoleModel);
    const verb = this.editingRoleId ? 'Update' : 'Add';

    request$.subscribe({
      next: (res) => {
        this.isSubmitting = false;
        if (res.isSuccess) {
          this.messageService.add({ severity: 'success', summary: 'Success', detail: res.message ?? (this.editingRoleId ? 'Role updated' : 'Role added') });
          this.onReset();
          this.loadRoles();
          this.loadAccessRules();
        } else {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: res.message ?? `${verb} failed` });
        }
      },
      error: (err: any) => {
        this.isSubmitting = false;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || `${verb} failed` });
      }
    });
  }

  onEdit(role: ApplicationRole): void {
    this.editingRoleId = role.id;
    this.form.reset({
      name: role.name,
      canSelfResetPassword: role.canSelfResetPassword ?? true
    });
    this.loadGrid(this.rulesByRole.get(role.id) ?? []);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onReset(): void {
    this.editingRoleId = null;
    this.form.reset({ name: '', canSelfResetPassword: true });
    this.loadGrid([]);
    this.isSubmitting = false;
  }

  // --- table-cell helpers ---

  /** Summary chip for a role's user-management access. */
  getAccessSummary(role: ApplicationRole): { text: string; severity: 'success' | 'info' | 'secondary' } {
    const rules = this.rulesByRole.get(role.id) ?? [];
    if (rules.some(isFullAccessRule)) return { text: 'Full access', severity: 'success' };
    if (rules.length === 0) return { text: 'None', severity: 'secondary' };
    if (rules.some((r) => r.targetRoleId === ALL_ROLES_TARGET)) return { text: 'All roles · limited', severity: 'info' };
    return { text: `${rules.length} role${rules.length === 1 ? '' : 's'}`, severity: 'info' };
  }

  /** One line per target role with its allowed actions (HTML, rendered with escape=false). */
  getAccessTooltip(role: ApplicationRole): string {
    const rules = this.rulesByRole.get(role.id) ?? [];
    if (rules.some(isFullAccessRule)) return "Can see and manage every role's users";
    if (rules.length === 0) return 'Cannot see or manage any users';
    return rules
      .map((r) => {
        const target = r.targetRoleId === ALL_ROLES_TARGET
          ? 'All roles'
          : (this.roles.find((x) => x.id === r.targetRoleId)?.name ?? 'Unknown role');
        const allowed = this.actions.filter((a) => r[a.field]).map((a) => a.label).join(', ');
        return `<div><b>${this.htmlEscape(target)}</b>: ${this.htmlEscape(allowed)}</div>`;
      })
      .join('');
  }

  private htmlEscape(s: string): string {
    return (s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
