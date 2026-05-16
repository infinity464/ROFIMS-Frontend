import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Fluid } from 'primeng/fluid';
import { ButtonModule } from 'primeng/button';
import { PostingOrderNumberConfigModel } from '../shared/models/posting-order-number-config';
import { MessageService, ConfirmationService } from 'primeng/api';
import { SharedService } from '@/shared/services/shared-service';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { CodeType, PostingType } from '@/models/enums';
import { InputText } from 'primeng/inputtext';
import { InputNumber } from 'primeng/inputnumber';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { TableModule } from 'primeng/table';
import { Select } from 'primeng/select';
import { Checkbox } from 'primeng/checkbox';

@Component({
    selector: 'app-posting-order-number-config',
    imports: [ReactiveFormsModule, TableModule, InputText, InputNumber, Fluid, ButtonModule, IconField, InputIcon, Select, Checkbox],
    templateUrl: './posting-order-number-config.html',
    styleUrl: './posting-order-number-config.scss'
})
export class PostingOrderNumberConfigComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    isSubmitting = false;
    isEditMode = false;
    editingConfigId = 0;
    configForm!: FormGroup;

    configs: PostingOrderNumberConfigModel[] = [];
    filteredConfigs: PostingOrderNumberConfigModel[] = [];

    postingTypeOptions = [
        { label: 'New Posting', value: PostingType.NewPosting },
        { label: 'Inter Posting', value: PostingType.InterPosting },
        { label: 'General', value: PostingType.General },
        { label: 'Ex-BD Leave', value: PostingType.ExBdLeave }
    ];

    memberTypeOptions: { label: string; value: number }[] = [];

    currentUser: string = '';

    // Pagination
    first = 0;
    rows = 10;
    totalRecords = 0;

    // Search
    searchValue = '';

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
        this.masterBasicSetupService.getAllByType(CodeType.EmployeeType).subscribe(res => {
            this.memberTypeOptions = res.map(r => ({ label: r.codeValueEN, value: r.codeId }));
        });
    }

    initForm() {
        this.configForm = this.fb.group({
            configId: [0],
            postingType: [null, Validators.required],
            memberTypeId: [null, Validators.required],
            prefix: [null, Validators.required],
            prefixBN: [null, Validators.required],
            startNumber: [null, [Validators.required, Validators.min(1)]],
            includeDate: [true]
        });
    }

    getAll() {
        this.masterBasicSetupService.getAllPostingOrderNumberConfig().subscribe({
            next: (res: PostingOrderNumberConfigModel[]) => {
                this.configs = res;
                this.filteredConfigs = [...res];
                this.totalRecords = res.length;
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to fetch Posting Order Number Config data'
                });
            }
        });
    }

    getPreview(): string {
        const prefix = this.configForm.get('prefix')?.value || 'PREFIX';
        const startNumber = this.configForm.get('startNumber')?.value || '10001';
        const includeDate = this.configForm.get('includeDate')?.value;
        if (includeDate) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            return `${prefix}/${year}/${month}/${startNumber}`;
        }
        return `${prefix}/${startNumber}`;
    }

    onSearch(event: Event) {
        const target = event.target as HTMLInputElement;
        this.searchValue = target.value.toLowerCase().trim();

        if (this.searchValue) {
            this.filteredConfigs = this.configs.filter((c) => {
                return c.postingType.toLowerCase().includes(this.searchValue)
                    || c.prefix.toLowerCase().includes(this.searchValue);
            });
        } else {
            this.filteredConfigs = [...this.configs];
        }

        this.totalRecords = this.filteredConfigs.length;
        this.first = 0;
    }

    onSubmit() {
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

    create() {
        this.isSubmitting = true;
        const currentDateTime = this.sharedService.getCurrentDateTime();

        const payload: any = {
            ...this.configForm.value,
            configId: 0,
            currentNumber: 0,
            currentYear: 0,
            currentMonth: 0,
            status: true,
            createdBy: this.currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: this.currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.createPostingOrderNumberConfig(payload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Posting Order Number Config created successfully'
                });
                this.onReset();
                this.getAll();
                this.isSubmitting = false;
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to create Posting Order Number Config'
                });
                this.isSubmitting = false;
            }
        });
    }

    update() {
        this.isSubmitting = true;
        const currentDateTime = this.sharedService.getCurrentDateTime();

        const existing = this.configs.find(c => c.configId === this.editingConfigId);

        const formVal = this.configForm.getRawValue();
        const payload: any = {
            ...existing,
            memberTypeId: formVal.memberTypeId,
            prefix: formVal.prefix,
            prefixBN: formVal.prefixBN ?? '',
            lastUpdatedBy: this.currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.updatePostingOrderNumberConfig(payload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Posting Order Number Config updated successfully'
                });
                this.onReset();
                this.getAll();
                this.isSubmitting = false;
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to update Posting Order Number Config'
                });
                this.isSubmitting = false;
            }
        });
    }

    onEdit(row: PostingOrderNumberConfigModel) {
        this.isEditMode = true;
        this.editingConfigId = row.configId;
        this.configForm.patchValue({
            configId: row.configId,
            postingType: row.postingType,
            memberTypeId: row.memberTypeId,
            prefix: row.prefix,
            prefixBN: row.prefixBN ?? '',
            startNumber: row.startNumber,
            includeDate: row.includeDate ?? true
        });
        // Disable fields that should not be changed after creation
        this.configForm.get('postingType')?.disable();
        this.configForm.get('startNumber')?.disable();
    }

    getMemberTypeLabel(id: number): string {
        return this.memberTypeOptions.find(o => o.value === id)?.label ?? '-';
    }

    onDelete(row: PostingOrderNumberConfigModel) {
        if (!confirm(`Are you sure you want to delete the config for "${row.postingType}"?`)) {
            return;
        }

        this.masterBasicSetupService.deletePostingOrderNumberConfig(row.configId).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Posting Order Number Config deleted successfully'
                });
                this.getAll();
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to delete Posting Order Number Config'
                });
            }
        });
    }

    onReset() {
        this.configForm.reset({
            configId: 0,
            postingType: null,
            memberTypeId: null,
            prefix: null,
            prefixBN: null,
            startNumber: null,
            includeDate: true
        });
        // Re-enable fields that were disabled during edit
        this.configForm.get('postingType')?.enable();
        this.configForm.get('startNumber')?.enable();
        this.isEditMode = false;
        this.editingConfigId = 0;
        this.isSubmitting = false;
    }
}
