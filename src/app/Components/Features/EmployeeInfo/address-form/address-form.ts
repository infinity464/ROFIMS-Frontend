import { CommonCodeService } from '@/services/common-code-service';
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Fluid } from 'primeng/fluid';
import { Checkbox } from 'primeng/checkbox';
import { Select } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

export interface AddressData {
    employeeId?: number;
    division: number | null;
    district: number | null;
    upazila: number | null;
    postOffice: number | null;
    villageEnglish: string;
    villageBangla: string;
    houseRoad: string;
}

export interface AddressFormConfig {
    title: string;
    addressType: 'permanent' | 'present' | 'wife' | 'father' | 'mother' | 'emergency';
    showSameAsPresent?: boolean;
    employeeId?: number;
    initialData?: Partial<AddressData>;
}

@Component({
    selector: 'app-address-form',
    templateUrl: './address-form.html',
    styleUrls: ['./address-form.scss'],
    imports: [Fluid, InputTextModule, Checkbox, Select, ButtonModule, CommonModule, FormsModule, ReactiveFormsModule]
})
export class AddressFormComponent implements OnInit {
    @Input() config!: AddressFormConfig;
    @Input() presentAddressData?: AddressData; // For "Same as Present" functionality

    @Output() onSave = new EventEmitter<AddressData>();
    @Output() onCancel = new EventEmitter<void>();

    addressForm!: FormGroup;
    // sameAsPresent: boolean = false;

    // Dropdown options
    divisions: any[] = [];
    districts: any[] = [];
    upazilas: any[] = [];
    postOffices: any[] = [];

    // All data for cascading
    allDistricts: any[] = [];
    allUpazilas: any[] = [];
    allPostOffices: any[] = [];

    constructor(
        private fb: FormBuilder,
        private commonCodeService: CommonCodeService
    ) {}

    ngOnInit(): void {
        this.initializeForm();
        this.loadDivisions();
        this.addressForm.get('sameAsPresent')!.valueChanges.subscribe((checked) => this.onSameAsPresentChange(checked));
    }

    initializeForm(): void {
        this.addressForm = this.fb.group({
            sameAsPresent: [false],
            division: [null, Validators.required],
            district: [null, Validators.required],
            upazila: [null, Validators.required],
            postOffice: [null, Validators.required],
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








    onDivisionChange(divisionId: number): void {
        console.log("OK");
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
        if (checked && this.presentAddressData) {
            this.districts = this.allDistricts.filter((d) => d.divisionId === this.presentAddressData!.division);
            this.upazilas = this.allUpazilas.filter((u) => u.districtId === this.presentAddressData!.district);
            this.postOffices = this.allPostOffices.filter((p) => p.upazilaId === this.presentAddressData!.upazila);

            this.addressForm.patchValue(this.presentAddressData);

            this.disableAddressFields();
        } else {
            this.enableAddressFields();
        }
    }

    private disableAddressFields(): void {
        ['division', 'district', 'upazila', 'postOffice', 'villageEnglish', 'villageBangla', 'houseRoad'].forEach((name) => this.addressForm.get(name)?.disable());
    }

    private enableAddressFields(): void {
        ['division', 'district', 'upazila', 'postOffice', 'villageEnglish', 'villageBangla', 'houseRoad'].forEach((name) => this.addressForm.get(name)?.enable());
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
        return this.config.showSameAsPresent === true && this.config.addressType !== 'present' && !!this.presentAddressData;
    }
}
