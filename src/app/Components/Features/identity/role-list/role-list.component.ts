import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { RadioButtonModule } from 'primeng/radiobutton';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TagModule } from 'primeng/tag';
import { Fluid } from 'primeng/fluid';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { IdentityService } from '@/services/identity.service';
import { SharedService } from '@/shared/services/shared-service';
import type { ApplicationRole, CreateRoleModel, UpdateRoleModel } from '@/models/identity.model';

const FULL_ACCESS_TOKEN = '*';

type PermissionMode = 'deny' | 'specific' | 'full';

@Component({
  selector: 'app-role-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    MultiSelectModule,
    RadioButtonModule,
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
  private sharedService = inject(SharedService);

  form!: FormGroup;
  roles: ApplicationRole[] = [];
  editingRoleId: string | null = null;
  isSubmitting = false;
  /** Only users whose own role has `["*"]` may edit other roles' reset permission. */
  currentUserHasFullAccess = false;

  ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

    this.currentUserHasFullAccess = this.sharedService.getCurrentResetRoleIds().includes('*');

    this.initForm();
    this.loadRoles();
  }

  initForm(): void {
    this.form = this.fb.group({
      name: ['', Validators.required],
      permissionMode: ['deny' as PermissionMode],
      canResetRoleIds: [[] as string[]],
      canSelfResetPassword: [true]
    });
  }

  /**
   * Options for the multi-select. Includes the role itself so a role can be granted
   * permission to manage its own role (e.g. Admin managing other Admins).
   */
  get roleOptions(): { label: string; value: string }[] {
    return this.roles.map((r) => ({ label: r.name, value: r.id }));
  }

  loadRoles(): void {
    this.identityService.getRoles().subscribe({
      next: (list) => {
        this.roles = Array.isArray(list) ? list : [];
      },
      error: (err: any) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load roles' });
      }
    });
  }

  /**
   * Builds the wire-shape array for `canResetRoleIds` from the current form state.
   * `full` → `["*"]`; `specific` → picked IDs; `deny` → `[]`.
   */
  private buildCanResetRoleIds(): string[] {
    const v = this.form.getRawValue();
    const mode = v.permissionMode as PermissionMode;
    if (mode === 'full') return [FULL_ACCESS_TOKEN];
    if (mode === 'specific') {
      return Array.isArray(v.canResetRoleIds)
        ? v.canResetRoleIds.filter((x: string) => !!x && x !== FULL_ACCESS_TOKEN)
        : [];
    }
    return [];
  }

  onSubmit(): void {
    if (this.isSubmitting || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const name = this.form.get('name')?.value?.trim();
    if (!name) return;
    const canResetRoleIds = this.buildCanResetRoleIds();
    const canSelfResetPassword = !!this.form.get('canSelfResetPassword')?.value;

    this.isSubmitting = true;
    if (this.editingRoleId) {
      const payload: UpdateRoleModel = { id: this.editingRoleId, name, canResetRoleIds, canSelfResetPassword };
      this.identityService.updateRole(payload).subscribe({
        next: (res) => {
          this.isSubmitting = false;
          if (res.isSuccess) {
            this.messageService.add({ severity: 'success', summary: 'Success', detail: res.message ?? 'Role updated' });
            this.onReset();
            this.loadRoles();
          } else {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: res.message ?? 'Update failed' });
          }
        },
        error: (err: any) => {
          this.isSubmitting = false;
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Update failed' });
        }
      });
    } else {
      const payload: CreateRoleModel = { name, canResetRoleIds, canSelfResetPassword };
      this.identityService.createRole(payload).subscribe({
        next: (res) => {
          this.isSubmitting = false;
          if (res.isSuccess) {
            this.messageService.add({ severity: 'success', summary: 'Success', detail: res.message ?? 'Role added' });
            this.onReset();
            this.loadRoles();
          } else {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: res.message ?? 'Add failed' });
          }
        },
        error: (err: any) => {
          this.isSubmitting = false;
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Add failed' });
        }
      });
    }
  }

  onEdit(role: ApplicationRole): void {
    this.editingRoleId = role.id;
    const ids = role.canResetRoleIds ?? [];
    const mode: PermissionMode = ids.includes(FULL_ACCESS_TOKEN)
      ? 'full'
      : ids.length === 0
        ? 'deny'
        : 'specific';
    this.form.patchValue({
      name: role.name,
      permissionMode: mode,
      canResetRoleIds: mode === 'specific' ? ids : [],
      canSelfResetPassword: role.canSelfResetPassword ?? true
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onReset(): void {
    this.editingRoleId = null;
    this.form.reset({ name: '', permissionMode: 'deny', canResetRoleIds: [], canSelfResetPassword: true });
    this.isSubmitting = false;
  }

  // --- table-cell helpers ---

  /** Summary chip for a role's reset permission. */
  getResetSummary(role: ApplicationRole): { text: string; severity: 'success' | 'info' | 'secondary' } {
    const ids = role.canResetRoleIds ?? [];
    if (ids.includes(FULL_ACCESS_TOKEN)) return { text: 'Full access', severity: 'success' };
    if (ids.length === 0) return { text: 'None', severity: 'secondary' };
    return { text: `${ids.length} role${ids.length === 1 ? '' : 's'}`, severity: 'info' };
  }

  /** Names of roles a given role may reset (for tooltip). Empty when full access or none. */
  getResetTooltip(role: ApplicationRole): string {
    const ids = role.canResetRoleIds ?? [];
    if (ids.includes(FULL_ACCESS_TOKEN)) return 'May reset any role';
    if (ids.length === 0) return 'Not allowed to reset any role';
    const names = ids
      .map((id) => this.roles.find((r) => r.id === id)?.name)
      .filter((n): n is string => !!n);
    return names.join(', ');
  }
}
