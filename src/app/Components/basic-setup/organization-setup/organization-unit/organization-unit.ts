import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';
import { Fluid } from 'primeng/fluid';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
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

@Component({
    selector: 'app-organization-unit',
    imports: [
        Fluid,
        ReactiveFormsModule,
        InputTextModule,
        SelectModule,
        DatePickerModule,
        InputNumberModule,
        Button,
        Toast,
        TableModule,
        IconField,
        InputIcon,
        ConfirmDialog,
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
    filteredOrganizations: OrganizationModel[] = [];
    editingId: number | null = null;
    currentUser : string = ""

    // Pagination
    first = 0;
    rows = 10;
    totalRecords = 0;

    // Search
    searchValue = '';

    statusOptions = [
        { label: 'Active', value: true },
        { label: 'Inactive', value: false }
    ];

    constructor(
        private fb: FormBuilder,
        private organizationService: OrganizationService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private sharedService: SharedService
    ) {}

    ngOnInit(): void {

        this.GetAllOrgUnit();
        this.loadMotherOrg();
        this.currentUser = this.sharedService.getCurrentUser();
        this.initForm();
    }

    initForm() {
        this.organizationForm = this.fb.group({
            orgId: [0],
            orgNameEN: ['', Validators.required],
            orgNameBN: ['', Validators.required],
            contactName: [''],
            contactNumber: [''],
            locationCode: [''],
            locationEN: [''],
            locationBN: [''],
            email: [''],
            sortOrder: [0],
            status: [true],
            remarks: [''],
            parentOrg: [Validators.required],
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
                this.filteredOrganizations = [...res];
                this.totalRecords = res.length;
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

    loadMotherOrg(){
        this.organizationService.getAllActiveMotherOrgs().subscribe({
            next: (res: OrganizationModel[]) => {
                this.motherOrg = res;

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

    onSearch(event: Event) {
        const target = event.target as HTMLInputElement;
        this.searchValue = target.value.toLowerCase().trim();

        if (this.searchValue) {
            this.filteredOrganizations = this.organizations.filter(org =>
                org.orgNameEN?.toLowerCase().includes(this.searchValue) ||
                org.orgNameBN?.toLowerCase().includes(this.searchValue)
            );
        } else {
            this.filteredOrganizations = [...this.organizations];
        }

        this.totalRecords = this.filteredOrganizations.length;
        this.first = 0; // Reset to first page
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
            status: true,
            createdDate: new Date(),
            lastupdate: new Date(),
            lastUpdatedBy: this.currentUser,
            createdBy: this.currentUser

        });
        this.isSubmitting = false;
    }
}


