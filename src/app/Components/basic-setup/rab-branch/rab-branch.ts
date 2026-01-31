import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormConfig } from '../shared/models/formConfig';
import { TableConfig } from '../shared/models/dataTableConfig';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DynamicFormComponent } from '../shared/componets/dynamic-form-component/dynamic-form';
import { DataTable } from '../shared/componets/data-table/data-table';
import { Fluid } from 'primeng/fluid';

import { CommonCode } from '../shared/models/common-code';
import { SharedService } from '@/shared/services/shared-service';

@Component({
    selector: 'app-rab-branch',
    imports: [DynamicFormComponent, DataTable, Fluid, ],
    templateUrl: './rab-branch.html',
    styleUrl: './rab-branch.scss',
    providers: []
})
export class RabBranch {
    upazilaData: any[] = [];
    editingId: number | null = null;
    upazilaForm!: FormGroup;
    title = 'Rab Branch';
    codeType = 'Rab Branch';

    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    searchValue: string = '';

    rabUnitOptions: { label: string; value: any }[] = [];
    rabWingOptions: { label: string; value: any }[] = [];
    ancestors: CommonCode[] = [];

    formConfig: FormConfig = {
        formFields: [
            {
                name: 'rabUnitId',
                label: 'RabUnit',
                type: 'select',
                required: true,
                options: []
            },
            {
                name: 'rabWingId',
                label: 'RabWing',
                type: 'select',
                required: true,
                options: [],
                dependsOn: 'rabUnitId',
                cascadeLoad: true
            },
            {
                name: 'codeValueEN',
                label: 'Rab Branch Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'Rab Branch Name (Bangla)',
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
            // { field: 'rabUnitName', header: 'RabUnit' },
            // { field: 'rabWingName', header: 'RabWing' },
            { field: 'codeValueEN', header: 'Rab Branch (EN)' },
            { field: 'codeValueBN', header: 'Rab Branch (BN)' },
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
        this.initForm();
        this.loadRabUnits(); // Load rabUnits on init
        this.getUpazilaWithPaging({
            first: this.first,
            rows: this.rows
        });
    }

    initForm() {
        this.upazilaForm = this.fb.group({
            rabUnitId: [null, Validators.required],
            rabWingId: [null, Validators.required],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [true, Validators.required],
            orgId: [0],
            codeId: [0],
            codeType: ['RabBranch'],
            parentCodeId: [null], // Will store rabWingId
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

    // Load all rabUnits
    loadRabUnits() {
        this.masterBasicSetupService.getAllByType('RabUnit').subscribe({
            next: (rabUnits) => {
                this.rabUnitOptions = rabUnits.map((d) => ({
                    label: d.codeValueEN,
                    value: d.codeId
                }));

                // Update form config with rabUnit options
                const rabUnitField = this.formConfig.formFields.find((f) => f.name === 'rabUnitId');
                if (rabUnitField) {
                    rabUnitField.options = this.rabUnitOptions;
                }
            },
            error: (err) => {
                console.error('Error loading rabUnits:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load rabUnits'
                });
            }
        });
    }

    loadRabWings(rabUnitId: number) {
        this.masterBasicSetupService.getByParentId(rabUnitId).subscribe({
            next: (rabWings) => {
                this.rabWingOptions = rabWings.map((d) => ({
                    label: d.codeValueEN,
                    value: d.codeId
                }));
                const rabWingField = this.formConfig.formFields.find((f) => f.name === 'rabWingId');
                if (rabWingField) {
                    rabWingField.options = this.rabWingOptions;
                }
            },
            error: (err) => {
                console.error('Error loading rabWings:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load rabWings'
                });
            }
        });
    }

    // Handle field changes (for cascading dropdowns)
    onFieldChange(event: { fieldName: string; value: any }) {
        console.log('Field changed:', event);

        // When rabWingId field needs to be updated (because rabUnitId changed)
        if (event.fieldName === 'rabWingId' && event.value.parentField === 'rabUnitId') {
            const rabUnitId = event.value.parentValue;
            this.loadRabWings(rabUnitId);
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

        const apiCall = this.searchValue ? this.masterBasicSetupService.getByKeyordWithPaging('RabBranch', this.searchValue, pageNo, pageSize) : this.masterBasicSetupService.getAllWithPaging('RabBranch', pageNo, pageSize);

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
        const currentDateTime = this.shareService.getCurrentDateTime()

        // Set parentCodeId to selected rabWingId
        this.upazilaForm.patchValue({
            parentCodeId: this.upazilaForm.value.rabWingId
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
                    detail: 'RabBranch created successfully'
                });
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create rab-branch'
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
                    detail: 'RabBranch updated successfully'
                });
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to update rab-branch'
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

            const rabUnitId = this.ancestors[0]?.codeId;

            if (rabUnitId) {
                console.log('Loading rabWings for rabUnitId:', rabUnitId);
                this.loadRabWings(rabUnitId);

                // Patch the form after rabWings are loaded
                // Use setTimeout or subscribe to loadRabWings completion

                    this.upazilaForm.patchValue({
                        rabUnitId: rabUnitId,
                        rabWingId: row.parentCodeId,
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
                        this.getUpazilaWithPaging({
                            first: this.first,
                            rows: this.rows
                        });
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'RabBranch deleted successfully'
                        });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: 'Failed to delete rab-branch'
                        });
                    }
                });
            }
        });
    }

    resetForm() {
        this.editingId = null;

        // Clear rabWing options when resetting
        const rabWingField = this.formConfig.formFields.find((f) => f.name === 'rabWingId');
        if (rabWingField) {
            rabWingField.options = [];
        }

        this.upazilaForm.reset({
            rabUnitId: null,
            rabWingId: null,
            orgId: 0,
            codeId: 0,
            codeType: 'RabBranch',
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
        return this.shareService.getCurrentUser()
    }
}
