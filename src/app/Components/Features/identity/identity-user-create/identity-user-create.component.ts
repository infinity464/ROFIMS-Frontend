import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Fluid } from 'primeng/fluid';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { forkJoin } from 'rxjs';
import { IdentityService } from '@/services/identity.service';
import {
  IdentityUserMappingService,
  IdentityUserMappingDto,
  EmployeeDropdownDto
} from '@/services/identity-user-mapping.service';
import type { ApplicationRole, ApplicationUser } from '@/models/identity.model';

interface UserRow extends ApplicationUser {
  employeeId?: number | null;
  employeeDisplay?: string;
  isActive?: boolean;
}

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
    TableModule,
    TooltipModule,
    DialogModule,
    Fluid,
    Toast
  ],
  providers: [MessageService],
  templateUrl: './identity-user-create.component.html',
  styleUrl: './identity-user-create.component.scss'
})
export class IdentityUserCreateComponent implements OnInit {
  private fb = inject(FormBuilder);
  private identityService = inject(IdentityService);
  private mappingService = inject(IdentityUserMappingService);
  private messageService = inject(MessageService);

  form!: FormGroup;
  roles: ApplicationRole[] = [];
  users: UserRow[] = [];
  employees: EmployeeDropdownDto[] = [];
  private mappings: IdentityUserMappingDto[] = [];
  editingUser: UserRow | null = null;
  isSubmitting = false;

  resetDialogVisible = false;
  resetTargetUser: UserRow | null = null;
  resetNewPassword = '';
  resetConfirmPassword = '';
  resetSubmitting = false;

  togglingUserId: string | null = null;

  ngOnInit(): void {
    this.initForm();
    this.loadRoles();
    this.loadEmployees();
    this.loadUsersAndMappings();
  }

  loadUsersAndMappings(): void {
    forkJoin({
      users: this.identityService.getAllUsers(),
      mappings: this.mappingService.getMappings()
    }).subscribe({
      next: ({ users, mappings }) => {
        this.mappings = Array.isArray(mappings) ? this.normMappings(mappings) : [];
        const arr = Array.isArray(users) ? users : [];
        this.users = arr.map((u) => this.buildUserRow(u));
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load users' });
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
    return { ...base, employeeId: mapping?.employeeId ?? null, employeeDisplay: display, isActive };
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
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load employees' });
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
      userName: ['', [Validators.required, Validators.minLength(3)]],
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
      confirmUrl: [confirmUrl, Validators.required]
    });
  }

  loadRoles(): void {
    this.identityService.getRoles().subscribe({
      next: (list) => {
        this.roles = Array.isArray(list) ? list : [];
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load roles'
        });
      }
    });
  }

  onSubmit(): void {
    if (this.isSubmitting || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.isSubmitting = true;

    if (this.editingUser) {
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
            this.isSubmitting = false;
            if (res.isSuccess) {
              this.messageService.add({ severity: 'success', summary: 'Success', detail: res.message ?? 'User updated.' });
              this.onReset();
              this.loadUsersAndMappings();
            } else {
              this.messageService.add({ severity: 'error', summary: 'Error', detail: res.message ?? 'Update failed' });
            }
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
          this.mapNewUser(createdEmail, employeeId, res.message, value.confirmUrl);
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

  private mapNewUser(email: string, employeeId: number, createMsg: string | undefined, confirmUrl: string): void {
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
        this.mappingService.setMapping({ userId: created.id, employeeId }).subscribe({
          next: (mapRes) => {
            this.isSubmitting = false;
            if (mapRes.statusCode === 200) {
              this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: createMsg ?? 'User created and mapped.'
              });
            } else {
              this.messageService.add({
                severity: 'warn',
                summary: 'Mapping Failed',
                detail: mapRes.description ?? 'User created but mapping failed.'
              });
            }
            this.resetFormAfterCreate(confirmUrl);
            this.loadUsersAndMappings();
          },
          error: () => {
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
      error: () => {
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
      employeeId: user.employeeId ?? null
    });
    this.form.get('userName')?.disable();
    this.form.get('password')?.clearValidators();
    this.form.get('password')?.updateValueAndValidity();
    this.form.get('employeeId')?.disable();
    this.form.get('employeeId')?.clearValidators();
    this.form.get('employeeId')?.updateValueAndValidity();
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
      confirmUrl: confirmUrl ?? ''
    });
  }

  openResetPassword(user: UserRow): void {
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
}
