import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';

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
    districtOptions: { label: string; value: number }[] = [];
    filteredOrganizations: OrgUnitRow[] = [];
    editingId: number | null = null;
    currentUser : string = ""

    // Pagination
    first = 0;
    rows = 10;
    totalRecords = 0;

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
        private sharedService: SharedService,
        private masterBasicSetupService: MasterBasicSetupService
    ) {}

    ngOnInit(): void {
        this.currentUser = this.sharedService.getCurrentUser();
        this.initForm();
        this.setupFormFilterListeners();
        this.loadDistricts();
        this.loadMotherOrg(); // loads first, then GetAllOrgUnit so parentName can use both
    }

    onSearch() {
        this.first = 0;
        this.buildTableData();
    }

    private setupFormFilterListeners() {
        this.organizationForm.get('parentOrg')?.valueChanges.subscribe(() => {
            this.first = 0;
            this.buildTableData();
        });
        this.organizationForm.get('status')?.valueChanges.subscribe(() => {
            this.first = 0;
            this.buildTableData();
        });
        this.organizationForm.get('districtId')?.valueChanges.subscribe(() => {
            this.first = 0;
            this.buildTableData();
        });
    }

    loadDistricts() {
        this.masterBasicSetupService.getAllByType('District').subscribe({
            next: (districts) => {
                const list = Array.isArray(districts) ? districts : [];
                this.districtOptions = list.map((d: any) => ({
                    label: d.codeValueBN ? `${d.codeValueEN} (${d.codeValueBN})` : d.codeValueEN,
                    value: d.codeId
                }));
                this.buildTableData();
            },
            error: (err) => {
                console.error('Error loading districts:', err);
            }
        });
    }

    getDistrictDisplay(id: number | null | undefined): string {
        if (id == null) return '-';
        const opt = this.districtOptions.find(o => o.value === id);
        return opt?.label ?? '-';
    }

    getParentName(parentOrgId: number | null | undefined): string {
        if (parentOrgId == null) return '-';
        const parent = this.motherOrg.find(o => o.orgId === parentOrgId);
        return parent?.orgNameEN ?? '-';
    }

    initForm() {
        this.organizationForm = this.fb.group({
            orgId: [0],
            orgNameEN: ['', Validators.required],
            orgNameBN: [''],
            contactName: [''],
            contactNumber: [''],
            locationCode: [''],
            districtId: [null],
            email: [''],
            sortOrder: [0],
            status: [true],
            remarks: [''],
            parentOrg: [null, Validators.required],
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
                this.buildTableData();
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

    private buildTableData() {
        let list = this.organizations.map(o => ({
            ...o,
            parentName: this.resolveParentName(o.parentOrg),
            districtDisplay: this.getDistrictDisplay(o.districtId)
        }));

        const parentOrg = this.organizationForm?.get('parentOrg')?.value;
        const status = this.organizationForm?.get('status')?.value;

        if (parentOrg != null && parentOrg !== '') {
            list = list.filter(org => org.parentOrg === parentOrg);
        }
        if (status != null) {
            list = list.filter(org => org.status === status);
        }

        const districtId = this.organizationForm?.get('districtId')?.value;
        if (districtId != null && districtId !== '') {
            list = list.filter(org => org.districtId === districtId);
        }

        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) {
            list = list.filter(org =>
                org.orgNameEN?.toLowerCase().includes(q) ||
                org.orgNameBN?.toLowerCase().includes(q) ||
                (org.parentName && org.parentName.toLowerCase().includes(q)) ||
                this.getDistrictDisplay(org.districtId).toLowerCase().includes(q)
            );
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
            this.organizationForm.patchValue({ status: true });
            this.create();
        }
    }

    create() {
        this.isSubmitting = true;

        const preservedParentOrg = this.organizationForm.get('parentOrg')?.value;

        this.organizationService.post(this.organizationForm.value).subscribe({
            next: (res: any) => {
                console.log('Organization created successfully', res);
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Organization created successfully'
                });
                this.onReset();
                this.organizationForm.patchValue({ parentOrg: preservedParentOrg });
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

        const preservedParentOrg = this.organizationForm.get('parentOrg')?.value;

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
                this.organizationForm.patchValue({ parentOrg: preservedParentOrg });
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
        this.searchValue = '';
        this.organizationForm.reset({
            orgId: 0,
            parentOrg: null,
            districtId: null,
            status: true,
            createdDate: new Date(),
            lastupdate: new Date(),
            lastUpdatedBy: this.currentUser,
            createdBy: this.currentUser
        });
        this.buildTableData();
        this.isSubmitting = false;
    }
}


