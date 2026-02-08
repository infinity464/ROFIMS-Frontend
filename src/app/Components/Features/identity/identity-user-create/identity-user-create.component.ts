import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Fluid } from 'primeng/fluid';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { IdentityService } from '@/services/identity.service';
import type { ApplicationRole, ApplicationUser } from '@/models/identity.model';

@Component({
  selector: 'app-identity-user-create',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    ButtonModule,
    SelectModule,
    TableModule,
    TooltipModule,
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
  private messageService = inject(MessageService);

  form!: FormGroup;
  roles: ApplicationRole[] = [];
  users: ApplicationUser[] = [];
  editingUser: ApplicationUser | null = null;
  isSubmitting = false;

  ngOnInit(): void {
    this.initForm();
    this.loadRoles();
    this.loadUsers();
  }

  loadUsers(): void {
    this.identityService.getAllUsers().subscribe({
      next: (list) => {
        const arr = Array.isArray(list) ? list : [];
        this.users = arr.map((u) => this.normUser(u));
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load users' });
      }
    });
  }

  private normUser(u: unknown): ApplicationUser {
    const o = u as Record<string, unknown>;
    return {
      id: (o['id'] ?? o['Id']) as string,
      userName: (o['userName'] ?? o['UserName']) as string,
      email: (o['email'] ?? o['Email']) as string,
      phoneNumber: (o['phoneNumber'] ?? o['PhoneNumber']) as string | null,
      roleName: (o['roleName'] ?? o['RoleName']) as string
    };
  }

  initForm(): void {
    const confirmUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}#/landing`
        : '';
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      phoneNumber: [''],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(6),
          Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{6,20}$/)
        ]
      ],
      roleName: ['', Validators.required],
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
          phoneNumber: value.phoneNumber || undefined,
          roleName: value.roleName
        })
        .subscribe({
          next: (res) => {
            this.isSubmitting = false;
            if (res.isSuccess) {
              this.messageService.add({ severity: 'success', summary: 'Success', detail: res.message ?? 'User updated.' });
              this.onReset();
              this.loadUsers();
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

    this.identityService.createUser(value).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        if (res.isSuccess) {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: res.message ?? 'User created. Confirmation email sent.'
          });
          this.form.reset({
            email: '',
            phoneNumber: '',
            password: '',
            roleName: '',
            confirmUrl: value.confirmUrl
          });
          this.loadUsers();
        } else {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: res.message ?? 'Create failed'
          });
        }
      },
      error: (err) => {
        this.isSubmitting = false;
        const msg =
          err?.error?.message ||
          err?.error?.message ||
          (typeof err?.message === 'string' ? err.message : 'Create user failed');
        this.messageService.add({ severity: 'error', summary: 'Error', detail: msg });
      }
    });
  }

  onEdit(user: ApplicationUser): void {
    this.editingUser = user;
    this.form.patchValue({
      email: user.email,
      phoneNumber: user.phoneNumber ?? '',
      roleName: user.roleName ?? '',
      password: ''
    });
    this.form.get('email')?.disable();
    this.form.get('password')?.clearValidators();
    this.form.get('password')?.updateValueAndValidity();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onReset(): void {
    this.editingUser = null;
    this.form.get('email')?.enable();
    this.form.get('password')?.setValidators([
      Validators.required,
      Validators.minLength(6),
      Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{6,20}$/)
    ]);
    this.form.get('password')?.updateValueAndValidity();
    const confirmUrl = this.form.get('confirmUrl')?.value;
    this.form.reset({
      email: '',
      phoneNumber: '',
      password: '',
      roleName: '',
      confirmUrl: confirmUrl ?? ''
    });
  }
}
