import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Fluid } from 'primeng/fluid';
import { ButtonModule } from 'primeng/button';
import { NoteSheetNumberConfigModel } from '../shared/models/notesheet-number-config';
import { MessageService, ConfirmationService } from 'primeng/api';
import { SharedService } from '@/shared/services/shared-service';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { CodeType } from '@/models/enums';
import { InputText } from 'primeng/inputtext';
import { InputNumber } from 'primeng/inputnumber';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { TableModule } from 'primeng/table';
import { Select } from 'primeng/select';
import { MultiSelect } from 'primeng/multiselect';
import { Checkbox } from 'primeng/checkbox';
@Component({
    selector: 'app-notesheet-number-config',
    imports: [ReactiveFormsModule, TableModule, InputText, InputNumber, Fluid, ButtonModule, IconField, InputIcon, Select, MultiSelect, Checkbox],
    templateUrl: './notesheet-number-config.html',
    styleUrl: './notesheet-number-config.scss'
})
export class NoteSheetNumberConfigComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    isSubmitting = false;
    isEditMode = false;
    editingConfigId = 0;
    configForm!: FormGroup;

    configs: NoteSheetNumberConfigModel[] = [];
    filteredConfigs: NoteSheetNumberConfigModel[] = [];

    noteSheetTypeOptions = [
        { label: 'General', value: 'General' },
        { label: 'Ex-BD Leave', value: 'ExBDLeave' },
        { label: 'New Posting', value: 'NewPosting' },
        { label: 'Inter Posting', value: 'InterPosting' }
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
            noteSheetType: [null, Validators.required],
            memberTypeIds: [[], [(control: any) => control.value?.length ? null : { required: true }]],
            prefix: [null, Validators.required],
            prefixBN: [null, Validators.required],
            startNumber: [null, [Validators.required, Validators.min(1)]],
            includeDateInNumber: [false]
        });
    }

    getAll() {
        this.masterBasicSetupService.getAllNoteSheetNumberConfig().subscribe({
            next: (res: NoteSheetNumberConfigModel[]) => {
                this.configs = res;
                this.filteredConfigs = [...res];
                this.totalRecords = res.length;
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to fetch NoteSheet Number Config data'
                });
            }
        });
    }

    getPreview(): string {
        const raw = this.configForm.get('prefix')?.value || 'PREFIX';
        const prefix = (raw as string).replace(/[\s\/\-]+$/, '');
        const startNumber = this.configForm.get('startNumber')?.value || '10001';
        if (this.configForm.get('includeDateInNumber')?.value) {
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
                return c.noteSheetType.toLowerCase().includes(this.searchValue)
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
        const formVal = this.configForm.value;
        const payload: any = {
            ...formVal,
            memberTypeIds: (formVal.memberTypeIds as number[]).join(','),
            configId: 0,
            currentNumber: 0,
            status: true,
            createdBy: this.currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: this.currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.createNoteSheetNumberConfig(payload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'NoteSheet Number Config created successfully'
                });
                this.onReset();
                this.getAll();
                this.isSubmitting = false;
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to create NoteSheet Number Config'
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
            memberTypeIds: (formVal.memberTypeIds as number[]).join(','),
            prefix: formVal.prefix,
            prefixBN: formVal.prefixBN ?? '',
            includeDateInNumber: formVal.includeDateInNumber ?? false,
            lastUpdatedBy: this.currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.updateNoteSheetNumberConfig(payload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'NoteSheet Number Config updated successfully'
                });
                this.onReset();
                this.getAll();
                this.isSubmitting = false;
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to update NoteSheet Number Config'
                });
                this.isSubmitting = false;
            }
        });
    }

    onEdit(row: NoteSheetNumberConfigModel) {
        this.isEditMode = true;
        this.editingConfigId = row.configId;
        this.configForm.patchValue({
            configId: row.configId,
            noteSheetType: row.noteSheetType,
            memberTypeIds: row.memberTypeIds ? row.memberTypeIds.split(',').map(Number) : [],
            prefix: row.prefix,
            prefixBN: row.prefixBN ?? '',
            startNumber: row.startNumber,
            includeDateInNumber: row.includeDateInNumber ?? false
        });
        // Disable fields that should not be changed after creation
        this.configForm.get('noteSheetType')?.disable();
        this.configForm.get('startNumber')?.disable();
    }

    onDelete(row: NoteSheetNumberConfigModel) {
        if (!confirm(`Are you sure you want to delete the config for "${row.noteSheetType}"?`)) {
            return;
        }

        this.masterBasicSetupService.deleteNoteSheetNumberConfig(row.configId).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'NoteSheet Number Config deleted successfully'
                });
                this.getAll();
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to delete NoteSheet Number Config'
                });
            }
        });
    }

    getMemberTypeLabel(idsStr: string): string {
        if (!idsStr) return '-';
        const labels = idsStr.split(',')
            .map(id => this.memberTypeOptions.find(o => o.value === +id)?.label)
            .filter(Boolean) as string[];
        return labels.length ? labels.join(', ') : '-';
    }

    onReset() {
        this.configForm.reset({
            configId: 0,
            noteSheetType: null,
            memberTypeIds: [],
            prefix: null,
            prefixBN: null,
            startNumber: null,
            includeDateInNumber: false
        });
        // Re-enable fields that were disabled during edit
        this.configForm.get('noteSheetType')?.enable();
        this.configForm.get('startNumber')?.enable();
        this.isEditMode = false;
        this.editingConfigId = 0;
        this.isSubmitting = false;
    }
}
