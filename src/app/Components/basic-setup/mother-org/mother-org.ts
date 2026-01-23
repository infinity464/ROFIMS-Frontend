import { Component, OnInit } from '@angular/core';
import { MasterConfig } from '../Models/master-basic-setup.model';
import { MasterBasicSetup } from '../shared/master-basic-setup/master-basic-setup';
import { MotherOrgService } from '../Services/mother-org-service';
import { CommonCode } from '../Models/common-code';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { PagedResponse } from '@/Core/Models/Pagination';
@Component({
    selector: 'app-mother-org',
    imports: [MasterBasicSetup, Toast, ConfirmDialog],
    templateUrl: './mother-org.html',
    styleUrl: './mother-org.scss',
    providers: [ConfirmationService, MessageService]
})
export class MotherOrg implements OnInit {
    motherOrgDate: CommonCode[] = [];
    editingId: number | null = null;
    motherOrgForm!: FormGroup;
    dataWithPaging: PagedResponse<CommonCode> = {
        datalist: [],
        pages: { rows: 0, totalPages: 0 }
    };

    totalRecords = 0;
    rows = 10; // page size
    first = 0; // index of first record
    loading = false;
    serchValue: string = '';

    constructor(
        private motherOrgService: MotherOrgService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private fb: FormBuilder
    ) { }

    ngOnInit(): void {
        this.initForm();
        this.getMotherOrgWithPaging({
            first: this.first,
            rows: this.rows
        });

    }

    initForm() {
        this.motherOrgForm = this.fb.group({
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [true, Validators.required],
            orgId: [0],
            codeId: [0],
            codeType: ['MotherOrg'],
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

    motherOrgConfig: MasterConfig = {
        title: 'Mother Org Setup',
        formFields: [
            {
                name: 'codeValueEN',
                label: 'Mother Org Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'Mother Org Name (Bangla)',
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
        ],
        tableColumns: [
            { field: 'codeValueEN', header: 'Mother Org Name (EN)' },
            { field: 'codeValueBN', header: 'Mother Org Name (BN)' },
            { field: 'status', header: 'Status', type: 'boolean', trueLabel: 'Active', falseLabel: 'Inactive' },
            { field: 'codeId', header: 'Code ID', hidden: true }
        ]
    };


    getMotherOrgWithPaging(event?: any) {
        this.loading = true;

        const pageNo = event ? event.first / event.rows + 1 : 1;

        const pageSize = event?.rows ?? this.rows;
        this.first = event?.first ?? 0;

        const apiCall = this.serchValue? this.motherOrgService.getByKeyordWithPaging(this.serchValue, pageNo, pageSize) : this.motherOrgService.getAllWithPaging(pageNo, pageSize);

        apiCall.subscribe({
            next: (res) => {
                this.motherOrgDate = res.datalist;
                this.totalRecords = res.pages.rows;
                this.rows = pageSize;
                console.log(res);
                this.loading = false;
            },
            error: (err) => {
                console.error('Error fetching data:', err);
                this.loading = false;
            }
        });
    }

    submit(data: any) {
        console.log('Form Data:', data);
        if (this.motherOrgForm.invalid) {
            this.motherOrgForm.markAllAsTouched();
            return;
        }

        const currentUser = this.getCurrentUser();
        const currentDateTime = new Date().toISOString();

        if (this.editingId) {
            const updatePayload = {
                ...this.motherOrgForm.value,
                codeId: this.editingId,
                lastUpdatedBy: currentUser,
                lastupdate: currentDateTime
            };

            this.motherOrgService.update(updatePayload).subscribe({
                next: (res) => {
                    console.log('Updated:', res);
                    this.resetForm();
                    this.getMotherOrgWithPaging({
                        first: this.first,
                        rows: this.rows
                    });

                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Record updated successfully' });
                },
                error: (err) => {
                    console.error('Error updating:', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update record' });
                }
            });
        } else {
            const createPayload = {
                ...this.motherOrgForm.value,
                createdBy: currentUser,
                createdDate: currentDateTime,
                lastUpdatedBy: currentUser,
                lastupdate: currentDateTime
            };

            this.motherOrgService.create(createPayload).subscribe({
                next: (res) => {
                    console.log('Created:', res);
                    this.resetForm();
                    this.getMotherOrgWithPaging({
                        first: this.first,
                        rows: this.rows
                    });

                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Record created successfully' });
                },
                error: (err) => {
                    console.error('Error creating:', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to create record' });
                }
            });
        }
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.motherOrgForm.patchValue(row);
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
                try {
                    this.motherOrgService.delete(row.codeId).subscribe({
                        next: () => {
                            this.getMotherOrgWithPaging({
                                first: this.first,
                                rows: this.rows
                            });

                            this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Record deleted successfully' });
                        },
                        error: (err) => {
                            console.error(err)
                            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete record' });
                        }
                    });
                } catch (err) {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete record' });
                }
            }
        });
    }

    resetForm() {
        this.editingId = null;
        this.motherOrgForm.reset({
            orgId: 0,
            codeId: 0,
            codeType: 'MotherOrg',
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
    this.serchValue = keyword; // store the keyword
    this.first = 0; // reset pagination
    this.getMotherOrgWithPaging({ first: 0, rows: this.rows });
}


    private getCurrentUser(): string {
        return 'Admin';
    }
}
