import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Fluid } from 'primeng/fluid';
import { ButtonModule } from 'primeng/button';
import { MovementLetterNumberConfigModel } from '../shared/models/movement-letter-number-config';
import { MessageService } from 'primeng/api';
import { SharedService } from '@/shared/services/shared-service';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { InputText } from 'primeng/inputtext';
import { InputNumber } from 'primeng/inputnumber';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { TableModule } from 'primeng/table';
import { Select } from 'primeng/select';
import { Checkbox } from 'primeng/checkbox';
import { MoveOrderType, MoveOrderTypeOptions } from '@/models/enums';

@Component({
    selector: 'app-movement-letter-number-config',
    imports: [ReactiveFormsModule, TableModule, InputText, InputNumber, Fluid, ButtonModule, IconField, InputIcon, Select, Checkbox],
    templateUrl: './movement-letter-number-config.html',
    styleUrl: './movement-letter-number-config.scss'
})
export class MovementLetterNumberConfigComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    isSubmitting = false;
    isEditMode = false;
    editingConfigId = 0;
    configForm!: FormGroup;

    configs: MovementLetterNumberConfigModel[] = [];
    filteredConfigs: MovementLetterNumberConfigModel[] = [];

    moveOrderTypeOptions = MoveOrderTypeOptions;

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
    }

    initForm() {
        this.configForm = this.fb.group({
            configId: [0],
            moveOrderType: [null as MoveOrderType | null, Validators.required],
            prefix: [null],
            prefixBN: [null],
            startNumber: [null, [Validators.required, Validators.min(1)]],
            includeDateInNumber: [false]
        });
    }

    getAll() {
        this.masterBasicSetupService.getAllMovementLetterNumberConfig().subscribe({
            next: (res: MovementLetterNumberConfigModel[]) => {
                this.configs = res;
                this.filteredConfigs = [...res];
                this.totalRecords = res.length;
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to fetch Movement Letter Number Config data'
                });
            }
        });
    }

    getMoveOrderTypeLabel(value: number): string {
        return this.moveOrderTypeOptions.find((o) => o.value === value)?.label ?? '-';
    }

    getPreview(): string {
        const rawPrefix = (this.configForm.get('prefix')?.value ?? '').toString().trim();
        const startNumber = this.configForm.get('startNumber')?.value || '10001';
        const includeDate = this.configForm.get('includeDateInNumber')?.value;
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');

        // No prefix → number leads. CC drops the month ("StartNo/Year");
        // other types keep "StartNo/Year/Month". Without date, just "StartNo".
        if (!rawPrefix) {
            if (!includeDate) return `${startNumber}`;
            const isCC = this.configForm.get('moveOrderType')?.value === MoveOrderType.CC;
            return isCC ? `${startNumber}/${year}` : `${startNumber}/${year}/${month}`;
        }

        const sep = rawPrefix.endsWith('/') || rawPrefix.endsWith('-') ? '' : '-';
        if (includeDate) {
            return `${rawPrefix}${sep}${year}/${month}/${startNumber}`;
        }
        return `${rawPrefix}${sep}${startNumber}`;
    }

    onSearch(event: Event) {
        const target = event.target as HTMLInputElement;
        this.searchValue = target.value.toLowerCase().trim();

        if (this.searchValue) {
            this.filteredConfigs = this.configs.filter((c) => {
                const typeLabel = this.getMoveOrderTypeLabel(c.moveOrderType).toLowerCase();
                return typeLabel.includes(this.searchValue) || (c.prefix || '').toLowerCase().includes(this.searchValue);
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
            prefix: this.configForm.value.prefix ?? '',
            prefixBN: this.configForm.value.prefixBN ?? '',
            currentNumber: 0,
            currentYear: 0,
            currentMonth: 0,
            status: true,
            createdBy: this.currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: this.currentUser,
            lastupdate: currentDateTime,
            includeDateInNumber: this.configForm.value.includeDateInNumber ?? false
        };

        this.masterBasicSetupService.createMovementLetterNumberConfig(payload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Movement Letter Number Config created successfully'
                });
                this.onReset();
                this.getAll();
                this.isSubmitting = false;
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to create Movement Letter Number Config'
                });
                this.isSubmitting = false;
            }
        });
    }

    update() {
        this.isSubmitting = true;
        const currentDateTime = this.sharedService.getCurrentDateTime();

        const existing = this.configs.find((c) => c.configId === this.editingConfigId);

        const formVal = this.configForm.getRawValue();
        const payload: any = {
            ...existing,
            prefix: formVal.prefix ?? '',
            prefixBN: formVal.prefixBN ?? '',
            includeDateInNumber: formVal.includeDateInNumber ?? false,
            lastUpdatedBy: this.currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.updateMovementLetterNumberConfig(payload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Movement Letter Number Config updated successfully'
                });
                this.onReset();
                this.getAll();
                this.isSubmitting = false;
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to update Movement Letter Number Config'
                });
                this.isSubmitting = false;
            }
        });
    }

    onEdit(row: MovementLetterNumberConfigModel) {
        this.isEditMode = true;
        this.editingConfigId = row.configId;
        this.configForm.patchValue({
            configId: row.configId,
            moveOrderType: row.moveOrderType,
            prefix: row.prefix,
            prefixBN: row.prefixBN ?? '',
            startNumber: row.startNumber,
            includeDateInNumber: row.includeDateInNumber ?? false
        });
        // Type + start-number locked after creation (matches notesheet-number-config)
        this.configForm.get('moveOrderType')?.disable();
        this.configForm.get('startNumber')?.disable();
    }

    onReset() {
        this.configForm.reset({
            configId: 0,
            moveOrderType: null,
            prefix: null,
            prefixBN: null,
            startNumber: null,
            includeDateInNumber: false
        });
        this.configForm.get('moveOrderType')?.enable();
        this.configForm.get('startNumber')?.enable();
        this.isEditMode = false;
        this.editingConfigId = 0;
        this.isSubmitting = false;
    }
}
