import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

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
import { TooltipModule } from 'primeng/tooltip';

import { EmpService } from '@/services/emp-service';
import { CommonCodeService } from '@/services/common-code-service';
import { MedicalCategoryOptions } from '@/models/enums';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';

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
        RadioButtonModule,
        TooltipModule,
        EmployeeSearchComponent
    ],
    templateUrl: './emp-personal-info.html',
    styleUrl: './emp-personal-info.scss'
})
export class EmpPersonalInfo implements OnInit {
    // Employee lookup
    employeeFound: boolean = false;
    selectedEmployeeId: number | null = null;

    // Employee basic info (auto-loaded from search)
    employeeBasicInfo: any = null;

    // Personal Info Form
    personalInfoForm!: FormGroup;

    // Dropdown options (all loaded from CommonCode database)
    bloodGroups: any[] = [];
    religions: any[] = [];
    maritalStatuses: any[] = [];
    batches: any[] = [];
    professionalQualifications: any[] = [];
    personalQualifications: any[] = [];
    gallantryAwards: any[] = [];
    educationQualifications: any[] = [];
    medicalCategories = MedicalCategoryOptions;
    tribalOptions: any[] = [
        { label: 'No', value: 0 },
        { label: 'Yes', value: 1 }
    ];
    freedomFighterOptions: any[] = [
        { label: 'No', value: 0 },
        { label: 'Yes', value: 1 }
    ];
    yesNoOptions: any[] = [
        { label: 'No', value: false },
        { label: 'Yes', value: true }
    ];

    // Investigation Experience toggle
    showInvestigationExperience: boolean = false;

    // File upload
    uploadedFiles: any[] = [];

    // Mode: 'search' (default), 'view' (readonly), 'edit'
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly: boolean = false;

    // Track if personal info record exists (for save vs update)
    personalInfoExists: boolean = false;

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private route: ActivatedRoute,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.initializeForm();
        this.loadDropdownData();
        this.checkRouteParams();
    }

    checkRouteParams(): void {
        this.route.queryParams.subscribe(params => {
            const employeeId = params['id'];
            const mode = params['mode'];

            if (employeeId) {
                this.mode = mode === 'edit' ? 'edit' : 'view';
                this.isReadonly = this.mode === 'view';
                this.loadEmployeeById(parseInt(employeeId, 10));
            } else {
                this.mode = 'search';
                this.isReadonly = false;
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

                    // Load personal info
                    this.loadPersonalInfo(employee);

                    // Load batches by mother org
                    const orgId = employee.orgId || employee.OrgId || employee.lastMotherUnit || employee.LastMotherUnit;
                    if (orgId) {
                        this.loadBatchesByMotherOrg(orgId);
                    }

                    // Disable form in view mode
                    if (this.isReadonly) {
                        this.personalInfoForm.disable();
                    }
                }
            },
            error: (err) => {
                console.error('Failed to load employee', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load employee data'
                });
            }
        });
    }

    enableEditMode(): void {
        this.mode = 'edit';
        this.isReadonly = false;
        this.personalInfoForm.enable();
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { id: this.selectedEmployeeId, mode: 'edit' },
            queryParamsHandling: 'merge'
        });
    }

    goBack(): void {
        this.router.navigate(['/emp-list']);
    }

    initializeForm(): void {
        this.personalInfoForm = this.fb.group({
            bloodGroup: [null],
            nid: ['', [Validators.pattern('^[0-9]{0,17}$'), Validators.maxLength(17)]],
            mobileNo: ['', [Validators.pattern('^01[3-9][0-9]{8}$')]],
            emailAddress: ['', [Validators.email]],
            dateOfBirth: [null],
            religion: [null],
            passportNo: [''],
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
            medicalCategory: [1],  // Default to A (AYEE) - value is integer ID
            tribal: [null],
            freedomFighter: [null],
            heightFeet: [null, [Validators.min(0), Validators.max(8)]],
            heightInch: [null, [Validators.min(0), Validators.max(11)]],
            weightKg: [null, [Validators.min(0), Validators.max(200)]],
            weightLbs: [null, [Validators.min(0), Validators.max(440)]],
            drivingLicenseNo: [''],
            serviceIdCardNo: ['']
        });

        // Weight auto-conversion: KG to Lbs
        this.personalInfoForm.get('weightKg')?.valueChanges.subscribe(kg => {
            if (kg !== null && kg !== undefined) {
                const lbs = Math.round(kg * 2.20462);
                this.personalInfoForm.patchValue({ weightLbs: lbs }, { emitEvent: false });
            }
        });

        // Weight auto-conversion: Lbs to KG
        this.personalInfoForm.get('weightLbs')?.valueChanges.subscribe(lbs => {
            if (lbs !== null && lbs !== undefined) {
                const kg = Math.round(lbs / 2.20462);
                this.personalInfoForm.patchValue({ weightKg: kg }, { emitEvent: false });
            }
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
        // Load Blood Groups from database (BloodGroup field is varchar(5), stores actual value like "A+", "B+")
        this.commonCodeService.getAllActiveCommonCodesType('BloodGroup').subscribe({
            next: (data) => this.bloodGroups = data.map(d => ({ label: d.codeValueEN, value: d.codeValueEN })),
            error: (err) => console.error('Failed to load blood groups', err)
        });

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

        // Batches will be loaded based on Mother Organization when employee is searched
        // Initial load is skipped - batches shown as per Mother Organization only

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

        // Medical Categories loaded from enum (MedicalCategoryOptions) with default A (AYEE)
    }

    loadBatchesByMotherOrg(orgId: number): void {
        this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Batch').subscribe({
            next: (data) => this.batches = data.map(d => ({ label: d.codeValueEN, value: d.codeId })),
            error: (err) => console.error('Failed to load batches by org', err)
        });
    }

    // Handle employee search component events
    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;

        // Load personal info if exists
        this.loadPersonalInfo(employee);

        // Load batches by mother org if available
        const orgId = (employee as any).orgId || (employee as any).OrgId || (employee as any).lastMotherUnit || (employee as any).LastMotherUnit;
        if (orgId) {
            this.loadBatchesByMotherOrg(orgId);
        }
    }

    onEmployeeSearchReset(): void {
        this.resetForm();
    }

    loadPersonalInfo(employee: any): void {
        const employeeId = employee.employeeID || employee.EmployeeID;
        if (!employeeId) return;

        // Fetch personal info from PersonalInfo API
        this.empService.getPersonalInfoByEmployeeId(employeeId).subscribe({
            next: (personalInfo: any) => {
                if (personalInfo) {
                    this.personalInfoExists = true;
                    this.populateFormWithPersonalInfo(personalInfo);
                } else {
                    this.personalInfoExists = false;
                }
            },
            error: (err) => {
                console.error('Failed to load personal info', err);
                this.personalInfoExists = false;
            }
        });
    }

    populateFormWithPersonalInfo(data: any): void {
        // Convert Height (stored in inches) to Feet and Inch
        const heightInches = data.Height || data.height || 0;
        const heightFeet = Math.floor(heightInches / 12);
        const heightInch = heightInches % 12;

        // Convert Weight (stored in KG) to KG and Lbs
        const weightKg = data.Weight || data.weight || null;
        const weightLbs = weightKg ? Math.round(weightKg * 2.20462) : null;

        // Parse dropdown values - they may be stored as strings but need to match dropdown values
        const parseDropdownValue = (val: any) => {
            if (val === null || val === undefined || val === '') return null;
            const num = parseInt(val, 10);
            return isNaN(num) ? val : num;
        };

        this.personalInfoForm.patchValue({
            bloodGroup: data.BloodGroup || data.bloodGroup || null,
            nid: data.Nid || data.nid || '',
            mobileNo: data.MobileNo || data.mobileNo || '',
            emailAddress: data.Email || data.email || '',
            dateOfBirth: data.DOB ? new Date(data.DOB) : (data.dob ? new Date(data.dob) : null),
            religion: parseDropdownValue(data.Religion || data.religion),
            passportNo: data.PassportNo || data.passportNo || '',
            identificationMark: data.IdentificationMark || data.identificationMark || '',
            maritalStatus: parseDropdownValue(data.MaritalStatus || data.maritalStatus),
            emergencyContactNo: data.EmergencyContact || data.emergencyContact || '',
            dateOfJoining: data.JoiningDate ? new Date(data.JoiningDate) : (data.joiningDate ? new Date(data.joiningDate) : null),
            dateOfCommission: data.CommissionDate ? new Date(data.CommissionDate) : (data.commissionDate ? new Date(data.commissionDate) : null),
            batch: parseDropdownValue(data.Batch || data.batch),
            investigationExperience: data.HasInvestigationExp || data.hasInvestigationExp || false,
            investigationExperienceDetails: data.InvestigationExpDetails || data.investigationExpDetails || '',
            professionalQualification: parseDropdownValue(data.ProfessionalQualification || data.professionalQualification),
            personalQualification: parseDropdownValue(data.PersonalQualification || data.personalQualification),
            gallantryAward: parseDropdownValue(data.Awards || data.awards),
            lastEducationQualification: parseDropdownValue(data.LastEducationalQualification || data.lastEducationalQualification),
            medicalCategory: data.MedicalCategory || data.medicalCategory || 1,
            tribal: data.Tribal !== undefined ? data.Tribal : (data.tribal !== undefined ? data.tribal : null),
            freedomFighter: data.FreedomFighter !== undefined ? data.FreedomFighter : (data.freedomFighter !== undefined ? data.freedomFighter : null),
            heightFeet: heightFeet || null,
            heightInch: heightInch || null,
            weightKg: weightKg,
            weightLbs: weightLbs,
            drivingLicenseNo: data.DrivingLicenseNo || data.drivingLicenseNo || '',
            serviceIdCardNo: data.ServiceIdCardNo || data.serviceIdCardNo || ''
        }, { emitEvent: false }); // Prevent auto-conversion trigger during load

        this.showInvestigationExperience = data.HasInvestigationExp || data.hasInvestigationExp || false;
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

    // Save or Update personal information
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

        // Call UpdateAsyn if record exists, otherwise SaveAsyn
        const saveOrUpdate$ = this.personalInfoExists
            ? this.empService.updatePersonalInfo(personalInfoPayload)
            : this.empService.savePersonalInfo(personalInfoPayload);

        saveOrUpdate$.subscribe({
            next: (res) => {
                this.personalInfoExists = true; // After save, record now exists
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: this.personalInfoExists ? 'Personal information updated successfully!' : 'Personal information saved successfully!'
                });
            },
            error: (err) => {
                console.error('Failed to save/update personal info', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to save personal information'
                });
            }
        });
    }

    buildPersonalInfoPayload(): any {
        const formValue = this.personalInfoForm.getRawValue();

        // Convert Feet/Inch to total inches for Height
        const heightFeet = formValue.heightFeet || 0;
        const heightInch = formValue.heightInch || 0;
        const totalHeightInches = (heightFeet * 12) + heightInch;

        // Weight stored in KG
        const weightKg = formValue.weightKg || null;

        return {
            EmployeeID: this.selectedEmployeeId,
            Nid: formValue.nid,
            Email: formValue.emailAddress,
            BloodGroup: formValue.bloodGroup,  // varchar(5) - value from CommonCode (e.g., "A+", "B+")
            MobileNo: formValue.mobileNo,
            DOB: formValue.dateOfBirth ? new Date(formValue.dateOfBirth).toISOString().split('T')[0] : null,
            Religion: formValue.religion ? formValue.religion.toString() : null,
            PassportNo: formValue.passportNo,
            IdentificationMark: formValue.identificationMark,
            MaritalStatus: formValue.maritalStatus ? formValue.maritalStatus.toString() : null,
            EmergencyContact: formValue.emergencyContactNo,
            JoiningDate: formValue.dateOfJoining ? new Date(formValue.dateOfJoining).toISOString().split('T')[0] : null,
            CommissionDate: formValue.dateOfCommission ? new Date(formValue.dateOfCommission).toISOString().split('T')[0] : null,
            Batch: formValue.batch ? formValue.batch.toString() : null,
            HasInvestigationExp: formValue.investigationExperience,
            InvestigationExpDetails: formValue.investigationExperienceDetails,
            ProfessionalQualification: formValue.professionalQualification ? formValue.professionalQualification.toString() : null,
            PersonalQualification: formValue.personalQualification ? formValue.personalQualification.toString() : null,
            Awards: formValue.gallantryAward ? formValue.gallantryAward.toString() : null,
            LastEducationalQualification: formValue.lastEducationQualification ? formValue.lastEducationQualification.toString() : null,
            MedicalCategory: formValue.medicalCategory,
            Tribal: formValue.tribal,
            FreedomFighter: formValue.freedomFighter,
            Height: totalHeightInches > 0 ? totalHeightInches : null,
            Weight: weightKg,
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
            investigationExperience: false,
            heightFeet: null,
            heightInch: null,
            weightKg: null,
            weightLbs: null,
            medicalCategory: 1  // Default to A (AYEE) - value is integer ID
        });
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.uploadedFiles = [];
        this.showInvestigationExperience = false;
        this.personalInfoExists = false;
    }
}
