import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Fluid } from 'primeng/fluid';
import { ButtonModule } from 'primeng/button';
import { RabIdSerialModel } from '../shared/models/rab-id-serial';
import { CommonCode } from '../shared/models/common-code';
import { OrganizationModel } from '../organization-setup/models/organization';
import { MessageService } from 'primeng/api';
import { SharedService } from '@/shared/services/shared-service';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { InputText } from 'primeng/inputtext';
import { InputNumber } from 'primeng/inputnumber';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { TableModule } from 'primeng/table';
import { Select } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';

@Component({
    selector: 'app-rab-id-serial',
    imports: [ReactiveFormsModule, TableModule, InputText, InputNumber, Fluid, ButtonModule, IconField, InputIcon, Select, MultiSelectModule],
    templateUrl: './rab-id-serial.html',
    styleUrl: './rab-id-serial.scss'
})
export class RabIdSerial implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    isSubmitting = false;
    rabIdSerialForm!: FormGroup;

    rabIdSerials: RabIdSerialModel[] = [];
    filteredRabIdSerials: RabIdSerialModel[] = [];
    employeeTypes: CommonCode[] = [];
    employeeTypeOptions: { label: string; value: number }[] = [];
    motherOrgs: OrganizationModel[] = [];
    motherOrgOptions: { label: string; value: number }[] = [];

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
        this.loadEmployeeTypes();
        this.loadMotherOrgs();
        this.getAll();
    }

    private setupFormFilterListeners() {
        this.rabIdSerialForm.get('employeeTypeId')?.valueChanges.subscribe(() => {
            this.first = 0;
            this.buildTableData();
        });
        this.rabIdSerialForm.get('motherOrgIds')?.valueChanges.subscribe(() => {
            this.first = 0;
            this.buildTableData();
        });
    }

    private buildTableData() {
        let list = [...this.rabIdSerials];
        const employeeTypeId = this.rabIdSerialForm?.get('employeeTypeId')?.value;
        if (employeeTypeId != null) {
            list = list.filter((r) => r.employeeTypeId === employeeTypeId);
        }
        const selectedOrgIds = (this.rabIdSerialForm?.get('motherOrgIds')?.value as number[]) ?? [];
        if (selectedOrgIds.length > 0) {
            list = list.filter((r) => {
                const rowOrgIds = this.parseMotherOrgIds(r.motherOrgIds);
                return selectedOrgIds.some((id) => rowOrgIds.includes(id));
            });
        }
        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) {
            list = list.filter((r) => {
                const employeeTypeName = this.getEmployeeTypeName(r.employeeTypeId).toLowerCase();
                const motherOrgNames = this.getMotherOrgNames(r.motherOrgIds).toLowerCase();
                return (
                    employeeTypeName.includes(q) ||
                    motherOrgNames.includes(q) ||
                    String(r.minId).includes(q)
                );
            });
        }
        this.filteredRabIdSerials = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    parseMotherOrgIds(motherOrgIds: string | null | undefined): number[] {
        if (!motherOrgIds || !motherOrgIds.trim()) return [];
        return motherOrgIds
            .split(',')
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !isNaN(n));
    }

    getMotherOrgNames(motherOrgIds: string | null | undefined): string {
        const ids = this.parseMotherOrgIds(motherOrgIds);
        if (ids.length === 0) return 'All';
        return ids
            .map((id) => this.motherOrgs.find((o) => o.orgId === id)?.orgNameEN ?? String(id))
            .join(', ');
    }

    initForm() {
        this.rabIdSerialForm = this.fb.group({
            rabIdSerialId: [0],
            employeeTypeId: [null],
            motherOrgIds: [
                [] as number[],
                [(c: AbstractControl) => (Array.isArray(c?.value) && c.value.length > 0 ? null : { required: true })]
            ],
            minId: [null, [Validators.required, Validators.min(1)]],
            currentId: [null],
            createdBy: [this.currentUser],
            createdDate: [new Date().toISOString()],
            lastUpdatedBy: [this.currentUser],
            lastupdate: [new Date().toISOString()]
        });
    }

    loadEmployeeTypes() {
        this.masterBasicSetupService.getAllByType('EmployeeType').subscribe({
            next: (res: CommonCode[]) => {
                this.employeeTypes = res;
                this.employeeTypeOptions = res.map((o) => ({
                    label: o.codeValueEN,
                    value: o.codeId
                }));
                this.setupFormFilterListeners();
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load employee types'
                });
            }
        });
    }

    loadMotherOrgs() {
        this.masterBasicSetupService.getAllActiveMotherOrgs().subscribe({
            next: (res: OrganizationModel[]) => {
                this.motherOrgs = res ?? [];
                this.motherOrgOptions = this.motherOrgs.map((o) => ({
                    label: o.orgNameEN,
                    value: o.orgId
                }));
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load mother organizations'
                });
            }
        });
    }

    getAll() {
        this.masterBasicSetupService.getAllRabIdSerial().subscribe({
            next: (res: RabIdSerialModel[]) => {
                // Map legacy officerTypeId to employeeTypeId for backward compatibility
                this.rabIdSerials = (res ?? []).map((r) => ({
                    ...r,
                    employeeTypeId: r.employeeTypeId ?? (r as unknown as { officerTypeId?: number }).officerTypeId ?? 0
                }));
                this.buildTableData();
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to fetch RAB ID Serial data'
                });
            }
        });
    }

    getEmployeeTypeName(employeeTypeId: number): string {
        const employeeType = this.employeeTypes.find((o) => o.codeId === employeeTypeId);
        return employeeType ? employeeType.codeValueEN : '-';
    }

    onSearch(event: Event) {
        const target = event.target as HTMLInputElement;
        this.searchValue = (target?.value ?? '').toLowerCase().trim();
        this.first = 0;
        this.buildTableData();
    }

    onSubmit() {
        if (this.isSubmitting) return;

        const employeeTypeId = this.rabIdSerialForm.get('employeeTypeId')?.value;
        if (employeeTypeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Employee Type' });
            return;
        }
        const motherOrgIds = (this.rabIdSerialForm.get('motherOrgIds')?.value as number[]) ?? [];
        if (motherOrgIds.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select at least one Mother Org' });
            return;
        }
        if (this.rabIdSerialForm.invalid) {
            this.rabIdSerialForm.markAllAsTouched();
            return;
        }

        this.create();
    }

    create() {
        this.isSubmitting = true;
        const currentDateTime = this.sharedService.getCurrentDateTime();

        const motherOrgIdsArr = (this.rabIdSerialForm.get('motherOrgIds')?.value as number[]) ?? [];
        const motherOrgIdsStr =
            motherOrgIdsArr.length > 0 ? motherOrgIdsArr.join(',') : '';

        const payload = {
            ...this.rabIdSerialForm.value,
            motherOrgIds: motherOrgIdsStr || null,
            currentId: this.rabIdSerialForm.value.minId, // Set currentId to minId on create
            createdBy: this.currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: this.currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.createRabIdSerial(payload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'RAB ID Serial created successfully'
                });
                this.onReset();
                this.getAll();
                this.isSubmitting = false;
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create RAB ID Serial'
                });
                this.isSubmitting = false;
            }
        });
    }

    onReset() {
        this.searchValue = '';
        this.rabIdSerialForm.reset({
            rabIdSerialId: 0,
            employeeTypeId: null,
            motherOrgIds: [],
            minId: null,
            currentId: null,
            createdBy: this.currentUser,
            createdDate: new Date().toISOString(),
            lastUpdatedBy: this.currentUser,
            lastupdate: new Date().toISOString()
        });
        this.buildTableData();
        this.isSubmitting = false;
    }
}
