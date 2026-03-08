import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';
import { Fluid } from 'primeng/fluid';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { OrganizationService } from '../services/organization-service';
import { OrganizationModel } from '../models/organization';
import { Button, ButtonModule } from "primeng/button";
import { MessageService } from 'primeng/api';
import { Toast } from "primeng/toast";
import { ConfirmDialog } from "primeng/confirmdialog";
import {  ConfirmationService } from 'primeng/api';
import { TableModule } from "primeng/table";
import { IconField } from "primeng/iconfield";
import { InputIcon } from "primeng/inputicon";
import { SharedService } from '@/shared/services/shared-service';

interface TableColumn {
    field: string;
    header: string;
}

interface OrgUnitRow extends OrganizationModel {
    parentName?: string;
}

@Component({
    selector: 'app-organization-unit',
    imports: [
        Fluid,
        FormsModule,
        ReactiveFormsModule,
        InputTextModule,
        SelectModule,
        MultiSelectModule,
        DatePickerModule,
        InputNumberModule,
        Button,
        TableModule,
        IconField,
        InputIcon,
        ButtonModule,
        CommonModule
    ],
    providers: [],
    templateUrl: './organization-unit.html',
    styleUrl: './organization-unit.scss'
})
export class OrganizationUnit implements OnInit {
    organizationForm!: FormGroup;
    isSubmitting = false;
    motherOrg: OrganizationModel[] = [];
    organizations: OrganizationModel[] = [];
    filteredOrganizations: OrgUnitRow[] = [];
    editingId: number | null = null;
    currentUser : string = ""

    // Pagination
    first = 0;
    rows = 10;
    totalRecords = 0;

    // Search
    searchValue = '';

    // Filter dropdowns
    filterParentId: number | null = null;
    filterStatus: boolean | null = null;

    statusOptions = [
        { label: 'Active', value: true },
        { label: 'Inactive', value: false }
    ];

    filterStatusOptions = [
        { label: 'All', value: null },
        { label: 'Active', value: true },
        { label: 'Inactive', value: false }
    ];

    get filterParentOptions(): { label: string; value: number | null }[] {
        return [
            { label: 'All', value: null },
            ...this.motherOrg.map(o => ({ label: o.orgNameEN, value: o.orgId }))
        ];
    }

    // Column visibility - dynamic filter
    cols: TableColumn[] = [
        { field: 'parentName', header: 'Parent Name' },
        { field: 'orgNameEN', header: 'Unit Name (English)' },
        { field: 'orgNameBN', header: 'Unit Name (Bangla)' },
        { field: 'locationBN', header: 'Unit Location (Bangla)' },
        { field: 'locationEN', header: 'Unit Location (English)' },
        { field: 'status', header: 'Status' }
    ];
    selectedColumns: TableColumn[] = [];

    constructor(
        private fb: FormBuilder,
        private organizationService: OrganizationService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private sharedService: SharedService
    ) {}

    ngOnInit(): void {
        this.selectedColumns = [...this.cols];
        this.currentUser = this.sharedService.getCurrentUser();
        this.initForm();
        this.loadMotherOrg(); // loads first, then GetAllOrgUnit so parentName can use both
    }

    getParentName(parentOrgId: number | null | undefined): string {
        if (parentOrgId == null) return '-';
        const parent = this.motherOrg.find(o => o.orgId === parentOrgId);
        return parent?.orgNameEN ?? '-';
    }

    isColumnVisible(field: string): boolean {
        return this.selectedColumns.some(c => c.field === field);
    }

    initForm() {
        this.organizationForm = this.fb.group({
            orgId: [0],
            orgNameEN: ['', Validators.required],
            orgNameBN: [''],
            contactName: [''],
            contactNumber: [''],
            locationCode: [''],
            locationEN: ['', Validators.required],
            locationBN: [''],
            email: [''],
            sortOrder: [0],
            status: [true],
            remarks: [''],
            parentOrg: [null],
            createdBy: [this.currentUser],
            createdDate: [new Date() ],
            lastUpdatedBy: [this.currentUser],
            lastupdate: [new Date() ],

        });
    }

    GetAllOrgUnit() {
        this.organizationService.GetAllOrgUnit().subscribe({
            next: (res: OrganizationModel[]) => {
                console.log('Organizations fetched successfully', res);
                this.organizations = res;
                this.applyFilters();
            },
            error: (err: any) => {
                console.log('Error fetching organizations');
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to fetch organizations'
                });
            }
        });
    }

    loadMotherOrg() {
        this.organizationService.getAllActiveMotherOrgs().subscribe({
            next: (res: OrganizationModel[]) => {
                this.motherOrg = res;
                this.GetAllOrgUnit();
            },
            error: (err: any) => {
                console.log('Error fetching organizations');
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to fetch organizations'
                });
            }
        });
    }

    private resolveParentName(parentOrgId: number | null | undefined): string {
        if (parentOrgId == null) return '';
        const parent = this.motherOrg.find(o => o.orgId === parentOrgId);
        return parent?.orgNameEN ?? '';
    }

    onSearch() {
        this.searchValue = (this.searchValue ?? '').toLowerCase().trim();
        this.applyFilters();
    }

    onFilterChange() {
        this.first = 0;
        this.applyFilters();
    }

    clearFilters() {
        this.searchValue = '';
        this.filterParentId = null;
        this.filterStatus = null;
        this.first = 0;
        this.applyFilters();
    }

    applyFilters() {
        let list = this.organizations.map(o => ({
            ...o,
            parentName: this.resolveParentName(o.parentOrg)
        }));

        if (this.searchValue) {
            const q = this.searchValue;
            list = list.filter(org =>
                org.orgNameEN?.toLowerCase().includes(q) ||
                org.orgNameBN?.toLowerCase().includes(q));
        }
        if (this.filterParentId != null) {
            list = list.filter(org => org.parentOrg === this.filterParentId);
        }
        if (this.filterStatus != null) {
            list = list.filter(org => org.status === this.filterStatus);
        }

        this.filteredOrganizations = list;
        this.totalRecords = list.length;
        this.first = 0;
    }


    onSubmit() {
        if (this.isSubmitting) return;

        if (this.organizationForm.invalid) {
            this.organizationForm.markAllAsTouched();
            return;
        }

        if (this.editingId) {
            this.update();
        } else {
            this.create();
        }
    }

    create() {
        this.isSubmitting = true;

        this.organizationService.post(this.organizationForm.value).subscribe({
            next: (res: any) => {
                console.log('Organization created successfully', res);
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Organization created successfully'
                });
                this.onReset();
                this.GetAllOrgUnit();
                this.isSubmitting = false;
            },
            error: (err: any) => {
                console.log('Error creating organization-unit');
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create organization-unit'
                });
                this.isSubmitting = false;
            }
        });
    }

    update() {
        this.isSubmitting = true;

        const updatePayload = {
            ...this.organizationForm.value,
            orgId: this.editingId
        };

        this.organizationService.update(updatePayload).subscribe({
            next: (res: any) => {
                console.log('Organization updated successfully', res);
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Organization updated successfully'
                });
                this.onReset();
                this.GetAllOrgUnit();
                this.isSubmitting = false;
            },
            error: (err: any) => {
                console.log('Error updating organization-unit');
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to update organization-unit'
                });
                this.isSubmitting = false;
            }
        });
    }

    onEdit(organization: OrganizationModel) {
        this.editingId = organization.orgId;
        this.organizationForm.patchValue(organization);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    onDelete(organization: OrganizationModel, event: Event) {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Do you want to delete this record?-unit?',
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            acceptIcon: 'pi pi-check',
            rejectIcon: 'pi pi-times',
            rejectLabel: 'Cancel',
            acceptLabel: 'Delete',
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
                this.organizationService.delete(organization.orgId).subscribe({
                    next: () => {
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'Organization deleted successfully'
                        });
                        this.GetAllOrgUnit();
                    },
                    error: (err: any) => {
                        console.log('Error deleting organization-unit');
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: 'Failed to delete organization-unit'
                        });
                    }
                });
            }
        });
    }

    onReset() {
        this.editingId = null;
        this.organizationForm.reset({
            orgId: 0,
            parentOrg: null,
            status: true,
            createdDate: new Date(),
            lastupdate: new Date(),
            lastUpdatedBy: this.currentUser,
            createdBy: this.currentUser
        });
        this.isSubmitting = false;
    }
}


