import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FileUpload } from 'primeng/fileupload';
import { Select } from 'primeng/select';
import { DatePicker } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { Button, ButtonModule } from 'primeng/button';
import { CommonCodeModel } from '@/models/common-code-model';
import { EmpService } from '@/services/emp-service';
import { MotherOrganizationModel } from '@/models/mother-org-model';
import { CommonCodeService } from '@/services/common-code-service';
import { MessageService } from 'primeng/api';
import { Fluid } from 'primeng/fluid';
import { Checkbox } from 'primeng/checkbox';
import { Dialog } from 'primeng/dialog';
import { AddressData, AddressFormConfig, AddressFormComponent } from '../../EmployeeInfo/address-form/address-form';
import { forkJoin } from 'rxjs';
import { LocationType, PostingStatus } from '@/models/enums';
import { EmpPresentMemberCheckComponent } from '../emp-present-member-check/emp-present-member-check.component';

@Component({
    selector: 'app-emp-basic-info',
    imports: [FileUpload, Fluid, Button, ButtonModule, Select, DatePicker, ReactiveFormsModule, FormsModule, InputTextModule, AddressFormComponent, Checkbox, Dialog, EmpPresentMemberCheckComponent],
    templateUrl: './emp-basic-info.html',
    styleUrl: './emp-basic-info.scss'
})
export class EmpBasicInfo implements OnInit {
    @ViewChild('fileUpload') fileUpload!: FileUpload;
    @ViewChild('permanentAddressForm') permanentAddressForm!: AddressFormComponent;
    @ViewChild('presentAddressForm') presentAddressForm!: AddressFormComponent;
    @ViewChild('wifePermanentAddressForm') wifePermanentAddressForm!: AddressFormComponent;
    @ViewChild('wifePresentAddressForm') wifePresentAddressForm!: AddressFormComponent;

    // View/Edit mode
    isViewMode: boolean = false;
    isEditMode: boolean = false;
    pageTitle: string = 'New Posting Entry Form';

    /** When false, the entry form is hidden until search returns "employee not found". When true (or when opening with id in route), form is shown. */
    showEntryForm: boolean = false;

    // Image preview modal
    showImagePreviewModal: boolean = false;
    selectedFileName: string = '';

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
        addressType: 'wifePresent',
        showSameAsPresent: true,
        sameAsLabel: 'Same as Wife Permanent Address',
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
        this.selectedRelieverEmployee = this.existingEmployees.find((e) => e.employeeID === employeeId);
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
            AddressId: 0,
            FMID: 0,
            LocationType: LocationType.Present,
            LocationCode: `${data.division}-${data.district}-${data.upazila}`,
            PostCode: data.postCode || '',
            AddressAreaEN: data.villageEnglish || '',
            AddressAreaBN: data.villageBangla || '',
            DivisionType: data.division,
            DistrictType: data.district,
            ThanType: data.upazila,
            PostOfficeType: data.postOffice,
            HouseRoad: data.houseRoad || '',
            Active: true, // New addresses are active by default
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
            AddressId: 0,
            FMID: 0,
            LocationType: LocationType.Permanent,
            LocationCode: `${data.division}-${data.district}-${data.upazila}`,
            PostCode: data.postCode || '',
            AddressAreaEN: data.villageEnglish || '',
            AddressAreaBN: data.villageBangla || '',
            DivisionType: data.division,
            DistrictType: data.district,
            ThanType: data.upazila,
            PostOfficeType: data.postOffice,
            HouseRoad: data.houseRoad || '',
            Active: true, // New addresses are active by default
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
            LocationType: LocationType.WifePermanent,
            LocationCode: `${data.division}-${data.district}-${data.upazila}`,
            PostCode: data.postCode || '',
            AddressAreaEN: data.villageEnglish || '',
            AddressAreaBN: data.villageBangla || '',
            DivisionType: data.division,
            DistrictType: data.district,
            ThanType: data.upazila,
            PostOfficeType: data.postOffice,
            HouseRoad: data.houseRoad || '',
            Active: true, // New addresses are active by default
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
            LocationType: LocationType.WifePresent,
            LocationCode: `${data.division}-${data.district}-${data.upazila}`,
            PostCode: data.postCode || '',
            AddressAreaEN: data.villageEnglish || '',
            AddressAreaBN: data.villageBangla || '',
            DivisionType: data.division,
            DistrictType: data.district,
            ThanType: data.upazila,
            PostOfficeType: data.postOffice,
            HouseRoad: data.houseRoad || '',
            Active: true, // New addresses are active by default
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

    // Copy permanent address data to present address form
    copyPermanentToPresent(): void {
        const permanentData = this.permanentAddressForm?.getFormData();
        if (permanentData?.data) {
            this.presentAddressForm?.populateFromSourceAddress(permanentData.data);
        }
    }

    // Copy wife permanent address data to wife present address form
    copyWifePermanentToWifePresent(): void {
        const wifePermanentData = this.wifePermanentAddressForm?.getFormData();
        if (wifePermanentData?.data) {
            this.wifePresentAddressForm?.populateFromSourceAddress(wifePermanentData.data);
        }
    }

    // Save All - Employee + All Addresses
    saveAll(): void {
        // Validate employee form first
        if (this.postingForm.invalid) {
            Object.keys(this.postingForm.controls).forEach((key) => {
                this.postingForm.get(key)?.markAsTouched();
            });
            this.messageService.add({
                severity: 'warn',
                summary: 'Validation Error',
                detail: 'Please fill all required employee fields'
            });
            return;
        }

        // Check for duplicate service ID
        if (this.isServiceIdDuplicate) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Duplicate Service ID',
                detail: 'Please use a unique Service ID'
            });
            return;
        }

        // Get form data from all address forms
        const permanentData = this.permanentAddressForm?.getFormData();
        const presentData = this.presentAddressForm?.getFormData();
        const wifePermanentData = this.wifePermanentAddressForm?.getFormData();
        const wifePresentData = this.wifePresentAddressForm?.getFormData();

        // Only validate required addresses (permanent and present)
        // Wife addresses are optional
        const requiredAddressesValid = permanentData?.valid && presentData?.valid;

        if (!requiredAddressesValid) {
            this.permanentAddressForm?.markAsTouched();
            this.presentAddressForm?.markAsTouched();

            this.messageService.add({
                severity: 'warn',
                summary: 'Validation Error',
                detail: 'Please fill all required address fields (Permanent and Present)'
            });
            return;
        }

        // Step 1: Save or Update Employee
        const formValue = this.postingForm.getRawValue();
        const formattedData = {
            ...formValue,
            employeeID: this.generatedEmployeeId || 0,
            joiningDate: this.formatDate(formValue.joiningDate),
            // Set PostingStatus to Supernumerary by default for new employees
            postingStatus: formValue.postingStatus || PostingStatus.Supernumerary,
            // Include isReliever boolean and relieverId
            isReliever: this.isReliever,
            relieverId: this.isReliever && this.selectedRelieverEmployeeId ? this.selectedRelieverEmployeeId : null
        };

        // Determine whether to save or update
        const employeeRequest = this.isEditMode ? this.empService.updateEmployee(formattedData) : this.empService.saveEmployee(formattedData);

        employeeRequest.subscribe({
            next: (res) => {
                // For new employee, get ID from response; for update, use existing ID
                const employeeId = this.isEditMode ? this.generatedEmployeeId : res?.data?.employeeID || res?.Data?.EmployeeID;

                if (employeeId) {
                    this.generatedEmployeeId = employeeId;
                    this.presentAddressConfig.employeeId = employeeId;
                    this.permanentAddressConfig.employeeId = employeeId;
                    this.wifePermanentAddressConfig.employeeId = employeeId;
                    this.wifePresentAddressConfig.employeeId = employeeId;

                    // Step 2: Save or Update addresses (only those with data)
                    this.saveAllAddressesInternal(permanentData!.data, presentData!.data, this.wifePermanentAddressForm?.hasData() ? wifePermanentData!.data : null, this.wifePresentAddressForm?.hasData() ? wifePresentData!.data : null);
                } else {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to get Employee ID from response'
                    });
                }
            },
            error: (err) => {
                console.error('Error saving/updating employee', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: this.isEditMode ? 'Failed to update employee' : 'Failed to save employee'
                });
            }
        });
    }

    // Internal method to save or update all addresses
    private saveAllAddressesInternal(permanent: AddressData, present: AddressData, wifePermanent: AddressData | null, wifePresent: AddressData | null): void {
        const buildPayload = (data: AddressData, locationType: string, existingAddressId?: number) => {
            const payload: any = {
                EmployeeID: this.generatedEmployeeId,
                AddressId: existingAddressId || 0,
                FMID: 0,
                LocationType: locationType,
                LocationCode: `${data.division}-${data.district}-${data.upazila}`,
                PostCode: data.postCode || '',
                AddressAreaEN: data.villageEnglish || '',
                AddressAreaBN: data.villageBangla || '',
                DivisionType: data.division,
                DistrictType: data.district,
                ThanType: data.upazila,
                PostOfficeType: data.postOffice,
                HouseRoad: data.houseRoad || '',
                Active: true, // New addresses are active by default
                CreatedBy: 'system',
                CreatedDate: new Date().toISOString(),
                LastUpdatedBy: 'system',
                Lastupdate: new Date().toISOString()
            };
            console.log('Address payload:', payload);
            return payload;
        };

        // For edit mode, use update if addressId exists; otherwise save
        const getAddressRequest = (data: AddressData, locationType: string, existingAddressId?: number) => {
            const payload = buildPayload(data, locationType, existingAddressId);
            return this.isEditMode && existingAddressId ? this.empService.updateAddress(payload) : this.empService.saveAddress(payload);
        };

        // Build save requests - only include addresses that have data
        const saveRequests: { [key: string]: any } = {
            permanent: getAddressRequest(permanent, LocationType.Permanent, this.permanentAddressId),
            present: getAddressRequest(present, LocationType.Present, this.presentAddressId)
        };

        // Add wife addresses only if they have data
        if (wifePermanent) {
            saveRequests['wifePermanent'] = getAddressRequest(wifePermanent, LocationType.WifePermanent, this.wifePermanentAddressId);
        }
        if (wifePresent) {
            saveRequests['wifePresent'] = getAddressRequest(wifePresent, LocationType.WifePresent, this.wifePresentAddressId);
        }

        forkJoin(saveRequests).subscribe({
            next: (results: any) => {
                this.permanentAddress = permanent;
                this.presentAddress = present;
                if (wifePermanent) this.wifePermanentAddress = wifePermanent;
                if (wifePresent) this.wifePresentAddress = wifePresent;

                // Only update addressIds for NEW addresses (not when updating existing ones)
                const getAddressId = (res: any) => res?.data?.addressId || res?.Data?.AddressId || res?.addressId;
                if (!this.permanentAddressId && results.permanent) this.permanentAddressId = getAddressId(results.permanent);
                if (!this.presentAddressId && results.present) this.presentAddressId = getAddressId(results.present);
                if (!this.wifePermanentAddressId && results.wifePermanent) this.wifePermanentAddressId = getAddressId(results.wifePermanent);
                if (!this.wifePresentAddressId && results.wifePresent) this.wifePresentAddressId = getAddressId(results.wifePresent);

                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: this.isEditMode ? 'Employee and addresses updated successfully!' : 'Employee and addresses saved successfully!'
                });
            },
            error: (err: any) => {
                console.error('Error saving/updating addresses', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: this.isEditMode ? 'Employee updated but failed to update one or more addresses' : 'Employee saved but failed to save one or more addresses'
                });
            }
        });
    }

    postingForm!: FormGroup;
    imagePreview: string | null = null;
    selectedFile: File | null = null;

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
        private messageService: MessageService,
        private route: ActivatedRoute,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.initializeForm();
        this.loadMotherOrg();
        this.loadMemberType();
        this.loadAppointment();
        this.loadGender();

        // Check for query params (view/edit mode)
        this.route.queryParams.subscribe((params) => {
            const employeeId = params['id'];
            const mode = params['mode'];

            if (employeeId) {
                this.generatedEmployeeId = +employeeId;
                this.showEntryForm = true; // Edit/View: always show form

                if (mode === 'edit') {
                    this.isEditMode = true;
                    this.isViewMode = false;
                    this.pageTitle = 'Edit Employee';
                } else {
                    this.isViewMode = true;
                    this.isEditMode = false;
                    this.pageTitle = 'View Employee Details';
                }

                // Load employee data
                this.loadEmployeeData(+employeeId);
            }
        });
    }

    // Load employee data for view/edit mode
    loadEmployeeData(employeeId: number): void {
        // Load employee basic info
        this.empService.getEmployeeById(employeeId).subscribe({
            next: (employee: any) => {
                // Populate form with employee data
                this.postingForm.patchValue({
                    employeeID: employee.employeeID,
                    motherOrganization: employee.orgId,
                    lastMotherUnit: employee.lastMotherUnit,
                    memberType: employee.memberType,
                    appointment: employee.appointment,
                    joiningDate: employee.joiningDate ? new Date(employee.joiningDate) : null,
                    rank: employee.rank,
                    branch: employee.branch,
                    trade: employee.trade,
                    tradeMark: employee.tradeMark,
                    gender: employee.gender,
                    prefix: employee.prefix,
                    serviceId: employee.serviceId,
                    rabid: employee.rabid,
                    nid: employee.nid,
                    fullNameEN: employee.fullNameEN,
                    fullNameBN: employee.fullNameBN,
                    postingStatus: employee.postingStatus,
                    status: employee.status,
                    officerType: employee.officerType,
                    orgId: employee.orgId
                });

                // Load dependent dropdowns based on employee data
                if (employee.orgId) {
                    this.loadMotherOrgUnits(employee.orgId);
                    this.loadMotherOrgRank(employee.orgId);
                    this.loadMotherOrgCorps(employee.orgId);
                    this.loadMotherOrgPrefix(employee.orgId);
                }
                if (employee.memberType) {
                    this.loadOfficerType(employee.memberType);
                }
                if (employee.branch) {
                    this.loadTrade(employee.branch);
                }

                // Check reliever
                if (employee.relieverId) {
                    this.isReliever = true;
                    this.selectedRelieverEmployeeId = employee.relieverId;
                    this.loadExistingEmployees();
                }

                // Disable form in view mode
                if (this.isViewMode) {
                    this.disableForm();
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

        // Load addresses by employee ID
        this.empService.getAddressesByEmployeeId(employeeId).subscribe({
            next: (addresses: any[]) => {
                console.log('Loaded addresses:', addresses);

                addresses.forEach((addr) => {
                    // Handle both camelCase and PascalCase property names
                    const locationCode = addr.locationCode || addr.LocationCode || '';
                    const locationType = addr.locationType || addr.LocationType || '';
                    const addressId = addr.addressId || addr.AddressId;
                    const empId = addr.employeeID || addr.EmployeeID;
                    const divisionType = addr.divisionType || addr.DivisionType;
                    const thanType = addr.thanType || addr.ThanType;
                    const postOfficeType = addr.postOfficeType || addr.PostOfficeType;
                    const postCode = addr.postCode || addr.PostCode || '';
                    const addressAreaEN = addr.addressAreaEN || addr.AddressAreaEN || '';
                    const addressAreaBN = addr.addressAreaBN || addr.AddressAreaBN || '';
                    const houseRoad = addr.houseRoad || addr.HouseRoad || '';

                    // Parse locationCode to extract district (format: division-district-upazila)
                    let districtValue: number | null = null;
                    if (locationCode) {
                        const parts = locationCode.split('-');
                        if (parts.length >= 2) {
                            districtValue = parseInt(parts[1], 10) || null;
                        }
                    }

                    const addressData: AddressData = {
                        employeeId: empId,
                        division: divisionType,
                        district: districtValue,
                        upazila: thanType,
                        postOffice: postOfficeType,
                        postCode: postCode,
                        villageEnglish: addressAreaEN,
                        villageBangla: addressAreaBN,
                        houseRoad: houseRoad
                    };

                    // Set address data based on location type using enum values
                    // Normalize for case-insensitive comparison
                    const normalizedType = locationType.toLowerCase();

                    if (normalizedType === LocationType.Permanent.toLowerCase()) {
                        this.permanentAddress = addressData;
                        this.permanentAddressId = addressId;
                    } else if (normalizedType === LocationType.Present.toLowerCase()) {
                        this.presentAddress = addressData;
                        this.presentAddressId = addressId;
                    } else if (normalizedType === LocationType.WifePermanent.toLowerCase()) {
                        this.wifePermanentAddress = addressData;
                        this.wifePermanentAddressId = addressId;
                    } else if (normalizedType === LocationType.WifePresent.toLowerCase()) {
                        this.wifePresentAddress = addressData;
                        this.wifePresentAddressId = addressId;
                    }

                    console.log(`Address loaded - Type: ${locationType}, AddressId: ${addressId}`);
                });
            },
            error: (err) => {
                console.error('Failed to load addresses', err);
            }
        });
    }

    // Disable form for view mode
    disableForm(): void {
        this.postingForm.disable();
    }

    // Enable form for edit mode
    enableForm(): void {
        this.postingForm.enable();
        // Keep rabid disabled as it's always readonly
        this.postingForm.get('rabid')?.disable();
    }

    // Go back to list
    goBackToList(): void {
        this.router.navigate(['/emp-list']);
    }

    // Switch to edit mode
    switchToEditMode(): void {
        this.isViewMode = false;
        this.isEditMode = true;
        this.pageTitle = 'Edit Employee';
        this.enableForm();

        // Update URL without reloading
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { id: this.generatedEmployeeId, mode: 'edit' },
            queryParamsHandling: 'merge'
        });
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
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Please upload a valid image file (JPG, PNG, GIF)'
                });
                this.fileUpload.clear();
                return;
            }

            // Validate file size (5MB max)
            if (file.size > 5000000) {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'File size must be less than 5MB'
                });
                this.fileUpload.clear();
                return;
            }

            this.selectedFile = file;
            this.selectedFileName = file.name;
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
        this.selectedFileName = '';
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
                joiningDate: this.formatDate(formValue.joiningDate),
                // Set PostingStatus to Supernumerary by default
                postingStatus: formValue.postingStatus || PostingStatus.Supernumerary
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
        this.selectedFileName = '';

        if (this.fileUpload) {
            this.fileUpload.clear();
        }
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
}
