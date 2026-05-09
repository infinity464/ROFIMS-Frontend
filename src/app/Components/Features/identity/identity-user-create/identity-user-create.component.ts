import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { RadioButtonModule } from 'primeng/radiobutton';
import { PasswordModule } from 'primeng/password';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { Fluid } from 'primeng/fluid';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { forkJoin } from 'rxjs';
import { IdentityService } from '@/services/identity.service';
import {
  IdentityUserMappingService,
  IdentityUserMappingDto,
  EmployeeDropdownDto
} from '@/services/identity-user-mapping.service';
import {
  IdentityUserMemberTypeAccessService,
  UserMemberTypeAccessDto
} from '@/services/identity-user-member-type-access.service';
import {
  IdentityUserRabUnitAccessService,
  UserRabUnitAccessDto
} from '@/services/identity-user-rab-unit-access.service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { SharedService } from '@/shared/services/shared-service';
import type { ApplicationRole, ApplicationUser } from '@/models/identity.model';

interface UserRow extends ApplicationUser {
  employeeId?: number | null;
  employeeDisplay?: string;
  employeeName?: string | null;
  employeeMeta?: string | null;
  serviceId?: string | null;
  isActive?: boolean;
  memberTypeNames?: string[];
  /** flattened form used by p-table global + column filtering */
  memberTypeNamesJoined?: string;
  rabUnitNames?: string[];
  rabUnitNamesJoined?: string;
}

interface MemberTypeOption {
  label: string;
  value: number;
}

interface RabUnitOption {
  label: string;
  value: number;
}

const USERNAME_PATTERN = /^[A-Za-z0-9._@-]+$/;

@Component({
  selector: 'app-identity-user-create',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    InputTextModule,
    ButtonModule,
    SelectModule,
    MultiSelectModule,
    RadioButtonModule,
    PasswordModule,
    IconFieldModule,
    InputIconModule,
    TableModule,
    TooltipModule,
    DialogModule,
    TagModule,
    Fluid,
    Toast
  ],
  providers: [MessageService],
  templateUrl: './identity-user-create.component.html',
  styleUrl: './identity-user-create.component.scss'
})
export class IdentityUserCreateComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

  private fb = inject(FormBuilder);
  private identityService = inject(IdentityService);
  private mappingService = inject(IdentityUserMappingService);
  private accessService = inject(IdentityUserMemberTypeAccessService);
  private rabUnitAccessService = inject(IdentityUserRabUnitAccessService);
  private masterBasicSetupService = inject(MasterBasicSetupService);
  private messageService = inject(MessageService);
  private sharedService = inject(SharedService);

  form!: FormGroup;
  roles: ApplicationRole[] = [];
  /** Role IDs whose users the current caller may reset passwords for. `['*']` = any. */
  private currentResetRoleIds: string[] = [];
  users: UserRow[] = [];
  employees: EmployeeDropdownDto[] = [];
  memberTypes: MemberTypeOption[] = [];
  rabUnits: RabUnitOption[] = [];
  private mappings: IdentityUserMappingDto[] = [];
  private memberTypeAccesses: UserMemberTypeAccessDto[] = [];
  private rabUnitAccesses: UserRabUnitAccessDto[] = [];
  editingUser: UserRow | null = null;
  isSubmitting = false;

  resetDialogVisible = false;
  resetTargetUser: UserRow | null = null;
  resetNewPassword = '';
  resetConfirmPassword = '';
  resetSubmitting = false;

  togglingUserId: string | null = null;

  ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

    this.currentResetRoleIds = this.sharedService.getCurrentResetRoleIds();

    this.initForm();
    this.loadRoles();
    this.loadEmployees();
    this.loadMemberTypes();
    this.loadRabUnits();
    this.loadUsersAndMappings();
  }

  loadRabUnits(): void {
    this.masterBasicSetupService.getAllByType('RabUnit').subscribe({
      next: (list) => {
        const arr = Array.isArray(list) ? list : [];
        this.rabUnits = arr
          .filter((u) => u.status !== false && u.codeId > 0)
          .map((u) => ({ label: u.codeValueEN ?? '', value: u.codeId }));
      },
      error: (err: any) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load RAB units' });
      }
    });
  }

  loadMemberTypes(): void {
    this.masterBasicSetupService.getAllByType('EmployeeType').subscribe({
      next: (list) => {
        const arr = Array.isArray(list) ? list : [];
        this.memberTypes = arr
          .filter((m) => m.status !== false && m.codeId > 0)
          .map((m) => ({ label: m.codeValueEN ?? '', value: m.codeId }));
      },
      error: (err: any) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load member types' });
      }
    });
  }

  loadUsersAndMappings(): void {
    forkJoin({
      users: this.identityService.getAllUsers(),
      mappings: this.mappingService.getMappings(),
      accesses: this.accessService.getAllByUser(),
      rabAccesses: this.rabUnitAccessService.getAllByUser()
    }).subscribe({
      next: ({ users, mappings, accesses, rabAccesses }) => {
        this.mappings = Array.isArray(mappings) ? this.normMappings(mappings) : [];
        this.memberTypeAccesses = Array.isArray(accesses) ? accesses : [];
        this.rabUnitAccesses = Array.isArray(rabAccesses) ? rabAccesses : [];
        const arr = Array.isArray(users) ? users : [];
        this.users = arr.map((u) => this.buildUserRow(u));
      },
      error: (err: any) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load users' });
      }
    });
  }

  private normMappings(list: unknown[]): IdentityUserMappingDto[] {
    return list.map((x: any) => ({
      userId: x.userId ?? x.UserId,
      email: x.email ?? x.Email ?? '',
      userName: x.userName ?? x.UserName ?? '',
      employeeId: x.employeeId ?? x.EmployeeId ?? null,
      employeeName: x.employeeName ?? x.EmployeeName ?? null,
      rabID: x.rabID ?? x.RABID ?? null,
      serviceId: x.serviceId ?? x.ServiceId ?? null
    }));
  }

  private buildUserRow(u: unknown): UserRow {
    const o = u as Record<string, unknown>;
    const lockoutEnd = (o['lockoutEnd'] ?? o['LockoutEnd']) as string | null | undefined;
    const base: ApplicationUser = {
      id: (o['id'] ?? o['Id']) as string,
      userName: (o['userName'] ?? o['UserName']) as string,
      email: (o['email'] ?? o['Email']) as string,
      phoneNumber: (o['phoneNumber'] ?? o['PhoneNumber']) as string | null,
      roleName: (o['roleName'] ?? o['RoleName']) as string,
      lockoutEnd: lockoutEnd ?? null
    };
    const isActive = !(lockoutEnd && new Date(lockoutEnd).getTime() > Date.now());
    const mapping = this.mappings.find((m) => m.userId === base.id);
    const display = mapping?.employeeName
      ? this.buildEmployeeLabel(mapping.employeeName, mapping.rabID ?? null, mapping.serviceId ?? null)
      : '-';
    const access = this.memberTypeAccesses.find((a) => a.userId === base.id);
    const rabAccess = this.rabUnitAccesses.find((a) => a.userId === base.id);
    return {
      ...base,
      employeeId: mapping?.employeeId ?? null,
      employeeDisplay: display,
      employeeName: mapping?.employeeName ?? null,
      employeeMeta: this.buildEmployeeMeta(mapping?.rabID ?? null, mapping?.serviceId ?? null),
      serviceId: mapping?.serviceId ?? null,
      isActive,
      memberTypeNames: access?.memberTypeNames ?? [],
      memberTypeNamesJoined: (access?.memberTypeNames ?? []).join(' | '),
      rabUnitNames: rabAccess?.rabUnitNames ?? [],
      rabUnitNamesJoined: (rabAccess?.rabUnitNames ?? []).join(' | ')
    };
  }

  private buildEmployeeMeta(rabID: string | null, serviceId: string | null): string | null {
    const parts: string[] = [];
    if (rabID) parts.push(`RAB: ${rabID}`);
    if (serviceId) parts.push(`Service: ${serviceId}`);
    return parts.length ? parts.join(' · ') : null;
  }

  private buildEmployeeLabel(name: string, rabID: string | null, serviceId: string | null): string {
    const parts: string[] = [];
    if (rabID) parts.push(`RAB: ${rabID}`);
    if (serviceId) parts.push(`Service: ${serviceId}`);
    return parts.length ? `${name} (${parts.join(' / ')})` : name;
  }

  loadEmployees(): void {
    this.mappingService.getEmployeesForDropdown().subscribe({
      next: (list) => {
        const arr = Array.isArray(list) ? list : [];
        this.employees = arr.map((x: any) => {
          const fullNameEN = x.fullNameEN ?? x.FullNameEN ?? '';
          const rabID = x.rabID ?? x.RABID ?? null;
          const serviceId = x.serviceId ?? x.ServiceId ?? null;
          return {
            employeeID: x.employeeID ?? x.EmployeeID,
            fullNameEN,
            rabID,
            serviceId,
            displayLabel: this.buildEmployeeLabel(fullNameEN, rabID, serviceId)
          };
        });
      },
      error: (err: any) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load employees' });
      }
    });
  }

  initForm(): void {
    const confirmUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}#/landing`
        : '';
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      userName: ['', [Validators.required, Validators.minLength(3), Validators.pattern(USERNAME_PATTERN)]],
      phoneNumber: ['', Validators.required],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(6),
          Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{6,20}$/)
        ]
      ],
      roleName: ['', Validators.required],
      employeeId: [null as number | null, Validators.required],
      memberTypeIds: [[] as number[]],
      rabUnitMode: ['all' as 'all' | 'specific'],
      rabUnitIds: [[] as number[]],
      confirmUrl: [confirmUrl, Validators.required]
    });
  }

  loadRoles(): void {
    this.identityService.getRoles().subscribe({
      next: (list) => {
        this.roles = Array.isArray(list) ? list : [];
      },
      error: (err: any) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.message || 'Failed to load roles'
        });
      }
    });
  }

  private findDuplicate(value: {
    email: string;
    userName: string;
    phoneNumber: string;
    employeeId: number | null;
  }): string | null {
    const editingId = this.editingUser?.id ?? null;
    const email = (value.email ?? '').toString().trim().toLowerCase();
    const userName = (value.userName ?? '').toString().trim().toLowerCase();
    const phone = this.normalizePhone(value.phoneNumber);

    if (email) {
      const dupe = this.users.find(
        (u) => u.id !== editingId && (u.email ?? '').toString().trim().toLowerCase() === email
      );
      if (dupe) {
        return `Email "${value.email}" is already used by ${dupe.userName ?? dupe.email}.`;
      }
    }

    if (!this.editingUser && userName) {
      const dupe = this.users.find(
        (u) => (u.userName ?? '').toString().trim().toLowerCase() === userName
      );
      if (dupe) {
        return `Username "${value.userName}" is already taken.`;
      }
    }

    if (phone) {
      const dupe = this.users.find(
        (u) => u.id !== editingId && this.normalizePhone(u.phoneNumber) === phone
      );
      if (dupe) {
        return `Phone number "${value.phoneNumber}" is already registered to ${dupe.userName ?? dupe.email}.`;
      }
    }

    if (!this.editingUser && value.employeeId) {
      const mapped = this.mappings.find((m) => m.employeeId === value.employeeId);
      if (mapped) {
        const label = mapped.employeeName ?? `employee #${value.employeeId}`;
        return `${label} is already linked to another user account (${mapped.userName ?? mapped.email}). One employee can only have one user.`;
      }
    }

    return null;
  }

  private normalizePhone(value: string | null | undefined): string {
    return (value ?? '').toString().replace(/[\s\-()+]/g, '').trim();
  }

  onSubmit(): void {
    if (this.isSubmitting || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();

    const duplicate = this.findDuplicate(value);
    if (duplicate) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Duplicate',
        detail: duplicate,
        life: 6000
      });
      return;
    }

    this.isSubmitting = true;

    if (this.editingUser) {
      const editingUserId = this.editingUser.id;
      const memberTypeIds: number[] = Array.isArray(value.memberTypeIds) ? value.memberTypeIds : [];
      const rabUnitIds: number[] = this.buildRabUnitIds();
      this.identityService
        .updateUser({
          email: value.email,
          userName: value.userName || undefined,
          phoneNumber: value.phoneNumber || undefined,
          roleName: value.roleName,
          confirmUrl: value.confirmUrl
        })
        .subscribe({
          next: (res) => {
            if (!res.isSuccess) {
              this.isSubmitting = false;
              this.messageService.add({ severity: 'error', summary: 'Error', detail: res.message ?? 'Update failed' });
              return;
            }
            forkJoin({
              memberAccess: this.accessService.setAccesses({ userId: editingUserId, memberTypeIds }),
              rabAccess: this.rabUnitAccessService.setAccesses({ userId: editingUserId, rabUnitIds })
            }).subscribe({
              next: ({ memberAccess, rabAccess }) => {
                this.isSubmitting = false;
                const memberOk = memberAccess.statusCode === 200;
                const rabOk = rabAccess.statusCode === 200;
                if (memberOk && rabOk) {
                  this.messageService.add({ severity: 'success', summary: 'Success', detail: res.message ?? 'User updated.' });
                } else {
                  this.messageService.add({
                    severity: 'warn',
                    summary: 'Partial Update',
                    detail: !memberOk
                      ? (memberAccess.description ?? 'User updated but member-type access save failed.')
                      : (rabAccess.description ?? 'User updated but RAB Unit access save failed.')
                  });
                }
                this.onReset();
                this.loadUsersAndMappings();
              },
              error: (err: any) => {
                this.isSubmitting = false;
                this.messageService.add({
                  severity: 'warn',
                  summary: 'Partial Update',
                  detail: 'User updated but access save failed.'
                });
                this.onReset();
                this.loadUsersAndMappings();
              }
            });
          },
          error: (err) => {
            this.isSubmitting = false;
            const msg = err?.error?.message ?? (typeof err?.message === 'string' ? err.message : 'Update failed');
            this.messageService.add({ severity: 'error', summary: 'Error', detail: msg });
          }
        });
      return;
    }

    const employeeId: number = value.employeeId;
    const memberTypeIds: number[] = Array.isArray(value.memberTypeIds) ? value.memberTypeIds : [];
    const rabUnitIds: number[] = this.buildRabUnitIds();
    const createdEmail: string = value.email;

    this.identityService
      .createUser({
        email: value.email,
        userName: value.userName || undefined,
        phoneNumber: value.phoneNumber || undefined,
        password: value.password,
        roleName: value.roleName,
        confirmUrl: value.confirmUrl
      })
      .subscribe({
        next: (res) => {
          if (!res.isSuccess) {
            this.isSubmitting = false;
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: res.message ?? 'Create failed'
            });
            return;
          }
          this.mapNewUser(createdEmail, employeeId, memberTypeIds, rabUnitIds, res.message, value.confirmUrl);
        },
        error: (err) => {
          this.isSubmitting = false;
          const msg =
            err?.error?.message ||
            (typeof err?.message === 'string' ? err.message : 'Create user failed');
          this.messageService.add({ severity: 'error', summary: 'Error', detail: msg });
        }
      });
  }

  private mapNewUser(
    email: string,
    employeeId: number,
    memberTypeIds: number[],
    rabUnitIds: number[],
    createMsg: string | undefined,
    confirmUrl: string
  ): void {
    forkJoin({
      users: this.identityService.getAllUsers(),
      mappings: this.mappingService.getMappings()
    }).subscribe({
      next: ({ users, mappings }) => {
        this.mappings = Array.isArray(mappings) ? this.normMappings(mappings) : [];
        const arr = Array.isArray(users) ? users : [];
        this.users = arr.map((u) => this.buildUserRow(u));
        const created = this.users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
        if (!created?.id) {
          this.isSubmitting = false;
          this.messageService.add({
            severity: 'warn',
            summary: 'Warning',
            detail: 'User created but could not locate new user to set employee mapping.'
          });
          this.resetFormAfterCreate(confirmUrl);
          return;
        }
        const newUserId = created.id;
        this.mappingService.setMapping({ userId: newUserId, employeeId }).subscribe({
          next: (mapRes) => {
            const mappingOk = mapRes.statusCode === 200;
            forkJoin({
              memberAccess: this.accessService.setAccesses({ userId: newUserId, memberTypeIds }),
              rabAccess: this.rabUnitAccessService.setAccesses({ userId: newUserId, rabUnitIds })
            }).subscribe({
              next: ({ memberAccess, rabAccess }) => {
                this.isSubmitting = false;
                const memberOk = memberAccess.statusCode === 200;
                const rabOk = rabAccess.statusCode === 200;
                if (mappingOk && memberOk && rabOk) {
                  this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: createMsg ?? 'User created.'
                  });
                } else {
                  let detail: string | undefined;
                  if (!mappingOk) {
                    detail = mapRes.description ?? 'User created but employee mapping failed.';
                  } else if (!memberOk) {
                    detail = memberAccess.description ?? 'User created but member-type access save failed.';
                  } else {
                    detail = rabAccess.description ?? 'User created but RAB Unit access save failed.';
                  }
                  this.messageService.add({
                    severity: 'warn',
                    summary: 'Partial Success',
                    detail
                  });
                }
                this.resetFormAfterCreate(confirmUrl);
                this.loadUsersAndMappings();
              },
              error: (err: any) => {
                this.isSubmitting = false;
                this.messageService.add({
                  severity: 'warn',
                  summary: 'Partial Success',
                  detail: 'User created but access save failed.'
                });
                this.resetFormAfterCreate(confirmUrl);
                this.loadUsersAndMappings();
              }
            });
          },
          error: (err: any) => {
            this.isSubmitting = false;
            this.messageService.add({
              severity: 'warn',
              summary: 'Mapping Failed',
              detail: 'User created but mapping request failed.'
            });
            this.resetFormAfterCreate(confirmUrl);
            this.loadUsersAndMappings();
          }
        });
      },
      error: (err: any) => {
        this.isSubmitting = false;
        this.messageService.add({
          severity: 'warn',
          summary: 'Warning',
          detail: 'User created but failed to refresh list for mapping.'
        });
        this.resetFormAfterCreate(confirmUrl);
      }
    });
  }

  private resetFormAfterCreate(confirmUrl: string): void {
    this.form.reset({
      email: '',
      userName: '',
      phoneNumber: '',
      password: '',
      roleName: '',
      employeeId: null,
      memberTypeIds: [],
      rabUnitMode: 'all',
      rabUnitIds: [],
      confirmUrl
    });
  }

  onEdit(user: UserRow): void {
    this.editingUser = user;
    this.form.patchValue({
      email: user.email,
      userName: user.userName ?? '',
      phoneNumber: user.phoneNumber ?? '',
      roleName: user.roleName ?? '',
      password: '',
      employeeId: user.employeeId ?? null,
      memberTypeIds: [],
      rabUnitIds: []
    });
    this.form.get('userName')?.disable();
    this.form.get('password')?.clearValidators();
    this.form.get('password')?.updateValueAndValidity();
    this.form.get('employeeId')?.disable();
    this.form.get('employeeId')?.clearValidators();
    this.form.get('employeeId')?.updateValueAndValidity();

    if (user.id) {
      forkJoin({
        memberTypeIds: this.accessService.getByUserId(user.id),
        rabUnitIds: this.rabUnitAccessService.getByUserId(user.id)
      }).subscribe({
        next: ({ memberTypeIds, rabUnitIds }) => {
          const ids = Array.isArray(rabUnitIds) ? rabUnitIds : [];
          this.form.patchValue({
            memberTypeIds: Array.isArray(memberTypeIds) ? memberTypeIds : [],
            rabUnitMode: ids.length === 0 ? 'all' : 'specific',
            rabUnitIds: ids
          });
        },
        error: (err: any) => {
          this.messageService.add({
            severity: 'warn',
            summary: 'Warning',
            detail: "Couldn't load access settings for this user."
          });
        }
      });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onReset(): void {
    this.editingUser = null;
    this.form.get('userName')?.enable();
    this.form.get('password')?.setValidators([
      Validators.required,
      Validators.minLength(6),
      Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{6,20}$/)
    ]);
    this.form.get('password')?.updateValueAndValidity();
    this.form.get('employeeId')?.enable();
    this.form.get('employeeId')?.setValidators(Validators.required);
    this.form.get('employeeId')?.updateValueAndValidity();
    const confirmUrl = this.form.get('confirmUrl')?.value;
    this.form.reset({
      email: '',
      userName: '',
      phoneNumber: '',
      password: '',
      roleName: '',
      employeeId: null,
      memberTypeIds: [],
      rabUnitMode: 'all',
      rabUnitIds: [],
      confirmUrl: confirmUrl ?? ''
    });
  }

  /**
   * Whether the current caller may manage users of `roleName` — gates create, update,
   * disable, and password reset. Backed by the same `canResetRoleIds` allowlist.
   * Resolves role ID from the loaded `roles` list so target's role ID isn't needed in the user payload.
   * Match is case-insensitive + trimmed to defend against legacy data.
   */
  canManageRole(roleName: string | null | undefined): boolean {
    const allow = this.currentResetRoleIds;
    if (!allow?.length) return false;
    if (allow.includes('*')) return true;
    const needle = (roleName ?? '').trim().toLowerCase();
    if (!needle) return false;
    const targetRoleId = this.roles.find((r) => (r.name ?? '').trim().toLowerCase() === needle)?.id;
    return !!targetRoleId && allow.includes(targetRoleId);
  }

  /** Roles the caller is allowed to assign — used to filter the role dropdown. */
  get manageableRoles(): ApplicationRole[] {
    return this.roles.filter((r) => this.canManageRole(r.name));
  }

  /** True when the caller can manage at least one role (i.e. the create/edit form is usable). */
  get hasAnyManagePermission(): boolean {
    return this.currentResetRoleIds.length > 0;
  }

  openResetPassword(user: UserRow): void {
    if (!this.canManageRole(user.roleName)) return;
    this.resetTargetUser = user;
    this.resetNewPassword = '';
    this.resetConfirmPassword = '';
    this.resetDialogVisible = true;
  }

  closeResetPassword(): void {
    if (this.resetSubmitting) return;
    this.resetDialogVisible = false;
    this.resetTargetUser = null;
    this.resetNewPassword = '';
    this.resetConfirmPassword = '';
  }

  toggleUserActive(user: UserRow): void {
    if (!user?.id || this.togglingUserId) return;
    const nextActive = !user.isActive;
    const action = nextActive ? 'enable' : 'disable';
    if (typeof window !== 'undefined' && !window.confirm(`Are you sure you want to ${action} ${user.email}?`)) {
      return;
    }
    this.togglingUserId = user.id;
    this.identityService.setUserActive({ email: user.email, isActive: nextActive }).subscribe({
      next: (res) => {
        this.togglingUserId = null;
        if (res.isSuccess) {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: res.message ?? (nextActive ? 'User enabled.' : 'User disabled.')
          });
          this.loadUsersAndMappings();
        } else {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: res.message ?? `Failed to ${action} user.`
          });
        }
      },
      error: (err) => {
        this.togglingUserId = null;
        const msg = err?.error?.message ?? (typeof err?.message === 'string' ? err.message : `Failed to ${action} user.`);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: msg });
      }
    });
  }

  submitResetPassword(): void {
    if (!this.resetTargetUser || this.resetSubmitting) return;
    const pwd = this.resetNewPassword ?? '';
    const pattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{6,20}$/;
    if (!pattern.test(pwd)) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Invalid Password',
        detail: 'At least 6 characters, 1 upper, 1 lower, 1 number and 1 symbol.'
      });
      return;
    }
    if (pwd !== this.resetConfirmPassword) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Password Mismatch',
        detail: 'New password and confirm password must match.'
      });
      return;
    }
    this.resetSubmitting = true;
    this.identityService
      .adminResetPassword({ email: this.resetTargetUser.email, newPassword: pwd })
      .subscribe({
        next: (res) => {
          this.resetSubmitting = false;
          if (res.isSuccess) {
            this.messageService.add({
              severity: 'success',
              summary: 'Success',
              detail: res.message ?? 'Password reset successfully.'
            });
            this.resetDialogVisible = false;
            this.resetTargetUser = null;
            this.resetNewPassword = '';
            this.resetConfirmPassword = '';
          } else {
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: res.message ?? 'Reset failed.'
            });
          }
        },
        error: (err) => {
          this.resetSubmitting = false;
          const msg = err?.error?.message ?? (typeof err?.message === 'string' ? err.message : 'Reset failed');
          this.messageService.add({ severity: 'error', summary: 'Error', detail: msg });
        }
      });
  }

  toggleAllMemberTypes(checked: boolean): void {
    const ids = checked ? this.memberTypes.map((m) => m.value) : [];
    this.form.get('memberTypeIds')?.setValue(ids);
    this.form.get('memberTypeIds')?.markAsDirty();
  }

  /** Whether a given member-type chip is currently selected. */
  isMemberTypeSelected(id: number): boolean {
    const ids: number[] = this.form?.get('memberTypeIds')?.value ?? [];
    return ids.includes(id);
  }

  /** Toggle a single member-type chip in/out of the selection. */
  toggleMemberType(id: number): void {
    const ids: number[] = this.form.get('memberTypeIds')?.value ?? [];
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    this.form.get('memberTypeIds')?.setValue(next);
    this.form.get('memberTypeIds')?.markAsDirty();
  }

  /** Clear all selected member-type chips. */
  clearMemberTypes(): void {
    this.form.get('memberTypeIds')?.setValue([]);
    this.form.get('memberTypeIds')?.markAsDirty();
  }

  /**
   * Builds the wire-shape array for `rabUnitIds` from the current form state.
   * `all` mode → `[]` (backend treats empty as "all units, no restriction").
   * `specific` mode → the picked IDs.
   */
  private buildRabUnitIds(): number[] {
    const v = this.form.getRawValue();
    if (v.rabUnitMode === 'all') return [];
    return Array.isArray(v.rabUnitIds) ? v.rabUnitIds : [];
  }

  // --- Password live-checklist getters (drive the requirement chips under the password input) ---
  private get pwValue(): string {
    return this.form?.get('password')?.value ?? '';
  }
  get pwHasMinLength(): boolean { return this.pwValue.length >= 6 && this.pwValue.length <= 20; }
  get pwHasLower(): boolean { return /[a-z]/.test(this.pwValue); }
  get pwHasUpper(): boolean { return /[A-Z]/.test(this.pwValue); }
  get pwHasNumber(): boolean { return /\d/.test(this.pwValue); }
  get pwHasSymbol(): boolean { return /[^\da-zA-Z]/.test(this.pwValue); }

  // --- User-list cell helpers ---

  private static AVATAR_PALETTE: ReadonlyArray<{ bg: string; fg: string }> = [
    { bg: 'bg-purple-100 dark:bg-purple-900/40', fg: 'text-purple-700 dark:text-purple-200' },
    { bg: 'bg-teal-100 dark:bg-teal-900/40',     fg: 'text-teal-700 dark:text-teal-200' },
    { bg: 'bg-pink-100 dark:bg-pink-900/40',     fg: 'text-pink-700 dark:text-pink-200' },
    { bg: 'bg-amber-100 dark:bg-amber-900/40',   fg: 'text-amber-700 dark:text-amber-200' },
    { bg: 'bg-blue-100 dark:bg-blue-900/40',     fg: 'text-blue-700 dark:text-blue-200' },
    { bg: 'bg-emerald-100 dark:bg-emerald-900/40', fg: 'text-emerald-700 dark:text-emerald-200' },
    { bg: 'bg-rose-100 dark:bg-rose-900/40',     fg: 'text-rose-700 dark:text-rose-200' },
    { bg: 'bg-indigo-100 dark:bg-indigo-900/40', fg: 'text-indigo-700 dark:text-indigo-200' }
  ];

  getInitials(user: UserRow): string {
    const source = (user.employeeName?.trim() || user.userName?.trim() || user.email?.trim() || '?');
    const parts = source.split(/[\s._@-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return source.substring(0, 2).toUpperCase();
  }

  getAvatarClass(user: UserRow): string {
    const key = user.id ?? user.email ?? user.userName ?? '';
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    const pal = IdentityUserCreateComponent.AVATAR_PALETTE[hash % IdentityUserCreateComponent.AVATAR_PALETTE.length];
    return `${pal.bg} ${pal.fg}`;
  }

  getRolePillClass(roleName: string | null | undefined): string {
    const role = (roleName ?? '').toLowerCase();
    if (role === 'admin') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    if (role === 'user')  return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300';
    return 'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-300';
  }

  /** Returns label for member-type access. Empty selection = "no access" → "—". */
  getMemberAccessSummary(user: UserRow): { text: string; partial: boolean } {
    const sel = user.memberTypeNames?.length ?? 0;
    const total = this.memberTypes.length;
    if (sel === 0) return { text: '—', partial: false };
    if (total > 0 && sel === total) return { text: `All · ${total}`, partial: false };
    return { text: `${sel} of ${total}`, partial: true };
  }

  /** Returns label for RAB-Unit access. Empty selection = "all units" (no restriction). */
  getRabAccessSummary(user: UserRow): { text: string; partial: boolean } {
    const sel = user.rabUnitNames?.length ?? 0;
    const total = this.rabUnits.length;
    if (sel === 0) return { text: total > 0 ? `All · ${total}` : '—', partial: false };
    if (total > 0 && sel === total) return { text: `All · ${total}`, partial: false };
    return { text: `${sel} of ${total}`, partial: true };
  }
}
