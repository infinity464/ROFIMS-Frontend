import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Fluid } from 'primeng/fluid';
import { ButtonModule } from 'primeng/button';
import { MovementLetterNumberConfigModel } from '../shared/models/movement-letter-number-config';
import { MessageService } from 'primeng/api';
import { SharedService } from '@/shared/services/shared-service';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { InputText } from 'primeng/inputtext';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { TableModule } from 'primeng/table';
import { Select } from 'primeng/select';
import { Checkbox } from 'primeng/checkbox';
import { MoveOrderType, MoveOrderTypeOptions } from '@/models/enums';

@Component({
    selector: 'app-movement-letter-number-config',
    imports: [ReactiveFormsModule, TableModule, InputText, Fluid, ButtonModule, IconField, InputIcon, Select, Checkbox],
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
    rabUnitOptions: { label: string; value: number }[] = [];

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
        this.loadRabUnits();
        this.getAll();
    }

    initForm() {
        this.configForm = this.fb.group({
            configId: [0],
            rabUnitId: [null as number | null, Validators.required],
            moveOrderType: [null as MoveOrderType | null, Validators.required],
            prefix: [null],
            prefixBN: [null],
            // Text, not a number input — the leading zeros the user types are the
            // padding width ("001" → 3 wide). Digits only, at least one non-zero.
            startNumber: [null, [Validators.required, Validators.pattern(/^\d+$/), this.nonZeroValidator]],
            includeDateInNumber: [false],
            telephoneNo: [null]
        });
    }

    /** "000" / "0" is not a usable starting point — the sequence must begin at 1 or above. */
    private nonZeroValidator(control: AbstractControl): ValidationErrors | null {
        const raw = (control.value ?? '').toString().trim();
        if (!raw) return null;
        if (!/^\d+$/.test(raw)) return null;
        return Number(raw) >= 1 ? null : { nonZero: true };
    }

    /** Width the user typed the Start Number at — that becomes the zero-pad width. */
    private get startNumberRaw(): string {
        return (this.configForm.get('startNumber')?.value ?? '').toString().trim();
    }

    /** Left-pads a sequence number to the configured width for display. */
    padNumber(value: number | null | undefined, padding: number | null | undefined): string {
        if (value == null) return '-';
        const text = String(value);
        return padding && padding > 0 ? text.padStart(padding, '0') : text;
    }

    /** RAB units come from the CommonCode master maintained on /basic-setup/rab-unit. */
    private loadRabUnits() {
        this.masterBasicSetupService.getAllByType('RabUnit').subscribe({
            next: (units) => {
                this.rabUnitOptions = (units ?? []).map((u) => ({ label: u.codeValueEN, value: u.codeId }));
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load RAB Units'
                });
            }
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

    /** Legacy rows saved before the per-unit split carry no unit — they act as the global fallback. */
    getRabUnitLabel(value: number | null | undefined): string {
        if (value == null) return 'All Units (Global)';
        return this.rabUnitOptions.find((o) => o.value === value)?.label ?? `Unit ${value}`;
    }

    getPreview(): string {
        return this.buildNumber(this.startNumberRaw || '00001');
    }

    /** Second sample, so the zero-padding is obvious: 001 → 002. */
    getPreviewNext(): string {
        const raw = this.startNumberRaw || '00001';
        if (!/^\d+$/.test(raw)) return '';
        return this.buildNumber(String(Number(raw) + 1).padStart(raw.length, '0'));
    }

    private buildNumber(sequence: string): string {
        const rawPrefix = (this.configForm.get('prefix')?.value ?? '').toString().trim();
        const includeYear = this.configForm.get('includeDateInNumber')?.value;
        const year = new Date().getFullYear();

        // No prefix → number leads: "StartNo/Year", or just "StartNo" when the year is off.
        if (!rawPrefix) {
            return includeYear ? `${sequence}/${year}` : `${sequence}`;
        }

        const sep = rawPrefix.endsWith('/') || rawPrefix.endsWith('-') ? '' : '-';
        if (includeYear) {
            return `${rawPrefix}${sep}${year}/${sequence}`;
        }
        return `${rawPrefix}${sep}${sequence}`;
    }

    /** A unit may hold only one config per move-order type — mirrors the DB unique key. */
    private findDuplicate(): MovementLetterNumberConfigModel | undefined {
        const val = this.configForm.getRawValue();
        return this.configs.find(
            (c) => c.configId !== this.editingConfigId && (c.rabUnitId ?? null) === (val.rabUnitId ?? null) && c.moveOrderType === val.moveOrderType
        );
    }

    onSearch(event: Event) {
        const target = event.target as HTMLInputElement;
        this.searchValue = target.value.toLowerCase().trim();

        if (this.searchValue) {
            this.filteredConfigs = this.configs.filter((c) => {
                const typeLabel = this.getMoveOrderTypeLabel(c.moveOrderType).toLowerCase();
                const unitLabel = this.getRabUnitLabel(c.rabUnitId).toLowerCase();
                return (
                    typeLabel.includes(this.searchValue) ||
                    unitLabel.includes(this.searchValue) ||
                    (c.prefix || '').toLowerCase().includes(this.searchValue) ||
                    (c.telephoneNo || '').toLowerCase().includes(this.searchValue)
                );
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

        const duplicate = this.findDuplicate();
        if (duplicate) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Duplicate configuration',
                detail: `${this.getRabUnitLabel(duplicate.rabUnitId)} already has a configuration for ${this.getMoveOrderTypeLabel(duplicate.moveOrderType)}. Edit that one instead.`,
                life: 6000
            });
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

        // "001" is stored as StartNumber 1 with NumberPadding 3 — the typed width
        // is what the generated letter numbers are padded to.
        const raw = this.startNumberRaw;

        const payload: any = {
            ...this.configForm.value,
            configId: 0,
            prefix: this.configForm.value.prefix ?? '',
            prefixBN: this.configForm.value.prefixBN ?? '',
            telephoneNo: this.configForm.value.telephoneNo ?? null,
            startNumber: Number(raw),
            numberPadding: raw.length,
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
                // The API rejects a duplicate (RAB Unit, Move Order Type) with a
                // ResultViewModel — its message lands in `description`.
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.description || err?.error?.message || 'Failed to create Movement Letter Number Config'
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
            telephoneNo: formVal.telephoneNo ?? null,
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
                    detail: err?.error?.description || err?.error?.message || 'Failed to update Movement Letter Number Config'
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
            rabUnitId: row.rabUnitId ?? null,
            moveOrderType: row.moveOrderType,
            prefix: row.prefix,
            prefixBN: row.prefixBN ?? '',
            // Re-render the padding the config was created with, so the field
            // shows "001" rather than "1".
            startNumber: this.padNumber(row.startNumber, row.numberPadding),
            includeDateInNumber: row.includeDateInNumber ?? false,
            telephoneNo: row.telephoneNo ?? null
        });
        // Unit + type + start-number locked after creation — they identify the
        // running sequence (matches notesheet-number-config).
        this.configForm.get('rabUnitId')?.disable();
        this.configForm.get('moveOrderType')?.disable();
        this.configForm.get('startNumber')?.disable();
    }

    onReset() {
        this.configForm.reset({
            configId: 0,
            rabUnitId: null,
            moveOrderType: null,
            prefix: null,
            prefixBN: null,
            startNumber: null,
            includeDateInNumber: false,
            telephoneNo: null
        });
        this.configForm.get('rabUnitId')?.enable();
        this.configForm.get('moveOrderType')?.enable();
        this.configForm.get('startNumber')?.enable();
        this.isEditMode = false;
        this.editingConfigId = 0;
        this.isSubmitting = false;
    }
}
