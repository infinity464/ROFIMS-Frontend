import { Component, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FileUpload } from 'primeng/fileupload';
import { Select } from 'primeng/select';
import { DatePicker } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { CommonCodeModel } from '@/models/common-code-model';
import { EmpService } from '@/services/emp-service';
import { MotherOrganizationModel } from '@/models/mother-org-model';
import { CommonCodeService } from '@/services/common-code-service';
import { DropdownOption } from '@/models/drop-down-options';
import { MessageService } from 'primeng/api';

@Component({
    selector: 'app-emp-basic-info',
    imports: [FileUpload, ButtonModule, Select, DatePicker, ReactiveFormsModule, InputTextModule],
    templateUrl: './emp-basic-info.html',
    styleUrl: './emp-basic-info.scss'
})
export class EmpBasicInfo {
    @ViewChild('fileUpload') fileUpload!: FileUpload;

    postingForm!: FormGroup;
    imagePreview: string | null = null;
    selectedFile: File | null = null;

    // Success/Error flags
    saveSuccess = false;
    submitSuccess = false;
    errorMessage: string | null = null;

    // Dropdown options
    motherOrganizations: MotherOrganizationModel[] = [];
    lastUnitOrganizations: MotherOrganizationModel[] = [];
    memberTypes: CommonCodeModel[] = [];
    officerTypes: CommonCodeModel[] = [];
    appointments: CommonCodeModel[] = [];
    ranks: CommonCodeModel[] = [];
    corps: CommonCodeModel[] = [];
    trades: CommonCodeModel[] = [];
    genders: CommonCodeModel[] = [];
    prefixes: CommonCodeModel[] = [];

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.initializeForm();
        this.loadMotherOrg();
        this.loadMemberType();
        this.loadAppointment();
        this.loadGender();
    }

    initializeForm(): void {
        this.postingForm = this.fb.group({
            employeeID: [0],
            picture: [null],
            lastMotherUnit: [null, Validators.required],
            memberType: [null, Validators.required],
            appointment: [null, Validators.required],
            joiningDate: [null, Validators.required],
            rank: [null, Validators.required],
            branch: [null, Validators.required],
            trade: [null, Validators.required],
            tradeMark: [''],
            gender: [null, Validators.required],
            prefix: [null, Validators.required],
            serviceId: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
            rabid: [{ value: '', disabled: true }],
            nid: [''],
            fullNameEN: ['', [Validators.required, Validators.minLength(2)]],
            fullNameBN: ['', [Validators.required, Validators.minLength(2)]],
            isReliever: [false],
            postingStatus: [''],
            status: [true],
            createdBy: ['system'],
            createdDate: [new Date()],
            lastUpdatedBy: ['system'],
            lastupdate: [new Date()],
            statusDate: [new Date()],
            lastMotherUnitLocation: [''],
            motherOrganization: [''],
            officerType: ['']
        });
    }

    onFileSelect(event: any): void {
        const file = event.files[0];

        if (file) {
            const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
            if (!validTypes.includes(file.type)) {
                this.showError('Please upload a valid image file (JPG, PNG, GIF)');
                this.fileUpload.clear();
                return;
            }

            // Validate file size (5MB max)
            if (file.size > 5000000) {
                this.showError('File size must be less than 5MB');
                this.fileUpload.clear();
                return;
            }

            this.selectedFile = file;
            this.postingForm.patchValue({ picture: file });

            // Create image preview
            const reader = new FileReader();
            reader.onload = (e: any) => {
                this.imagePreview = e.target.result;
            };
            reader.readAsDataURL(file);

            console.log('Image selected:', file.name);
        }
    }

    /**
     * Remove selected image
     */
    removeImage(): void {
        this.imagePreview = null;
        this.selectedFile = null;
        this.postingForm.patchValue({ picture: null });

        // Clear the file upload component
        if (this.fileUpload) {
            this.fileUpload.clear();
        }
    }

    loadMotherOrg(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (res: MotherOrganizationModel[]) => {
                this.motherOrganizations = res;
            },
            error: (error) => {
                console.error('Failed to load mother organizations', error);
            }
        });
    }

    loadMotherOrgUnits(orgId: number) {
        this.commonCodeService.getAllActiveMotherOrgUnits(orgId).subscribe({
            next: (res) => {
                this.lastUnitOrganizations = res;
            },
            error: (err) => {
                console.error(err);
            }
        });
    }

    onMotherOrgChange(orgId: number): void {
        this.loadMotherOrgUnits(orgId);
        this.loadMotherOrgRank(orgId);
        this.loadMotherOrgCorps(orgId);
        this.loadMotherOrgPrefix(orgId);
    }

    onLastUnitChange(unit: any): void {
        console.log(unit);

        const location = this.lastUnitOrganizations.find((x) => x.orgId === unit)?.locationEN;
        console.log(location);
        this.postingForm.patchValue({
            lastMotherUnitLocation: location
        });
    }

    loadMemberType() {
        this.commonCodeService.getAllActiveCommonCodesType('EmployeeType').subscribe({
            next: (res) => {
                this.memberTypes = res;
            },
            error: (err) => {
                console.log(err);
            }
        });
    }
    loadGender() {
        this.commonCodeService.getAllActiveCommonCodesType('Gender').subscribe({
            next: (res) => {
                this.genders = res;
            },
            error: (err) => {
                console.log(err);
            }
        });
    }

    loadOfficerType(codeId: number) {
        this.commonCodeService.getAllActiveCommonCodesByParentId(codeId).subscribe({
            next: (res) => {
                this.officerTypes = res;
            },
            error: (err) => {
                console.error(err);
            }
        });
    }
    loadAppointment() {
        this.commonCodeService.getAllActiveCommonCodesType('AppointmentCategory').subscribe({
            next: (res) => {
                this.appointments = res;
            },
            error: (err) => {
                console.log(err);
            }
        });
    }

    loadMotherOrgRank(orgId: number) {
        this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
            next: (res) => {
                this.ranks = res;
            }
        });
    }
    loadMotherOrgPrefix(orgId: number) {
        this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Prefix').subscribe({
            next: (res) => {
                this.prefixes = res;
            }
        });
    }
    loadMotherOrgCorps(orgId: number) {
        this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Corps').subscribe({
            next: (res) => {
                this.corps = res;
            }
        });
    }

    loadTrade(codeId: number) {
        this.commonCodeService.getAllActiveCommonCodesByParentId(codeId).subscribe({
            next: (res) => {
                this.trades = res;
            },
            error: (err) => {
                console.error(err);
            }
        });
    }

    onChangeCorps(codeId: number) {
        this.loadTrade(codeId);
    }

    onMemberTypeChange(codeId: number) {
        this.loadOfficerType(codeId);
    }

    onSubmit(): void {
        if (this.postingForm.valid) {
            // Get the form value
            const formValue = this.postingForm.getRawValue();

            // Format the date to YYYY-MM-DD for backend
            const formattedData = {
                ...formValue,
                joiningDate: this.formatDate(formValue.joiningDate)
            };

            this.empService.saveEmployee(formattedData).subscribe({
                next: (res) => {
                    console.log('Saved successfully', res);
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'Employee saved successfully'
                    });
                },
                error: (err) => {
                    console.log('Error saving employee', err);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to save employee'
                    });
                }
            });
        } else {
            console.log('Form is invalid');
            Object.keys(this.postingForm.controls).forEach((key) => {
                this.postingForm.get(key)?.markAsTouched();
            });
        }
    }


    formatDate(date: Date | string | null): string | null {
        if (!date) return null;

        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    onReset(): void {
        this.postingForm.reset();
        this.imagePreview = null;
        this.selectedFile = null;
        this.saveSuccess = false;
        this.submitSuccess = false;
        this.errorMessage = null;

        if (this.fileUpload) {
            this.fileUpload.clear();
        }
    }

    /**
     * Prepare form data for submission (including file)
     */
    private prepareFormData(): FormData {
        const formData = new FormData();
        const formValues = this.postingForm.getRawValue();

        // Append all form fields
        Object.keys(formValues).forEach((key) => {
            if (key !== 'picture' && formValues[key] !== null && formValues[key] !== undefined) {
                formData.append(key, formValues[key]);
            }
        });

        // Append file if exists
        if (this.selectedFile) {
            formData.append('picture', this.selectedFile, this.selectedFile.name);
        }

        return formData;
    }

    private saveToLocalStorage(formData: FormData): void {
        const dataObject: any = {};
        formData.forEach((value, key) => {
            dataObject[key] = value;
        });

        // Save image as base64 for localStorage
        if (this.imagePreview) {
            dataObject.imagePreview = this.imagePreview;
        }

        localStorage.setItem('postingFormDraft', JSON.stringify(dataObject));
    }

    /**
     * Load draft from localStorage (optional feature)
     */
    loadDraft(): void {
        const draft = localStorage.getItem('postingFormDraft');
        if (draft) {
            try {
                const draftData = JSON.parse(draft);

                // Restore form values
                this.postingForm.patchValue(draftData);

                // Restore image preview
                if (draftData.imagePreview) {
                    this.imagePreview = draftData.imagePreview;
                }

                console.log('Draft loaded successfully');
            } catch (error) {
                console.error('Error loading draft:', error);
            }
        }
    }

    /**
     * Clear draft from localStorage
     */
    clearDraft(): void {
        localStorage.removeItem('postingFormDraft');
    }

    /**
     * Mark all fields as touched to show validation errors
     */
    private markFormGroupTouched(formGroup: FormGroup): void {
        Object.keys(formGroup.controls).forEach((key) => {
            const control = formGroup.get(key);
            control?.markAsTouched();

            if (control instanceof FormGroup) {
                this.markFormGroupTouched(control);
            }
        });
    }

    /**
     * Check if a field is invalid
     */
    isFieldInvalid(fieldName: string): boolean {
        const field = this.postingForm.get(fieldName);
        return !!(field && field.invalid && (field.dirty || field.touched));
    }

    /**
     * Get error message for a field
     */
    getErrorMessage(fieldName: string): string {
        const field = this.postingForm.get(fieldName);

        if (field?.hasError('required')) {
            return 'This field is required';
        }

        if (field?.hasError('pattern')) {
            return 'Please enter only numbers';
        }

        if (field?.hasError('minlength')) {
            return `Minimum length is ${field.errors?.['minlength']?.requiredLength} characters`;
        }

        return 'Invalid value';
    }

    /**
     * Show success message
     */
    private showSuccess(type: 'save' | 'submit'): void {
        if (type === 'save') {
            this.saveSuccess = true;
            setTimeout(() => (this.saveSuccess = false), 3000);
        } else {
            this.submitSuccess = true;
            setTimeout(() => (this.submitSuccess = false), 3000);
        }
        this.errorMessage = null;
    }

    /**
     * Show error message
     */
    private showError(message: string): void {
        this.errorMessage = message;
        setTimeout(() => (this.errorMessage = null), 5000);
        this.saveSuccess = false;
        this.submitSuccess = false;
    }

    /**
     * Get image file name
     */
    get imageFileName(): string {
        return this.selectedFile ? this.selectedFile.name : 'No file selected';
    }

    /**
     * Get image file size in KB
     */
    get imageFileSize(): string {
        if (this.selectedFile) {
            const sizeInKB = (this.selectedFile.size / 1024).toFixed(2);
            return `${sizeInKB} KB`;
        }
        return '';
    }
}
