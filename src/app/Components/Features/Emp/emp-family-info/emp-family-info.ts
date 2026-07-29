import { Component, EventEmitter, Input, OnInit, Output, ViewChild , inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { SharedService } from '@/shared/services/shared-service';
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
import { TabsModule } from 'primeng/tabs';
import { DividerModule } from 'primeng/divider';

import { EmpService } from '@/services/emp-service';
import { CommonCodeService } from '@/services/common-code-service';
import { FamilyInfoService } from '@/services/family-info-service';
import { AddressFormComponent, AddressData, AddressFormConfig } from '@/Components/Features/EmployeeInfo/address-form/address-form';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { LocationType } from '@/models/enums';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

interface FamilyMember {
    employeeId: number;
    fmid: number;
    relation: number | null;
    nameEN: string | null;
    nameBN: string | null;
    dob: Date | null;
    maritalStatus: number | null;
    occupation: number | null;
    occupationDetails: string | null;
    districtId: number | null;
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
        ConfirmDialogModule,
        TabsModule,
        DividerModule,
        AddressFormComponent,
        EmployeeSearchComponent,
        FlexibleDateDirective
    ],
    providers: [ConfirmationService],
    templateUrl: './emp-family-info.html',
    styleUrl: './emp-family-info.scss'
})
export class EmpFamilyInfo implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    private sharedService = inject(SharedService);

    /** Logged-in user for CreatedBy / LastUpdatedBy. Falls back to 'system' only when nobody is signed in. */
    private get auditUser(): string {
        return this.sharedService.getCurrentUser() ?? 'system';
    }

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    /** When true (e.g. inside tab view), the "Employee Family Information" title and header actions are hidden. */
    @Input() hideTitle = false;

    @Input() embedMode = false;
    @Input() externalEmployeeId: number | null = null;
    @Output() saved = new EventEmitter<void>();
    @Output() cancelled = new EventEmitter<void>();

    employeeFound: boolean = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly: boolean = false;

    // Family members data
    familyMembers: FamilyMember[] = [];
    isLoading: boolean = false;

    // Inline form
    showInlineForm: boolean = false;
    displayDialog: boolean = false;
    isEditMode: boolean = false;
    familyForm!: FormGroup;
    editingFmid: number | null = null;

    // Dropdowns
    relationOptions: any[] = [];
    maritalStatusOptions: any[] = [];
    occupationOptions: any[] = [];
    districtOptions: any[] = [];

    // Address Dialog (separate dialog for viewing/editing existing addresses)
    displayAddressDialog: boolean = false;
    selectedFamilyMember: FamilyMember | null = null;
    permanentAddressData: AddressData | null = null;
    presentAddressData: AddressData | null = null;
    permanentAddressId: number = 0; // Track existing AddressId for update
    presentAddressId: number = 0; // Track existing AddressId for update
    isLoadingAddresses: boolean = false;
    isSavingAddresses: boolean = false;

    // Dialog tabs and address data (for Add/Edit Family Member dialog)
    activeDialogTab: string = '0';
    dialogPermanentAddressData: AddressData | null = null;
    dialogPresentAddressData: AddressData | null = null;
    dialogPermanentAddressId: number = 0; // Track existing AddressId for update in dialog
    dialogPresentAddressId: number = 0; // Track existing AddressId for update in dialog
    isSaving: boolean = false;

    // Address form references
    @ViewChild('permanentAddressForm') permanentAddressForm!: AddressFormComponent;
    @ViewChild('presentAddressForm') presentAddressForm!: AddressFormComponent;
    @ViewChild('dialogPermanentAddressForm') dialogPermanentAddressForm!: AddressFormComponent;
    @ViewChild('dialogPresentAddressForm') dialogPresentAddressForm!: AddressFormComponent;

    // Address configs
    permanentAddressConfig: AddressFormConfig = {
        title: 'Permanent Address',
        addressType: 'permanent',
        showSameAsPresent: false
    };

    presentAddressConfig: AddressFormConfig = {
        title: 'Present Address',
        addressType: 'present',
        showSameAsPresent: true,
        sameAsLabel: 'Same as Permanent Address'
    };

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
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadDropdowns();
        if (this.embedMode && this.externalEmployeeId != null) {
            this.mode = 'edit';
            this.isReadonly = false;
            this.selectedEmployeeId = this.externalEmployeeId;
            this.employeeFound = true;
            this.loadEmployeeById(this.externalEmployeeId);
            return;
        }
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
            occupationDetails: [''],
            districtId: [null],
            nid: [''],
            mobileNo: [''],
            passportNo: [''],
            email: ['', Validators.email]
        });

        // Clear dependent fields when occupation is cleared
        this.familyForm.get('occupation')?.valueChanges.subscribe((value) => {
            if (!value) {
                this.familyForm.patchValue({ occupationDetails: '', districtId: null });
            }
        });
    }

    /**
     * Capitalize the first letter of each word in the given text field (fixes
     * casing mistakes like "john doe" → "John Doe"). Runs on blur.
     */
    capitalizeWords(fieldName: string): void {
        const field = this.familyForm.get(fieldName);
        const value = field?.value;
        if (typeof value !== 'string' || !value.trim()) return;
        const formatted = value
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase()
            .replace(/\b\p{L}/gu, (ch) => ch.toUpperCase());
        if (formatted !== value) {
            field!.setValue(formatted);
        }
    }

    loadDropdowns(): void {
        // Load Relation dropdown
        this.commonCodeService.getAllActiveCommonCodesType('Relationship').subscribe({
            next: (data) => {
                this.relationOptions = data.map((item) => ({
                    label: item.codeValueEN || item.displayCodeValueEN,
                    value: item.codeId
                }));
            }
        });

        // Load MaritalStatus dropdown
        this.commonCodeService.getAllActiveCommonCodesType('MaritalStatus').subscribe({
            next: (data) => {
                this.maritalStatusOptions = data.map((item) => ({
                    label: item.codeValueEN || item.displayCodeValueEN,
                    value: item.codeId
                }));
            }
        });

        // Load Occupation dropdown
        this.commonCodeService.getAllActiveCommonCodesType('Occupation').subscribe({
            next: (data) => {
                this.occupationOptions = data.map((item) => ({
                    label: item.codeValueEN || item.displayCodeValueEN,
                    value: item.codeId
                }));
            }
        });

        // Load District dropdown
        this.commonCodeService.getAllActiveCommonCodesType('District').subscribe({
            next: (data) => {
                this.districtOptions = data.map((item) => ({
                    label: item.codeValueEN || item.displayCodeValueEN,
                    value: item.codeId
                }));
            }
        });
    }

    checkRouteParams(): void {
        this.route.queryParams.subscribe((params) => {
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
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load employee' });
            }
        });
    }

    loadFamilyMembers(): void {
        if (!this.selectedEmployeeId) return;

        this.isLoading = true;
        this.familyInfoService.getByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (data: any[]) => {
                this.familyMembers = data.map((item) => ({
                    employeeId: item.employeeId || item.EmployeeId,
                    fmid: item.fmid || item.FMID,
                    relation: item.relation || item.Relation,
                    nameEN: item.nameEN || item.NameEN,
                    nameBN: item.nameBN || item.NameBN,
                    dob: item.dob || item.DOB ? new Date(item.dob || item.DOB) : null,
                    maritalStatus: item.maritalStatus || item.MaritalStatus,
                    occupation: item.occupation || item.Occupation,
                    occupationDetails: item.occupationDetails || item.OccupationDetails,
                    districtId: item.districtId || item.DistrictId,
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
        const option = this.relationOptions.find((o) => o.value === relationId);
        return option ? option.label : 'N/A';
    }

    getMaritalStatusName(statusId: number | null): string {
        if (!statusId) return 'N/A';
        const option = this.maritalStatusOptions.find((o) => o.value === statusId);
        return option ? option.label : 'N/A';
    }

    getOccupationName(occupationId: number | null): string {
        if (!occupationId) return 'N/A';
        const option = this.occupationOptions.find((o) => o.value === occupationId);
        return option ? option.label : 'N/A';
    }

    getDistrictName(districtId: number | null): string {
        if (!districtId) return 'N/A';
        const option = this.districtOptions.find((o) => o.value === districtId);
        return option ? option.label : 'N/A';
    }

    openAddDialog(): void {
        this.isEditMode = false;
        this.isReadonly = false;
        this.editingFmid = null;
        this.familyForm.reset();
        this.activeDialogTab = '0';
        this.dialogPermanentAddressData = null;
        this.dialogPresentAddressData = null;
        this.dialogPermanentAddressId = 0;
        this.dialogPresentAddressId = 0;
        this.showInlineForm = true;
    }

    openEditDialog(member: FamilyMember): void {
        this.isEditMode = true;
        this.isReadonly = false; // Switch to edit mode when opening edit dialog
        this.editingFmid = member.fmid;
        this.familyForm.patchValue({
            relation: member.relation,
            nameEN: member.nameEN,
            nameBN: member.nameBN,
            dob: member.dob,
            maritalStatus: member.maritalStatus,
            occupation: member.occupation,
            occupationDetails: member.occupationDetails,
            districtId: member.districtId,
            nid: member.nid,
            mobileNo: member.mobileNo,
            passportNo: member.passportNo,
            email: member.email
        });
        this.activeDialogTab = '0';
        this.dialogPermanentAddressData = null;
        this.dialogPresentAddressData = null;
        this.dialogPermanentAddressId = 0;
        this.dialogPresentAddressId = 0;
        this.loadDialogAddresses(member);
        this.showInlineForm = true;
    }

    /** Relation codeId that represents "Spouse", resolved from the loaded relation options. */
    private get spouseRelationCodeId(): number | null {
        const opt = this.relationOptions.find((o) => (o.label || '').toLowerCase().trim() === 'spouse');
        return opt ? opt.value : null;
    }

    /** True when this family member is the spouse (so spouse-typed addresses belong to them). */
    private isSpouseMember(member: FamilyMember): boolean {
        const spouseId = this.spouseRelationCodeId;
        return spouseId != null && member.relation === spouseId;
    }

    /**
     * Picks the permanent/present address rows for a family member.
     * Normal members match by FMID. The spouse's address is stored with dedicated
     * Spouse* location types and may be unlinked (FMID 0/mismatched) when seeded from
     * the Serving Member / Basic Info forms, so for the spouse we also accept those
     * spouse-typed rows by location type alone.
     */
    private pickMemberAddresses(addresses: any[], member: FamilyMember): { permanent: any | undefined; present: any | undefined } {
        const isSpouse = this.isSpouseMember(member);
        const relevant = (addresses || []).filter((addr) => {
            const isActive = addr.active !== false && addr.Active !== false;
            if (!isActive) return false;
            const fmidMatch = (addr.fmid || addr.FMID) === member.fmid;
            if (fmidMatch) return true;
            if (!isSpouse) return false;
            const lt = (addr.locationType || addr.LocationType || '').toLowerCase();
            return lt === LocationType.SpousePermanent.toLowerCase() || lt === LocationType.SpousePresent.toLowerCase();
        });

        const permanent = relevant.find((addr) => (addr.locationType || addr.LocationType || '').toLowerCase().includes('permanent'));
        const present = relevant.find((addr) => (addr.locationType || addr.LocationType || '').toLowerCase().includes('present'));
        return { permanent, present };
    }

    loadDialogAddresses(member: FamilyMember): void {
        if (!member.employeeId || !member.fmid) return;

        this.empService.getAddressesByEmployeeId(member.employeeId).subscribe({
            next: (addresses: any[]) => {
                const { permanent: permanentAddr, present: presentAddr } = this.pickMemberAddresses(addresses, member);

                if (permanentAddr) {
                    this.dialogPermanentAddressData = this.mapAddressToFormData(permanentAddr);
                    this.dialogPermanentAddressId = permanentAddr.addressId || permanentAddr.AddressId || 0;
                }
                if (presentAddr) {
                    this.dialogPresentAddressData = this.mapAddressToFormData(presentAddr);
                    this.dialogPresentAddressId = presentAddr.addressId || presentAddr.AddressId || 0;
                }
            },
            error: (err) => {
                console.error('Failed to load family member addresses', err);
            }
        });
    }

    saveFamily(): void {
        if (this.familyForm.invalid) {
            Object.keys(this.familyForm.controls).forEach((key) => {
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
            OccupationDetails: formValue.occupationDetails || null,
            DistrictId: formValue.districtId || null,
            NID: formValue.nid || null,
            MobileNo: formValue.mobileNo || null,
            PassportNo: formValue.passportNo || null,
            Email: formValue.email || null,
            LastUpdatedBy: this.auditUser,
            Lastupdate: new Date().toISOString(),
            StatusDate: new Date().toISOString()
        };

        if (this.isEditMode) {
            this.familyInfoService.update(payload).subscribe({
                next: () => {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Family member updated successfully' });
                    this.showInlineForm = false;
                    this.loadFamilyMembers();
                },
                error: (err) => {
                    console.error('Failed to update family member', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to update family member' });
                }
            });
        } else {
            this.familyInfoService.save(payload).subscribe({
                next: (response: any) => {
                    // Get the generated FMID from the response
                    const generatedFmid = response?.data?.fmid || response?.data?.FMID || response?.FMID || response?.fmid;

                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Family member added successfully' });
                    this.showInlineForm = false;
                    this.loadFamilyMembers();

                    // If FMID was returned, ask user if they want to add address
                    if (generatedFmid && this.selectedEmployeeId) {
                        this.confirmationService.confirm({
                            message: 'Family member saved. Do you want to add address for this family member?',
                            header: 'Add Address',
                            icon: 'pi pi-map-marker',
                            acceptLabel: 'Yes, Add Address',
                            rejectLabel: 'No, Later',
                            accept: () => {
                                // Create a temporary family member object with the generated FMID
                                const newMember: FamilyMember = {
                                    employeeId: this.selectedEmployeeId!,
                                    fmid: generatedFmid,
                                    relation: formValue.relation,
                                    nameEN: formValue.nameEN,
                                    nameBN: formValue.nameBN,
                                    dob: formValue.dob,
                                    maritalStatus: formValue.maritalStatus,
                                    occupation: formValue.occupation,
                                    occupationDetails: formValue.occupationDetails,
                                    districtId: formValue.districtId,
                                    nid: formValue.nid,
                                    mobileNo: formValue.mobileNo,
                                    passportNo: formValue.passportNo,
                                    email: formValue.email
                                };
                                this.openAddressDialog(newMember);
                            }
                        });
                    }
                },
                error: (err) => {
                    console.error('Failed to save family member', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to save family member' });
                }
            });
        }
    }

    confirmDelete(member: FamilyMember): void {
        this.confirmationService.confirm({
            message: `Are you sure you want to delete ${member.nameEN}?`,
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Delete', severity: 'danger' },
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
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to delete family member' });
            }
        });
    }

    formatDate(date: Date): string {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        // Local Y/M/D — toISOString() converts to UTC and shifts the date back a day in UTC+ zones.
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    enableEditMode(): void {
        this.mode = 'edit';
        this.isReadonly = false;
    }

    enableSearchEditMode(): void {
        this.isReadonly = false;
    }

    goBack(): void {
        if (this.embedMode) {
            this.cancelled.emit();
            return;
        }
        this.router.navigate(['/emp-list']);
    }

    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.familyMembers = [];
    }

    // Handle employee search component events
    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.isReadonly = true;
        this.loadFamilyMembers();
    }

    onEmployeeSearchReset(): void {
        this.resetForm();
    }

    // Address Dialog Methods
    openAddressDialog(member: FamilyMember): void {
        this.selectedFamilyMember = member;
        this.permanentAddressData = null;
        this.presentAddressData = null;
        this.permanentAddressId = 0; // Reset for new/update
        this.presentAddressId = 0; // Reset for new/update
        this.displayAddressDialog = true;
        this.loadFamilyMemberAddresses(member);
    }

    loadFamilyMemberAddresses(member: FamilyMember): void {
        if (!member.employeeId || !member.fmid) return;

        this.isLoadingAddresses = true;

        // Get addresses filtered by EmployeeId and FMID
        this.empService.getAddressesByEmployeeId(member.employeeId).subscribe({
            next: (addresses: any[]) => {
                // Find permanent and present addresses (spouse-typed rows included for the spouse)
                const { permanent: permanentAddr, present: presentAddr } = this.pickMemberAddresses(addresses, member);

                if (permanentAddr) {
                    this.permanentAddressData = this.mapAddressToFormData(permanentAddr);
                    this.permanentAddressId = permanentAddr.addressId || permanentAddr.AddressId || 0;
                }

                if (presentAddr) {
                    this.presentAddressData = this.mapAddressToFormData(presentAddr);
                    this.presentAddressId = presentAddr.addressId || presentAddr.AddressId || 0;
                }

                this.isLoadingAddresses = false;
            },
            error: (err) => {
                console.error('Failed to load family member addresses', err);
                this.isLoadingAddresses = false;
            }
        });
    }

    mapAddressToFormData(addr: any): AddressData {
        return {
            employeeId: addr.employeeID || addr.EmployeeID,
            division: addr.divisionType || addr.DivisionType,
            district: addr.districtType || addr.DistrictType,
            upazila: addr.thanaType || addr.ThanaType,
            postOffice: addr.postOfficeType || addr.PostOfficeType,
            postCode: addr.postCode || addr.PostCode || '',
            villageEnglish: addr.addressAreaEN || addr.AddressAreaEN || '',
            villageBangla: addr.addressAreaBN || addr.AddressAreaBN || '',
            houseRoad: addr.houseRoad || addr.HouseRoad || ''
        };
    }

    copyPermanentToPresent(): void {
        if (this.permanentAddressForm) {
            const permanentData = this.permanentAddressForm.getFormData();
            if (permanentData.data && permanentData.data.division) {
                this.presentAddressForm?.populateFromSourceAddress(permanentData.data);
            } else {
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Warning',
                    detail: 'Please fill Permanent Address first'
                });
            }
        }
    }

    saveFamilyAddresses(): void {
        if (!this.selectedFamilyMember) return;

        const permanentFormData = this.permanentAddressForm?.getFormData();
        const presentFormData = this.presentAddressForm?.getFormData();

        // Check if at least one address has data
        if (!permanentFormData?.data?.division && !presentFormData?.data?.division) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Warning',
                detail: 'Please fill at least one address'
            });
            return;
        }

        this.isSavingAddresses = true;
        const savePromises: Promise<any>[] = [];
        const isSpouse = this.isSpouseMember(this.selectedFamilyMember);
        const permType = isSpouse ? LocationType.SpousePermanent : LocationType.Permanent;
        const presType = isSpouse ? LocationType.SpousePresent : LocationType.Present;

        // Save permanent address if filled
        if (permanentFormData?.data?.division) {
            savePromises.push(
                this.saveFamilyAddress(
                    permanentFormData.data,
                    permType,
                    this.selectedFamilyMember.employeeId,
                    this.selectedFamilyMember.fmid,
                    this.permanentAddressId // Pass existing AddressId for update
                ).toPromise()
            );
        }

        // Save present address if filled
        if (presentFormData?.data?.division) {
            savePromises.push(
                this.saveFamilyAddress(
                    presentFormData.data,
                    presType,
                    this.selectedFamilyMember.employeeId,
                    this.selectedFamilyMember.fmid,
                    this.presentAddressId // Pass existing AddressId for update
                ).toPromise()
            );
        }

        Promise.all(savePromises)
            .then(() => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Addresses saved successfully'
                });
                this.displayAddressDialog = false;
                this.isSavingAddresses = false;
            })
            .catch((err) => {
                console.error('Failed to save addresses', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to save addresses'
                });
                this.isSavingAddresses = false;
            });
    }

    saveFamilyAddress(data: AddressData, locationType: LocationType, employeeId: number, fmid: number, addressId: number = 0) {
        const addressPayload = {
            EmployeeID: employeeId,
            AddressId: addressId, // Use existing AddressId for update, 0 for new
            FMID: fmid, // Pass FMID for family member address
            LocationType: locationType,
            LocationCode: `${data.division}-${data.district}-${data.upazila}`,
            PostCode: data.postCode || '',
            AddressAreaEN: data.villageEnglish || '',
            AddressAreaBN: data.villageBangla || '',
            HouseRoad: data.houseRoad || '',
            DivisionType: data.division,
            DistrictType: data.district,
            ThanaType: data.upazila,
            PostOfficeType: data.postOffice,
            Active: true,
            CreatedBy: this.auditUser,
            CreatedDate: new Date().toISOString(),
            LastUpdatedBy: this.auditUser,
            Lastupdate: new Date().toISOString()
        };

        // Use updateAddress if addressId exists, otherwise saveAddress for new
        if (addressId > 0) {
            return this.empService.updateAddress(addressPayload);
        } else {
            return this.empService.saveAddress(addressPayload);
        }
    }

    closeAddressDialog(): void {
        this.displayAddressDialog = false;
        this.selectedFamilyMember = null;
        this.permanentAddressData = null;
        this.presentAddressData = null;
        this.permanentAddressId = 0;
        this.presentAddressId = 0;
    }

    // Dialog methods for Add/Edit Family Member with Address
    copyDialogPermanentToPresent(): void {
        if (this.dialogPermanentAddressForm) {
            const permanentData = this.dialogPermanentAddressForm.getFormData();
            if (permanentData.data && permanentData.data.division) {
                this.dialogPresentAddressForm?.populateFromSourceAddress(permanentData.data);
            } else {
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Warning',
                    detail: 'Please fill Permanent Address first'
                });
            }
        }
    }

    saveFamilyWithAddress(): void {
        if (this.familyForm.invalid) {
            Object.keys(this.familyForm.controls).forEach((key) => {
                this.familyForm.get(key)?.markAsTouched();
            });
            this.activeDialogTab = '0'; // Switch to basic info tab to show errors
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please fill required fields in Basic Info' });
            return;
        }

        this.isSaving = true;
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
            OccupationDetails: formValue.occupationDetails || null,
            DistrictId: formValue.districtId || null,
            NID: formValue.nid || null,
            MobileNo: formValue.mobileNo || null,
            PassportNo: formValue.passportNo || null,
            Email: formValue.email || null,
            LastUpdatedBy: this.auditUser,
            Lastupdate: new Date().toISOString(),
            StatusDate: new Date().toISOString()
        };

        const saveObservable = this.isEditMode ? this.familyInfoService.update(payload) : this.familyInfoService.save(payload);

        saveObservable.subscribe({
            next: (response: any) => {
                // Get FMID - for edit mode use existing, for new get from response
                const fmid = this.isEditMode ? this.editingFmid! : response?.data?.fmid || response?.data?.FMID || response?.FMID || response?.fmid;

                if (fmid && this.selectedEmployeeId) {
                    // Save addresses if filled
                    this.saveDialogAddresses(this.selectedEmployeeId, fmid);
                } else {
                    this.isSaving = false;
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Family member saved successfully' });
                    this.showInlineForm = false;
                    this.loadFamilyMembers();
                    this.resetDialogState();
                }
            },
            error: (err) => {
                console.error('Failed to save family member', err);
                this.isSaving = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to save family member' });
            }
        });
    }

    saveDialogAddresses(employeeId: number, fmid: number): void {
        const permanentFormData = this.dialogPermanentAddressForm?.getFormData();
        const presentFormData = this.dialogPresentAddressForm?.getFormData();

        const savePromises: Promise<any>[] = [];
        const isSpouse = this.spouseRelationCodeId != null && this.familyForm.get('relation')?.value === this.spouseRelationCodeId;
        const permType = isSpouse ? LocationType.SpousePermanent : LocationType.Permanent;
        const presType = isSpouse ? LocationType.SpousePresent : LocationType.Present;

        // Save permanent address if filled
        if (permanentFormData?.data?.division) {
            savePromises.push(this.saveFamilyAddress(permanentFormData.data, permType, employeeId, fmid, this.dialogPermanentAddressId).toPromise());
        }

        // Save present address if filled
        if (presentFormData?.data?.division) {
            savePromises.push(this.saveFamilyAddress(presentFormData.data, presType, employeeId, fmid, this.dialogPresentAddressId).toPromise());
        }

        if (savePromises.length > 0) {
            Promise.all(savePromises)
                .then(() => {
                    this.isSaving = false;
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Family member and addresses saved successfully' });
                    this.showInlineForm = false;
                    this.loadFamilyMembers();
                    this.resetDialogState();
                })
                .catch((err) => {
                    console.error('Failed to save addresses', err);
                    this.isSaving = false;
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Family member saved but failed to save addresses' });
                    this.showInlineForm = false;
                    this.loadFamilyMembers();
                    this.resetDialogState();
                });
        } else {
            this.isSaving = false;
            this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Family member saved successfully' });
            this.showInlineForm = false;
            this.loadFamilyMembers();
            this.resetDialogState();
        }
    }

    resetDialogState(): void {
        this.activeDialogTab = '0';
        this.dialogPermanentAddressData = null;
        this.dialogPresentAddressData = null;
        this.dialogPermanentAddressId = 0;
        this.dialogPresentAddressId = 0;
        this.familyForm.reset();
        this.editingFmid = null;
        this.isEditMode = false;
    }
}
