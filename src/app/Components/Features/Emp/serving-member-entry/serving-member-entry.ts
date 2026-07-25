import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FileUpload } from 'primeng/fileupload';
import { Select } from 'primeng/select';
import { DatePicker } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectButtonModule } from 'primeng/selectbutton';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { RadioButtonModule } from 'primeng/radiobutton';
import { Button, ButtonModule } from 'primeng/button';
import { CommonCodeModel } from '@/models/common-code-model';
import { EmpService } from '@/services/emp-service';
import { FamilyInfoService } from '@/services/family-info-service';
import { MotherOrganizationModel } from '@/models/mother-org-model';
import { CommonCodeService } from '@/services/common-code-service';
import { MessageService } from 'primeng/api';
import { Fluid } from 'primeng/fluid';
import { Dialog } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { AddressData, AddressFormConfig, AddressFormComponent } from '../../EmployeeInfo/address-form/address-form';
import { forkJoin, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, map, switchMap } from 'rxjs/operators';
import { LocationType, PostingStatus, PresentStatusTypeOptions, PresentStatusType } from '@/models/enums';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { EquivalentRankModel } from '@/Components/basic-setup/shared/models/equivalent-rank';
import { SharedService } from '@/shared/services/shared-service';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { PreviousRABServiceService } from '@/services/previous-rab-service.service';
import { PresentStatusInfoService } from '@/services/present-status-info.service';
import { DatePrecision, toDateOnlyWithPrecision } from '@/shared/utils/partial-date.util';

/** UI-level precision for the service From date. Maps to DB's 'D'|'M'|'Y' at save. */
type ServicePrecision = 'full' | 'month-year' | 'year';
const UI_TO_DB_PRECISION: Record<ServicePrecision, DatePrecision> = { 'full': 'D', 'month-year': 'M', 'year': 'Y' };

/**
 * Serving Member Entry — one-time form for seeding existing serving members into
 * production. Differs from the New Posting Entry form (emp-basic-info):
 *  - RAB ID is editable (the real RAB IDs already exist for serving members).
 *  - Posting Status is fixed to "Servings".
 *  - Present/Permanent and Spouse addresses are laid out side by side.
 *  - No "present member" search gate — the form is shown directly.
 */
@Component({
    selector: 'app-serving-member-entry',
    imports: [FileUpload, Fluid, Button, ButtonModule, Select, MultiSelectModule, SelectButtonModule, InputNumberModule, TextareaModule, RadioButtonModule, DatePicker, ReactiveFormsModule, FormsModule, InputTextModule, AddressFormComponent, Dialog, TooltipModule, FlexibleDateDirective],
    templateUrl: './serving-member-entry.html',
    styleUrl: './serving-member-entry.scss',
    standalone: true
})
export class ServingMemberEntry implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    @ViewChild('fileUpload') fileUpload!: FileUpload;
    @ViewChild('permanentAddressForm') permanentAddressForm!: AddressFormComponent;
    @ViewChild('presentAddressForm') presentAddressForm!: AddressFormComponent;
    @ViewChild('spousePermanentAddressForm') spousePermanentAddressForm!: AddressFormComponent;
    @ViewChild('spousePresentAddressForm') spousePresentAddressForm!: AddressFormComponent;

    pageTitle: string = 'Serving Member Entry Form';

    // Image preview modal
    showImagePreviewModal: boolean = false;
    selectedFileName: string = '';

    employeeId = 0;
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

    permanentAddressConfig: AddressFormConfig = {
        title: 'Permanent Address',
        addressType: 'permanent',
        employeeId: this.employeeId
    };

    presentAddressConfig: AddressFormConfig = {
        title: 'Present Address',
        addressType: 'present',
        showSameAsPresent: true,
        sameAsLabel: 'Same As Permanent Address',
        employeeId: this.employeeId
    };

    spousePermanentAddressConfig: AddressFormConfig = {
        title: 'Spouse Permanent Address',
        addressType: 'spouse',
        showSameAsPresent: true,
        sameAsLabel: 'Same As Member Permanent Address',
        employeeId: this.employeeId
    };

    spousePresentAddressConfig: AddressFormConfig = {
        title: 'Spouse Present Address',
        addressType: 'spousePresent',
        showSameAsPresent: true,
        sameAsLabel: 'Same As Member Present Address',
        showSameAsSecondary: true,
        sameAsSecondaryLabel: 'Same As Permanent Address',
        employeeId: this.employeeId
    };

    // Duplicate check on (Mother Organization + Prefix + Service ID)
    isDuplicateCombo: boolean = false;
    isCheckingCombo: boolean = false;

    // Duplicate check on RAB ID
    isDuplicateRabId: boolean = false;
    isCheckingRabId: boolean = false;

    checkDuplicateRabId(): void {
        const rabId = this.postingForm?.get('rabid')?.value;
        const rabIdStr = rabId != null ? String(rabId).trim() : '';

        if (!rabIdStr) {
            this.isDuplicateRabId = false;
            this.isCheckingRabId = false;
            return;
        }

        this.isCheckingRabId = true;
        const selfId = this.generatedEmployeeId != null ? Number(this.generatedEmployeeId) : null;
        this.empService
            .searchListByRabIdOrServiceId(rabIdStr, undefined, undefined, undefined, undefined, undefined, selfId)
            .subscribe({
                next: (employees) => {
                    // Match exactly (API search may be partial); compare trimmed RAB IDs.
                    this.isDuplicateRabId = (employees ?? []).some(
                        (e: any) => String(e.rabid ?? e.RABID ?? e.rabId ?? '').trim() === rabIdStr
                    );
                    this.isCheckingRabId = false;

                    if (this.isDuplicateRabId) {
                        this.messageService.add({
                            severity: 'warn',
                            summary: 'Duplicate RAB ID',
                            detail: `RAB ID "${rabIdStr}" already exists`
                        });
                    }
                },
                error: (err) => {
                    console.error('Error checking duplicate RAB ID', err);
                    this.isCheckingRabId = false;
                }
            });
    }

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

    cancelAddress() {}

    // Copy helpers
    copyPermanentToPresent(): void {
        const permanentData = this.permanentAddressForm?.getFormData();
        if (permanentData?.data) {
            this.presentAddressForm?.populateFromSourceAddress(permanentData.data);
        }
    }

    copySpousePermanentToSpousePresent(): void {
        const spousePermanentData = this.spousePermanentAddressForm?.getFormData();
        if (spousePermanentData?.data) {
            this.spousePresentAddressForm?.populateFromSourceAddress(spousePermanentData.data);
        }
    }

    copyMemberPresentToSpousePresent(): void {
        const presentData = this.presentAddressForm?.getFormData();
        if (presentData?.data) {
            this.spousePresentAddressForm?.populateFromSourceAddress(presentData.data);
        }
    }

    copyMemberPermanentToSpousePermanent(): void {
        const permanentData = this.permanentAddressForm?.getFormData();
        if (permanentData?.data) {
            this.spousePermanentAddressForm?.populateFromSourceAddress(permanentData.data);
        }
    }

    // Save All - Employee + All Addresses
    saveAll(): void {
        // Guard against double submission while a save is already in flight.
        if (this.isSaving) {
            return;
        }

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

        if (this.isDuplicateCombo) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Duplicate Entry',
                detail: 'A member with the same Mother Organization + Prefix + Service ID already exists'
            });
            return;
        }

        if (this.isDuplicateRabId) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Duplicate RAB ID',
                detail: 'A member with the same RAB ID already exists'
            });
            return;
        }

        // Service Information is required for a serving member (Battalion + From date).
        if (this.serviceForm.invalid) {
            Object.keys(this.serviceForm.controls).forEach((key) => this.serviceForm.get(key)?.markAsTouched());
            this.messageService.add({
                severity: 'warn',
                summary: 'Validation Error',
                detail: 'Please fill Service Information (Battalion Name and From date)'
            });
            return;
        }

        const permanentData = this.permanentAddressForm?.getFormData();
        const presentData = this.presentAddressForm?.getFormData();
        const spousePermanentData = this.spousePermanentAddressForm?.getFormData();
        const spousePresentData = this.spousePresentAddressForm?.getFormData();

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

        // From here on a request will be issued — lock the Save button until the flow settles.
        this.isSaving = true;

        const doSave = (profileImgsJson: string | null) => {
            this.saveEmployeeWithFilesRefs(this.formattedDataForEmployee(), null, profileImgsJson, permanentData!, presentData!, spousePermanentData, spousePresentData);
        };

        // Only the profile image is uploaded here (no Files/Supporting Documents section).
        if (this.selectedFile) {
            this.empService.uploadEmployeeFile(this.selectedFile, this.selectedFileName || this.selectedFile.name).subscribe({
                next: (profileResult: any) => {
                    const profileImagesJson = profileResult ? JSON.stringify([{ FileId: profileResult.fileId, fileName: profileResult.fileName }]) : this.getProfileImagesJson();
                    doSave(profileImagesJson);
                },
                error: (err) => {
                    this.isSaving = false;
                    console.error('Error uploading profile image', err);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.message || 'Failed to upload profile image'
                    });
                }
            });
            return;
        }

        doSave(this.getProfileImagesJson());
    }

    private formattedDataForEmployee(): any {
        const formValue = this.postingForm.getRawValue();
        const specialQualsArr = Array.isArray(formValue.specialQualifications) ? formValue.specialQualifications : [];
        const specialQualsCsv = specialQualsArr.length > 0 ? specialQualsArr.join(',') : null;
        return {
            ...formValue,
            employeeID: this.generatedEmployeeId || 0,
            joiningDate: this.formatDate(formValue.joiningDate),
            // Serving Member form: always seed as a serving member.
            postingStatus: PostingStatus.Servings,
            maritalStatus: formValue.maritalStatus ?? null,
            batch: formValue.batch ?? null,
            specialQualifications: specialQualsCsv
        };
    }

    private getProfileImagesJson(): string | null {
        if (this.profileImageRef) {
            return JSON.stringify([{ FileId: this.profileImageRef.fileId, fileName: this.profileImageRef.fileName }]);
        }
        return null;
    }

    private enrollProfileFace(employeeId: number, file: File | null): void {
        if (!employeeId || !file) return;
        this.empService.getEnrolledFaceCount(employeeId).subscribe({
            next: (res) => {
                const count = res?.photoCount ?? 0;
                if (count >= this.MAX_FACES_PER_EMPLOYEE) {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Face Limit Reached',
                        detail: `This employee already has the maximum of ${this.MAX_FACES_PER_EMPLOYEE} face images.`,
                        life: 7000
                    });
                    return;
                }
                this.doEnrollProfileFace(employeeId, file);
            },
            error: () => {}
        });
    }

    private doEnrollProfileFace(employeeId: number, file: File): void {
        this.empService.enrollFaces(employeeId, [file], 'id_card').subscribe({
            next: (res: any) => {
                if ((res?.photos_enrolled ?? 0) > 0) {
                    this.messageService.add({
                        severity: 'info',
                        summary: 'Face Enrolled',
                        detail: 'Profile photo was also added to the face-recognition database.'
                    });
                } else {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Face Not Enrolled',
                        detail: 'Profile photo was saved but could not be used for face recognition (no clear face detected).'
                    });
                }
            },
            error: (err: any) => {
                if (err?.status === 409) {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Face Limit Reached',
                        detail: `This employee already has the maximum of ${this.MAX_FACES_PER_EMPLOYEE} face images.`,
                        life: 7000
                    });
                }
            }
        });
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

        const profileFaceFile: File | null = this.selectedFile;

        this.empService.saveEmployee(formattedData).subscribe({
            next: (res) => {
                const employeeId = res?.data?.employeeID || res?.Data?.EmployeeID;

                if (employeeId) {
                    this.generatedEmployeeId = employeeId;
                    this.enrollProfileFace(employeeId, profileFaceFile);
                    this.saveServiceInfo(employeeId);
                    this.savePersonalInfo(employeeId);
                    this.presentAddressConfig.employeeId = employeeId;
                    this.permanentAddressConfig.employeeId = employeeId;
                    this.spousePermanentAddressConfig.employeeId = employeeId;
                    this.spousePresentAddressConfig.employeeId = employeeId;

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
                    this.isSaving = false;
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to get Employee ID from response'
                    });
                }
            },
            error: (err) => {
                this.isSaving = false;
                console.error('Error saving employee', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to save employee'
                });
            }
        });
    }

    private saveSpouseIfMarried(employeeId: number): import('rxjs').Observable<number | null> {
        const formValue = this.postingForm.getRawValue();
        const spouseName = (formValue.spouseName || '').trim();
        const isNotUnmarried = this.isMaritalStatusNotUnmarried;
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
            StatusDate: nowIso,
            FMID: this.spouseFmid != null ? this.spouseFmid : 0
        };

        const req = this.spouseFmid ? this.familyInfoService.update(payload) : this.familyInfoService.save(payload);
        return req.pipe(
            map((res: any) => {
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

    private saveAllAddressesInternal(permanent: AddressData, present: AddressData, spousePermanent: AddressData | null, spousePresent: AddressData | null, spouseFmidFromApi?: number | null): void {
        const buildPayload = (data: AddressData, locationType: string, existingAddressId?: number, fmid?: number) => {
            const fmidVal = fmid ?? 0;
            return {
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
                Active: true,
                CreatedBy: 'system',
                CreatedDate: new Date().toISOString(),
                LastUpdatedBy: 'system',
                Lastupdate: new Date().toISOString()
            };
        };

        const spouseFmid = (spouseFmidFromApi != null && spouseFmidFromApi !== 0 ? spouseFmidFromApi : this.spouseFmid) ?? 0;
        const getAddressRequest = (data: AddressData, locationType: string, existingAddressId?: number, fmid?: number) =>
            this.empService.saveAddress(buildPayload(data, locationType, existingAddressId, fmid));

        const saveRequests: { [key: string]: any } = {
            permanent: getAddressRequest(permanent, LocationType.Permanent, this.permanentAddressId),
            present: getAddressRequest(present, LocationType.Present, this.presentAddressId)
        };

        if (spousePermanent) {
            saveRequests['spousePermanent'] = getAddressRequest(spousePermanent, LocationType.SpousePermanent, this.spousePermanentAddressId, spouseFmid);
        }
        if (spousePresent) {
            saveRequests['spousePresent'] = getAddressRequest(spousePresent, LocationType.SpousePresent, this.spousePresentAddressId, spouseFmid);
        }

        forkJoin(saveRequests).subscribe({
            next: (results: any) => {
                this.isSaving = false;
                this.permanentAddress = permanent;
                this.presentAddress = present;
                if (spousePermanent) this.spousePermanentAddress = spousePermanent;
                if (spousePresent) this.spousePresentAddress = spousePresent;

                const getAddressId = (res: any) => res?.data?.addressId || res?.Data?.AddressId || res?.addressId;
                if (!this.permanentAddressId && results.permanent) this.permanentAddressId = getAddressId(results.permanent);
                if (!this.presentAddressId && results.present) this.presentAddressId = getAddressId(results.present);
                if (!this.spousePermanentAddressId && results.spousePermanent) this.spousePermanentAddressId = getAddressId(results.spousePermanent);
                if (!this.spousePresentAddressId && results.spousePresent) this.spousePresentAddressId = getAddressId(results.spousePresent);

                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Serving member and addresses saved successfully!'
                });

                this.resetForNewEntry();
            },
            error: (err: any) => {
                this.isSaving = false;
                console.error('Error saving addresses', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Employee saved but failed to save one or more addresses'
                });
            }
        });
    }

    postingForm!: FormGroup;

    // Service Information (Previous RAB service history) — one record entered with the member.
    serviceForm!: FormGroup;
    rabUnitOptions: { label: string; value: number }[] = [];
    rabWingOptions: { label: string; value: number }[] = [];
    rabBranchOptions: { label: string; value: number }[] = [];
    rabSubBranchOptions: { label: string; value: number }[] = [];
    rabSectionOptions: { label: string; value: number }[] = [];
    rabSubSectionOptions: { label: string; value: number }[] = [];
    precisionOptions: { label: string; value: ServicePrecision }[] = [
        { label: 'Full date', value: 'full' },
        { label: 'Month & year', value: 'month-year' },
        { label: 'Year only', value: 'year' }
    ];

    // Personal Information (emp-personal-info, minus Supporting Documents).
    personalInfoForm!: FormGroup;
    personalInfoCollapsed = false;
    showInvestigationExperience = false;
    bloodGroups: { label: string; value: string }[] = [];
    religions: { label: string; value: number }[] = [];
    professionalQualifications: { label: string; value: number }[] = [];
    personalQualifications: { label: string; value: number }[] = [];
    gallantryAwards: { label: string; value: number }[] = [];
    educationQualifications: { label: string; value: number }[] = [];
    medicalCategories: { label: string; value: number }[] = [];
    tribalOptions = [{ label: 'No', value: 0 }, { label: 'Yes', value: 1 }];
    freedomFighterOptions = [{ label: 'No', value: 0 }, { label: 'Yes', value: 1 }];
    yesNoOptions = [{ label: 'No', value: false }, { label: 'Yes', value: true }];
    leavingStatusOptions = [{ label: 'In Leaving', value: true }, { label: 'Out Leaving', value: false }];
    presentStatusTypes: any[] = PresentStatusTypeOptions;

    imagePreview: string | null = null;
    selectedFile: File | null = null;
    private readonly MAX_FACES_PER_EMPLOYEE = 10;

    profileImageRef: { fileId: number; fileName: string } | null = null;

    // Dropdown options
    motherOrganizations: MotherOrganizationModel[] = [];
    lastUnitOrganizations: MotherOrganizationModel[] = [];
    memberTypes: CommonCodeModel[] = [];
    batches: CommonCodeModel[] = [];
    specialQualificationOptions: (CommonCodeModel & { displayLabel?: string })[] = [];
    officerTypes: CommonCodeModel[] = [];
    appointments: CommonCodeModel[] = [];
    ranks: CommonCodeModel[] = [];
    corps: CommonCodeModel[] = [];
    tradeOptions: { label: string; value: number }[] = [];
    genders: CommonCodeModel[] = [];
    maritalStatusOptions: CommonCodeModel[] = [];
    relationOptions: CommonCodeModel[] = [];
    spouseFmid: number | null = null;
    prefixes: CommonCodeModel[] = [];
    districtOptions: { label: string; value: number }[] = [];
    rabRankEquivalentDisplay: string = '';
    rabRankDropdownOptions: { label: string; value: number }[] = [];
    selectedRabEquivalentNameId: number | null = null;
    private rankEquivalentListWithOrg: Array<{ equivalentNameID: number; motherOrgRankId: number; motherOrgId: number; sortOrder: number | null }> = [];
    private rabMotherOrgId: number | null = null;
    private motherOrgRankNameById = new Map<number, string>();

    // Add Last Unit dialog
    showLastUnitDialog: boolean = false;
    newLastUnitNameEN: string = '';
    newLastUnitNameBN: string = '';
    isSavingLastUnit: boolean = false;
    /** True while a Save All request is in flight — disables the Save button to prevent double submits. */
    isSaving: boolean = false;

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
        private previousRABService: PreviousRABServiceService,
        private presentStatusService: PresentStatusInfoService
    ) {}

    private allowedMemberTypeIds: number[] | null = null;
    private allRanksForOrg: CommonCodeModel[] = [];

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.initializeForm();
        this.loadCurrentUserMemberTypePermissions();

        ['motherOrganization', 'prefix', 'serviceId'].forEach((field) => {
            this.postingForm.get(field)?.valueChanges.pipe(
                debounceTime(500),
                distinctUntilChanged()
            ).subscribe(() => this.checkDuplicateCombo());
        });

        // Real-time duplicate check on RAB ID
        this.postingForm.get('rabid')?.valueChanges.pipe(
            debounceTime(500),
            distinctUntilChanged()
        ).subscribe(() => this.checkDuplicateRabId());

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

        this.buildServiceForm();
        this.loadServiceUnits();

        this.buildPersonalInfoForm();
        this.loadPersonalDropdownData();
    }

    // ---- Service Information (previous RAB service) ----

    private buildServiceForm(): void {
        this.serviceForm = this.fb.group({
            rabUnitCodeId: [null, Validators.required],
            rabWingCodeId: [null],
            rabBranchCodeId: [null],
            rabSubBranchCodeId: [null],
            rabSectionCodeId: [null],
            rabSubSectionCodeId: [null],
            precision: ['full' as ServicePrecision],
            serviceFrom: [null, Validators.required],
            postingAuth: [''],
            remarks: ['']
        });

        // Cascading dropdowns: each selection loads the next level's options.
        this.serviceForm.get('rabUnitCodeId')?.valueChanges.subscribe((v) => this.onServiceParentChange(v, 'rabWingOptions', ['rabWingCodeId', 'rabBranchCodeId', 'rabSubBranchCodeId', 'rabSectionCodeId', 'rabSubSectionCodeId']));
        this.serviceForm.get('rabWingCodeId')?.valueChanges.subscribe((v) => this.onServiceParentChange(v, 'rabBranchOptions', ['rabBranchCodeId', 'rabSubBranchCodeId', 'rabSectionCodeId', 'rabSubSectionCodeId']));
        this.serviceForm.get('rabBranchCodeId')?.valueChanges.subscribe((v) => this.onServiceParentChange(v, 'rabSubBranchOptions', ['rabSubBranchCodeId', 'rabSectionCodeId', 'rabSubSectionCodeId']));
        this.serviceForm.get('rabSubBranchCodeId')?.valueChanges.subscribe((v) => this.onServiceParentChange(v, 'rabSectionOptions', ['rabSectionCodeId', 'rabSubSectionCodeId']));
        this.serviceForm.get('rabSectionCodeId')?.valueChanges.subscribe((v) => this.onServiceParentChange(v, 'rabSubSectionOptions', ['rabSubSectionCodeId']));
    }

    private loadServiceUnits(): void {
        this.commonCodeService.getAllActiveCommonCodesType('RabUnit').subscribe({
            next: (res: any[]) => {
                this.rabUnitOptions = (Array.isArray(res) ? res : []).map((item: any) => ({
                    label: item.codeValueEN ?? item.CodeValueEN ?? '',
                    value: item.codeId ?? item.CodeId
                }));
            },
            error: (err) => console.error('Failed to load RAB units', err)
        });
    }

    /**
     * Generic cascade: when a parent changes, clear all child controls + their option
     * lists, then load the immediate child options from the selected parent's id.
     */
    private onServiceParentChange(parentId: number | null, childOptionsProp: 'rabWingOptions' | 'rabBranchOptions' | 'rabSubBranchOptions' | 'rabSectionOptions' | 'rabSubSectionOptions', childControls: string[]): void {
        // Clear all descendant option lists and values.
        const optionProps: Array<typeof childOptionsProp> = ['rabWingOptions', 'rabBranchOptions', 'rabSubBranchOptions', 'rabSectionOptions', 'rabSubSectionOptions'];
        const startIdx = optionProps.indexOf(childOptionsProp);
        optionProps.slice(startIdx).forEach((p) => (this[p] = []));

        const patch: Record<string, null> = {};
        childControls.forEach((c) => (patch[c] = null));
        this.serviceForm.patchValue(patch, { emitEvent: false });

        if (parentId == null) return;
        this.commonCodeService.getAllActiveCommonCodesByParentId(parentId).subscribe({
            next: (list: any[]) => {
                this[childOptionsProp] = (Array.isArray(list) ? list : []).map((item: any) => ({
                    label: item.codeValueEN ?? item.CodeValueEN ?? '',
                    value: item.codeId ?? item.CodeId
                }));
            },
            error: () => (this[childOptionsProp] = [])
        });
    }

    /** Save the single service history record for the just-saved member. */
    private saveServiceInfo(employeeId: number): void {
        const v = this.serviceForm.getRawValue();
        if (v.rabUnitCodeId == null || !v.serviceFrom) return;

        const dbPrecision = UI_TO_DB_PRECISION[(v.precision as ServicePrecision) ?? 'full'];
        const serviceFrom = toDateOnlyWithPrecision(v.serviceFrom, dbPrecision);
        const now = new Date().toISOString();

        const payload = {
            employeeID: employeeId,
            // First service record for a freshly-created member starts at 1 (never 0),
            // matching the client-assigned composite-key convention used elsewhere.
            previousRABServiceID: 1,
            rabUnitCodeId: v.rabUnitCodeId ?? null,
            rabWingCodeId: v.rabWingCodeId ?? null,
            rabBranchCodeId: v.rabBranchCodeId ?? null,
            rabSubBranchCodeId: v.rabSubBranchCodeId ?? null,
            rabSectionCodeId: v.rabSectionCodeId ?? null,
            rabSubSectionCodeId: v.rabSubSectionCodeId ?? null,
            serviceFrom,
            serviceTo: null,
            serviceFromPrecision: dbPrecision,
            serviceToPrecision: dbPrecision,
            // Serving member: this posting is the current/active one.
            isCurrentlyActive: true,
            // Appointment comes from the top form (already captured) — reused here.
            appointment: this.postingForm.get('appointment')?.value ?? null,
            postingAuth: v.postingAuth || null,
            remarks: v.remarks || null,
            filesReferences: null,
            createdBy: 'system',
            createdDate: now,
            lastUpdatedBy: 'system',
            lastupdate: now
        };

        this.previousRABService.save(payload).subscribe({
            next: () => {},
            error: (err) => {
                console.error('Error saving service information', err);
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Service Info',
                    detail: 'Member saved, but failed to save Service Information.'
                });
            }
        });
    }

    // ---- Personal Information (emp-personal-info, minus Supporting Documents) ----

    private buildPersonalInfoForm(): void {
        this.personalInfoForm = this.fb.group({
            bloodGroup: [null],
            nidOld: ['', [Validators.pattern('^[0-9]{0,17}$'), Validators.maxLength(17)]],
            nid: ['', [Validators.pattern('^[0-9]{0,17}$'), Validators.maxLength(17)]],
            mobileNo: ['', [Validators.pattern('^01[3-9][0-9]{8}$')]],
            mobileNoOfficial: ['', [Validators.pattern('^01[3-9][0-9]{8}$')]],
            emailAddress: ['', [Validators.email]],
            dateOfBirth: [null],
            religion: [null],
            passportNo: [''],
            identificationMark: [''],
            emergencyContactNo: ['', [Validators.pattern('^01[3-9][0-9]{8}$')]],
            dateOfJoining: [null],
            dateOfCommission: [null],
            investigationExperience: [false],
            investigationExperienceDetails: [''],
            professionalQualification: [[] as number[]],
            personalQualification: [[] as number[]],
            gallantryAward: [[] as number[]],
            lastEducationQualification: [null],
            medicalCategory: [null],
            tribal: [0],
            freedomFighter: [0],
            heightFeet: [null, [Validators.min(0), Validators.max(8)]],
            heightInch: [null, [Validators.min(0), Validators.max(11.5)]],
            weightKg: [null, [Validators.min(0), Validators.max(200)]],
            leavingStatus: [null],
            drivingLicenseNo: [''],
            serviceIdCardNo: [''],
            // Serving member is On Duty by default; field is read-only in the UI.
            presentStatus: [{ value: PresentStatusType.OnDuty, disabled: true }]
        });

        // Show details only when investigation experience is Yes.
        this.personalInfoForm.get('investigationExperience')?.valueChanges.subscribe((value) => {
            this.showInvestigationExperience = value;
            if (!value) this.personalInfoForm.patchValue({ investigationExperienceDetails: '' });
        });
    }

    private loadPersonalDropdownData(): void {
        const map = (d: any) => ({ label: d.codeValueEN ?? d.CodeValueEN ?? '', value: d.codeId ?? d.CodeId });
        this.commonCodeService.getAllActiveCommonCodesType('BloodGroup').subscribe({
            next: (res) => (this.bloodGroups = (res ?? []).map((d: any) => ({ label: d.codeValueEN, value: d.codeValueEN }))),
            error: (err) => console.error(err)
        });
        this.commonCodeService.getAllActiveCommonCodesType('Religion').subscribe({
            next: (res) => (this.religions = (res ?? []).map(map)),
            error: (err) => console.error(err)
        });
        this.commonCodeService.getAllActiveCommonCodesType('ProfessionalQualification').subscribe({
            next: (res) => (this.professionalQualifications = (res ?? []).map(map)),
            error: (err) => console.error(err)
        });
        this.commonCodeService.getAllActiveCommonCodesType('PersonalQualification').subscribe({
            next: (res) => (this.personalQualifications = (res ?? []).map(map)),
            error: (err) => console.error(err)
        });
        this.commonCodeService.getAllActiveCommonCodesType('Decoration').subscribe({
            next: (res) => (this.gallantryAwards = (res ?? []).map(map)),
            error: (err) => console.error(err)
        });
        this.commonCodeService.getAllActiveCommonCodesType('EducationQualification').subscribe({
            next: (res) => (this.educationQualifications = (res ?? []).map(map)),
            error: (err) => console.error(err)
        });
        this.commonCodeService.getAllActiveCommonCodesType('MedicalCategoryType').subscribe({
            next: (res) => {
                this.medicalCategories = (res ?? []).map((d: any) => ({ label: d.codeValueEN ?? String(d.codeId), value: d.codeId }));
                // Default-select "A (AYEE)" (case-insensitive match on label).
                const ctrl = this.personalInfoForm.get('medicalCategory');
                if (ctrl && ctrl.value == null) {
                    const defaultCat = this.medicalCategories.find((c) => (c.label ?? '').trim().toLowerCase() === 'a (ayee)');
                    if (defaultCat) ctrl.setValue(defaultCat.value);
                }
            },
            error: (err) => console.error(err)
        });
    }

    /** Save personal information for the just-saved member (Supporting Documents excluded → FilesReferences null). */
    private savePersonalInfo(employeeId: number): void {
        const formValue = this.personalInfoForm.getRawValue();
        const toIso = (d: any) => (d ? new Date(d).toISOString().split('T')[0] : null);

        const feet = Number(formValue.heightFeet) || 0;
        const inch = Number(formValue.heightInch) || 0;
        const totalHeightInches = feet * 12 + inch;
        const weightKg = formValue.weightKg != null && formValue.weightKg !== '' ? Number(formValue.weightKg) : null;

        const payload = {
            EmployeeID: employeeId,
            Nid: formValue.nid,
            NidOld: formValue.nidOld,
            Email: formValue.emailAddress,
            BloodGroup: formValue.bloodGroup,
            MobileNo: formValue.mobileNo,
            MobileNoOfficial: formValue.mobileNoOfficial,
            DOB: toIso(formValue.dateOfBirth),
            Religion: formValue.religion ? formValue.religion.toString() : null,
            PassportNo: formValue.passportNo,
            IdentificationMark: formValue.identificationMark,
            EmergencyContact: formValue.emergencyContactNo,
            JoiningDate: toIso(formValue.dateOfJoining),
            CommissionDate: toIso(formValue.dateOfCommission),
            HasInvestigationExp: formValue.investigationExperience,
            InvestigationExpDetails: formValue.investigationExperienceDetails,
            // Multi-select: join selected ids into a CSV string, null when empty.
            ProfessionalQualification: formValue.professionalQualification?.length ? formValue.professionalQualification.join(',') : null,
            PersonalQualification: formValue.personalQualification?.length ? formValue.personalQualification.join(',') : null,
            Awards: formValue.gallantryAward?.length ? formValue.gallantryAward.join(',') : null,
            LastEducationalQualification: formValue.lastEducationQualification ? formValue.lastEducationQualification.toString() : null,
            MedicalCategory: formValue.medicalCategory,
            Tribal: formValue.tribal,
            FreedomFighter: formValue.freedomFighter,
            Height: totalHeightInches > 0 ? totalHeightInches : null,
            Weight: weightKg,
            LeavingStatus: formValue.leavingStatus,
            DrivingLicenseNo: formValue.drivingLicenseNo,
            ServiceIdCardNo: formValue.serviceIdCardNo,
            PresentStatus: formValue.presentStatus || null,
            FilesReferences: null,
            CreatedBy: 'system',
            CreatedDate: new Date().toISOString(),
            LastUpdatedBy: 'system',
            Lastupdate: new Date().toISOString()
        };

        this.empService.savePersonalInfo(payload).subscribe({
            next: () => {},
            error: (err) => {
                console.error('Error saving personal information', err);
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Personal Info',
                    detail: 'Member saved, but failed to save Personal Information.'
                });
            }
        });

        // Mirror the present status into the PresentStatusInfo history when On Duty.
        const presentStatus = formValue.presentStatus || null;
        if (presentStatus === PresentStatusType.OnDuty) {
            this.saveOnDutyPresentStatus(employeeId);
        }
    }

    /** Create an "On Duty" PresentStatusInfo record for the just-saved serving member. */
    private saveOnDutyPresentStatus(employeeId: number): void {
        const now = new Date().toISOString();
        const payload = {
            EmployeeID: employeeId,
            PresentStatusType: PresentStatusType.OnDuty,
            Dated: this.formatDate(new Date()),
            ProfileShift: false,
            TransferredUnitID: null,
            MotherOrgTransferredUnitID: null,
            DateOfRelease: null,
            ReduceFromRABStrength: null,
            RTUCause: null,
            AbsentTypeID: null,
            AbsentReport: null,
            InquiryReport: null,
            IncidentDetails: null,
            DeceasedPlace: null,
            DeceasedReason: null,
            SupportingDocFilesReferences: null,
            IsActive: true,
            CreatedBy: 'system',
            CreatedDate: now,
            LastUpdatedBy: 'system',
            Lastupdate: now
        };

        this.presentStatusService.save(payload).subscribe({
            next: () => {},
            error: (err) => {
                console.error('Error saving present status', err);
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Present Status',
                    detail: 'Member saved, but failed to record On Duty present status.'
                });
            }
        });
    }

    onFileSelect(event: any): void {
        const file = event.files[0];
        if (file) {
            const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
            if (!validTypes.includes(file.type)) {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Please upload a valid image file (JPG, PNG, GIF)' });
                this.fileUpload.clear();
                return;
            }
            if (file.size > 5000000) {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'File size must be less than 5MB' });
                this.fileUpload.clear();
                return;
            }
            this.selectedFile = file;
            this.selectedFileName = file.name;
            this.postingForm.patchValue({ picture: file });

            const reader = new FileReader();
            reader.onload = (e: any) => { this.imagePreview = e.target.result; };
            reader.readAsDataURL(file);
        }
    }

    removeImage(): void {
        this.imagePreview = null;
        this.selectedFile = null;
        this.selectedFileName = '';
        this.profileImageRef = null;
        this.postingForm.patchValue({ picture: null });
        if (this.fileUpload) this.fileUpload.clear();
    }

    loadMotherOrg(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (res: MotherOrganizationModel[]) => {
                this.motherOrganizations = res;
                this.rabMotherOrgId = this.motherOrganizations.find((org) => (org?.orgNameEN || '').toLowerCase().includes('rab'))?.orgId ?? null;
                this.updateRabRankEquivalent(this.postingForm?.get('rank')?.value);
            },
            error: (error) => console.error('Failed to load mother organizations', error)
        });
    }

    loadMotherOrgUnits(orgId: number) {
        this.commonCodeService.getAllActiveMotherOrgUnits(orgId).subscribe({
            next: (res) => { this.lastUnitOrganizations = res; },
            error: (err) => console.error(err)
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
            error: (err) => console.error('Error loading districts:', err)
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

                const allRanks = Array.isArray(allMotherOrgRanks) ? allMotherOrgRanks : [];
                this.motherOrgRankNameById.clear();
                allRanks.forEach((rank: any) => {
                    const codeId = Number(rank?.codeId ?? rank?.CodeId);
                    const codeValue = rank?.codeValueEN ?? rank?.CodeValueEN ?? '';
                    if (Number.isFinite(codeId) && codeValue) this.motherOrgRankNameById.set(codeId, codeValue);
                });
                this.updateRabRankEquivalent(this.postingForm.get('rank')?.value);
            },
            error: () => {
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
            return;
        }

        const selectedRankEquivalent = this.rankEquivalentListWithOrg.find((row) => Number(row.motherOrgRankId) === selectedRankCodeId);
        if (!selectedRankEquivalent) {
            this.rabRankEquivalentDisplay = '';
            this.selectedRabEquivalentNameId = null;
            return;
        }

        this.selectedRabEquivalentNameId = Number(selectedRankEquivalent.equivalentNameID);
        this.rabRankEquivalentDisplay =
            this.rabRankDropdownOptions.find((x) => Number(x.value) === Number(this.selectedRabEquivalentNameId))?.label ?? '';
    }

    onMotherOrgChange(orgId: number): void {
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
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select Mother Organization first' });
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
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Last Unit of Mother Organization created successfully' });
                this.showLastUnitDialog = false;
                this.isSavingLastUnit = false;

                const newOrgId = res?.orgId ?? res?.OrgId;
                this.commonCodeService.getAllActiveMotherOrgUnits(parentOrgId).subscribe({
                    next: (units) => {
                        this.lastUnitOrganizations = units;
                        if (newOrgId) {
                            this.postingForm.patchValue({ lastMotherUnit: newOrgId, lastMotherUnitLocation: '', lastMotherUnitDistrictId: null });
                        }
                    }
                });
            },
            error: (err) => {
                console.error('Error creating last unit:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to create Last Unit of Mother Organization' });
                this.isSavingLastUnit = false;
            }
        });
    }

    loadMemberType() {
        this.commonCodeService.getAllActiveCommonCodesType('EmployeeType').subscribe({
            next: (res) => { this.memberTypes = res; },
            error: (err) => console.log(err)
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
            next: (res) =>
                (this.specialQualificationOptions = (res ?? []).map((item: any) => ({
                    ...item,
                    displayLabel: item.codeValueBN ? `${item.codeValueEN} (${item.codeValueBN})` : item.codeValueEN
                }))),
            error: (err) => console.log(err)
        });
    }

    loadGender() {
        this.commonCodeService.getAllActiveCommonCodesType('Gender').subscribe({
            next: (res) => { this.genders = res; },
            error: (err) => console.log(err)
        });
    }

    loadMaritalStatus(): void {
        this.commonCodeService.getAllActiveCommonCodesType('MaritalStatus').subscribe({
            next: (res) => { this.maritalStatusOptions = res; },
            error: (err) => console.error('Failed to load marital status', err)
        });
    }

    loadRelationshipOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('Relationship').subscribe({
            next: (res) => {
                this.relationOptions = res;
                this.setRelationshipToSpouseIfMarried();
            },
            error: (err) => console.error('Failed to load relationship options', err)
        });
    }

    private setRelationshipToSpouseIfMarried(): void {
        if (this.relationOptions.length === 0) return;
        if (!this.isMaritalStatusNotUnmarried) return;
        const currentRel = this.postingForm.get('relationship')?.value;
        if (currentRel != null) return;
        const spouseCodeId = this.relationOptions.find((r) => (r.codeValueEN || (r as any).codeValueEn || '').toLowerCase().trim() === 'spouse')?.codeId;
        if (spouseCodeId != null) this.postingForm.patchValue({ relationship: spouseCodeId });
    }

    onMaritalStatusChange(value: number | null): void {
        const isUnmarried = value != null && this.maritalStatusOptions.some((m) => m.codeId === value && (m.codeValueEN || (m as any).codeValueEn || '').toLowerCase().trim() === 'unmarried');
        if (value == null || isUnmarried) {
            this.postingForm.patchValue({ relationship: null, spouseName: '' });
        } else {
            this.setRelationshipToSpouseIfMarried();
        }
    }

    get isMaritalStatusNotUnmarried(): boolean {
        const maritalStatusId = this.postingForm.get('maritalStatus')?.value;
        if (maritalStatusId == null) return false;
        const selected = this.maritalStatusOptions.find((m) => m.codeId === maritalStatusId);
        if (!selected) return false;
        return (selected.codeValueEN || '').toLowerCase() !== 'unmarried';
    }

    loadOfficerType(codeId: number, orgId?: number | null) {
        const filterByMemberType = (res: CommonCodeModel[]) => {
            this.officerTypes = (res ?? []).filter((item) => item.parentCodeId === codeId);
        };

        if (orgId == null) {
            this.commonCodeService.getAllActiveCommonCodesType('OfficerType').subscribe({ next: filterByMemberType, error: (err) => console.error(err) });
            return;
        }

        this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'OfficerType').subscribe({ next: filterByMemberType, error: (err) => console.error(err) });
    }

    loadAppointment() {
        this.commonCodeService.getAllActiveCommonCodesType('AppointmentCategory').subscribe({
            next: (res) => { this.appointments = res; },
            error: (err) => console.log(err)
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
            next: (res) => { this.prefixes = res; }
        });
    }

    loadMotherOrgCorps(orgId: number) {
        this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Corps').subscribe({
            next: (res) => { this.corps = res; }
        });
    }

    loadTrade(codeId: number) {
        this.commonCodeService.getAllActiveCommonCodesByParentId(codeId).subscribe({
            next: (res) => {
                const list = Array.isArray(res) ? res : [];
                this.tradeOptions = list.map((t: CommonCodeModel) => ({
                    label: t.codeValueBN ? `${t.codeValueEN} (${t.codeValueBN})` : t.codeValueEN,
                    value: t.codeId
                }));
            },
            error: (err) => console.error(err)
        });
    }

    onChangeCorps(codeId: number) {
        this.loadTrade(codeId);
    }

    /** Show Officer Type unless a non-"Officer" Member Type is selected. */
    get isOfficerMemberType(): boolean {
        const id = this.postingForm?.get('memberType')?.value;
        if (id == null) return true;
        const mt = this.memberTypes?.find((m: CommonCodeModel) => m.codeId === id);
        return (mt?.codeValueEN ?? '').trim().toLowerCase() === 'officer';
    }

    onMemberTypeChange(codeId: number) {
        if (codeId != null && this.allowedMemberTypeIds !== null && !this.allowedMemberTypeIds.includes(codeId)) {
            const typeName = this.memberTypes?.find((m: CommonCodeModel) => m.codeId === codeId)?.codeValueEN ?? 'this member type';
            this.messageService.add({ severity: 'warn', summary: 'No Permission', detail: `You do not have permission to use ${typeName}.`, life: 6000 });
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
        if (!userId) { this.allowedMemberTypeIds = null; return; }
        const cached = this.memberTypeAccess.getCachedMemberTypeIds(userId);
        if (cached !== null) { this.allowedMemberTypeIds = cached; return; }
        this.memberTypeAccess.cacheForUser(userId).subscribe({
            next: (ids) => { this.allowedMemberTypeIds = Array.isArray(ids) ? ids : []; },
            error: () => { this.allowedMemberTypeIds = null; }
        });
    }

    initializeForm(): void {
        this.postingForm = this.fb.group({
            employeeID: [0],
            picture: [null],
            lastMotherUnit: [null, Validators.required],
            memberType: [null, Validators.required],
            batch: [null],
            appointment: [null],
            joiningDate: [null, Validators.required],
            rank: [null, Validators.required],
            branch: [null, Validators.required],
            trade: [null, Validators.required],
            specialQualifications: [[] as number[]],
            tradeMark: [''],
            gender: [null, Validators.required],
            maritalStatus: [null],
            isRFTSComplted: [null],
            relationship: [null],
            spouseName: [''],
            prefix: [null, Validators.required],
            serviceId: ['', [Validators.required]],
            // Serving Member form: RAB ID is editable AND required (real IDs already exist).
            rabid: ['', [Validators.required]],
            nid: [''],
            fullNameEN: ['', [Validators.required, Validators.minLength(2)]],
            fullNameBN: ['', [Validators.required, Validators.minLength(2)]],
            postingStatus: [PostingStatus.Servings],
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
            postingStatus: PostingStatus.Servings,
            createdBy: 'system',
            createdDate: now,
            lastUpdatedBy: 'system',
            lastupdate: now,
            statusDate: now
        });
        this.imagePreview = null;
        this.selectedFile = null;
        this.selectedFileName = '';
        if (this.fileUpload) this.fileUpload.clear();
    }

    private resetForNewEntry(): void {
        this.onReset();

        this.generatedEmployeeId = null;
        this.permanentAddressId = undefined;
        this.presentAddressId = undefined;
        this.spousePermanentAddressId = undefined;
        this.spousePresentAddressId = undefined;
        this.spouseFmid = null;
        this.profileImageRef = null;
        this.permanentAddress = undefined;
        this.presentAddress = undefined;
        this.spousePermanentAddress = undefined;
        this.spousePresentAddress = undefined;
        this.isDuplicateCombo = false;
        this.isDuplicateRabId = false;

        this.presentAddressConfig.employeeId = 0;
        this.permanentAddressConfig.employeeId = 0;
        this.spousePermanentAddressConfig.employeeId = 0;
        this.spousePresentAddressConfig.employeeId = 0;

        this.permanentAddressForm?.reset();
        this.presentAddressForm?.reset();
        this.spousePermanentAddressForm?.reset();
        this.spousePresentAddressForm?.reset();

        this.serviceForm.reset({ precision: 'full' });
        this.rabWingOptions = [];
        this.rabBranchOptions = [];
        this.rabSubBranchOptions = [];
        this.rabSectionOptions = [];
        this.rabSubSectionOptions = [];

        this.personalInfoForm.reset({ investigationExperience: false, presentStatus: PresentStatusType.OnDuty });
        this.showInvestigationExperience = false;
    }

    capitalizeWords(fieldName: string): void {
        const field = this.postingForm.get(fieldName);
        const value = field?.value;
        if (typeof value !== 'string' || !value.trim()) return;
        const formatted = value
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase()
            .replace(/\b\p{L}/gu, (ch) => ch.toUpperCase());
        if (formatted !== value) field!.setValue(formatted);
    }

    isFieldInvalid(fieldName: string): boolean {
        const field = this.postingForm.get(fieldName);
        return !!(field && field.invalid && (field.dirty || field.touched));
    }

    getErrorMessage(fieldName: string): string {
        const field = this.postingForm.get(fieldName);
        if (field?.hasError('required')) return 'This field is required';
        if (field?.hasError('pattern')) return 'Please enter only numbers';
        if (field?.hasError('minlength')) {
            if (fieldName === 'serviceId') return 'Minimum 10 digits required';
            return `Minimum length is ${field.errors?.['minlength']?.requiredLength} characters`;
        }
        return 'Invalid value';
    }
}
