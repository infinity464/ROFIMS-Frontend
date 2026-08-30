import { Component, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { CommonCode } from '../shared/models/common-code';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { ConfirmationService, MessageService } from 'primeng/api';
import { FormConfig } from '../shared/models/formConfig';
import { TableConfig } from '../shared/models/dataTableConfig';
import { DynamicFormComponent } from '../shared/componets/dynamic-form-component/dynamic-form';

import { Fluid } from 'primeng/fluid';
import { SharedService } from '@/shared/services/shared-service';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { PaginatorModule } from 'primeng/paginator';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';

@Component({
    selector: 'app-education-qualification',
    imports: [
        DynamicFormComponent,
        Fluid,
        CommonModule,
        ButtonModule,
        TagModule,
        PaginatorModule,
        InputTextModule,
        IconFieldModule,
        InputIconModule,
        ProgressSpinnerModule
    ],
    templateUrl: './education-qualification.html',
    providers: [],
    styleUrl: './education-qualification.scss'
})
export class EducationQualification {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    codeType: string = 'EducationQualification';
    commonCodeData: (CommonCode & { departmentNames?: string; departmentChips?: string[] })[] = [];
    editingId: number | null = null;
    commonCodeForm!: FormGroup;

    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    serchValue: string = '';
    isSubmitting = false;

    // Department multiselect support
    allDepartments: any[] = [];
    departmentOptions: { label: string; value: any }[] = [];
    /** qualificationCodeId -> department codeIds[] */
    private mappingByQualification = new Map<number, number[]>();

    // Form Configuration
    formConfig: FormConfig = {
        formFields: [
            {
                name: 'codeValueEN',
                label: 'Education Qualification Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'Education Qualification Name (Bangla)',
                type: 'text',
                required: true
            },
            {
                name: 'departmentIds',
                label: 'Department',
                type: 'multiselect',
                required: false,
                default: [],
                options: []
            },
            {
                name: 'status',
                label: 'Status',
                type: 'select',
                required: true,
                default: true,
                options: [
                    { label: 'Active', value: true },
                    { label: 'Inactive', value: false }
                ]
            }
        ]
    };

    // Table Configuration
    tableConfig: TableConfig = {
        tableColumns: [
            { field: 'codeValueEN', header: 'Education Qualification Name (EN)' },
            { field: 'codeValueBN', header: 'Education Qualification Name (BN)' },
            { field: 'departmentNames', header: 'Department(s)' },
            {
                field: 'status',
                header: 'Status',
                type: 'boolean',
                trueLabel: 'Active',
                falseLabel: 'Inactive'
            },
            { field: 'codeId', header: 'Code ID', hidden: true }
        ]
    };

    constructor(
        private masterBasicSetupService: MasterBasicSetupService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private fb: FormBuilder,
        private shareService: SharedService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.initForm();
        this.searchSubject.pipe(debounceTime(500), distinctUntilChanged()).subscribe((keyword) => this.onSearch(keyword));
        this.loadDepartments();
    }

    /** Load the department options (EducationalDepartment common codes) then the grid. */
    private loadDepartments() {
        this.masterBasicSetupService.getAllByType('EducationalDepartment').subscribe({
            next: (depts) => {
                this.allDepartments = Array.isArray(depts) ? depts : [];
                this.departmentOptions = this.allDepartments.map((d) => ({ label: d.codeValueEN, value: d.codeId }));
                const field = this.formConfig.formFields.find((f) => f.name === 'departmentIds');
                if (field) field.options = this.departmentOptions;
                this.loadMappingsThenGrid();
            },
            error: (err) => {
                console.error('Error loading departments:', err);
                this.loadMappingsThenGrid();
            }
        });
    }

    /** Load all qualification→department mappings, then load the paged grid. */
    private loadMappingsThenGrid() {
        this.masterBasicSetupService.getAllQualificationDepartments().subscribe({
            next: (rows) => {
                this.buildMappingIndex(rows);
                this.getCommonCodeWithPaging({ first: this.first, rows: this.rows });
            },
            error: (err) => {
                console.error('Error loading qualification-department mappings:', err);
                this.getCommonCodeWithPaging({ first: this.first, rows: this.rows });
            }
        });
    }

    private buildMappingIndex(rows: any[]) {
        this.mappingByQualification.clear();
        (Array.isArray(rows) ? rows : []).forEach((r: any) => {
            const list = this.mappingByQualification.get(r.qualificationCodeId) ?? [];
            list.push(r.departmentCodeId);
            this.mappingByQualification.set(r.qualificationCodeId, list);
        });
    }

    private departmentNamesFor(qualificationCodeId: number): string {
        const ids = this.mappingByQualification.get(qualificationCodeId) ?? [];
        if (!ids.length) return '-';
        return ids
            .map((id) => this.allDepartments.find((d) => d.codeId === id)?.codeValueEN ?? `#${id}`)
            .join(', ');
    }

    private departmentChipsFor(qualificationCodeId: number): string[] {
        const ids = this.mappingByQualification.get(qualificationCodeId) ?? [];
        return ids.map((id) => this.allDepartments.find((d) => d.codeId === id)?.codeValueEN ?? `#${id}`);
    }

    /** Debounced search wired to the card-list search box. */
    searchSubject = new Subject<string>();

    onPageChange(event: any) {
        this.first = event.first;
        this.rows = event.rows;
        this.getCommonCodeWithPaging({ first: event.first, rows: event.rows });
    }

    initForm() {
        this.commonCodeForm = this.fb.group({
            departmentIds: [[]],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [true, Validators.required],
            orgId: [0],
            codeId: [0],
            codeType: [this.codeType],
            commCode: [null],
            displayCodeValueEN: [null],
            displayCodeValueBN: [null],
            parentCodeId: [null],
            sortOrder: [null],
            level: [null],
            createdBy: [''],
            createdDate: [''],
            lastUpdatedBy: [''],
            lastupdate: ['']
        });
    }

    getCommonCodeWithPaging(event?: any) {
        this.loading = true;
        const pageNo = event ? event.first / event.rows + 1 : 1;
        const pageSize = event?.rows ?? this.rows;

        const apiCall = this.serchValue ? this.masterBasicSetupService.getByKeyordWithPaging(this.codeType, this.serchValue, pageNo, pageSize) : this.masterBasicSetupService.getAllWithPaging(this.codeType, pageNo, pageSize);

        apiCall.subscribe({
            next: (res) => {
                this.commonCodeData = (res.datalist ?? []).map((r: any) => ({
                    ...r,
                    departmentNames: this.departmentNamesFor(r.codeId),
                    departmentChips: this.departmentChipsFor(r.codeId)
                }));
                this.totalRecords = res.pages.rows;
                this.rows = pageSize;
                this.loading = false;
            },
            error: (err) => {
                console.error('Error fetching data:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load data'
                });
                this.loading = false;
            }
        });
    }

    submit(data: any) {

        if (this.commonCodeForm.invalid) {
            this.commonCodeForm.markAllAsTouched();
            return;
        }

        const currentUser = this.getCurrentUser();
        const currentDateTime = this.shareService.getCurrentDateTime()

        if (this.editingId) {
            this.updateCommonCode(currentUser, currentDateTime);
        } else {
            this.createCommonCode(currentUser, currentDateTime);
        }
    }

    private createCommonCode(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const departmentIds: number[] = this.commonCodeForm.value.departmentIds ?? [];
        const { departmentIds: _ignored, ...rest } = this.commonCodeForm.value;
        const createPayload = {
            ...rest,
            createdBy: currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.create(createPayload).subscribe({
            next: (res: any) => {
                const newCodeId = res?.data?.codeId ?? res?.codeId;
                this.saveDepartmentsThenFinish(newCodeId, departmentIds, currentUser, currentDateTime, 'created');
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to create education-qualification'
                });
                this.isSubmitting = false;
            }
        });
    }

    private updateCommonCode(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const departmentIds: number[] = this.commonCodeForm.value.departmentIds ?? [];
        const editingId = this.editingId;
        const { departmentIds: _ignored, ...rest } = this.commonCodeForm.value;
        const updatePayload = {
            ...rest,
            codeId: editingId,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.update(updatePayload).subscribe({
            next: () => {
                this.saveDepartmentsThenFinish(editingId, departmentIds, currentUser, currentDateTime, 'updated');
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to update education-qualification'
                });
                this.isSubmitting = false;
            }
        });
    }

    /** Persist the department mapping for a saved qualification, then refresh UI. */
    private saveDepartmentsThenFinish(
        qualificationCodeId: number | null | undefined,
        departmentIds: number[],
        currentUser: string,
        currentDateTime: string,
        action: 'created' | 'updated'
    ) {
        const finish = () => {
            this.resetForm();
            this.loadMappingsThenGrid();
            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: `EducationQualification ${action} successfully`
            });
            this.isSubmitting = false;
        };

        if (qualificationCodeId == null) {
            // Could not resolve the qualification id — finish without the mapping.
            finish();
            return;
        }

        this.masterBasicSetupService.saveQualificationDepartments({
            qualificationCodeId,
            departmentCodeIds: departmentIds ?? [],
            orgId: this.commonCodeForm.get('orgId')?.value ?? 0,
            status: true,
            createdBy: currentUser,
            lastUpdatedBy: currentUser
        }).subscribe({
            next: () => finish(),
            error: (err) => {
                console.error('Error saving departments:', err);
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Partial save',
                    detail: 'Record saved, but department mapping failed'
                });
                this.resetForm();
                this.loadMappingsThenGrid();
                this.isSubmitting = false;
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.commonCodeForm.patchValue(row);
        this.commonCodeForm.patchValue({
            departmentIds: this.mappingByQualification.get(row.codeId) ?? []
        });
    }

    delete(row: any, event: Event) {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Do you want to delete this record?',
            header: 'Delete Confirmation',
            icon: 'pi pi-info-circle',
            rejectLabel: 'Cancel',
            rejectButtonProps: {
                label: 'Cancel',
                severity: 'secondary',
                outlined: true
            },
            acceptButtonProps: {
                label: 'Delete',
                severity: 'danger'
            },
            accept: () => {
                this.masterBasicSetupService.delete(row.codeId).subscribe({
                    next: () => {
                        this.getCommonCodeWithPaging({
                            first: this.first,
                            rows: this.rows
                        });
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'EducationQualification deleted successfully'
                        });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: err?.error?.message || 'Failed to delete education-qualification'
                        });
                    }
                });
            }
        });
    }

    resetForm() {
        this.isSubmitting = false;
        this.editingId = null;
        this.commonCodeForm.reset({
            departmentIds: [],
            orgId: 0,
            codeId: 0,
            codeType: this.codeType,
            status: true,
            commCode: null,
            displayCodeValueEN: null,
            displayCodeValueBN: null,
            parentCodeId: null,
            sortOrder: null,
            level: null,
            createdBy: '',
            createdDate: '',
            lastUpdatedBy: '',
            lastupdate: ''
        });
    }

    onSearch(keyword: string) {
        this.serchValue = keyword;
        this.first = 0;
        this.getCommonCodeWithPaging({ first: 0, rows: this.rows });
    }

    private getCurrentUser(): string {
        // TODO: Get from authentication service
        return this.shareService.getCurrentUser()
    }
}
