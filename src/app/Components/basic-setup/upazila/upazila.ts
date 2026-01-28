import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormConfig } from '../shared/models/formConfig';
import { TableConfig } from '../shared/models/dataTableConfig';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DynamicFormComponent } from '../shared/componets/dynamic-form-component/dynamic-form';
import { DataTable } from '../shared/componets/data-table/data-table';
import { Fluid } from 'primeng/fluid';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Toast } from 'primeng/toast';
import { CommonCode } from '../shared/models/common-code';

@Component({
    selector: 'app-upazila',
    imports: [DynamicFormComponent, DataTable, Fluid, ConfirmDialog, Toast],
    templateUrl: './upazila.html',
    styleUrl: './upazila.scss',
    providers: [MessageService, ConfirmationService]
})
export class Upazila {
    upazilaData: any[] = [];
    editingId: number | null = null;
    upazilaForm!: FormGroup;
    title = 'Thana Setup';
    codeType = 'Thana';

    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    searchValue: string = '';

    divisionOptions: { label: string; value: any }[] = [];
    districtOptions: { label: string; value: any }[] = [];
    ancestors: CommonCode[] = [];

    formConfig: FormConfig = {
        formFields: [
            {
                name: 'divisionId',
                label: 'Division',
                type: 'select',
                required: true,
                options: []
            },
            {
                name: 'districtId',
                label: 'District',
                type: 'select',
                required: true,
                options: [],
                dependsOn: 'divisionId',
                cascadeLoad: true
            },
            {
                name: 'codeValueEN',
                label: 'Upazila Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'Upazila Name (Bangla)',
                type: 'text',
                required: true
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

    tableConfig: TableConfig = {
        tableColumns: [
            // { field: 'divisionName', header: 'Division' },
            // { field: 'districtName', header: 'District' },
            { field: 'codeValueEN', header: 'Upazila Name (EN)' },
            { field: 'codeValueBN', header: 'Upazila Name (BN)' },
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
        private fb: FormBuilder
    ) {}

    ngOnInit(): void {
        this.initForm();
        this.loadDivisions(); // Load divisions on init
        this.getUpazilaWithPaging({
            first: this.first,
            rows: this.rows
        });
    }

    initForm() {
        this.upazilaForm = this.fb.group({
            divisionId: [null, Validators.required],
            districtId: [null, Validators.required],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [true, Validators.required],
            orgId: [0],
            codeId: [0],
            codeType: ['Upazila'],
            parentCodeId: [null], // Will store districtId
            commCode: [null],
            displayCodeValueEN: [null],
            displayCodeValueBN: [null],
            sortOrder: [null],
            level: [null],
            createdBy: [''],
            createdDate: [''],
            lastUpdatedBy: [''],
            lastupdate: ['']
        });
    }

    // Load all divisions
    loadDivisions() {
        this.masterBasicSetupService.getAllByType('Division').subscribe({
            next: (divisions) => {
                this.divisionOptions = divisions.map((d) => ({
                    label: d.codeValueEN,
                    value: d.codeId
                }));

                // Update form config with division options
                const divisionField = this.formConfig.formFields.find((f) => f.name === 'divisionId');
                if (divisionField) {
                    divisionField.options = this.divisionOptions;
                }
            },
            error: (err) => {
                console.error('Error loading divisions:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load divisions'
                });
            }
        });
    }

    loadDistricts(divisionId: number) {
        this.masterBasicSetupService.getByParentId(divisionId).subscribe({
            next: (districts) => {
                this.districtOptions = districts.map((d) => ({
                    label: d.codeValueEN,
                    value: d.codeId
                }));
                const districtField = this.formConfig.formFields.find((f) => f.name === 'districtId');
                if (districtField) {
                    districtField.options = this.districtOptions;
                }
            },
            error: (err) => {
                console.error('Error loading districts:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load districts'
                });
            }
        });
    }

    // Handle field changes (for cascading dropdowns)
    onFieldChange(event: { fieldName: string; value: any }) {
        console.log('Field changed:', event);

        // When districtId field needs to be updated (because divisionId changed)
        if (event.fieldName === 'districtId' && event.value.parentField === 'divisionId') {
            const divisionId = event.value.parentValue;
            this.loadDistricts(divisionId);
        }
    }

    loadAnscestors(codeId: number) {
        this.masterBasicSetupService.getAncestorsOfCommonCode(codeId).subscribe({
            next: (res) => {
                this.ancestors = res;
                console.log('Ancestors:', this.ancestors);
            },
            error: (err) => {
                console.error('Error loading ancestors:');
            }
        });
    }

    getUpazilaWithPaging(event?: any) {
        this.loading = true;
        const pageNo = event ? event.first / event.rows + 1 : 1;
        const pageSize = event?.rows ?? this.rows;

        const apiCall = this.searchValue ? this.masterBasicSetupService.getByKeyordWithPaging('Upazila', this.searchValue, pageNo, pageSize) : this.masterBasicSetupService.getAllWithPaging('Upazila', pageNo, pageSize);

        apiCall.subscribe({
            next: (res) => {
                this.upazilaData = res.datalist;
                this.totalRecords = res.pages.rows;
                this.rows = pageSize;
                this.loading = false;
            },
            error: (err) => {
                console.error('Error fetching data:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load data'
                });
                this.loading = false;
            }
        });
    }

    submit(data: any) {
        if (this.upazilaForm.invalid) {
            this.upazilaForm.markAllAsTouched();
            return;
        }

        const currentUser = this.getCurrentUser();
        const currentDateTime = new Date().toISOString();

        // Set parentCodeId to selected districtId
        this.upazilaForm.patchValue({
            parentCodeId: this.upazilaForm.value.districtId
        });

        if (this.editingId) {
            this.updateUpazila(currentUser, currentDateTime);
        } else {
            this.createUpazila(currentUser, currentDateTime);
        }
    }

    private createUpazila(currentUser: string, currentDateTime: string) {
        const createPayload = {
            ...this.upazilaForm.value,
            createdBy: currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.create(createPayload).subscribe({
            next: (res) => {
                console.log('Created:', res);
                this.resetForm();
                this.getUpazilaWithPaging({
                    first: this.first,
                    rows: this.rows
                });
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Upazila created successfully'
                });
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create upazila'
                });
            }
        });
    }

    private updateUpazila(currentUser: string, currentDateTime: string) {
        const updatePayload = {
            ...this.upazilaForm.value,
            codeId: this.editingId,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime,
            createdDate: currentDateTime,
            createdBy: currentUser
        };

        this.masterBasicSetupService.update(updatePayload).subscribe({
            next: (res) => {
                console.log('Updated:', res);
                this.resetForm();
                this.getUpazilaWithPaging({
                    first: this.first,
                    rows: this.rows
                });
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Upazila updated successfully'
                });
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to update upazila'
                });
            }
        });
    }

    update(row: any) {
    this.editingId = row.codeId;

    this.loadAnscestors(row.codeId);

    // Move the logic inside the loadAnscestors subscribe callback
    this.masterBasicSetupService.getAncestorsOfCommonCode(row.codeId).subscribe({
        next: (ancestors) => {
            this.ancestors = ancestors;
            console.log('Ancestors:', this.ancestors);

            const divisionId = this.ancestors[0]?.codeId;

            if (divisionId) {
                console.log('Loading districts for divisionId:', divisionId);
                this.loadDistricts(divisionId);

                // Patch the form after districts are loaded
                // Use setTimeout or subscribe to loadDistricts completion

                    this.upazilaForm.patchValue({
                        divisionId: divisionId,
                        districtId: row.parentCodeId,
                        codeValueEN: row.codeValueEN,
                        codeValueBN: row.codeValueBN,
                        status: row.status
                    });

            }
        },
        error: (err) => {
            console.error('Error loading ancestors:', err);
        }
    });

    console.log('Edit:', row);
}

    delete(row: any, event: Event) {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Do you want to delete this record?',
            header: 'Danger Zone',
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
                        this.getUpazilaWithPaging({
                            first: this.first,
                            rows: this.rows
                        });
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'Upazila deleted successfully'
                        });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: 'Failed to delete upazila'
                        });
                    }
                });
            }
        });
    }

    resetForm() {
        this.editingId = null;

        // Clear district options when resetting
        const districtField = this.formConfig.formFields.find((f) => f.name === 'districtId');
        if (districtField) {
            districtField.options = [];
        }

        this.upazilaForm.reset({
            divisionId: null,
            districtId: null,
            orgId: 0,
            codeId: 0,
            codeType: 'Upazila',
            status: true,
            parentCodeId: null,
            commCode: null,
            displayCodeValueEN: null,
            displayCodeValueBN: null,
            sortOrder: null,
            level: null,
            createdBy: '',
            createdDate: '',
            lastUpdatedBy: '',
            lastupdate: ''
        });
    }

    onSearch(keyword: string) {
        this.searchValue = keyword;
        this.first = 0;
        this.getUpazilaWithPaging({ first: 0, rows: this.rows });
    }

    private getCurrentUser(): string {
        // TODO: Get from authentication service
        return 'Admin';
    }
}
