import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Fluid } from 'primeng/fluid';
import { ButtonModule } from 'primeng/button';
import { OnulipiConfigModel, OnulipiItem } from '../shared/models/onulipi-config';
import { MessageService } from 'primeng/api';
import { SharedService } from '@/shared/services/shared-service';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { PostingType } from '@/models/enums';
import { InputText } from 'primeng/inputtext';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { TableModule } from 'primeng/table';
import { Select } from 'primeng/select';

@Component({
    selector: 'app-onulipi-config',
    imports: [ReactiveFormsModule, TableModule, InputText, Fluid, ButtonModule, IconField, InputIcon, Select],
    templateUrl: './onulipi-config.html',
    styleUrl: './onulipi-config.scss'
})
export class OnulipiConfigComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    isSubmitting = false;
    isEditMode = false;
    editingConfigId = 0;
    configForm!: FormGroup;

    configs: OnulipiConfigModel[] = [];
    filteredConfigs: OnulipiConfigModel[] = [];

    postingTypeOptions = [
        { label: 'New Posting', value: PostingType.NewPosting },
        { label: 'Inter Posting', value: PostingType.InterPosting },
        { label: 'General', value: PostingType.General },
        { label: 'Ex-BD Leave', value: PostingType.ExBdLeave }
    ];

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
            postingType: [null, Validators.required],
            items: this.fb.array([])
        });
        this.addItem();
    }

    get items(): FormArray {
        return this.configForm.get('items') as FormArray;
    }

    // Each Office Order Type can be configured only once (DB enforces UNIQUE).
    // In create mode hide types that already have a config; in edit mode keep
    // the current type visible (it is locked/disabled anyway).
    get availablePostingTypeOptions() {
        if (this.isEditMode) {
            return this.postingTypeOptions;
        }
        const used = new Set(this.configs.map(c => c.postingType));
        return this.postingTypeOptions.filter(o => !used.has(o.value));
    }

    // True when all 4 types already have a config — nothing left to create.
    get allTypesConfigured(): boolean {
        return !this.isEditMode && this.availablePostingTypeOptions.length === 0;
    }

    // A row is valid as long as Bangla OR English is filled.
    private atLeastOneFilled(group: AbstractControl): ValidationErrors | null {
        const bn = (group.get('bn')?.value ?? '').toString().trim();
        const en = (group.get('en')?.value ?? '').toString().trim();
        return bn || en ? null : { atLeastOne: true };
    }

    newItem(bn = '', en = ''): FormGroup {
        return this.fb.group(
            {
                bn: [bn],
                en: [en]
            },
            { validators: (g: AbstractControl) => this.atLeastOneFilled(g) }
        );
    }

    addItem(bn = '', en = '') {
        this.items.push(this.newItem(bn, en));
    }

    removeItem(index: number) {
        this.items.removeAt(index);
        if (this.items.length === 0) {
            this.addItem();
        }
    }

    moveUp(index: number) {
        if (index <= 0) return;
        const ctrl = this.items.at(index);
        this.items.removeAt(index);
        this.items.insert(index - 1, ctrl);
    }

    moveDown(index: number) {
        if (index >= this.items.length - 1) return;
        const ctrl = this.items.at(index);
        this.items.removeAt(index);
        this.items.insert(index + 1, ctrl);
    }

    getAll() {
        this.masterBasicSetupService.getAllOnulipiConfig().subscribe({
            next: (res: OnulipiConfigModel[]) => {
                this.configs = res;
                this.filteredConfigs = [...res];
                this.totalRecords = res.length;
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to fetch Onulipi Config data'
                });
            }
        });
    }

    // Number of entries stored in a config row (read from the BN list).
    getEntryCount(row: OnulipiConfigModel): number {
        return this.parseList(row.onulipiJsonBN).length;
    }

    getPostingTypeLabel(value: string): string {
        return this.postingTypeOptions.find(o => o.value === value)?.label ?? value;
    }

    private parseList(json: string): OnulipiItem[] {
        if (!json) return [];
        try {
            const parsed = JSON.parse(json);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    onSearch(event: Event) {
        const target = event.target as HTMLInputElement;
        this.searchValue = target.value.toLowerCase().trim();

        if (this.searchValue) {
            this.filteredConfigs = this.configs.filter((c) =>
                this.getPostingTypeLabel(c.postingType).toLowerCase().includes(this.searchValue)
            );
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

    // Build the two serial-ordered JSON columns from the editable rows.
    private buildJson(): { bn: string; en: string } {
        const rows = this.items.value as { bn: string; en: string }[];
        const bn: OnulipiItem[] = rows.map((r, idx) => ({ serial: idx + 1, text: r.bn }));
        const en: OnulipiItem[] = rows.map((r, idx) => ({ serial: idx + 1, text: r.en }));
        return { bn: JSON.stringify(bn), en: JSON.stringify(en) };
    }

    create() {
        this.isSubmitting = true;
        const currentDateTime = this.sharedService.getCurrentDateTime();
        const json = this.buildJson();

        const payload: OnulipiConfigModel = {
            configId: 0,
            postingType: this.configForm.get('postingType')?.value,
            onulipiJsonBN: json.bn,
            onulipiJsonEN: json.en,
            status: true,
            createdBy: this.currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: this.currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.createOnulipiConfig(payload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Onulipi Config created successfully'
                });
                this.onReset();
                this.getAll();
                this.isSubmitting = false;
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to create Onulipi Config'
                });
                this.isSubmitting = false;
            }
        });
    }

    update() {
        this.isSubmitting = true;
        const currentDateTime = this.sharedService.getCurrentDateTime();
        const json = this.buildJson();

        const existing = this.configs.find(c => c.configId === this.editingConfigId);

        const payload: OnulipiConfigModel = {
            ...(existing as OnulipiConfigModel),
            configId: this.editingConfigId,
            postingType: this.configForm.getRawValue().postingType,
            onulipiJsonBN: json.bn,
            onulipiJsonEN: json.en,
            lastUpdatedBy: this.currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.updateOnulipiConfig(payload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Onulipi Config updated successfully'
                });
                this.onReset();
                this.getAll();
                this.isSubmitting = false;
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to update Onulipi Config'
                });
                this.isSubmitting = false;
            }
        });
    }

    onEdit(row: OnulipiConfigModel) {
        this.isEditMode = true;
        this.editingConfigId = row.configId;

        // Merge the two JSON lists back into editable rows, keyed by serial.
        const bnList = this.parseList(row.onulipiJsonBN);
        const enList = this.parseList(row.onulipiJsonEN);
        const enBySerial = new Map<number, string>(enList.map(e => [e.serial, e.text]));

        this.items.clear();
        const ordered = [...bnList].sort((a, b) => a.serial - b.serial);
        for (const item of ordered) {
            this.addItem(item.text, enBySerial.get(item.serial) ?? '');
        }
        if (this.items.length === 0) {
            this.addItem();
        }

        this.configForm.patchValue({
            configId: row.configId,
            postingType: row.postingType
        });
        // Posting Type identifies the row and must not change after creation.
        this.configForm.get('postingType')?.disable();
    }

    onDelete(row: OnulipiConfigModel) {
        if (!confirm(`Are you sure you want to delete the অনুলিপি config for "${this.getPostingTypeLabel(row.postingType)}"?`)) {
            return;
        }

        this.masterBasicSetupService.deleteOnulipiConfig(row.configId).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Onulipi Config deleted successfully'
                });
                this.getAll();
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to delete Onulipi Config'
                });
            }
        });
    }

    onReset() {
        this.configForm.reset({
            configId: 0,
            postingType: null
        });
        this.items.clear();
        this.addItem();
        this.configForm.get('postingType')?.enable();
        this.isEditMode = false;
        this.editingConfigId = 0;
        this.isSubmitting = false;
    }
}
