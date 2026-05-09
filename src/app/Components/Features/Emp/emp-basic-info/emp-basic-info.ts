import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FileUpload } from 'primeng/fileupload';
import { Select } from 'primeng/select';
import { DatePicker } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { Button, ButtonModule } from 'primeng/button';
import { CommonCodeModel } from '@/models/common-code-model';
import { EmpService } from '@/services/emp-service';
import { FamilyInfoService } from '@/services/family-info-service';
import { MotherOrganizationModel } from '@/models/mother-org-model';
import { CommonCodeService } from '@/services/common-code-service';
import { MessageService } from 'primeng/api';
import { Fluid } from 'primeng/fluid';
import { Checkbox } from 'primeng/checkbox';
import { Dialog } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { AddressData, AddressFormConfig, AddressFormComponent } from '../../EmployeeInfo/address-form/address-form';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, map, switchMap, tap } from 'rxjs/operators';
import { LocationType, PostingStatus } from '@/models/enums';
import { EmpPresentMemberCheckComponent } from '../emp-present-member-check/emp-present-member-check.component';
import { FileReferencesFormComponent } from '@components/Common/file-references-form/file-references-form';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { EquivalentRankModel } from '@/Components/basic-setup/shared/models/equivalent-rank';
import { SharedService } from '@/shared/services/shared-service';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { PermanentPostingJoineeDetailService, PermanentPostingJoineeDetailModel } from '@/services/permanent-posting-joinee-detail.service';
@Component({
    selector: 'app-emp-basic-info',
    imports: [FileUpload, Fluid, Button, ButtonModule, Select, MultiSelectModule, DatePicker, ReactiveFormsModule, FormsModule, InputTextModule, AddressFormComponent, Checkbox, Dialog, TooltipModule, EmpPresentMemberCheckComponent, FileReferencesFormComponent, FlexibleDateDirective, RouterLink],
    templateUrl: './emp-basic-info.html',
    styleUrl: './emp-basic-info.scss',
    standalone: true
})
export class EmpBasicInfo implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    @ViewChild('fileUpload') fileUpload!: FileUpload;
    @ViewChild(EmpPresentMemberCheckComponent) presentMemberCheck?: EmpPresentMemberCheckComponent;
    @ViewChild('fileReferencesForm') fileReferencesForm!: any; // FileReferencesFormComponent
    @ViewChild('permanentAddressForm') permanentAddressForm!: AddressFormComponent;
    @ViewChild('presentAddressForm') presentAddressForm!: AddressFormComponent;
    @ViewChild('spousePermanentAddressForm') spousePermanentAddressForm!: AddressFormComponent;
    @ViewChild('spousePresentAddressForm') spousePresentAddressForm!: AddressFormComponent;

    // View/Edit mode
    isViewMode: boolean = false;
    isEditMode: boolean = false;
    pageTitle: string = 'New Posting Entry Form';

    /** When false, the entry form is hidden until search returns "employee not found". When true (or when opening with id in route), form is shown. */
    showEntryForm: boolean = false;
    /** Hide search section when opened via query params (view/edit from another tab). */
    hideSearchSection: boolean = false;

    /** Called when emp-present-member-check emits employeeNotFound with motherOrgId + serviceId. */
    onEmployeeNotFound(data: { motherOrgId: number | null; serviceId: string }): void {
        this.showEntryForm = true;
        // Set motherOrganization first so dependent dropdowns load
        if (data.motherOrgId) {
            this.postingForm.patchValue({ motherOrganization: data.motherOrgId, orgId: data.motherOrgId });
            this.onMotherOrgChange(data.motherOrgId);
        }
        if (data.serviceId) {
            setTimeout(() => {
                this.postingForm.patchValue({ serviceId: data.serviceId });
                this.checkJoineeDetail(data.serviceId);
            }, 100);
        }
    }

    // Image preview modal
    showImagePreviewModal: boolean = false;
    selectedFileName: string = '';

    employeeId = 0; // Will be set after save
    generatedEmployeeId: number | null = null;

    // Store addresses
    presentAddress?: AddressData;
    permanentAddress?: AddressData;
    spousePermanentAddress?: AddressData;
    spousePresentAddress?: AddressData;

    // Store generated AddressIds
    permanentAddressId?: number;
    presentAddressId?: number;
    spousePermanentAddressId?: number;
    spousePresentAddressId?: number;

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

    // Spouse Permanent address config
    spousePermanentAddressConfig: AddressFormConfig = {
        title: 'Spouse Permanent Address',
        addressType: 'spouse',
        employeeId: this.employeeId
    };

    // Spouse Present address config (with "Same as Spouse Permanent" option)
    spousePresentAddressConfig: AddressFormConfig = {
        title: 'Spouse Present Address',
        addressType: 'spousePresent',
        showSameAsPresent: true,
        sameAsLabel: 'Same as Spouse Permanent Address',
        employeeId: this.employeeId
    };

    // New Joining Person: found in PermanentPostingJoineeDetail
    joineeRecord: PermanentPostingJoineeDetailModel | null = null;
    isCheckingJoinee: boolean = false;

    // Duplicate check on (Mother Organization + Prefix + Service ID)
    isDuplicateCombo: boolean = false;
    isCheckingCombo: boolean = false;

    checkDuplicateCombo(): void {
        const motherOrg = this.postingForm?.get('motherOrganization')?.value;
        const prefix = this.postingForm?.get('prefix')?.value;
        const serviceId = this.postingForm?.get('serviceId')?.value;

        const motherOrgNum = Number(motherOrg);
        const prefixNum = Number(prefix);
        const serviceIdStr = serviceId != null ? String(serviceId).trim() : '';

        if (!motherOrgNum || !prefixNum || !serviceIdStr) {
            this.isDuplicateCombo = false;
            this.isCheckingCombo = false;
            return;
        }

        this.isCheckingCombo = true;
        const selfId = this.generatedEmployeeId != null ? Number(this.generatedEmployeeId) : null;
        this.empService
            .searchListByRabIdOrServiceId(undefined, serviceIdStr, undefined, motherOrgNum, undefined, prefixNum, selfId)
            .subscribe({
                next: (employees) => {
                    this.isDuplicateCombo = (employees ?? []).length > 0;
                    this.isCheckingCombo = false;

                    if (this.isDuplicateCombo) {
                        this.messageService.add({
                            severity: 'warn',
                            summary: 'Duplicate Entry',
                            detail: 'A member with the same Mother Organization + Prefix + Service ID already exists'
                        });
                    }
                },
                error: (err) => {
                    console.error('Error checking duplicate combination', err);
                    this.isCheckingCombo = false;
                }
            });
    }

    checkJoineeDetail(serviceId: string): void {
        const sid = serviceId?.trim();
        if (!sid) { this.joineeRecord = null; return; }

        this.isCheckingJoinee = true;
        this.joineeDetailService.getPendingByServiceId(sid).subscribe({
            next: (record) => {
                this.isCheckingJoinee = false;
                if (record) {
                    this.joineeRecord = record;
                    this.loadAndPatchJoineeData(record);
                    this.messageService.add({
                        severity: 'info',
                        summary: 'নতুন জয়নি তথ্য লোড হয়েছে',
                        detail: 'এই সদস্য "New Joining Person" তালিকায় রয়েছে। তথ্য স্বয়ংক্রিয়ভাবে লোড করা হয়েছে।',
                        life: 6000
                    });
                } else {
                    this.joineeRecord = null;
                }
            },
            error: (err: any) => { this.isCheckingJoinee = false; this.joineeRecord = null; }
        });
    }

    /** Patch form with joinee data, then load dependent dropdowns (same pattern as loadEmployeeData). */
    private loadAndPatchJoineeData(record: PermanentPostingJoineeDetailModel): void {
        // Patch all values first
        this.postingForm.patchValue({
            ...(record.motherOrgId      != null && { motherOrganization: record.motherOrgId, orgId: record.motherOrgId }),
            ...(record.motherOrgUnitId  != null && { lastMotherUnit: record.motherOrgUnitId }),
            ...(record.memberType       != null && { memberType: record.memberType }),
            ...(record.prefixId         != null && { prefix: record.prefixId }),
            ...(record.rank             != null && { rank: record.rank }),
            ...(record.corps            != null && { branch: record.corps }),
            ...(record.trade            != null && { trade: record.trade }),
            ...(record.nameBangla       != null && record.nameBangla.trim() && { fullNameBN: record.nameBangla }),
        });

        // Load dependent dropdowns based on joinee data
        if (record.motherOrgId != null) {
            // Load units, then auto-fill district from selected unit
            this.commonCodeService.getAllActiveMotherOrgUnits(record.motherOrgId).subscribe({
                next: (res) => {
                    this.lastUnitOrganizations = res;
                    if (record.motherOrgUnitId != null) {
                        this.onLastUnitChange(record.motherOrgUnitId);
                    }
                }
            });
            this.loadMotherOrgRank(record.motherOrgId);
            this.loadMotherOrgCorps(record.motherOrgId);
            this.loadMotherOrgPrefix(record.motherOrgId);
            this.loadMotherOrgBatch(record.motherOrgId);
        }
        if (record.memberType != null) {
            this.loadOfficerType(record.memberType, record.motherOrgId);
        }
        if (record.corps != null) {
            this.loadTrade(record.corps);
        }
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
            ThanaType: data.upazila,
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
                    detail: err?.error?.message || 'Failed to save address'
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
            ThanaType: data.upazila,
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
                    detail: err?.error?.message || 'Failed to save address'
                });
            }
        });
    }

    // Spouse Permanent Address save handler
    saveSpousePermanentAddress(data: AddressData) {
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
            LocationType: LocationType.SpousePermanent,
            LocationCode: `${data.division}-${data.district}-${data.upazila}`,
            PostCode: data.postCode || '',
            AddressAreaEN: data.villageEnglish || '',
            AddressAreaBN: data.villageBangla || '',
            DivisionType: data.division,
            DistrictType: data.district,
            ThanaType: data.upazila,
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
                this.spousePermanentAddress = data;
                // Capture generated AddressId
                const addressId = res?.data?.addressId || res?.Data?.AddressId || res?.addressId;
                if (addressId) this.spousePermanentAddressId = addressId;
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Spouse permanent address saved successfully'
                });
            },
            error: (err) => {
                console.error('Error saving address', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to save address'
                });
            }
        });
    }

    // Spouse Present Address save handler
    saveSpousePresentAddress(data: AddressData) {
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
            LocationType: LocationType.SpousePresent,
            LocationCode: `${data.division}-${data.district}-${data.upazila}`,
            PostCode: data.postCode || '',
            AddressAreaEN: data.villageEnglish || '',
            AddressAreaBN: data.villageBangla || '',
            DivisionType: data.division,
            DistrictType: data.district,
            ThanaType: data.upazila,
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
                this.spousePresentAddress = data;
                // Capture generated AddressId
                const addressId = res?.data?.addressId || res?.Data?.AddressId || res?.addressId;
                if (addressId) this.spousePresentAddressId = addressId;
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Spouse present address saved successfully'
                });
            },
            error: (err) => {
                console.error('Error saving address', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to save address'
                });
            }
        });
    }

    cancelAddress() {
        console.log('Address editing cancelled');
    }

    onFileRowsChange(event: any): void {
        // Handle the event emitted from FileReferencesFormComponent
        if (event && Array.isArray(event)) {
            this.fileRows = event;
        }
    }

    onDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: (err) => {
                console.error('Download failed', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to download file' });
            }
        });
    }

    // Copy permanent address data to present address form
    copyPermanentToPresent(): void {
        const permanentData = this.permanentAddressForm?.getFormData();
        if (permanentData?.data) {
            this.presentAddressForm?.populateFromSourceAddress(permanentData.data);
        }
    }

    // Copy spouse permanent address data to spouse present address form
    copySpousePermanentToSpousePresent(): void {
        const spousePermanentData = this.spousePermanentAddressForm?.getFormData();
        if (spousePermanentData?.data) {
            this.spousePresentAddressForm?.populateFromSourceAddress(spousePermanentData.data);
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

        // Check for duplicate (Mother Org + Prefix + Service ID)
        if (this.isDuplicateCombo) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Duplicate Entry',
                detail: 'A member with the same Mother Organization + Prefix + Service ID already exists'
            });
            return;
        }

        // Get form data from all address forms
        const permanentData = this.permanentAddressForm?.getFormData();
        const presentData = this.presentAddressForm?.getFormData();
        const spousePermanentData = this.spousePermanentAddressForm?.getFormData();
        const spousePresentData = this.spousePresentAddressForm?.getFormData();

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

        // Step 1: Build filesReferences (existing refs + upload new files)
        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const doSave = (filesRefsJson: string | null, profileImgsJson: string | null) => {
            this.saveEmployeeWithFilesRefs(this.formattedDataForEmployee(), filesRefsJson, profileImgsJson, permanentData!, presentData!, spousePermanentData, spousePresentData);
        };

        if (filesToUpload.length > 0 || this.selectedFile) {
            const fileRefUploads = filesToUpload.map((r: any) => this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name));
            const profileUpload$ = this.selectedFile ? this.empService.uploadEmployeeFile(this.selectedFile, this.selectedFileName || this.selectedFile.name) : null;

            const allUploads = profileUpload$ ? [...fileRefUploads, profileUpload$] : fileRefUploads;

            forkJoin(allUploads).subscribe({
                next: (results: unknown) => {
                    const resultsArray = Array.isArray(results) ? results : [];
                    const filesRefResults = profileUpload$ ? resultsArray.slice(0, -1) : resultsArray;
                    const profileResult = profileUpload$ ? resultsArray[resultsArray.length - 1] : null;

                    const newRefs = (filesRefResults as any[]).map((r: any) => ({ FileId: r.fileId, fileName: r.fileName }));
                    const allRefs = [...existingRefs, ...newRefs];
                    const filesReferencesJson = allRefs.length > 0 ? JSON.stringify(allRefs) : null;

                    const profileImagesJson = profileResult ? JSON.stringify([{ FileId: (profileResult as any).fileId, fileName: (profileResult as any).fileName }]) : this.getProfileImagesJson();

                    doSave(filesReferencesJson, profileImagesJson);
                },
                error: (err) => {
                    console.error('Error uploading files', err);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.message || 'Failed to upload one or more files'
                    });
                }
            });
            return;
        }

        const filesReferencesJson = existingRefs.length > 0 ? JSON.stringify(existingRefs) : null;
        const profileImagesJson = this.getProfileImagesJson();
        doSave(filesReferencesJson, profileImagesJson);
    }

    private formattedDataForEmployee(): any {
        const formValue = this.postingForm.getRawValue();
        const specialQualsArr = Array.isArray(formValue.specialQualifications) ? formValue.specialQualifications : [];
        const specialQualsCsv = specialQualsArr.length > 0 ? specialQualsArr.join(',') : null;
        return {
            ...formValue,
            employeeID: this.generatedEmployeeId || 0,
            joiningDate: this.formatDate(formValue.joiningDate),
            postingStatus: formValue.postingStatus || PostingStatus.Supernumerary,
            isReliever: this.isReliever,
            relieverId: this.isReliever && this.selectedRelieverEmployeeId ? this.selectedRelieverEmployeeId : null,
            maritalStatus: formValue.maritalStatus ?? null,
            batch: formValue.batch ?? null,
            specialQualifications: specialQualsCsv
        };
    }

    /** Build ProfileImages JSON from existing ref (no new upload). Returns null if no profile image. */
    private getProfileImagesJson(): string | null {
        if (this.profileImageRef) {
            return JSON.stringify([{ FileId: this.profileImageRef.fileId, fileName: this.profileImageRef.fileName }]);
        }
        return null;
    }

    private saveEmployeeWithFilesRefs(
        formattedData: any,
        filesReferencesJson: string | null,
        profileImagesJson: string | null,
        permanentData: { data: AddressData },
        presentData: { data: AddressData },
        spousePermanentData: { data: AddressData } | null,
        spousePresentData: { data: AddressData } | null
    ): void {
        if (filesReferencesJson != null) {
            formattedData.filesReferences = filesReferencesJson;
        }
        if (profileImagesJson != null) {
            formattedData.profileImages = profileImagesJson;
        }

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
                    this.spousePermanentAddressConfig.employeeId = employeeId;
                    this.spousePresentAddressConfig.employeeId = employeeId;

                    // Step 1.5: If Married, save/update spouse in FamilyInfo first so we have FMID for spouse addresses
                    // Step 2: Then save addresses (spouse addresses will include spouse FMID in AddressInfo)
                    this.saveSpouseIfMarried(employeeId).pipe(
                        switchMap((spouseFmidFromApi) =>
                            of(null).pipe(
                                finalize(() =>
                                    this.saveAllAddressesInternal(
                                        permanentData.data,
                                        presentData.data,
                                        this.spousePermanentAddressForm?.hasData() && spousePermanentData ? spousePermanentData.data : null,
                                        this.spousePresentAddressForm?.hasData() && spousePresentData ? spousePresentData.data : null,
                                        spouseFmidFromApi
                                    )
                                )
                            )
                        )
                    ).subscribe();
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

    /** When Marital Status is not Unmarried, save or update spouse row in FamilyInfo. Returns Observable that emits the FMID to use for spouse addresses (from API on insert, or existing spouseFmid on update). */
    private saveSpouseIfMarried(employeeId: number): import('rxjs').Observable<number | null> {
        const formValue = this.postingForm.getRawValue();
        const maritalId = formValue.maritalStatus;
        const spouseName = (formValue.spouseName || '').trim();
        const isNotUnmarried = this.isMaritalStatusNotUnmarried;
        const hasSpouseAddress = this.spousePermanentAddressForm?.hasData() || this.spousePresentAddressForm?.hasData();
        const relationCodeId = formValue.relationship;
        const shouldSave = relationCodeId != null && (isNotUnmarried || spouseName.length > 0 || this.spouseFmid != null);
        if (!shouldSave) return of(null);

        const resolvedSpouseName = spouseName.length > 0 ? spouseName : '';

        const nowIso = new Date().toISOString();
        const payload: Record<string, unknown> = {
            EmployeeId: employeeId,
            Relation: relationCodeId,
            NameEN: resolvedSpouseName,
            NameBN: null,
            DOB: null,
            MaritalStatus: null,
            Occupation: null,
            NID: null,
            MobileNo: null,
            PassportNo: null,
            Email: null,
            CreatedDate: nowIso,
            LastUpdatedBy: 'system',
            Lastupdate: nowIso,
            StatusDate: nowIso
        };
        if (this.spouseFmid != null) {
            payload['FMID'] = this.spouseFmid;
        } else {
            payload['FMID'] = 0;
        }

        const req = this.spouseFmid ? this.familyInfoService.update(payload) : this.familyInfoService.save(payload);
        return req.pipe(
            map((res: any) => {
                // API returns ResultViewModel { Data = saved entity }; entity may use PascalCase or camelCase
                const data = res?.data ?? res?.Data;
                const fmid = data != null
                    ? (data.FMID ?? data.fmid ?? (typeof data === 'number' ? data : undefined))
                    : (res?.FMID ?? res?.fmid);
                const resolved = fmid != null && fmid !== 0 ? +fmid : (this.spouseFmid ?? null);
                if (this.spouseFmid == null && resolved != null) this.spouseFmid = resolved;
                return resolved;
            }),
            catchError((err) => {
                console.error('Error saving spouse', err);
                return of(this.spouseFmid);
            })
        );
    }

    // Internal method to save or update all addresses (spouse addresses include spouse FMID for AddressInfo)
    /** spouseFmidFromApi: FMID from spouse save response (use this for new spouse so address gets the generated FMID) */
    private saveAllAddressesInternal(permanent: AddressData, present: AddressData, spousePermanent: AddressData | null, spousePresent: AddressData | null, spouseFmidFromApi?: number | null): void {
        const buildPayload = (data: AddressData, locationType: string, existingAddressId?: number, fmid?: number) => {
            const fmidVal = fmid ?? 0;
            const payload: any = {
                EmployeeID: this.generatedEmployeeId,
                AddressId: existingAddressId || 0,
                FMID: fmidVal,
                fmid: fmidVal,
                LocationType: locationType,
                LocationCode: `${data.division}-${data.district}-${data.upazila}`,
                PostCode: data.postCode || '',
                AddressAreaEN: data.villageEnglish || '',
                AddressAreaBN: data.villageBangla || '',
                DivisionType: data.division,
                DistrictType: data.district,
                ThanaType: data.upazila,
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

        // For edit mode, use update if addressId exists; otherwise save. Wife addresses pass spouse FMID for AddressInfo.
        // Prefer FMID from API response (spouseFmidFromApi) so new spouse insert gets the generated FMID.
        const spouseFmid = (spouseFmidFromApi != null && spouseFmidFromApi !== 0 ? spouseFmidFromApi : this.spouseFmid) ?? 0;
        const getAddressRequest = (data: AddressData, locationType: string, existingAddressId?: number, fmid?: number) => {
            const payload = buildPayload(data, locationType, existingAddressId, fmid);
            return this.isEditMode && existingAddressId ? this.empService.updateAddress(payload) : this.empService.saveAddress(payload);
        };

        // Build save requests - only include addresses that have data
        const saveRequests: { [key: string]: any } = {
            permanent: getAddressRequest(permanent, LocationType.Permanent, this.permanentAddressId),
            present: getAddressRequest(present, LocationType.Present, this.presentAddressId)
        };

        // Add spouse addresses only if they have data; include spouse FMID so AddressInfo links to family member
        if (spousePermanent) {
            saveRequests['spousePermanent'] = getAddressRequest(spousePermanent, LocationType.SpousePermanent, this.spousePermanentAddressId, spouseFmid);
        }
        if (spousePresent) {
            saveRequests['spousePresent'] = getAddressRequest(spousePresent, LocationType.SpousePresent, this.spousePresentAddressId, spouseFmid);
        }

        forkJoin(saveRequests).subscribe({
            next: (results: any) => {
                this.permanentAddress = permanent;
                this.presentAddress = present;
                if (spousePermanent) this.spousePermanentAddress = spousePermanent;
                if (spousePresent) this.spousePresentAddress = spousePresent;

                // Only update addressIds for NEW addresses (not when updating existing ones)
                const getAddressId = (res: any) => res?.data?.addressId || res?.Data?.AddressId || res?.addressId;
                if (!this.permanentAddressId && results.permanent) this.permanentAddressId = getAddressId(results.permanent);
                if (!this.presentAddressId && results.present) this.presentAddressId = getAddressId(results.present);
                if (!this.spousePermanentAddressId && results.spousePermanent) this.spousePermanentAddressId = getAddressId(results.spousePermanent);
                if (!this.spousePresentAddressId && results.spousePresent) this.spousePresentAddressId = getAddressId(results.spousePresent);

                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: this.isEditMode ? 'Employee and addresses updated successfully!' : 'Employee and addresses saved successfully!'
                });

                // Mark joinee detail as added — only after full save succeeds
                if (!this.isEditMode && this.joineeRecord) {
                    this.joineeDetailService.saveUpdate({
                        ...this.joineeRecord,
                        isAddedInNewJoineeDataEntry: true
                    }).subscribe();
                }

                if (!this.isEditMode) {
                    this.resetForNewEntry();
                }
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

    // File references (for FilesReferences JSON). fileId set when loading existing refs.
    fileRows: { displayName: string; file: File | null; fileId?: number }[] = [];

    // Profile image: single item, same JSON shape as FilesReferences [{"FileId":2,"fileName":"..."}]
    profileImageRef: { fileId: number; fileName: string } | null = null;

    // Dropdown options
    motherOrganizations: MotherOrganizationModel[] = [];
    lastUnitOrganizations: MotherOrganizationModel[] = [];
    memberTypes: CommonCodeModel[] = [];
    batches: CommonCodeModel[] = [];
    specialQualificationOptions: CommonCodeModel[] = [];
    officerTypes: CommonCodeModel[] = [];
    appointments: CommonCodeModel[] = [];
    ranks: CommonCodeModel[] = [];
    corps: CommonCodeModel[] = [];
    trades: CommonCodeModel[] = [];
    genders: CommonCodeModel[] = [];
    maritalStatusOptions: CommonCodeModel[] = [];
    relationOptions: CommonCodeModel[] = [];
    /** When editing, FMID of existing spouse row in FamilyInfo (for update). */
    spouseFmid: number | null = null;
    prefixes: CommonCodeModel[] = [];
    districtOptions: { label: string; value: number }[] = [];
    rabRankEquivalentDisplay: string = '';
    rabRankDropdownOptions: { label: string; value: number }[] = [];
    selectedRabEquivalentNameId: number | null = null;
    private rankEquivalentList: Array<{ equivalentNameID: number; motherOrgRankId: number; sortOrder: number | null }> = [];
    private rankEquivalentListWithOrg: Array<{ equivalentNameID: number; motherOrgRankId: number; motherOrgId: number; sortOrder: number | null }> = [];
    private rabMotherOrgId: number | null = null;
    private motherOrgRankNameById = new Map<number, string>();

    // Add Last Unit of Mother Organization dialog (same pattern as Post Office setup)
    showLastUnitDialog: boolean = false;
    newLastUnitNameEN: string = '';
    newLastUnitNameBN: string = '';
    isSavingLastUnit: boolean = false;

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private familyInfoService: FamilyInfoService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private route: ActivatedRoute,
        private router: Router,
        private organizationService: OrganizationService,
        private masterBasicSetupService: MasterBasicSetupService,
        private sharedService: SharedService,
        private memberTypeAccess: IdentityUserMemberTypeAccessService,
        private joineeDetailService: PermanentPostingJoineeDetailService
    ) {}

    /** CodeIds of Member Types the current user is allowed to use. `null` means "not yet loaded" (fail-open). */
    private allowedMemberTypeIds: number[] | null = null;

    /** Raw ranks for the currently selected mother org (before member-type filter). */
    private allRanksForOrg: CommonCodeModel[] = [];

    /** Tracks the last employeeId we fetched, so route mode-only changes (e.g., view → edit
     * via Edit button) don't trigger a redundant refetch that would snap mode back to view. */
    private _lastLoadedEmployeeId: number | null = null;

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.initializeForm();
        this.loadCurrentUserMemberTypePermissions();

        // Real-time duplicate check on (Mother Org + Prefix + Service ID) as user fills any of the three
        ['motherOrganization', 'prefix', 'serviceId'].forEach((field) => {
            this.postingForm.get(field)?.valueChanges.pipe(
                debounceTime(500),
                distinctUntilChanged()
            ).subscribe(() => this.checkDuplicateCombo());
        });

        this.postingForm.get('rank')?.valueChanges.subscribe((rankId) => this.updateRabRankEquivalent(rankId));

        this.loadMotherOrg();
        this.loadDistricts();
        this.loadMemberType();
        this.loadSpecialQualifications();
        this.loadAppointment();
        this.loadGender();
        this.loadMaritalStatus();
        this.loadRelationshipOptions();
        this.loadRankEquivalentMappings();

        // Check for query params (view/edit mode)
        this.route.queryParams.subscribe((params) => {
            const employeeId = params['id'];
            const mode = params['mode'];

            if (employeeId) {
                const idNum = +employeeId;

                if (this._lastLoadedEmployeeId !== idNum) {
                    // First load (or new employee) — always start in view mode so the user
                    // explicitly opts into editing via the Edit button. URL's mode is ignored
                    // here intentionally; clicking Edit will navigate to mode=edit.
                    this._lastLoadedEmployeeId = idNum;
                    this.generatedEmployeeId = idNum;
                    this.showEntryForm = true;
                    this.hideSearchSection = true;
                    this.isViewMode = true;
                    this.isEditMode = false;
                    this.pageTitle = 'View Employee Details';
                    this.loadEmployeeData(idNum);
                } else {
                    // Same employee, mode-only change (e.g., Edit click) — toggle state
                    // without refetching, so the form doesn't snap back to view.
                    if (mode === 'edit') {
                        this.isEditMode = true;
                        this.isViewMode = false;
                        this.pageTitle = 'Edit Employee';
                        this.enableForm();
                    } else {
                        this.isViewMode = true;
                        this.isEditMode = false;
                        this.pageTitle = 'View Employee Details';
                        this.disableForm();
                    }
                }
            }
        });
    }

    /** Called when user clicks View Old Profile in present-member-check: show form and load ex-member data. */
    onLoadOldProfile(employeeId: number): void {
        this.showEntryForm = true;
        this.generatedEmployeeId = employeeId;
        this.isViewMode = true;
        this.isEditMode = false;
        this.pageTitle = 'View Old Profile';
        this.presentAddressConfig.employeeId = employeeId;
        this.permanentAddressConfig.employeeId = employeeId;
        this.spousePermanentAddressConfig.employeeId = employeeId;
        this.spousePresentAddressConfig.employeeId = employeeId;
        this.loadEmployeeData(employeeId);
    }

    // Load employee data for view/edit mode
    loadEmployeeData(employeeId: number): void {
        // Load employee basic info
        this.empService.getEmployeeById(employeeId).subscribe({
            next: (employee: any) => {
                // Populate form with employee data
                const specialQualsRaw = employee.specialQualifications ?? employee.SpecialQualifications ?? '';
                const specialQualIds = typeof specialQualsRaw === 'string' && specialQualsRaw.trim().length > 0
                    ? specialQualsRaw.split(',').map((s: string) => Number(s.trim())).filter((n: number) => !Number.isNaN(n))
                    : [];

                this.postingForm.patchValue({
                    employeeID: employee.employeeID,
                    motherOrganization: employee.orgId,
                    lastMotherUnit: employee.lastMotherUnit,
                    memberType: employee.memberType,
                    batch: employee.batch ?? employee.Batch ?? null,
                    appointment: employee.appointment,
                    joiningDate: employee.joiningDate ? new Date(employee.joiningDate) : null,
                    rank: employee.rank,
                    branch: employee.branch,
                    trade: employee.trade,
                    specialQualifications: specialQualIds,
                    tradeMark: employee.tradeMark,
                    gender: employee.gender,
                    maritalStatus: employee.maritalStatus ?? employee.MaritalStatus ?? null,
                    prefix: employee.prefix,
                    serviceId: employee.serviceId,
                    rabid: employee.rabid,
                    nid: employee.nid,
                    fullNameEN: employee.fullNameEN,
                    fullNameBN: employee.fullNameBN,
                    postingStatus: employee.postingStatus,
                    status: employee.status,
                    officerType: employee.officerType,
                    orgId: employee.orgId,
                    lastMotherUnitDistrictId: employee.lastMotherUnitDistrictId ?? null,
                    spouseName: employee.spouseName ?? employee.wifeName ?? ''
                });
                this.spouseFmid = null;

                // Load file references (display names from JSON; files are not re-fetched)
                const refsJson = employee.filesReferences || employee.FilesReferences;
                if (refsJson && typeof refsJson === 'string') {
                    try {
                        const refs = JSON.parse(refsJson) as { FileId?: number; fileName?: string }[];
                        if (Array.isArray(refs)) {
                            this.fileRows = refs.map((r) => ({ displayName: r.fileName || '', file: null, fileId: r.FileId }));
                        }
                    } catch {
                        this.fileRows = [];
                    }
                } else {
                    this.fileRows = [];
                }

                // Load profile image ref (single item: [{"FileId":2,"fileName":"..."}])
                const profileJson = employee.profileImages || employee.ProfileImages;
                if (profileJson && typeof profileJson === 'string') {
                    try {
                        const arr = JSON.parse(profileJson) as { FileId?: number; fileName?: string }[];
                        if (Array.isArray(arr) && arr.length > 0) {
                            const first = arr[0];
                            this.profileImageRef = { fileId: first.FileId ?? 0, fileName: first.fileName || '' };
                            this.selectedFileName = this.profileImageRef.fileName;
                            // Download and display the profile image
                            if (this.profileImageRef.fileId) {
                                this.empService.downloadFile(this.profileImageRef.fileId).subscribe({
                                    next: (blob) => {
                                        const reader = new FileReader();
                                        reader.onload = (e: any) => {
                                            this.imagePreview = e.target.result;
                                        };
                                        reader.readAsDataURL(blob);
                                    },
                                    error: (err) => {
                                        console.error('Failed to load profile image', err);
                                        this.imagePreview = null;
                                    }
                                });
                            } else {
                                this.imagePreview = null;
                            }
                        } else {
                            this.profileImageRef = null;
                            this.selectedFileName = '';
                            this.imagePreview = null;
                        }
                    } catch {
                        this.profileImageRef = null;
                        this.selectedFileName = '';
                        this.imagePreview = null;
                    }
                } else {
                    this.profileImageRef = null;
                    this.selectedFileName = '';
                    this.imagePreview = null;
                }

                // Load dependent dropdowns based on employee data
                if (employee.orgId) {
                    this.loadMotherOrgUnits(employee.orgId);
                    this.loadMotherOrgRank(employee.orgId);
                    this.loadMotherOrgCorps(employee.orgId);
                    this.loadMotherOrgPrefix(employee.orgId);
                    this.loadMotherOrgBatch(employee.orgId);
                }
                if (employee.memberType) {
                    this.loadOfficerType(employee.memberType, employee.orgId);
                }
                if (employee.branch) {
                    this.loadTrade(employee.branch);
                }

                // Load spouse (Wife Name) from FamilyInfo when marital status is Married
                const applySpouseFromFamilyList = (familyList: any[]) => {
                    if (!familyList || !Array.isArray(familyList)) return;
                    // Prefer matching by "Spouse" relation when options are loaded; else use first family member with Relation set so relationship gets a value
                    const spouseCodeId = this.relationOptions.length > 0
                        ? this.relationOptions.find((r) => (r.codeValueEN || (r as any).codeValueEn || '').toLowerCase() === 'spouse')?.codeId
                        : undefined;
                    let spouseRow = spouseCodeId != null
                        ? familyList.find((f: any) => {
                            const rel = f.relation ?? f.Relation;
                            return rel != null && rel === spouseCodeId;
                        })
                        : null;
                    if (!spouseRow && familyList.length > 0)
                        spouseRow = familyList.find((f: any) => (f.relation ?? f.Relation) != null) ?? familyList[0];
                    if (spouseRow) {
                        const name = spouseRow.NameEN ?? (spouseRow as any).nameEN ?? '';
                        const rawRel = spouseRow.Relation ?? (spouseRow as any).relation;
                        const relationId = rawRel != null ? +rawRel : null;
                        this.postingForm.patchValue({ spouseName: name, relationship: relationId });
                        this.spouseFmid = spouseRow.FMID ?? (spouseRow as any).fmid ?? null;
                    }
                };
                this.familyInfoService.getByEmployeeId(employeeId).subscribe({
                    next: (familyList) => {
                        if (this.relationOptions.length > 0) {
                            applySpouseFromFamilyList(familyList);
                        } else {
                            // Relationship dropdown not loaded yet; load it then apply spouse so relation is set correctly
                            this.commonCodeService.getAllActiveCommonCodesType('Relationship').subscribe({
                                next: (res) => {
                                    this.relationOptions = res;
                                    applySpouseFromFamilyList(familyList);
                                },
                                error: (err: any) => applySpouseFromFamilyList(familyList)
                            });
                        }
                    },
                    error: (err: any) => {}
                });

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
                    detail: err?.error?.message || 'Failed to load employee data'
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
                    const ThanaType = addr.thanaType || addr.ThanaType;
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
                        upazila: ThanaType,
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
                    } else if (normalizedType === LocationType.SpousePermanent.toLowerCase()) {
                        this.spousePermanentAddress = addressData;
                        this.spousePermanentAddressId = addressId;
                    } else if (normalizedType === LocationType.SpousePresent.toLowerCase()) {
                        this.spousePresentAddress = addressData;
                        this.spousePresentAddressId = addressId;
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
        // Keep rabid and serviceId disabled as they're always readonly (relationship is readonly in UI when Married, not disabled)
        this.postingForm.get('rabid')?.disable();
        if (this.isEditMode) {
            this.postingForm.get('serviceId')?.disable();
        }
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
            batch: [null],
            appointment: [null, Validators.required],
            joiningDate: [null, Validators.required],
            rank: [null, Validators.required],
            branch: [null, Validators.required],
            trade: [null, Validators.required],
            specialQualifications: [[] as number[]],
            tradeMark: [''],
            gender: [null, Validators.required],
            maritalStatus: [null],
            relationship: [null],
            spouseName: [''],
            prefix: [null, Validators.required],
            serviceId: ['', [Validators.required]],
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
            lastMotherUnitDistrictId: [null],
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
        this.profileImageRef = null;
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
                this.rabMotherOrgId = this.motherOrganizations.find((org) => (org?.orgNameEN || '').toLowerCase().includes('rab'))?.orgId ?? null;
                this.updateRabRankEquivalent(this.postingForm?.get('rank')?.value);
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

    loadDistricts(): void {
        this.masterBasicSetupService.getAllByType('District').subscribe({
            next: (districts) => {
                const list = Array.isArray(districts) ? districts : [];
                this.districtOptions = list.map((d: any) => ({
                    label: d.codeValueBN ? `${d.codeValueEN} (${d.codeValueBN})` : d.codeValueEN,
                    value: d.codeId
                }));
            },
            error: (err) => {
                console.error('Error loading districts:', err);
            }
        });
    }

    private loadRankEquivalentMappings(): void {
        forkJoin({
            equivalentNames: this.masterBasicSetupService.getAllByType('EquivalentName').pipe(catchError(() => of([]))),
            rankEquivalents: this.masterBasicSetupService.getAllRankEquivalents().pipe(catchError(() => of([] as EquivalentRankModel[]))),
            allMotherOrgRanks: this.masterBasicSetupService.getAllByType('MotherOrgRank').pipe(catchError(() => of([])))
        }).subscribe({
            next: ({ equivalentNames, rankEquivalents, allMotherOrgRanks }) => {
                const eqNames = Array.isArray(equivalentNames) ? equivalentNames : [];
                this.rabRankDropdownOptions = eqNames.map((item: any) => ({
                    label: item?.codeValueEN ?? '',
                    value: Number(item?.codeId ?? item?.CodeId)
                })).filter((x) => x.label && Number.isFinite(x.value));

                const rawRankEquivalents = Array.isArray(rankEquivalents) ? rankEquivalents : [];
                this.rankEquivalentListWithOrg = rawRankEquivalents
                    .map((row: any) => ({
                        equivalentNameID: Number(row?.equivalentNameID ?? row?.EquivalentNameID),
                        motherOrgRankId: Number(row?.motherOrgRankId ?? row?.MotherOrgRankId),
                        motherOrgId: Number(row?.motherOrgId ?? row?.MotherOrgId),
                        sortOrder: row?.sortOrder ?? row?.SortOrder ?? null
                    }))
                    .filter((row) => Number.isFinite(row.equivalentNameID) && Number.isFinite(row.motherOrgRankId) && Number.isFinite(row.motherOrgId));
                this.rankEquivalentList = this.rankEquivalentListWithOrg.map((row) => ({
                    equivalentNameID: row.equivalentNameID,
                    motherOrgRankId: row.motherOrgRankId,
                    sortOrder: row.sortOrder
                }));

                const allRanks = Array.isArray(allMotherOrgRanks) ? allMotherOrgRanks : [];
                this.motherOrgRankNameById.clear();
                allRanks.forEach((rank: any) => {
                    const codeId = Number(rank?.codeId ?? rank?.CodeId);
                    const codeValue = rank?.codeValueEN ?? rank?.CodeValueEN ?? '';
                    if (Number.isFinite(codeId) && codeValue) {
                        this.motherOrgRankNameById.set(codeId, codeValue);
                    }
                });
                this.updateRabRankEquivalent(this.postingForm.get('rank')?.value);
            },
            error: () => {
                this.rankEquivalentList = [];
                this.rankEquivalentListWithOrg = [];
                this.rabRankEquivalentDisplay = '';
            }
        });
    }

    private updateRabRankEquivalent(selectedRankId: number | null): void {
        const selectedRankCodeId = selectedRankId != null ? Number(selectedRankId) : null;
        if (!selectedRankCodeId || this.rankEquivalentListWithOrg.length === 0) {
            this.rabRankEquivalentDisplay = '';
            this.selectedRabEquivalentNameId = null;
            console.log('[RAB Rank Mapping] No mapping context', {
                selectedRankId: selectedRankCodeId,
                equivalentNameOptions: this.rabRankDropdownOptions.length,
                rankEquivalentCount: this.rankEquivalentListWithOrg.length
            });
            return;
        }

        const selectedRankEquivalent = this.rankEquivalentListWithOrg.find((row) => Number(row.motherOrgRankId) === selectedRankCodeId);
        if (!selectedRankEquivalent) {
            this.rabRankEquivalentDisplay = '';
            this.selectedRabEquivalentNameId = null;
            console.log('[RAB Rank Mapping] Selected rank has no equivalent setup', {
                selectedRankId: selectedRankCodeId
            });
            return;
        }

        this.selectedRabEquivalentNameId = Number(selectedRankEquivalent.equivalentNameID);
        this.rabRankEquivalentDisplay =
            this.rabRankDropdownOptions.find((x) => Number(x.value) === Number(this.selectedRabEquivalentNameId))?.label ?? '';

        console.log('[RAB Rank Mapping] Resolved equivalent rank', {
            selectedRankId: selectedRankCodeId,
            selectedEquivalentNameId: this.selectedRabEquivalentNameId,
            resolvedEquivalentName: this.rabRankEquivalentDisplay
        });
    }

    onMotherOrgChange(orgId: number): void {
        // Set orgId in form
        this.postingForm.patchValue({ orgId: orgId, batch: null });

        this.loadMotherOrgUnits(orgId);
        this.loadMotherOrgRank(orgId);
        this.loadMotherOrgCorps(orgId);
        this.loadMotherOrgPrefix(orgId);
        this.loadMotherOrgBatch(orgId);

        const memberType = this.postingForm.get('memberType')?.value;
        this.postingForm.patchValue({ officerType: null });
        if (memberType) {
            this.loadOfficerType(memberType, orgId);
        } else {
            this.officerTypes = [];
        }
    }

    onLastUnitChange(unit: any): void {
        const selectedUnit = this.lastUnitOrganizations.find((x) => x.orgId === unit);
        this.postingForm.patchValue({
            lastMotherUnitLocation: selectedUnit?.locationEN,
            lastMotherUnitDistrictId: selectedUnit?.districtId ?? null
        });
    }

    openAddLastUnitDialog(): void {
        const parentOrgId = this.postingForm.get('motherOrganization')?.value;
        if (!parentOrgId) return;
        this.newLastUnitNameEN = '';
        this.newLastUnitNameBN = '';
        this.showLastUnitDialog = true;
    }

    getSelectedMotherOrgName(): string {
        const orgId = this.postingForm.get('motherOrganization')?.value;
        const org = this.motherOrganizations.find((o) => o.orgId === orgId);
        return org?.orgNameEN ?? '';
    }

    saveNewLastUnit(): void {
        if (!this.newLastUnitNameEN?.trim()) return;

        const parentOrgId = this.postingForm.get('motherOrganization')?.value;
        if (!parentOrgId) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Warning',
                detail: 'Please select Mother Organization first'
            });
            return;
        }

        this.isSavingLastUnit = true;
        const currentUser = this.sharedService.getCurrentUser();
        const currentDateTime = this.sharedService.getCurrentDateTime();

        const payload = {
            orgId: 0,
            orgNameEN: this.newLastUnitNameEN.trim(),
            orgNameBN: this.newLastUnitNameBN?.trim() || '',
            locationEN: '',
            locationBN: '',
            districtId: null,
            parentOrg: parentOrgId,
            status: true,
            createdBy: currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime
        };

        this.organizationService.post(payload as any).subscribe({
            next: (res: any) => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Last Unit of Mother Organization created successfully'
                });
                this.showLastUnitDialog = false;
                this.isSavingLastUnit = false;

                const newOrgId = res?.orgId ?? res?.OrgId;
                this.commonCodeService.getAllActiveMotherOrgUnits(parentOrgId).subscribe({
                    next: (units) => {
                        this.lastUnitOrganizations = units;
                        if (newOrgId) {
                            this.postingForm.patchValue({
                                lastMotherUnit: newOrgId,
                                lastMotherUnitLocation: '',
                                lastMotherUnitDistrictId: null
                            });
                        }
                    }
                });
            },
            error: (err) => {
                console.error('Error creating last unit:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to create Last Unit of Mother Organization'
                });
                this.isSavingLastUnit = false;
            }
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

    loadMotherOrgBatch(orgId: number): void {
        this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Batch').subscribe({
            next: (res) => (this.batches = res ?? []),
            error: (err) => console.log(err)
        });
    }

    loadSpecialQualifications(): void {
        this.commonCodeService.getAllActiveCommonCodesType('SpecialQualification').subscribe({
            next: (res) => (this.specialQualificationOptions = res ?? []),
            error: (err) => console.log(err)
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

    loadMaritalStatus(): void {
        this.commonCodeService.getAllActiveCommonCodesType('MaritalStatus').subscribe({
            next: (res) => {
                this.maritalStatusOptions = res;
            },
            error: (err) => {
                console.error('Failed to load marital status', err);
            }
        });
    }

    loadRelationshipOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('Relationship').subscribe({
            next: (res) => {
                this.relationOptions = res;
                // When saving new employee: if Marital Status is already Married but relationship was null (dropdown just loaded), set it to Spouse so spouse info saves
                this.setRelationshipToSpouseIfMarried();
            },
            error: (err) => {
                console.error('Failed to load relationship options', err);
            }
        });
    }

    /** Sets relationship form control to Spouse codeId when Marital Status is not Unmarried and relationship is not set (so spouse info and addresses save). */
    private setRelationshipToSpouseIfMarried(): void {
        if (this.relationOptions.length === 0) return;
        if (!this.isMaritalStatusNotUnmarried) return;
        const currentRel = this.postingForm.get('relationship')?.value;
        if (currentRel != null) return;
        const spouseCodeId = this.relationOptions.find((r) => (r.codeValueEN || (r as any).codeValueEn || '').toLowerCase().trim() === 'spouse')?.codeId;
        if (spouseCodeId != null)
            this.postingForm.patchValue({ relationship: spouseCodeId });
    }

    onMaritalStatusChange(value: number | null): void {
        const isUnmarried = value != null && this.maritalStatusOptions.some((m) => m.codeId === value && (m.codeValueEN || (m as any).codeValueEn || '').toLowerCase().trim() === 'unmarried');
        if (value == null || isUnmarried) {
            this.postingForm.patchValue({ relationship: null, spouseName: '' });
        } else {
            // When user selects any non-Unmarried status, set Relationship to Spouse so spouse info and addresses save
            this.setRelationshipToSpouseIfMarried();
        }
    }

    /** True when Marital Status is Married (by commonCode codeValueEN). */
    get isMaritalStatusMarried(): boolean {
        const maritalStatusId = this.postingForm.get('maritalStatus')?.value;
        if (maritalStatusId == null) return false;
        return this.maritalStatusOptions.some((m) => m.codeId === maritalStatusId && (m.codeValueEN || '').toLowerCase() === 'married');
    }

    /** True when a Marital Status is selected and it is NOT Unmarried. */
    get isMaritalStatusNotUnmarried(): boolean {
        const maritalStatusId = this.postingForm.get('maritalStatus')?.value;
        if (maritalStatusId == null) return false;
        const selected = this.maritalStatusOptions.find((m) => m.codeId === maritalStatusId);
        if (!selected) return false;
        return (selected.codeValueEN || '').toLowerCase() !== 'unmarried';
    }

    loadOfficerType(codeId: number, orgId?: number | null) {
        this.commonCodeService.getAllActiveCommonCodesByParentId(codeId).subscribe({
            next: (res) => {
                if (orgId == null) {
                    this.officerTypes = res;
                    return;
                }
                this.officerTypes = res.filter((item) => item.orgId === orgId || item.orgId === 0);
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
                this.allRanksForOrg = res ?? [];
                this.applyRankMemberTypeFilter();
            }
        });
    }

    /** Filter the org-scoped ranks further by the currently selected Member Type (rank.parentCodeId === memberType). */
    private applyRankMemberTypeFilter() {
        const memberType = this.postingForm?.get('memberType')?.value;
        if (memberType == null) {
            this.ranks = this.allRanksForOrg;
            return;
        }
        this.ranks = this.allRanksForOrg.filter((r) => r.parentCodeId === memberType);
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
        if (codeId != null && this.allowedMemberTypeIds !== null && !this.allowedMemberTypeIds.includes(codeId)) {
            const typeName =
                this.memberTypes?.find((m: CommonCodeModel) => m.codeId === codeId)?.codeValueEN ?? 'this member type';
            this.messageService.add({
                severity: 'warn',
                summary: 'No Permission',
                detail: `You do not have permission to use ${typeName}.`,
                life: 6000
            });
            this.postingForm.patchValue({ memberType: null, officerType: null, rank: null });
            this.applyRankMemberTypeFilter();
            return;
        }

        const motherOrgId = this.postingForm.get('motherOrganization')?.value;
        this.postingForm.patchValue({ officerType: null, rank: null });
        this.loadOfficerType(codeId, motherOrgId);
        this.applyRankMemberTypeFilter();
    }

    private loadCurrentUserMemberTypePermissions(): void {
        const userId = this.sharedService.getCurrentUserId?.() ?? null;
        if (!userId) {
            this.allowedMemberTypeIds = null;
            return;
        }
        const cached = this.memberTypeAccess.getCachedMemberTypeIds(userId);
        if (cached !== null) {
            this.allowedMemberTypeIds = cached;
            return;
        }
        this.memberTypeAccess.cacheForUser(userId).subscribe({
            next: (ids) => {
                this.allowedMemberTypeIds = Array.isArray(ids) ? ids : [];
            },
            error: (err: any) => {
                this.allowedMemberTypeIds = null;
            }
        });
    }

    onSubmit(): void {
        if (this.postingForm.valid) {
            const formValueAfter = this.postingForm.getRawValue();

            const formattedData = {
                ...formValueAfter,
                employeeID: this.generatedEmployeeId || 0,
                joiningDate: this.formatDate(formValueAfter.joiningDate),
                postingStatus: formValueAfter.postingStatus || PostingStatus.Supernumerary,
                maritalStatus: formValueAfter.maritalStatus ?? null,
                relationship: formValueAfter.relationship ?? null
            };

            this.empService.saveEmployee(formattedData).subscribe({
                next: (res) => {
                    console.log('Saved successfully', res);

                    const employeeId = res?.data?.employeeID || res?.Data?.EmployeeID;

                    if (employeeId) {
                        this.generatedEmployeeId = employeeId;
                        this.presentAddressConfig.employeeId = employeeId;
                        this.permanentAddressConfig.employeeId = employeeId;
                        this.spousePermanentAddressConfig.employeeId = employeeId;
                        this.spousePresentAddressConfig.employeeId = employeeId;

                        // Save spouse (Spouse Name) to FamilyInfo when Marital Status is Married
                        this.saveSpouseIfMarried(employeeId);
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
                        detail: err?.error?.message || 'Failed to save employee'
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
        const now = new Date();
        this.postingForm.reset({
            employeeID: 0,
            status: true,
            specialQualifications: [],
            createdBy: 'system',
            createdDate: now,
            lastUpdatedBy: 'system',
            lastupdate: now,
            statusDate: now
        });
        this.imagePreview = null;
        this.selectedFile = null;
        this.selectedFileName = '';

        if (this.fileUpload) {
            this.fileUpload.clear();
        }
    }

    /** Reset all state so the form is ready for a brand-new employee entry, then focus Service ID. Clears IDs that would otherwise cause the next save to update the previous record. */
    private resetForNewEntry(): void {
        this.onReset();

        this.generatedEmployeeId = null;
        this.permanentAddressId = undefined;
        this.presentAddressId = undefined;
        this.spousePermanentAddressId = undefined;
        this.spousePresentAddressId = undefined;
        this.spouseFmid = null;
        this.profileImageRef = null;
        this.fileRows = [];
        this.permanentAddress = undefined;
        this.presentAddress = undefined;
        this.spousePermanentAddress = undefined;
        this.spousePresentAddress = undefined;
        this.isDuplicateCombo = false;

        this.presentAddressConfig.employeeId = 0;
        this.permanentAddressConfig.employeeId = 0;
        this.spousePermanentAddressConfig.employeeId = 0;
        this.spousePresentAddressConfig.employeeId = 0;

        this.permanentAddressForm?.reset();
        this.presentAddressForm?.reset();
        this.spousePermanentAddressForm?.reset();
        this.spousePresentAddressForm?.reset();

        // Hide the form so the search section is the active surface; focus the search Service ID input.
        this.showEntryForm = false;
        this.presentMemberCheck?.resetForNewSearch();
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
            if (fieldName === 'serviceId') {
                return 'Minimum 10 digits required';
            }
            return `Minimum length is ${field.errors?.['minlength']?.requiredLength} characters`;
        }

        return 'Invalid value';
    }
}
