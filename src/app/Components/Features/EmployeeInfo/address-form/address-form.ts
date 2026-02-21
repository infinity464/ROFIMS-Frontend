import { CommonCodeService } from '@/services/common-code-service';
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, OnChanges, SimpleChanges, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Fluid } from 'primeng/fluid';
import { Checkbox } from 'primeng/checkbox';
import { Select } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { forkJoin } from 'rxjs';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { SharedService } from '@/shared/services/shared-service';

export interface AddressData {
    employeeId?: number;
    division: number | null;
    district: number | null;
    upazila: number | null;
    postOffice: number | null;
    postCode: string;
    villageEnglish: string;
    villageBangla: string;
    houseRoad: string;
}

export interface AddressFormConfig {
    title: string;
    addressType: 'permanent' | 'present' | 'wife' | 'father' | 'mother' | 'emergency' | 'wifePresent';
    showSameAsPresent?: boolean;
    sameAsLabel?: string; // Custom label for "Same as" checkbox
    employeeId?: number;
    initialData?: Partial<AddressData>;
}

@Component({
    selector: 'app-address-form',
    standalone: true,
    templateUrl: './address-form.html',
    styleUrls: ['./address-form.scss'],
    imports: [Fluid, InputTextModule, Checkbox, Select, ButtonModule, CommonModule, FormsModule, ReactiveFormsModule, DialogModule, TooltipModule]
})
export class AddressFormComponent implements OnInit, OnChanges {
    @Input() config!: AddressFormConfig;
    @Input() savedAddressId?: number; // Generated AddressId after save
    @Input() showButtons: boolean = true; // Control visibility of save/cancel buttons
    @Input() showCard: boolean = true; // Control visibility of card wrapper
    @Input() isReadonly: boolean = false; // Control readonly mode
    @Input() initialAddressData?: AddressData; // Initial data for view/edit mode
    @Input() isOptional: boolean = false; // When true, fields are not required

    @Output() onSave = new EventEmitter<AddressData>();
    @Output() onCancel = new EventEmitter<void>();
    @Output() onSameAsPresentRequest = new EventEmitter<void>(); // Request parent for source address data

    addressForm!: FormGroup;

    // Dropdown options
    divisions: any[] = [];
    districts: any[] = [];
    upazilas: any[] = [];
    postOffices: any[] = [];

    // Add Post Office dialog
    showPostOfficeDialog: boolean = false;
    newPostOfficeNameEN: string = '';
    newPostOfficeNameBN: string = '';
    isSavingPostOffice: boolean = false;

    constructor(
        private fb: FormBuilder,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private masterBasicSetupService: MasterBasicSetupService,
        private sharedService: SharedService
    ) {}

    ngOnInit(): void {
        this.initializeForm();

        if (!this.config) {
            console.warn('AddressFormComponent: config is required');
            return;
        }

        this.loadDivisions();
        this.addressForm.get('sameAsPresent')!.valueChanges.subscribe((checked) => this.onSameAsPresentChange(checked));

        // If initial data is provided, load it (for view/edit mode)
        if (this.initialAddressData) {
            this.loadInitialData(this.initialAddressData);
        }

        // If readonly mode, disable the form
        if (this.isReadonly) {
            this.disableAddressFields();
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        // Handle initialAddressData changes (async data loading from parent)
        if (changes['initialAddressData'] && !changes['initialAddressData'].firstChange) {
            const newData = changes['initialAddressData'].currentValue;
            if (newData) {
                this.loadInitialData(newData);
            }
        }

        // Handle isReadonly changes
        if (changes['isReadonly'] && !changes['isReadonly'].firstChange) {
            if (changes['isReadonly'].currentValue) {
                this.disableAddressFields();
            } else {
                this.enableAddressFields();
            }
        }
    }

    initializeForm(): void {
        const requiredValidator = this.isOptional ? [] : [Validators.required];
        this.addressForm = this.fb.group({
            sameAsPresent: [false],
            division: [null, requiredValidator],
            district: [null, requiredValidator],
            upazila: [null, requiredValidator],
            postOffice: [null, requiredValidator],
            postCode: ['', [Validators.maxLength(10)]],
            villageEnglish: [''],
            villageBangla: [''],
            houseRoad: ['']
        });
    }

    loadDivisions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('Division').subscribe({
            next: (data) => {
                this.divisions = data;
            },
            error: (error) => {
                console.error('Failed to load divisions', error);
            }
        });
    }

    loadDistrict(divisionId: number){
        this.commonCodeService.getAllActiveCommonCodesByParentId(divisionId).subscribe({
            next: (res)=>{
                this.districts = res;
            }
        })
    }
    loadUpazila(districtId: number){
        this.commonCodeService.getAllActiveCommonCodesByParentId(districtId).subscribe({
            next: (res)=>{
                this.upazilas = res;
            }
        })
    }
    loadPO(upzilaId: number){
        this.commonCodeService.getAllActiveCommonCodesByParentId(upzilaId).subscribe({
            next: (res)=>{
                this.postOffices = res;
            }
        })
    }

    // Load initial data for view/edit mode (does NOT disable fields)
    loadInitialData(sourceData: AddressData): void {
        if (!sourceData || !sourceData.division) {
            return;
        }

        // Load all cascading dropdowns first, then set values
        const requests: any = {};

        if (sourceData.division) {
            requests.districts = this.commonCodeService.getAllActiveCommonCodesByParentId(sourceData.division);
        }
        if (sourceData.district) {
            requests.upazilas = this.commonCodeService.getAllActiveCommonCodesByParentId(sourceData.district);
        }
        if (sourceData.upazila) {
            requests.postOffices = this.commonCodeService.getAllActiveCommonCodesByParentId(sourceData.upazila);
        }

        // Load all dropdown data first
        if (Object.keys(requests).length > 0) {
            forkJoin(requests).subscribe({
                next: (results: any) => {
                    // Set dropdown options
                    if (results.districts) this.districts = results.districts;
                    if (results.upazilas) this.upazilas = results.upazilas;
                    if (results.postOffices) this.postOffices = results.postOffices;

                    // Now patch form with source address data
                    this.addressForm.patchValue({
                        division: sourceData.division,
                        district: sourceData.district,
                        upazila: sourceData.upazila,
                        postOffice: sourceData.postOffice,
                        postCode: sourceData.postCode || '',
                        villageEnglish: sourceData.villageEnglish || '',
                        villageBangla: sourceData.villageBangla || '',
                        houseRoad: sourceData.houseRoad || ''
                    });

                    // Do NOT disable fields here - this is for edit mode
                    // Readonly mode is handled separately via isReadonly input
                },
                error: (err) => {
                    console.error('Error loading initial address data', err);
                }
            });
        } else {
            // No cascading data needed, just patch values
            this.addressForm.patchValue({
                division: sourceData.division,
                district: sourceData.district,
                upazila: sourceData.upazila,
                postOffice: sourceData.postOffice,
                postCode: sourceData.postCode || '',
                villageEnglish: sourceData.villageEnglish || '',
                villageBangla: sourceData.villageBangla || '',
                houseRoad: sourceData.houseRoad || ''
            });
        }
    }


    onDivisionChange(divisionId: number): void {
        // Reset dependent fields
        this.addressForm.patchValue({
            district: null,
            upazila: null,
            postOffice: null
        });

       this.loadDistrict(divisionId)
        this.upazilas = [];
        this.postOffices = [];
    }

    onDistrictChange(upazilaId: number): void {
        // Reset dependent fields
        this.addressForm.patchValue({
            upazila: null,
            postOffice: null
        });

       this.loadUpazila(upazilaId)
    }

    onUpazilaChange(upazilaId: number): void {
        // Reset dependent field
        this.addressForm.patchValue({
            postOffice: null
        });

        this.loadPO(upazilaId)
    }

    onSameAsPresentChange(checked: boolean): void {
        if (checked) {
            // Emit event to request source address data from parent
            this.onSameAsPresentRequest.emit();
        } else {
            this.enableAddressFields();
            // Reset form when unchecked
            this.addressForm.patchValue({
                division: null,
                district: null,
                upazila: null,
                postOffice: null,
                postCode: '',
                villageEnglish: '',
                villageBangla: '',
                houseRoad: ''
            });
            this.districts = [];
            this.upazilas = [];
            this.postOffices = [];
        }
    }

    // Public method for parent to populate this form with source address data
    populateFromSourceAddress(sourceData: AddressData): void {
        if (!sourceData || !sourceData.division) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Warning',
                detail: 'Please fill Permanent Address first'
            });
            this.addressForm.patchValue({ sameAsPresent: false });
            return;
        }

        // Load all cascading dropdowns first, then set values
        const requests: any = {};

        if (sourceData.division) {
            requests.districts = this.commonCodeService.getAllActiveCommonCodesByParentId(sourceData.division);
        }
        if (sourceData.district) {
            requests.upazilas = this.commonCodeService.getAllActiveCommonCodesByParentId(sourceData.district);
        }
        if (sourceData.upazila) {
            requests.postOffices = this.commonCodeService.getAllActiveCommonCodesByParentId(sourceData.upazila);
        }

        // Load all dropdown data first
        if (Object.keys(requests).length > 0) {
            forkJoin(requests).subscribe({
                next: (results: any) => {
                    // Set dropdown options
                    if (results.districts) this.districts = results.districts;
                    if (results.upazilas) this.upazilas = results.upazilas;
                    if (results.postOffices) this.postOffices = results.postOffices;

                    // Now patch form with source address data
                    this.addressForm.patchValue({
                        division: sourceData.division,
                        district: sourceData.district,
                        upazila: sourceData.upazila,
                        postOffice: sourceData.postOffice,
                        postCode: sourceData.postCode || '',
                        villageEnglish: sourceData.villageEnglish || '',
                        villageBangla: sourceData.villageBangla || '',
                        houseRoad: sourceData.houseRoad || ''
                    });

                    this.disableAddressFields();
                },
                error: (err) => {
                    console.error('Error loading address data', err);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to load address data'
                    });
                    this.addressForm.patchValue({ sameAsPresent: false });
                }
            });
        } else {
            // No cascading data needed, just patch values
            this.addressForm.patchValue({
                division: sourceData.division,
                district: sourceData.district,
                upazila: sourceData.upazila,
                postOffice: sourceData.postOffice,
                postCode: sourceData.postCode || '',
                villageEnglish: sourceData.villageEnglish || '',
                villageBangla: sourceData.villageBangla || '',
                houseRoad: sourceData.houseRoad || ''
            });
            this.disableAddressFields();
        }
    }

    private disableAddressFields(): void {
        ['division', 'district', 'upazila', 'postOffice', 'postCode', 'villageEnglish', 'villageBangla', 'houseRoad'].forEach((name) => this.addressForm.get(name)?.disable());
    }

    private enableAddressFields(): void {
        ['division', 'district', 'upazila', 'postOffice', 'postCode', 'villageEnglish', 'villageBangla', 'houseRoad'].forEach((name) => this.addressForm.get(name)?.enable());
    }

    handleSave(): void {
        if (this.addressForm.invalid) return;

        const formData: AddressData = {
            employeeId: this.config.employeeId,
            ...this.addressForm.getRawValue()
        };

        this.onSave.emit(formData);
    }

    handleCancel(): void {
        this.onCancel.emit();
    }

    // Public method to get form data for parent component
    getFormData(): { data: AddressData; valid: boolean } {
        return {
            data: {
                employeeId: this.config.employeeId,
                ...this.addressForm.getRawValue()
            },
            valid: this.addressForm.valid
        };
    }

    // Mark form as touched to show validation errors
    markAsTouched(): void {
        Object.keys(this.addressForm.controls).forEach(key => {
            this.addressForm.get(key)?.markAsTouched();
        });
    }

    isFieldInvalid(fieldName: string): boolean {
        const field = this.addressForm.get(fieldName);
        return !!(field && field.invalid && (field.dirty || field.touched));
    }

    getErrorMessage(fieldName: string): string {
        const field = this.addressForm.get(fieldName);
        if (field?.hasError('required')) {
            return 'This field is required';
        }
        return '';
    }

    get formTitle(): string {
        return this.config.title;
    }

    get showSameAsPresentCheckbox(): boolean {
        return this.config.showSameAsPresent === true;
    }

    get sameAsCheckboxLabel(): string {
        return this.config.sameAsLabel || 'Same as Permanent Address';
    }

    // Check if form has meaningful data (division is selected)
    hasData(): boolean {
        const division = this.addressForm.get('division')?.value;
        return division !== null && division !== undefined;
    }

    // --- Add Post Office dialog ---

    openAddPostOfficeDialog(): void {
        this.newPostOfficeNameEN = '';
        this.newPostOfficeNameBN = '';
        this.showPostOfficeDialog = true;
    }

    getSelectedDivisionName(): string {
        const id = this.addressForm.get('division')?.value;
        return this.divisions.find(d => d.codeId === id)?.codeValueEN || '';
    }

    getSelectedDistrictName(): string {
        const id = this.addressForm.get('district')?.value;
        return this.districts.find(d => d.codeId === id)?.codeValueEN || '';
    }

    getSelectedUpazilaName(): string {
        const id = this.addressForm.get('upazila')?.value;
        return this.upazilas.find(d => d.codeId === id)?.codeValueEN || '';
    }

    saveNewPostOffice(): void {
        if (!this.newPostOfficeNameEN?.trim()) return;

        const upazilaId = this.addressForm.get('upazila')?.value;
        if (!upazilaId) return;

        this.isSavingPostOffice = true;
        const currentUser = this.sharedService.getCurrentUser();
        const currentDateTime = this.sharedService.getCurrentDateTime();

        const payload = {
            orgId: 0,
            codeId: 0,
            codeType: 'PostOffice',
            codeValueEN: this.newPostOfficeNameEN.trim(),
            codeValueBN: this.newPostOfficeNameBN?.trim() || null,
            commCode: null,
            displayCodeValueEN: null,
            displayCodeValueBN: null,
            status: true,
            parentCodeId: upazilaId,
            sortOrder: null,
            level: null,
            createdBy: currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.create(payload as any).subscribe({
            next: (res) => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Post Office created successfully'
                });
                this.showPostOfficeDialog = false;
                this.isSavingPostOffice = false;

                // Reload post offices and auto-select the new one
                this.commonCodeService.getAllActiveCommonCodesByParentId(upazilaId).subscribe({
                    next: (postOffices) => {
                        this.postOffices = postOffices;
                        if (res?.codeId) {
                            this.addressForm.patchValue({ postOffice: res.codeId });
                        }
                    }
                });
            },
            error: (err) => {
                console.error('Error creating post office:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create post office'
                });
                this.isSavingPostOffice = false;
            }
        });
    }
}
