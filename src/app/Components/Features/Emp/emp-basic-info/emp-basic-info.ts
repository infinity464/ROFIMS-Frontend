import { Component, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { FileUpload } from 'primeng/fileupload';
import { Select } from 'primeng/select';
import { DatePicker } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { Button, ButtonModule } from 'primeng/button';
import { CommonCodeModel } from '@/models/common-code-model';
import { EmpService } from '@/services/emp-service';
import { MotherOrganizationModel } from '@/models/mother-org-model';
import { CommonCodeService } from '@/services/common-code-service';
import { DropdownOption } from '@/models/drop-down-options';
import { MessageService } from 'primeng/api';
import { Fluid } from 'primeng/fluid';
import { Checkbox } from 'primeng/checkbox';
import { AddressData, AddressFormConfig, AddressFormComponent } from '../../EmployeeInfo/address-form/address-form';

@Component({
    selector: 'app-emp-basic-info',
    imports: [FileUpload, Fluid, Button, ButtonModule, Select, DatePicker, ReactiveFormsModule, FormsModule, InputTextModule, AddressFormComponent, Checkbox],
    templateUrl: './emp-basic-info.html',
    styleUrl: './emp-basic-info.scss'
})
export class EmpBasicInfo {
    @ViewChild('fileUpload') fileUpload!: FileUpload;







    employeeId = 0; // Will be set after save
    generatedEmployeeId: number | null = null;

  // Store addresses
  presentAddress?: AddressData;
  permanentAddress?: AddressData;
  wifePermanentAddress?: AddressData;
  wifePresentAddress?: AddressData;

  // Store generated AddressIds
  permanentAddressId?: number;
  presentAddressId?: number;
  wifePermanentAddressId?: number;
  wifePresentAddressId?: number;

  // Permanent address config (first)
  permanentAddressConfig: AddressFormConfig = {
    title: 'Permanent Address',
    addressType: 'permanent',
    employeeId: this.employeeId
  };

  // Present address config (second, with "Same as Permanent" option)
  presentAddressConfig: AddressFormConfig = {
    title: 'Present Address',
    addressType: 'present',
    showSameAsPresent: true,
    employeeId: this.employeeId
  };

  // Wife Permanent address config
  wifePermanentAddressConfig: AddressFormConfig = {
    title: 'Wife Permanent Address',
    addressType: 'wife',
    employeeId: this.employeeId
  };

  // Wife Present address config (with "Same as Wife Permanent" option)
  wifePresentAddressConfig: AddressFormConfig = {
    title: 'Wife Present Address',
    addressType: 'wife',
    showSameAsPresent: true,
    employeeId: this.employeeId
  };

  // Service ID validation
  isServiceIdDuplicate: boolean = false;
  isCheckingServiceId: boolean = false;

  checkServiceIdDuplicate(serviceId: string): void {
    if (!serviceId || serviceId.trim() === '') {
      this.isServiceIdDuplicate = false;
      return;
    }

    this.isCheckingServiceId = true;
    this.empService.searchEmployees({ serviceId: serviceId }).subscribe({
      next: (res) => {
        // If any employee found with same serviceId, it's a duplicate
        this.isServiceIdDuplicate = res && res.length > 0;
        this.isCheckingServiceId = false;

        if (this.isServiceIdDuplicate) {
          this.messageService.add({
            severity: 'warn',
            summary: 'Duplicate Service ID',
            detail: 'This Service ID already exists in the system'
          });
        }
      },
      error: (err) => {
        console.error('Error checking service ID', err);
        this.isCheckingServiceId = false;
      }
    });
  }

  // Reliever section
  isReliever: boolean = false;
  existingEmployees: any[] = [];
  selectedRelieverEmployeeId: number | null = null;
  selectedRelieverEmployee: any = null;

  onRelieverCheckChange(checked: boolean): void {
    this.isReliever = checked;
    if (checked && this.existingEmployees.length === 0) {
      this.loadExistingEmployees();
    }
    if (!checked) {
      this.selectedRelieverEmployeeId = null;
      this.selectedRelieverEmployee = null;
    }
  }

  loadExistingEmployees(): void {
    this.empService.getAll().subscribe({
      next: (res) => {
        this.existingEmployees = res;
      },
      error: (err) => {
        console.error('Failed to load employees', err);
      }
    });
  }

  onRelieverEmployeeSelect(employeeId: number): void {
    this.selectedRelieverEmployeeId = employeeId;
    this.selectedRelieverEmployee = this.existingEmployees.find(e => e.employeeID === employeeId);
  }

  updateRelieverId(): void {
    if (!this.generatedEmployeeId) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Please save employee first'
      });
      return;
    }

    if (!this.selectedRelieverEmployeeId) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Please select a reliever employee'
      });
      return;
    }

    const payload = {
      relieverId: this.selectedRelieverEmployeeId
    };

    this.empService.updateEmployee(this.generatedEmployeeId, payload).subscribe({
      next: (res) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Reliever information updated successfully'
        });
      },
      error: (err) => {
        console.error('Failed to update reliever', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to update reliever information'
        });
      }
    });
  }

  // Save handlers
  savePresentAddress(data: AddressData) {
    if (!this.generatedEmployeeId) {
        this.messageService.add({
            severity: 'warn',
            summary: 'Warning',
            detail: 'Please save employee first'
        });
        return;
    }

    const addressPayload = {
        EmployeeID: this.generatedEmployeeId,
        AddressId: 0,  // Auto-generated
        FMID: 0,
        LocationType: 'PRESENT',
        LocationCode: `${data.division}-${data.district}-${data.upazila}`,
        PostCode: data.postOffice?.toString() || '',
        AddressAreaEN: data.villageEnglish || '',
        AddressAreaBN: data.villageBangla || '',
        DivisionType: data.division,
        ThanType: data.upazila,
        PostOfficeType: data.postOffice,
        CreatedBy: 'system',
        CreatedDate: new Date().toISOString(),
        LastUpdatedBy: 'system',
        Lastupdate: new Date().toISOString()
    };

    this.empService.saveAddress(addressPayload).subscribe({
        next: (res) => {
            this.presentAddress = data;
            // Capture generated AddressId
            const addressId = res?.data?.addressId || res?.Data?.AddressId || res?.addressId;
            if (addressId) this.presentAddressId = addressId;
            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'Present address saved successfully'
            });
        },
        error: (err) => {
            console.error('Error saving address', err);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Failed to save address'
            });
        }
    });
  }

  savePermanentAddress(data: AddressData) {
    if (!this.generatedEmployeeId) {
        this.messageService.add({
            severity: 'warn',
            summary: 'Warning',
            detail: 'Please save employee first'
        });
        return;
    }

    const addressPayload = {
        EmployeeID: this.generatedEmployeeId,
        AddressId: 0,  // Auto-generated
        FMID: 0,
        LocationType: 'PERMANENT',
        LocationCode: `${data.division}-${data.district}-${data.upazila}`,
        PostCode: data.postOffice?.toString() || '',
        AddressAreaEN: data.villageEnglish || '',
        AddressAreaBN: data.villageBangla || '',
        DivisionType: data.division,
        ThanType: data.upazila,
        PostOfficeType: data.postOffice,
        CreatedBy: 'system',
        CreatedDate: new Date().toISOString(),
        LastUpdatedBy: 'system',
        Lastupdate: new Date().toISOString()
    };

    this.empService.saveAddress(addressPayload).subscribe({
        next: (res) => {
            this.permanentAddress = data;
            // Capture generated AddressId
            const addressId = res?.data?.addressId || res?.Data?.AddressId || res?.addressId;
            if (addressId) this.permanentAddressId = addressId;
            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'Permanent address saved successfully'
            });
        },
        error: (err) => {
            console.error('Error saving address', err);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Failed to save address'
            });
        }
    });
  }

  // Wife Permanent Address save handler
  saveWifePermanentAddress(data: AddressData) {
    if (!this.generatedEmployeeId) {
        this.messageService.add({
            severity: 'warn',
            summary: 'Warning',
            detail: 'Please save employee first'
        });
        return;
    }

    const addressPayload = {
        EmployeeID: this.generatedEmployeeId,
        AddressId: 0,
        FMID: 0,
        LocationType: 'WIFE_PERMANENT',
        LocationCode: `${data.division}-${data.district}-${data.upazila}`,
        PostCode: data.postOffice?.toString() || '',
        AddressAreaEN: data.villageEnglish || '',
        AddressAreaBN: data.villageBangla || '',
        DivisionType: data.division,
        ThanType: data.upazila,
        PostOfficeType: data.postOffice,
        CreatedBy: 'system',
        CreatedDate: new Date().toISOString(),
        LastUpdatedBy: 'system',
        Lastupdate: new Date().toISOString()
    };

    this.empService.saveAddress(addressPayload).subscribe({
        next: (res) => {
            this.wifePermanentAddress = data;
            // Capture generated AddressId
            const addressId = res?.data?.addressId || res?.Data?.AddressId || res?.addressId;
            if (addressId) this.wifePermanentAddressId = addressId;
            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'Wife permanent address saved successfully'
            });
        },
        error: (err) => {
            console.error('Error saving address', err);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Failed to save address'
            });
        }
    });
  }

  // Wife Present Address save handler
  saveWifePresentAddress(data: AddressData) {
    if (!this.generatedEmployeeId) {
        this.messageService.add({
            severity: 'warn',
            summary: 'Warning',
            detail: 'Please save employee first'
        });
        return;
    }

    const addressPayload = {
        EmployeeID: this.generatedEmployeeId,
        AddressId: 0,
        FMID: 0,
        LocationType: 'WIFE_PRESENT',
        LocationCode: `${data.division}-${data.district}-${data.upazila}`,
        PostCode: data.postOffice?.toString() || '',
        AddressAreaEN: data.villageEnglish || '',
        AddressAreaBN: data.villageBangla || '',
        DivisionType: data.division,
        ThanType: data.upazila,
        PostOfficeType: data.postOffice,
        CreatedBy: 'system',
        CreatedDate: new Date().toISOString(),
        LastUpdatedBy: 'system',
        Lastupdate: new Date().toISOString()
    };

    this.empService.saveAddress(addressPayload).subscribe({
        next: (res) => {
            this.wifePresentAddress = data;
            // Capture generated AddressId
            const addressId = res?.data?.addressId || res?.Data?.AddressId || res?.addressId;
            if (addressId) this.wifePresentAddressId = addressId;
            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'Wife present address saved successfully'
            });
        },
        error: (err) => {
            console.error('Error saving address', err);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Failed to save address'
            });
        }
    });
  }

  cancelAddress() {
    console.log('Address editing cancelled');
  }



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
            postingStatus: [''],
            status: [true],
            createdBy: ['system'],
            createdDate: [new Date()],
            lastUpdatedBy: ['system'],
            lastupdate: [new Date()],
            statusDate: [new Date()],
            lastMotherUnitLocation: [''],
            motherOrganization: [''],
            officerType: [''],
            orgId: [null]
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
        // Set orgId in form
        this.postingForm.patchValue({ orgId: orgId });

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

                    // Get generated EmployeeID from response
                    const employeeId = res?.data?.employeeID || res?.Data?.EmployeeID;

                    if (employeeId) {
                        this.generatedEmployeeId = employeeId;
                        // Update address config with new EmployeeID
                        this.presentAddressConfig.employeeId = employeeId;
                        this.permanentAddressConfig.employeeId = employeeId;
                        this.wifePermanentAddressConfig.employeeId = employeeId;
                        this.wifePresentAddressConfig.employeeId = employeeId;
                    }

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
