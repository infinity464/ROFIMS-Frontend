import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Fluid } from 'primeng/fluid';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { IdentityService } from '@/services/identity.service';
import type { ApplicationRole, UpdateRoleModel } from '@/models/identity.model';

@Component({
  selector: 'app-role-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
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
  private fb = inject(FormBuilder);
  private identityService = inject(IdentityService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);

  form!: FormGroup;
  roles: ApplicationRole[] = [];
  editingRoleId: string | null = null;
  isSubmitting = false;

  ngOnInit(): void {
    this.initForm();
    this.loadRoles();
  }

  initForm(): void {
    this.form = this.fb.group({
      name: ['', Validators.required]
    });
  }

  loadRoles(): void {
    this.identityService.getRoles().subscribe({
      next: (list) => {
        this.roles = Array.isArray(list) ? list : [];
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load roles' });
      }
    });
  }

  onSubmit(): void {
    if (this.isSubmitting || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const name = this.form.get('name')?.value?.trim();
    if (!name) return;

    this.isSubmitting = true;
    if (this.editingRoleId) {
      const payload: UpdateRoleModel = { id: this.editingRoleId, name };
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
        error: () => {
          this.isSubmitting = false;
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Update failed' });
        }
      });
    } else {
      this.identityService.createRole({ name }).subscribe({
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
        error: () => {
          this.isSubmitting = false;
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Add failed' });
        }
      });
    }
  }

  onEdit(role: ApplicationRole): void {
    this.editingRoleId = role.id;
    this.form.patchValue({ name: role.name });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onReset(): void {
    this.editingRoleId = null;
    this.form.reset({ name: '' });
    this.isSubmitting = false;
  }
}
