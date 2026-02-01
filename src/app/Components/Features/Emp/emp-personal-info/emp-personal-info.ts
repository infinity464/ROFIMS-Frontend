import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { FileUploadModule } from 'primeng/fileupload';
import { RadioButtonModule } from 'primeng/radiobutton';

import { EmpService } from '@/services/emp-service';
import { CommonCodeService } from '@/services/common-code-service';
import { BloodGroupOptions } from '@/models/enums';

@Component({
    selector: 'app-emp-personal-info',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        InputTextModule,
        ButtonModule,
        Fluid,
        SelectModule,
        DatePickerModule,
        InputNumberModule,
        TextareaModule,
        FileUploadModule,
        RadioButtonModule
    ],
    templateUrl: './emp-personal-info.html',
    styleUrl: './emp-personal-info.scss'
})
export class EmpPersonalInfo implements OnInit {
    // Employee lookup
    searchRabId: string = '';
    searchServiceId: string = '';
    isSearching: boolean = false;
    employeeFound: boolean = false;
    selectedEmployeeId: number | null = null;

    // Employee basic info (auto-loaded from search)
    employeeBasicInfo: any = null;

    // Personal Info Form
    personalInfoForm!: FormGroup;

    // Additional form fields
    authForm!: FormGroup;

    // Dropdown options
    bloodGroups = BloodGroupOptions;
    religions: any[] = [];
    maritalStatuses: any[] = [];
    batches: any[] = [];
    professionalQualifications: any[] = [];
    personalQualifications: any[] = [];
    gallantryAwards: any[] = [];
    educationQualifications: any[] = [];
    medicalCategories: any[] = [];
    tribalOptions: any[] = [
        { label: 'No', value: 'No' },
        { label: 'Yes', value: 'Yes' }
    ];
    freedomFighterOptions: any[] = [
        { label: 'No', value: 'No' },
        { label: 'Yes', value: 'Yes' }
    ];
    yesNoOptions: any[] = [
        { label: 'No', value: false },
        { label: 'Yes', value: true }
    ];

    // Investigation Experience toggle
    showInvestigationExperience: boolean = false;

    // File upload
    uploadedFiles: any[] = [];

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.initializeForm();
        this.loadDropdownData();
    }

    initializeForm(): void {
        this.personalInfoForm = this.fb.group({
            bloodGroup: [null],
            nid: ['', [Validators.pattern('^[0-9]*$'), Validators.maxLength(17)]],
            mobileNo: ['', [Validators.pattern('^01[3-9][0-9]{8}$')]],
            emailAddress: ['', [Validators.email]],
            dateOfBirth: [null],
            religion: [null],
            passportNo: ['', [Validators.pattern('^[0-9]*$')]],
            identificationMark: [''],
            maritalStatus: [null],
            emergencyContactNo: ['', [Validators.pattern('^01[3-9][0-9]{8}$')]],
            dateOfJoining: [null],
            dateOfCommission: [null],
            batch: [null],
            investigationExperience: [false],
            investigationExperienceDetails: [''],
            professionalQualification: [null],
            personalQualification: [null],
            gallantryAward: [null],
            lastEducationQualification: [null],
            medicalCategory: [null],
            tribal: [null],
            freedomFighter: [null],
            height: [null, [Validators.min(0), Validators.max(255)]],
            weight: [null, [Validators.min(0), Validators.max(255)]],
            drivingLicenseNo: [''],
            serviceIdCardNo: ['']
        });

        this.authForm = this.fb.group({
            auth: [''],
            remarks: ['']
        });

        // Watch for investigation experience change
        this.personalInfoForm.get('investigationExperience')?.valueChanges.subscribe(value => {
            this.showInvestigationExperience = value;
            if (!value) {
                this.personalInfoForm.patchValue({ investigationExperienceDetails: '' });
            }
        });
    }

    loadDropdownData(): void {
        // Blood Groups loaded from enum (BloodGroupOptions)

        // Load Religions
        this.commonCodeService.getAllActiveCommonCodesType('Religion').subscribe({
            next: (data) => {
                this.religions = data.map(d => ({ label: d.codeValueEN, value: d.codeId }));
                // Set default to Islam if found
                const islam = this.religions.find(r => r.label?.toLowerCase() === 'islam');
                if (islam && !this.personalInfoForm.get('religion')?.value) {
                    this.personalInfoForm.patchValue({ religion: islam.value });
                }
            },
            error: (err) => console.error('Failed to load religions', err)
        });

        // Load Marital Statuses
        this.commonCodeService.getAllActiveCommonCodesType('MaritalStatus').subscribe({
            next: (data) => this.maritalStatuses = data.map(d => ({ label: d.codeValueEN, value: d.codeId })),
            error: (err) => console.error('Failed to load marital statuses', err)
        });

        // Load Batches
        this.commonCodeService.getAllActiveCommonCodesType('Batch').subscribe({
            next: (data) => this.batches = data.map(d => ({ label: d.codeValueEN, value: d.codeId })),
            error: (err) => console.error('Failed to load batches', err)
        });

        // Load Professional Qualifications
        this.commonCodeService.getAllActiveCommonCodesType('ProfessionalQualification').subscribe({
            next: (data) => this.professionalQualifications = data.map(d => ({ label: d.codeValueEN, value: d.codeId })),
            error: (err) => console.error('Failed to load professional qualifications', err)
        });

        // Load Personal Qualifications
        this.commonCodeService.getAllActiveCommonCodesType('PersonalQualification').subscribe({
            next: (data) => this.personalQualifications = data.map(d => ({ label: d.codeValueEN, value: d.codeId })),
            error: (err) => console.error('Failed to load personal qualifications', err)
        });

        // Load Gallantry Awards / Decorations
        this.commonCodeService.getAllActiveCommonCodesType('Decoration').subscribe({
            next: (data) => this.gallantryAwards = data.map(d => ({ label: d.codeValueEN, value: d.codeId })),
            error: (err) => console.error('Failed to load gallantry awards', err)
        });

        // Load Education Qualifications
        this.commonCodeService.getAllActiveCommonCodesType('EducationQualification').subscribe({
            next: (data) => this.educationQualifications = data.map(d => ({ label: d.codeValueEN, value: d.codeId })),
            error: (err) => console.error('Failed to load education qualifications', err)
        });

        // Load Medical Categories
        this.commonCodeService.getAllActiveCommonCodesType('MedicalCategory').subscribe({
            next: (data) => {
                this.medicalCategories = data.map(d => ({ label: d.codeValueEN, value: d.codeId }));
                // Set default to A (AYEE) if found
                const defaultMedical = this.medicalCategories.find(m => m.label?.includes('A') || m.label?.includes('AYEE'));
                if (defaultMedical && !this.personalInfoForm.get('medicalCategory')?.value) {
                    this.personalInfoForm.patchValue({ medicalCategory: defaultMedical.value });
                }
            },
            error: (err) => console.error('Failed to load medical categories', err)
        });
    }

    loadBatchesByMotherOrg(orgId: number): void {
        this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Batch').subscribe({
            next: (data) => this.batches = data.map(d => ({ label: d.codeValueEN, value: d.codeId })),
            error: (err) => console.error('Failed to load batches by org', err)
        });
    }

    // Search employee by RAB ID or Service ID
    searchEmployee(): void {
        if (!this.searchRabId && !this.searchServiceId) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Warning',
                detail: 'Please enter RAB ID or Service ID'
            });
            return;
        }

        this.isSearching = true;
        this.employeeFound = false;

        this.empService.searchByRabIdOrServiceId(
            this.searchRabId || undefined,
            this.searchServiceId || undefined
        ).subscribe({
            next: (employee) => {
                this.isSearching = false;
                if (employee) {
                    this.employeeFound = true;
                    this.selectedEmployeeId = employee.EmployeeID;
                    this.employeeBasicInfo = employee;

                    // Load personal info if exists
                    this.loadPersonalInfo(employee);

                    // Load batches by mother org if available
                    const empAny = employee as any;
                    const orgId = empAny.OrgId || empAny.orgId || employee.LastMotherUnit;
                    if (orgId) {
                        this.loadBatchesByMotherOrg(orgId);
                    }

                    this.messageService.add({
                        severity: 'success',
                        summary: 'Employee Found',
                        detail: `Found: ${employee.FullNameEN}`
                    });
                } else {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Not Found',
                        detail: 'No employee found with given ID'
                    });
                }
            },
            error: (err) => {
                this.isSearching = false;
                console.error('Search error', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to search employee'
                });
            }
        });
    }

    loadPersonalInfo(employee: any): void {
        this.personalInfoForm.patchValue({
            bloodGroup: employee.BloodGroupId || employee.bloodGroupId,
            nid: employee.NID || employee.Nid || employee.nid || '',
            mobileNo: employee.MobileNo || employee.mobileNo || '',
            emailAddress: '', // Email not in PersonalInfo model
            dateOfBirth: employee.DOB ? new Date(employee.DOB) : (employee.dob ? new Date(employee.dob) : null),
            religion: employee.Religion || employee.religion,
            passportNo: employee.PassportNo || employee.passportNo || '',
            identificationMark: employee.IdentificationMark || employee.identificationMark || '',
            maritalStatus: employee.MaritalStatus || employee.maritalStatus,
            emergencyContactNo: employee.EmergencyContact || employee.emergencyContact || '',
            dateOfJoining: employee.JoiningDate ? new Date(employee.JoiningDate) : (employee.joiningDate ? new Date(employee.joiningDate) : null),
            dateOfCommission: employee.CommissionDate ? new Date(employee.CommissionDate) : (employee.commissionDate ? new Date(employee.commissionDate) : null),
            batch: employee.Batch || employee.batch || '',
            investigationExperience: employee.HasInvestigationExp || employee.hasInvestigationExp || false,
            investigationExperienceDetails: employee.InvestigationExpDetails || employee.investigationExpDetails || '',
            professionalQualification: employee.ProfessionalQualification || employee.professionalQualification,
            personalQualification: employee.PersonalQualification || employee.personalQualification,
            gallantryAward: employee.Awards || employee.awards || '',
            lastEducationQualification: employee.LastEducationalQualification || employee.lastEducationalQualification,
            medicalCategory: employee.MedicalCategory || employee.medicalCategory,
            tribal: employee.Tribal || employee.tribal,
            freedomFighter: employee.FreedomFighter || employee.freedomFighter,
            height: employee.Height || employee.height,
            weight: employee.Weight || employee.weight,
            drivingLicenseNo: employee.DrivingLicenseNo || employee.drivingLicenseNo || '',
            serviceIdCardNo: employee.ServiceIdCardNo || employee.serviceIdCardNo || ''
        });

        this.showInvestigationExperience = employee.HasInvestigationExp || employee.hasInvestigationExp || false;
    }

    // File upload handler
    onFileUpload(event: any): void {
        for (let file of event.files) {
            this.uploadedFiles.push(file);
        }
        this.messageService.add({
            severity: 'info',
            summary: 'File Uploaded',
            detail: 'File uploaded successfully'
        });
    }

    onFileRemove(event: any): void {
        const index = this.uploadedFiles.indexOf(event.file);
        if (index > -1) {
            this.uploadedFiles.splice(index, 1);
        }
    }

    // Save all information
    saveAll(): void {
        if (!this.selectedEmployeeId) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Warning',
                detail: 'Please search and select an employee first'
            });
            return;
        }

        const personalInfoPayload = this.buildPersonalInfoPayload();

        this.empService.updateEmployee(personalInfoPayload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Personal information saved successfully!'
                });
            },
            error: (err) => {
                console.error('Failed to save', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to save information'
                });
            }
        });
    }

    buildPersonalInfoPayload(): any {
        const formValue = this.personalInfoForm.getRawValue();
        return {
            EmployeeID: this.selectedEmployeeId,
            Nid: formValue.nid,
            BloodGroup: formValue.bloodGroup,  // string like "A+", "B+"
            MobileNo: formValue.mobileNo,
            DOB: formValue.dateOfBirth ? new Date(formValue.dateOfBirth).toISOString().split('T')[0] : null,
            Religion: formValue.religion,
            PassportNo: formValue.passportNo,
            IdentificationMark: formValue.identificationMark,
            MaritalStatus: formValue.maritalStatus,
            EmergencyContact: formValue.emergencyContactNo,
            JoiningDate: formValue.dateOfJoining ? new Date(formValue.dateOfJoining).toISOString().split('T')[0] : null,
            CommissionDate: formValue.dateOfCommission ? new Date(formValue.dateOfCommission).toISOString().split('T')[0] : null,
            Batch: formValue.batch,
            HasInvestigationExp: formValue.investigationExperience,
            InvestigationExpDetails: formValue.investigationExperienceDetails,
            ProfessionalQualification: formValue.professionalQualification,
            PersonalQualification: formValue.personalQualification,
            Awards: formValue.gallantryAward,
            LastEducationalQualification: formValue.lastEducationQualification,
            MedicalCategory: formValue.medicalCategory,
            Tribal: formValue.tribal,
            FreedomFighter: formValue.freedomFighter,
            Height: formValue.height,
            Weight: formValue.weight,
            DrivingLicenseNo: formValue.drivingLicenseNo,
            ServiceIdCardNo: formValue.serviceIdCardNo,
            CreatedBy: 'system',
            CreatedDate: new Date().toISOString(),
            LastUpdatedBy: 'system',
            Lastupdate: new Date().toISOString()
        };
    }

    resetForm(): void {
        this.personalInfoForm.reset({
            tribal: null,
            freedomFighter: null,
            investigationExperience: false
        });
        this.authForm.reset();
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.searchRabId = '';
        this.searchServiceId = '';
        this.uploadedFiles = [];
        this.showInvestigationExperience = false;
    }
}
