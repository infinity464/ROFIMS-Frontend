import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Fluid } from 'primeng/fluid';
import { ButtonModule } from 'primeng/button';
import { LeaveCardNumberConfigModel } from '../shared/models/leave-card-number-config';
import { MessageService } from 'primeng/api';
import { SharedService } from '@/shared/services/shared-service';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { InputNumber } from 'primeng/inputnumber';
import { TableModule } from 'primeng/table';

/**
 * Singleton config: admin sets a starting number once. The very next leave
 * application that reaches "Approved" gets that number on its certificate; every
 * subsequent approval increments by one.
 */
@Component({
    selector: 'app-leave-card-number-config',
    imports: [ReactiveFormsModule, TableModule, InputNumber, Fluid, ButtonModule, DatePipe],
    templateUrl: './leave-card-number-config.html',
    styleUrl: './leave-card-number-config.scss'
})
export class LeaveCardNumberConfigComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    isSubmitting = false;
    isEditMode = false;
    editingConfigId = 0;
    configForm!: FormGroup;

    /** Current row (single-row table). Empty array when no config exists yet. */
    configs: LeaveCardNumberConfigModel[] = [];

    currentUser: string = '';

    constructor(
        private fb: FormBuilder,
        private masterBasicSetupService: MasterBasicSetupService,
        private messageService: MessageService,
        private sharedService: SharedService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.currentUser = this.sharedService.getCurrentUser();
        this.initForm();
        this.getAll();
    }

    initForm(): void {
        this.configForm = this.fb.group({
            configId: [0],
            minId: [null, [Validators.required, Validators.min(1)]]
        });
    }

    getAll(): void {
        this.masterBasicSetupService.getAllLeaveCardNumberConfig().subscribe({
            next: (res: LeaveCardNumberConfigModel[]) => {
                this.configs = res ?? [];
                if (this.configs.length > 0) {
                    // Singleton: load the existing row in edit mode.
                    const row = this.configs[0];
                    this.isEditMode = true;
                    this.editingConfigId = row.configId;
                    this.configForm.patchValue({
                        configId: row.configId,
                        minId: row.minId
                    });
                } else {
                    this.isEditMode = false;
                    this.editingConfigId = 0;
                    this.configForm.reset({ configId: 0, minId: null });
                }
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to fetch Leave Card Number Config data'
                });
            }
        });
    }

    onSubmit(): void {
        if (this.isSubmitting) return;
        if (this.configForm.invalid) {
            this.configForm.markAllAsTouched();
            return;
        }
        if (this.isEditMode) {
            this.update();
        } else {
            this.create();
        }
    }

    create(): void {
        this.isSubmitting = true;
        const currentDateTime = this.sharedService.getCurrentDateTime();
        const payload: LeaveCardNumberConfigModel = {
            configId: 0,
            minId: this.configForm.value.minId,
            currentId: null,
            createdBy: this.currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: this.currentUser,
            lastupdate: currentDateTime
        };
        this.masterBasicSetupService.createLeaveCardNumberConfig(payload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Leave Card Number Config created successfully'
                });
                this.getAll();
                this.isSubmitting = false;
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to create Leave Card Number Config'
                });
                this.isSubmitting = false;
            }
        });
    }

    update(): void {
        this.isSubmitting = true;
        const currentDateTime = this.sharedService.getCurrentDateTime();
        const existing = this.configs.find((c) => c.configId === this.editingConfigId);
        const payload: LeaveCardNumberConfigModel = {
            ...(existing ?? ({} as LeaveCardNumberConfigModel)),
            configId: this.editingConfigId,
            minId: this.configForm.value.minId,
            lastUpdatedBy: this.currentUser,
            lastupdate: currentDateTime
        };
        this.masterBasicSetupService.updateLeaveCardNumberConfig(payload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Leave Card Number Config updated successfully'
                });
                this.getAll();
                this.isSubmitting = false;
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to update Leave Card Number Config'
                });
                this.isSubmitting = false;
            }
        });
    }

    onReset(): void {
        if (this.isEditMode && this.configs.length > 0) {
            const row = this.configs[0];
            this.configForm.patchValue({ configId: row.configId, minId: row.minId });
        } else {
            this.configForm.reset({ configId: 0, minId: null });
        }
        this.isSubmitting = false;
    }
}
