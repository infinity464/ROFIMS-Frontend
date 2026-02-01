import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { EmpService } from '@/services/emp-service';
import { CommonCodeService } from '@/services/common-code-service';
import { FamilyInfoService } from '@/services/family-info-service';

interface FamilyMember {
    employeeId: number;
    fmid: number;
    relation: number | null;
    nameEN: string | null;
    nameBN: string | null;
    dob: Date | null;
    maritalStatus: number | null;
    occupation: number | null;
    nid: string | null;
    mobileNo: string | null;
    passportNo: string | null;
    email: string | null;
}

@Component({
    selector: 'app-emp-family-info',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        InputTextModule,
        ButtonModule,
        Fluid,
        TooltipModule,
        TableModule,
        SelectModule,
        DatePickerModule,
        DialogModule,
        ConfirmDialogModule
    ],
    providers: [ConfirmationService],
    templateUrl: './emp-family-info.html',
    styleUrl: './emp-family-info.scss'
})
export class EmpFamilyInfo implements OnInit {
    searchRabId: string = '';
    searchServiceId: string = '';
    isSearching: boolean = false;
    employeeFound: boolean = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly: boolean = false;

    // Family members data
    familyMembers: FamilyMember[] = [];
    isLoading: boolean = false;

    // Dialog
    displayDialog: boolean = false;
    isEditMode: boolean = false;
    familyForm!: FormGroup;
    editingFmid: number | null = null;

    // Dropdowns
    relationOptions: any[] = [];
    maritalStatusOptions: any[] = [];
    occupationOptions: any[] = [];

    constructor(
        private empService: EmpService,
        private familyInfoService: FamilyInfoService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private route: ActivatedRoute,
        private router: Router,
        private fb: FormBuilder
    ) {
        this.initForm();
    }

    ngOnInit(): void {
        this.loadDropdowns();
        this.checkRouteParams();
    }

    initForm(): void {
        this.familyForm = this.fb.group({
            relation: [null, Validators.required],
            nameEN: ['', Validators.required],
            nameBN: [''],
            dob: [null],
            maritalStatus: [null],
            occupation: [null],
            nid: [''],
            mobileNo: [''],
            passportNo: [''],
            email: ['', Validators.email]
        });
    }

    loadDropdowns(): void {
        // Load Relation dropdown
        this.commonCodeService.getAllActiveCommonCodesType('Relationship').subscribe({
            next: (data) => {
                this.relationOptions = data.map(item => ({
                    label: item.codeValueEN || item.displayCodeValueEN,
                    value: item.codeId
                }));
            }
        });

        // Load MaritalStatus dropdown
        this.commonCodeService.getAllActiveCommonCodesType('MaritalStatus').subscribe({
            next: (data) => {
                this.maritalStatusOptions = data.map(item => ({
                    label: item.codeValueEN || item.displayCodeValueEN,
                    value: item.codeId
                }));
            }
        });

        // Load Occupation dropdown
        this.commonCodeService.getAllActiveCommonCodesType('Occupation').subscribe({
            next: (data) => {
                this.occupationOptions = data.map(item => ({
                    label: item.codeValueEN || item.displayCodeValueEN,
                    value: item.codeId
                }));
            }
        });
    }

    checkRouteParams(): void {
        this.route.queryParams.subscribe(params => {
            const employeeId = params['id'];
            const mode = params['mode'];
            if (employeeId) {
                this.mode = mode === 'edit' ? 'edit' : 'view';
                this.isReadonly = this.mode === 'view';
                this.loadEmployeeById(parseInt(employeeId, 10));
            }
        });
    }

    loadEmployeeById(employeeId: number): void {
        this.empService.getEmployeeById(employeeId).subscribe({
            next: (employee: any) => {
                if (employee) {
                    this.employeeFound = true;
                    this.selectedEmployeeId = employee.employeeID || employee.EmployeeID;
                    this.employeeBasicInfo = employee;
                    this.loadFamilyMembers();
                }
            },
            error: (err) => {
                console.error('Failed to load employee', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load employee' });
            }
        });
    }

    searchEmployee(): void {
        if (!this.searchRabId && !this.searchServiceId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please enter RAB ID or Service ID' });
            return;
        }
        this.isSearching = true;
        this.employeeFound = false;

        this.empService.searchByRabIdOrServiceId(this.searchRabId || undefined, this.searchServiceId || undefined).subscribe({
            next: (employee: any) => {
                this.isSearching = false;
                if (employee) {
                    this.employeeFound = true;
                    this.selectedEmployeeId = employee.employeeID || employee.EmployeeID;
                    this.employeeBasicInfo = employee;
                    this.isReadonly = true;
                    this.loadFamilyMembers();
                    this.messageService.add({ severity: 'success', summary: 'Employee Found', detail: `Found: ${employee.fullNameEN || employee.FullNameEN}` });
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Not Found', detail: 'No employee found' });
                }
            },
            error: () => {
                this.isSearching = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Search failed' });
            }
        });
    }

    loadFamilyMembers(): void {
        if (!this.selectedEmployeeId) return;

        this.isLoading = true;
        this.familyInfoService.getByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (data: any[]) => {
                this.familyMembers = data.map(item => ({
                    employeeId: item.employeeId || item.EmployeeId,
                    fmid: item.fmid || item.FMID,
                    relation: item.relation || item.Relation,
                    nameEN: item.nameEN || item.NameEN,
                    nameBN: item.nameBN || item.NameBN,
                    dob: item.dob || item.DOB ? new Date(item.dob || item.DOB) : null,
                    maritalStatus: item.maritalStatus || item.MaritalStatus,
                    occupation: item.occupation || item.Occupation,
                    nid: item.nid || item.NID,
                    mobileNo: item.mobileNo || item.MobileNo,
                    passportNo: item.passportNo || item.PassportNo,
                    email: item.email || item.Email
                }));
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Failed to load family members', err);
                this.isLoading = false;
            }
        });
    }

    getRelationName(relationId: number | null): string {
        if (!relationId) return 'N/A';
        const option = this.relationOptions.find(o => o.value === relationId);
        return option ? option.label : 'N/A';
    }

    getMaritalStatusName(statusId: number | null): string {
        if (!statusId) return 'N/A';
        const option = this.maritalStatusOptions.find(o => o.value === statusId);
        return option ? option.label : 'N/A';
    }

    getOccupationName(occupationId: number | null): string {
        if (!occupationId) return 'N/A';
        const option = this.occupationOptions.find(o => o.value === occupationId);
        return option ? option.label : 'N/A';
    }

    openAddDialog(): void {
        this.isEditMode = false;
        this.editingFmid = null;
        this.familyForm.reset();
        this.displayDialog = true;
    }

    openEditDialog(member: FamilyMember): void {
        this.isEditMode = true;
        this.editingFmid = member.fmid;
        this.familyForm.patchValue({
            relation: member.relation,
            nameEN: member.nameEN,
            nameBN: member.nameBN,
            dob: member.dob,
            maritalStatus: member.maritalStatus,
            occupation: member.occupation,
            nid: member.nid,
            mobileNo: member.mobileNo,
            passportNo: member.passportNo,
            email: member.email
        });
        this.displayDialog = true;
    }

    saveFamily(): void {
        if (this.familyForm.invalid) {
            Object.keys(this.familyForm.controls).forEach(key => {
                this.familyForm.get(key)?.markAsTouched();
            });
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please fill required fields' });
            return;
        }

        const formValue = this.familyForm.value;
        const payload = {
            EmployeeId: this.selectedEmployeeId,
            FMID: this.isEditMode ? this.editingFmid : 0,
            Relation: formValue.relation,
            NameEN: formValue.nameEN,
            NameBN: formValue.nameBN || null,
            DOB: formValue.dob ? this.formatDate(formValue.dob) : null,
            MaritalStatus: formValue.maritalStatus,
            Occupation: formValue.occupation,
            NID: formValue.nid || null,
            MobileNo: formValue.mobileNo || null,
            PassportNo: formValue.passportNo || null,
            Email: formValue.email || null,
            LastUpdatedBy: 'system',
            Lastupdate: new Date().toISOString(),
            StatusDate: new Date().toISOString()
        };

        if (this.isEditMode) {
            this.familyInfoService.update(payload).subscribe({
                next: () => {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Family member updated successfully' });
                    this.displayDialog = false;
                    this.loadFamilyMembers();
                },
                error: (err) => {
                    console.error('Failed to update family member', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update family member' });
                }
            });
        } else {
            this.familyInfoService.save(payload).subscribe({
                next: () => {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Family member added successfully' });
                    this.displayDialog = false;
                    this.loadFamilyMembers();
                },
                error: (err) => {
                    console.error('Failed to save family member', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save family member' });
                }
            });
        }
    }

    confirmDelete(member: FamilyMember): void {
        this.confirmationService.confirm({
            message: `Are you sure you want to delete ${member.nameEN}?`,
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                this.deleteFamilyMember(member);
            }
        });
    }

    deleteFamilyMember(member: FamilyMember): void {
        this.familyInfoService.delete(member.employeeId, member.fmid).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Family member deleted successfully' });
                this.loadFamilyMembers();
            },
            error: (err) => {
                console.error('Failed to delete family member', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete family member' });
            }
        });
    }

    formatDate(date: Date): string {
        if (!date) return '';
        const d = new Date(date);
        return d.toISOString().split('T')[0];
    }

    enableEditMode(): void {
        this.mode = 'edit';
        this.isReadonly = false;
    }

    enableSearchEditMode(): void {
        this.isReadonly = false;
    }

    goBack(): void {
        this.router.navigate(['/emp-list']);
    }

    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.searchRabId = '';
        this.searchServiceId = '';
        this.familyMembers = [];
    }
}
