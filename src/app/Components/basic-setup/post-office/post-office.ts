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
    selector: 'app-post-office',
    imports: [DynamicFormComponent, DataTable, Fluid, ConfirmDialog, Toast],
    templateUrl: './post-office.html',
    styleUrl: './post-office.scss',
    providers: [MessageService, ConfirmationService]
})
export class PostOffice {
    commonData: any[] = [];
    editingId: number | null = null;
    commonForm!: FormGroup;
    title = 'Post Office';
    codeType = 'PostOffice';
    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    searchValue: string = '';

    divisionOptions: { label: string; value: any }[] = [];
    districtOptions: { label: string; value: any }[] = [];
    upazilaOptions: { label: string; value: any }[] = [];
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
                name: 'upazilaId',
                label: 'Upazila',
                type: 'select',
                required: true,
                options: [],
                dependsOn: 'districtId',
                cascadeLoad: true
            },
            {
                name: 'codeValueEN',
                label: 'PostOffice Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'PostOffice Name (Bangla)',
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
            { field: 'codeValueEN', header: 'PostOffice Name (EN)' },
            { field: 'codeValueBN', header: 'PostOffice Name (BN)' },
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
        this.loadDivisions();
        this.getPostOfficeWithPaging({
            first: this.first,
            rows: this.rows
        });
    }

    initForm() {
        this.commonForm = this.fb.group({
            divisionId: [null, Validators.required],
            districtId: [null, Validators.required],
            upazilaId: [null, Validators.required],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [true, Validators.required],
            orgId: [0],
            codeId: [0],
            codeType: ['PostOffice'],
            parentCodeId: [null], // Will store upazilaId
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

    loadDivisions() {
        this.masterBasicSetupService.getAllByType('Division').subscribe({
            next: (divisions) => {
                this.divisionOptions = divisions.map((d) => ({
                    label: d.codeValueEN,
                    value: d.codeId
                }));

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

    loadUpazilas(districtId: number) {
        this.masterBasicSetupService.getByParentId(districtId).subscribe({
            next: (upazilas) => {
                this.upazilaOptions = upazilas.map((u) => ({
                    label: u.codeValueEN,
                    value: u.codeId
                }));
                const upazilaField = this.formConfig.formFields.find((f) => f.name === 'upazilaId');
                if (upazilaField) {
                    upazilaField.options = this.upazilaOptions;
                }
            },
            error: (err) => {
                console.error('Error loading upazilas:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load upazilas'
                });
            }
        });
    }

    onFieldChange(event: { fieldName: string; value: any }) {
        console.log('Field changed:', event);

        if (event.fieldName === 'districtId' && event.value.parentField === 'divisionId' && event.value.parentValue) {
            const divisionId = event.value.parentValue;
            this.loadDistricts(divisionId);
        }

        if (event.fieldName === 'upazilaId' && event.value.parentField === 'districtId' && event.value.parentValue) {
            const districtId = event.value.parentValue;
            this.loadUpazilas(districtId);
        }
    }

    getPostOfficeWithPaging(event?: any) {
        this.loading = true;
        const pageNo = event ? event.first / event.rows + 1 : 1;
        const pageSize = event?.rows ?? this.rows;

        const apiCall = this.searchValue ? this.masterBasicSetupService.getByKeyordWithPaging('PostOffice', this.searchValue, pageNo, pageSize) : this.masterBasicSetupService.getAllWithPaging('PostOffice', pageNo, pageSize);

        apiCall.subscribe({
            next: (res) => {
                this.commonData = res.datalist; // Changed from upazilaData
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
        if (this.commonForm.invalid) {
            this.commonForm.markAllAsTouched();
            return;
        }

        const currentUser = this.getCurrentUser();
        const currentDateTime = new Date().toISOString();

        // Set parentCodeId to selected upazilaId (not districtId!)
        this.commonForm.patchValue({
            parentCodeId: this.commonForm.value.upazilaId
        });

        if (this.editingId) {
            this.updatePostOffice(currentUser, currentDateTime);
        } else {
            this.createPostOffice(currentUser, currentDateTime);
        }
    }

    private createPostOffice(currentUser: string, currentDateTime: string) {
        const createPayload = {
            ...this.commonForm.value,
            createdBy: currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.create(createPayload).subscribe({
            next: (res) => {
                console.log('Created:', res);
                this.resetForm();
                this.getPostOfficeWithPaging({
                    first: this.first,
                    rows: this.rows
                });
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'PostOffice created successfully'
                });
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create post-office'
                });
            }
        });
    }

    private updatePostOffice(currentUser: string, currentDateTime: string) {
        const updatePayload = {
            ...this.commonForm.value,
            codeId: this.editingId,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.update(updatePayload).subscribe({
            next: (res) => {
                console.log('Updated:', res);
                this.resetForm();
                this.getPostOfficeWithPaging({
                    first: this.first,
                    rows: this.rows
                });
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'PostOffice updated successfully'
                });
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to update post-office'
                });
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;

        // Load ancestors and set form values in sequence
        this.masterBasicSetupService.getAncestorsOfCommonCode(row.codeId).subscribe({
            next: (ancestors) => {
                this.ancestors = ancestors;
                console.log('Ancestors:', this.ancestors);

                // ancestors[0] = Division, ancestors[1] = District, ancestors[2] = Upazila
                const divisionId = this.ancestors[0]?.codeId;
                const districtId = this.ancestors[1]?.codeId;
                const upazilaId = row.parentCodeId; // The parent of PostOffice is Upazila

                if (divisionId && districtId) {
                    // Load districts first
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

                            // Then load upazilas
                            this.masterBasicSetupService.getByParentId(districtId).subscribe({
                                next: (upazilas) => {
                                    this.upazilaOptions = upazilas.map((u) => ({
                                        label: u.codeValueEN,
                                        value: u.codeId
                                    }));
                                    const upazilaField = this.formConfig.formFields.find((f) => f.name === 'upazilaId');
                                    if (upazilaField) {
                                        upazilaField.options = this.upazilaOptions;
                                    }

                                    // Finally, patch the form with all values
                                    this.commonForm.patchValue({
                                        divisionId: divisionId,
                                        districtId: districtId,
                                        upazilaId: upazilaId,
                                        codeValueEN: row.codeValueEN,
                                        codeValueBN: row.codeValueBN,
                                        status: row.status
                                    });
                                },
                                error: (err) => {
                                    console.error('Error loading upazilas:', err);
                                }
                            });
                        },
                        error: (err) => {
                            console.error('Error loading districts:', err);
                        }
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
                        this.getPostOfficeWithPaging({
                            first: this.first,
                            rows: this.rows
                        });
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'PostOffice deleted successfully'
                        });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: 'Failed to delete post-office'
                        });
                    }
                });
            }
        });
    }

    resetForm() {
        this.editingId = null;

        // Clear all dependent dropdowns
        const districtField = this.formConfig.formFields.find((f) => f.name === 'districtId');
        if (districtField) {
            districtField.options = [];
        }

        const upazilaField = this.formConfig.formFields.find((f) => f.name === 'upazilaId');
        if (upazilaField) {
            upazilaField.options = [];
        }

        this.commonForm.reset({
            divisionId: null,
            districtId: null,
            upazilaId: null,
            orgId: 0,
            codeId: 0,
            codeType: 'PostOffice',
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
        this.getPostOfficeWithPaging({ first: 0, rows: this.rows });
    }

    private getCurrentUser(): string {
        return 'Admin';
    }
}
