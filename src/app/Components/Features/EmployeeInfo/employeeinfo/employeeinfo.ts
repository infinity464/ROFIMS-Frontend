import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { FileUploadModule } from 'primeng/fileupload';
import { TabsModule, Tab, TabList, Tabs, TabPanels, TabPanel } from 'primeng/tabs';
import { DatePickerModule } from 'primeng/datepicker';

import { ConfirmationService, MessageService } from 'primeng/api';
import { switchMap } from 'rxjs/operators';
import { AddressSectionComponent } from '../../Shared/address-section/address-section';
import { EmployeeinfoService } from '../Services/employeeinfo.service';
import { EmployeeInfoModel } from '../model/employeeinfo.model';
import { NomineeInfo } from '../../PersonalInfo/nominee-info/nominee-info';

@Component({
    selector: 'app-employeeinfo',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        CardModule,
        DividerModule,
        SelectModule,
        InputTextModule,
        DatePickerModule,
        TableModule,
        ButtonModule,
        CheckboxModule,
        FileUploadModule,
        AddressSectionComponent,
        Tab,
        TabList,
        Tabs,
        TabPanels,
        TabPanel
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './employeeinfo.html',
    styleUrl: './employeeinfo.scss'
})
export class Employeeinfo implements OnInit {
    form!: FormGroup;
    tempEmployeeID = 102;

    // Mode: 'create' | 'edit' | 'view'
    mode: 'create' | 'edit' | 'view' = 'create';
    currentEmployeeId: number | null = null;

    motherOrganizations = [
        { label: 'Army', value: 1 },
        { label: 'Navy', value: 2 },
        { label: 'Air Force', value: 3 },
        { label: 'Police', value: 4 }
    ];

    employees: EmployeeInfoModel[] = [];

    lastUnitOrganizations = [
        { label: 'Unit A', value: 1 },
        { label: 'Unit B', value: 2 },
        { label: 'Unit C', value: 3 }
    ];

    memberTypes = [
        { label: 'Officer', value: 1 },
        { label: 'Employee', value: 2 }
    ];

    officerTypes = [
        { label: 'General Officer', value: 'General' },
        { label: 'Junior Officer', value: 'Junior' }
    ];

    appointments = [
        { label: 'Ops Officer', value: 1 },
        { label: 'Admin Officer', value: 2 }
    ];

    ranks = [
        { label: 'Rank 1', value: 1 },
        { label: 'Rank 2', value: 2 },
        { label: 'Rank 3', value: 3 }
    ];

    corpsBranches = [
        { label: 'Branch A', value: 1 },
        { label: 'Branch B', value: 2 }
    ];

    trades = [
        { label: 'Trade A', value: 1 },
        { label: 'Trade B', value: 2 }
    ];

    genders = [
        { label: 'Male', value: 1 },
        { label: 'Female', value: 2 }
    ];

    prefixes = [
        { label: 'Mr.', value: 1 },
        { label: 'Mrs.', value: 2 },
        { label: 'Md.', value: 3 }
    ];

    yesNoOptions = [
        { label: 'Yes', value: true },
        { label: 'No', value: false }
    ];

    divisions = [
        { label: 'Dhaka', value: 1 },
        { label: 'Chattogram', value: 2 }
    ];

    districts = [
        { label: 'Dhaka', value: 1 },
        { label: 'Gazipur', value: 2 }
    ];

    upazilas = [
        { label: 'Savar', value: 1 },
        { label: 'Tongi', value: 2 }
    ];

    postOffices = [
        { label: 'Dhanmondi', value: 1 },
        { label: 'Uttara', value: 2 }
    ];

    serviceRecords: any[] = [];
    loading: boolean = false;
    errorMessage: string = '';

    constructor(
        private fb: FormBuilder,
        private employeeService: EmployeeinfoService,
        private confirmationService: ConfirmationService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.buildForm();
        this.handleSameAsPermanent();
        this.handleWifeSameAsPermanent();
        this.handleRelieverToggle();
        this.watchForRabIdGeneration();
        this.loadEmployeeInfo();
    }

    private buildForm(): void {
        this.form = this.fb.group({
            motherOrganization: [null],
            serviceId: [''],
            nidNo: [''],
            motherOrganizationForm: [null, Validators.required],
            lastUnitMotherOrg: [null, Validators.required],
            lastMotherUnitLocation: ['', Validators.required],

            memberType: [null, Validators.required],
            officerType: [null],
            appointment: [null, Validators.required],

            joiningDate: [null, Validators.required],
            rank: [null, Validators.required],
            corpsBranch: [null, Validators.required],

            trade: [null, Validators.required],
            tradeRemarks: [''],

            gender: [null, Validators.required],
            prefix: [null, Validators.required],

            serviceIdOnly: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
            rabId: [{ value: '', disabled: true }],

            nameEnglish: ['', Validators.required],
            nameBangla: ['', Validators.required],
            perDivision: [null, Validators.required],
            perDistrict: [null, Validators.required],
            perUpazila: [null, Validators.required],
            perPostOffice: [null, Validators.required],
            perVillageEnglish: [''],
            perVillageBangla: [''],
            perHouseRoad: [''],
            sameAsPermanent: [false],
            preDivision: [null],
            preDistrict: [null],
            preUpazila: [null],
            prePostOffice: [null],
            preVillageEnglish: [''],
            preVillageBangla: [''],
            preHouseRoad: [''],
            wifePerDivision: [null],
            wifePerDistrict: [null],
            wifePerUpazila: [null],
            wifePerPostOffice: [null],
            wifePerVillageEnglish: [''],
            wifePerVillageBangla: [''],
            wifePerHouseRoad: [''],
            wifeSameAsPermanent: [false],
            wifePreDivision: [null],
            wifePreDistrict: [null],
            wifePreUpazila: [null],
            wifePrePostOffice: [null],
            wifePreVillageEnglish: [''],
            wifePreVillageBangla: [''],
            wifePreHouseRoad: [''],
            isReliever: [null],
            relieverRabId: ['']
        });
    }

    private watchForRabIdGeneration(): void {
        this.form.get('prefix')?.valueChanges.subscribe(() => this.generateRabId());
        this.form.get('serviceIdOnly')?.valueChanges.subscribe(() => this.generateRabId());
    }

    private generateRabId(): void {
        const prefix = this.form.get('prefix')?.value;
        const serviceId = this.form.get('serviceIdOnly')?.value;

        if (prefix && serviceId) {
            const rabId = this.employeeService.generateRabId(prefix, serviceId);
            this.form.get('rabId')?.setValue(rabId);
        }
    }

    private buildEmployeePayload() {
        const now = new Date().toISOString();

        return {
            EmployeeID: this.tempEmployeeID,

            LastMotherUnit: null,
            MemberType: this.form.value.memberType,
            Appointment: this.form.value.appointment,
            JoiningDate: this.toDateOnlyString(this.form.value.joiningDate),

            Rank: this.form.value.rank,
            Branch: this.form.value.corpsBranch,
            Trade: this.form.value.trade,

            TradeMark: this.form.value.tradeRemarks,
            Gender: this.form.value.gender,
            Prefix: this.form.value.prefix,

            ServiceId: this.form.value.serviceIdOnly,
            RABID: this.form.get('rabId')?.value,
            NID: this.form.value.nidNo,

            FullNameEN: this.form.value.nameEnglish,
            FullNameBN: this.form.value.nameBangla,

            IsReliever: this.form.value.isReliever ?? false,
            PostingStatus: 'New',
            Status: true,

            CreatedBy: 'system',
            CreatedDate: now,
            LastUpdatedBy: 'system',
            Lastupdate: now,
            StatusDate: now
        };
    }

    private toDateOnlyString(value: any): string | null {
        if (!value) return null;

        const d = new Date(value);

        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');

        return `${yyyy}-${mm}-${dd}`;
    }

    private buildAddressPayload(employeeID: number): any[] {
        const v = this.form.getRawValue();
        const now = new Date().toISOString();

        const addresses: any[] = [];

        // 1) Permanent Address
        addresses.push({
            EmployeeID: employeeID,
            AddressId: 0,
            FMID: 0,
            LocationType: 'PERMANENT',
            LocationCode: `${v.perDivision}-${v.perDistrict}-${v.perUpazila}`,
            PostCode: v.perPostOffice?.toString() || '',
            AddressAreaEN: v.perVillageEnglish || '',
            AddressAreaBN: v.perVillageBangla || '',
            DivisionType: v.perDivision || null,
            ThanaType: v.perUpazila || null,
            PostOfficeType: v.perPostOffice || null,
            CreatedBy: 'system',
            CreatedDate: now,
            LastUpdatedBy: 'system',
            Lastupdate: now
        });

        // 2) Present Address (if different)
        if (!v.sameAsPermanent && v.preUpazila) {
            addresses.push({
                EmployeeID: employeeID,
                AddressId: 0,
                FMID: 0,
                LocationType: 'PRESENT',
                LocationCode: `${v.preDivision}-${v.preDistrict}-${v.preUpazila}`,
                PostCode: v.prePostOffice?.toString() || '',
                AddressAreaEN: v.preVillageEnglish || '',
                AddressAreaBN: v.preVillageBangla || '',
                DivisionType: v.preDivision || null,
                ThanaType: v.preUpazila || null,
                PostOfficeType: v.prePostOffice || null,
                CreatedBy: 'system',
                CreatedDate: now,
                LastUpdatedBy: 'system',
                Lastupdate: now
            });
        }

        // 3) Wife Permanent Address
        if (v.wifePerUpazila) {
            addresses.push({
                EmployeeID: employeeID,
                AddressId: 0,
                FMID: 1,
                LocationType: 'WIFE_PERMANENT',
                LocationCode: `${v.wifePerDivision}-${v.wifePerDistrict}-${v.wifePerUpazila}`,
                PostCode: v.wifePerPostOffice?.toString() || '',
                AddressAreaEN: v.wifePerVillageEnglish || '',
                AddressAreaBN: v.wifePerVillageBangla || '',
                DivisionType: v.wifePerDivision || null,
                ThanaType: v.wifePerUpazila || null,
                PostOfficeType: v.wifePerPostOffice || null,
                CreatedBy: 'system',
                CreatedDate: now,
                LastUpdatedBy: 'system',
                Lastupdate: now
            });
        }

        // 4) Wife Present Address (if different)
        if (!v.wifeSameAsPermanent && v.wifePreUpazila) {
            addresses.push({
                EmployeeID: employeeID,
                AddressId: 0,
                FMID: 1,
                LocationType: 'WIFE_PRESENT',
                LocationCode: `${v.wifePreDivision}-${v.wifePreDistrict}-${v.wifePreUpazila}`,
                PostCode: v.wifePrePostOffice?.toString() || '',
                AddressAreaEN: v.wifePreVillageEnglish || '',
                AddressAreaBN: v.wifePreVillageBangla || '',
                DivisionType: v.wifePreDivision || null,
                ThanaType: v.wifePreUpazila || null,
                PostOfficeType: v.wifePrePostOffice || null,
                CreatedBy: 'system',
                CreatedDate: now,
                LastUpdatedBy: 'system',
                Lastupdate: now
            });
        }

        return addresses;
    }
    loadEmployeeInfo(): void {
        this.loading = true;
        this.employeeService.getAll().subscribe({
            next: (res) => {
                this.employees = res;
                this.loading = false;
                console.log('Employees loaded:', this.employees);
            },
            error: (err) => {
                this.loading = false;
                this.errorMessage = err?.error?.message || 'Failed to load employee info';
                this.showError('Failed to load employees');
                console.error(err);
            }
        });
    }

    onSearch(): void {
        const payload = {
            motherOrganization: this.form.get('motherOrganization')?.value,
            serviceId: this.form.get('serviceId')?.value,
            nidNo: this.form.get('nidNo')?.value
        };

        console.log('SEARCH payload:', payload);
        this.loading = true;

        this.employeeService.searchEmployees(payload).subscribe({
            next: (results) => {
                this.serviceRecords = results;
                this.loading = false;

                if (results.length === 0) {
                    this.showInfo('No previous service records found');
                } else {
                    this.showSuccess(`Found ${results.length} service record(s)`);
                }
            },
            error: (err) => {
                this.loading = false;
                this.showError('Search failed');
                console.error(err);

                this.serviceRecords = [
                    {
                        fromDate: '01-01-2010',
                        toDate: '01-01-2013',
                        battalion: 'RAB-1',
                        appointment: 'Ops Offr'
                    }
                ];
            }
        });
    }

    viewOldProfile(row: any): void {
        console.log('View old profile:', row);

        if (row.employeeID) {
            this.loading = true;
            this.employeeService.getCompleteProfile(row.employeeID).subscribe({
                next: (profile) => {
                    this.loading = false;
                    console.log('Complete profile:', profile);

                    this.showSuccess('Profile loaded successfully');
                },
                error: (err) => {
                    this.loading = false;
                    this.showError('Failed to load profile');
                    console.error(err);
                }
            });
        }
    }

    importProfile(row: any): void {
        console.log('Import from old profile:', row);

        this.confirmationService.confirm({
            message: 'Do you want to import data from this previous service record?',
            header: 'Import Confirmation',
            icon: 'pi pi-question-circle',
            accept: () => {
                if (row.employeeID) {
                    this.loading = true;
                    this.employeeService.getCompleteProfile(row.employeeID).subscribe({
                        next: (profile) => {
                            this.loading = false;
                            this.populateFormFromProfile(profile);
                            this.showSuccess('Profile imported successfully');
                        },
                        error: (err) => {
                            this.loading = false;
                            this.showError('Failed to import profile');
                            console.error(err);
                        }
                    });
                } else {
                    this.form.patchValue({
                        motherOrganizationForm: this.form.get('motherOrganization')?.value,
                        appointment: row.appointment
                    });
                    this.showSuccess('Profile data imported');
                }
            }
        });
    }

    private populateFormFromProfile(profile: any): void {
        const employee = profile.employee;
        const addresses = profile.addresses;

        this.form.patchValue({
            motherOrganizationForm: employee.LastMotherUnit,
            memberType: employee.MemberType,
            appointment: employee.Appointment,
            joiningDate: new Date(employee.JoiningDate),
            rank: employee.Rank,
            corpsBranch: employee.Branch,
            trade: employee.Trade,
            tradeRemarks: employee.TradeMark,
            gender: employee.Gender,
            prefix: employee.Prefix,
            serviceIdOnly: employee.ServiceId,
            nidNo: employee.NID,
            nameEnglish: employee.FullNameEN,
            nameBangla: employee.FullNameBN,
            isReliever: employee.IsReliever
        });

        addresses.forEach((addr: any) => {
            const [division, district, upazila] = addr.LocationCode.split('-').map(Number);

            if (addr.LocationType === 1) {
                this.form.patchValue({
                    perDivision: division,
                    perDistrict: district,
                    perUpazila: upazila,
                    perPostOffice: addr.PostCode,
                    perVillageEnglish: addr.AddressAreaEN,
                    perVillageBangla: addr.AddressAreaBN
                });
            } else if (addr.LocationType === 2) {
                this.form.patchValue({
                    preDivision: division,
                    preDistrict: district,
                    preUpazila: upazila,
                    prePostOffice: addr.PostCode,
                    preVillageEnglish: addr.AddressAreaEN,
                    preVillageBangla: addr.AddressAreaBN
                });
            }
        });
    }

    onSubmit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            this.showError('Please fill all required fields');
            return;
        }

        const employeePayload = this.buildEmployeePayload();
        const addressPayload = this.buildAddressPayload(this.tempEmployeeID);

        console.log('EMP Payload:', employeePayload);
        console.log('ADDR Payload:', addressPayload);

        this.loading = true;

        this.employeeService.saveCompleteProfile(employeePayload, addressPayload).subscribe({
            next: (res) => {
                this.loading = false;
                console.log('Saved both:', res);
                this.showSuccess('Employee + Address saved successfully');
            },
            error: (err) => {
                this.loading = false;
                console.error('Save failed:', err);
                this.showError('Save failed');
            }
        });
    }

    resetForm(): void {
        this.confirmationService.confirm({
            message: 'Are you sure you want to reset the form? All unsaved data will be lost.',
            header: 'Reset Confirmation',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                this.form.reset();
                this.mode = 'create';
                this.currentEmployeeId = null;
                this.serviceRecords = [];
                this.showInfo('Form has been reset');
            }
        });
    }

    private handleSameAsPermanent(): void {
        this.form.get('sameAsPermanent')?.valueChanges.subscribe((checked: boolean) => {
            if (checked) {
                this.form.patchValue({
                    preDivision: this.form.get('perDivision')?.value,
                    preDistrict: this.form.get('perDistrict')?.value,
                    preUpazila: this.form.get('perUpazila')?.value,
                    prePostOffice: this.form.get('perPostOffice')?.value,
                    preVillageEnglish: this.form.get('perVillageEnglish')?.value,
                    preVillageBangla: this.form.get('perVillageBangla')?.value,
                    preHouseRoad: this.form.get('perHouseRoad')?.value
                });

                ['preDivision', 'preDistrict', 'preUpazila', 'prePostOffice', 'preVillageEnglish', 'preVillageBangla', 'preHouseRoad'].forEach((field) => {
                    this.form.get(field)?.disable();
                });
            } else {
                ['preDivision', 'preDistrict', 'preUpazila', 'prePostOffice', 'preVillageEnglish', 'preVillageBangla', 'preHouseRoad'].forEach((field) => {
                    this.form.get(field)?.enable();
                });
            }
        });
    }

    private handleWifeSameAsPermanent(): void {
        this.form.get('wifeSameAsPermanent')?.valueChanges.subscribe((checked: boolean) => {
            if (checked) {
                this.form.patchValue({
                    wifePreDivision: this.form.get('wifePerDivision')?.value,
                    wifePreDistrict: this.form.get('wifePerDistrict')?.value,
                    wifePreUpazila: this.form.get('wifePerUpazila')?.value,
                    wifePrePostOffice: this.form.get('wifePerPostOffice')?.value,
                    wifePreVillageEnglish: this.form.get('wifePerVillageEnglish')?.value,
                    wifePreVillageBangla: this.form.get('wifePerVillageBangla')?.value,
                    wifePreHouseRoad: this.form.get('wifePerHouseRoad')?.value
                });

                ['wifePreDivision', 'wifePreDistrict', 'wifePreUpazila', 'wifePrePostOffice', 'wifePreVillageEnglish', 'wifePreVillageBangla', 'wifePreHouseRoad'].forEach((field) => {
                    this.form.get(field)?.disable();
                });
            } else {
                ['wifePreDivision', 'wifePreDistrict', 'wifePreUpazila', 'wifePrePostOffice', 'wifePreVillageEnglish', 'wifePreVillageBangla', 'wifePreHouseRoad'].forEach((field) => {
                    this.form.get(field)?.enable();
                });
            }
        });
    }

    private handleRelieverToggle(): void {
        this.form.get('isReliever')?.valueChanges.subscribe((isReliever: boolean) => {
            const ctrl = this.form.get('relieverRabId');
            if (!ctrl) return;

            if (isReliever === true) {
                ctrl.setValidators([Validators.required]);
            } else {
                ctrl.clearValidators();
                ctrl.setValue('');
            }
            ctrl.updateValueAndValidity();
        });
    }

    private getFormValidationErrors(): any {
        const errors: any = {};
        Object.keys(this.form.controls).forEach((key) => {
            const control = this.form.get(key);
            if (control && control.errors) {
                errors[key] = control.errors;
            }
        });
        return errors;
    }

    private showSuccess(message: string): void {
        this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: message,
            life: 3000
        });
    }

    private showError(message: string): void {
        this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: message,
            life: 3000
        });
    }

    private showInfo(message: string): void {
        this.messageService.add({
            severity: 'info',
            summary: 'Info',
            detail: message,
            life: 3000
        });
    }
}
