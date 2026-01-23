import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

/** PrimeNG */
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
// import { CalendarModule } from 'primeng/calendar'; // ✅ FIXED: Added CalendarModule
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { FileUploadModule } from 'primeng/fileupload';

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
    // CalendarModule, // ✅ FIXED: Added to imports array
    TableModule,
    ButtonModule,
    CheckboxModule,
    FileUploadModule,
  ],
  templateUrl: './employeeinfo.html',
  styleUrl: './employeeinfo.scss',
})
export class Employeeinfo implements OnInit {
  form!: FormGroup;

  // Search dropdown data
  motherOrganizations = [
    { label: 'Army', value: 1 },
    { label: 'Navy', value: 2 },
    { label: 'Air Force', value: 3 },
    { label: 'Police', value: 4 },
  ];

  // Form dropdown data
  lastUnitOrganizations = [
    { label: 'Unit A', value: 1 },
    { label: 'Unit B', value: 2 },
    { label: 'Unit C', value: 3 },
  ];

  memberTypes = [
    { label: 'Officer', value: 'Officer' },
    { label: 'Employee', value: 'Employee' },
  ];

  officerTypes = [
    { label: 'General Officer', value: 'General' },
    { label: 'Junior Officer', value: 'Junior' },
  ];

  appointments = [
    { label: 'Ops Officer', value: 'Ops Officer' },
    { label: 'Admin Officer', value: 'Admin Officer' },
  ];

  ranks = [
    { label: 'Rank 1', value: 1 },
    { label: 'Rank 2', value: 2 },
    { label: 'Rank 3', value: 3 },
  ];

  corpsBranches = [
    { label: 'Branch A', value: 1 },
    { label: 'Branch B', value: 2 },
  ];

  trades = [
    { label: 'Trade A', value: 1 },
    { label: 'Trade B', value: 2 },
  ];

  genders = [
    { label: 'Male', value: 'Male' },
    { label: 'Female', value: 'Female' },
  ];

  prefixes = [
    { label: 'Mr.', value: 'Mr' },
    { label: 'Mrs.', value: 'Mrs' },
    { label: 'Md.', value: 'Md' },
  ];

  yesNoOptions = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];

  // Address dropdowns
  divisions = [
    { label: 'Dhaka', value: 1 },
    { label: 'Chattogram', value: 2 },
  ];

  districts = [
    { label: 'Dhaka', value: 1 },
    { label: 'Gazipur', value: 2 },
  ];

  upazilas = [
    { label: 'Savar', value: 1 },
    { label: 'Tongi', value: 2 },
  ];

  postOffices = [
    { label: 'Dhanmondi', value: 1 },
    { label: 'Uttara', value: 2 },
  ];

  // Table data
  serviceRecords: any[] = [];

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.buildForm();
    this.handleSameAsPermanent();
    this.handleWifeSameAsPermanent(); // ✅ FIXED: Added wife address handler
    this.handleRelieverToggle();
  }

  private buildForm(): void {
    this.form = this.fb.group({
      // Search Inputs
      motherOrganization: [null],
      serviceId: [''],
      nidNo: [''],

      // Main Form
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

      // Permanent Address
      perDivision: [null, Validators.required],
      perDistrict: [null, Validators.required],
      perUpazila: [null, Validators.required],
      perPostOffice: [null, Validators.required],
      perVillageEnglish: [''],
      perVillageBangla: [''],
      perHouseRoad: [''],

      // Present Address
      sameAsPermanent: [false],
      preDivision: [null],
      preDistrict: [null],
      preUpazila: [null],
      prePostOffice: [null],
      preVillageEnglish: [''],
      preVillageBangla: [''],
      preHouseRoad: [''],

      // ✅ FIXED: Added Wife Permanent Address controls
      wifePerDivision: [null],
      wifePerDistrict: [null],
      wifePerUpazila: [null],
      wifePerPostOffice: [null],
      wifePerVillageEnglish: [''],
      wifePerVillageBangla: [''],
      wifePerHouseRoad: [''],

      // ✅ FIXED: Added Wife Present Address controls
      wifeSameAsPermanent: [false],
      wifePreDivision: [null],
      wifePreDistrict: [null],
      wifePreUpazila: [null],
      wifePrePostOffice: [null],
      wifePreVillageEnglish: [''],
      wifePreVillageBangla: [''],
      wifePreHouseRoad: [''],

      // Reliever
      isReliever: [null],
      relieverRabId: [''],
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
          preHouseRoad: this.form.get('perHouseRoad')?.value,
        });

        this.form.get('preDivision')?.disable();
        this.form.get('preDistrict')?.disable();
        this.form.get('preUpazila')?.disable();
        this.form.get('prePostOffice')?.disable();
        this.form.get('preVillageEnglish')?.disable();
        this.form.get('preVillageBangla')?.disable();
        this.form.get('preHouseRoad')?.disable();
      } else {
        this.form.get('preDivision')?.enable();
        this.form.get('preDistrict')?.enable();
        this.form.get('preUpazila')?.enable();
        this.form.get('prePostOffice')?.enable();
        this.form.get('preVillageEnglish')?.enable();
        this.form.get('preVillageBangla')?.enable();
        this.form.get('preHouseRoad')?.enable();
      }
    });
  }

  // ✅ FIXED: Added handler for wife address same-as-permanent functionality
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
          wifePreHouseRoad: this.form.get('wifePerHouseRoad')?.value,
        });

        this.form.get('wifePreDivision')?.disable();
        this.form.get('wifePreDistrict')?.disable();
        this.form.get('wifePreUpazila')?.disable();
        this.form.get('wifePrePostOffice')?.disable();
        this.form.get('wifePreVillageEnglish')?.disable();
        this.form.get('wifePreVillageBangla')?.disable();
        this.form.get('wifePreHouseRoad')?.disable();
      } else {
        this.form.get('wifePreDivision')?.enable();
        this.form.get('wifePreDistrict')?.enable();
        this.form.get('wifePreUpazila')?.enable();
        this.form.get('wifePrePostOffice')?.enable();
        this.form.get('wifePreVillageEnglish')?.enable();
        this.form.get('wifePreVillageBangla')?.enable();
        this.form.get('wifePreHouseRoad')?.enable();
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

  onSearch(): void {
    const payload = {
      motherOrganization: this.form.get('motherOrganization')?.value,
      serviceId: this.form.get('serviceId')?.value,
      nidNo: this.form.get('nidNo')?.value,
    };

    console.log('SEARCH payload:', payload);

    // Demo data for table (replace with API result)
    this.serviceRecords = [
      {
        fromDate: '01-01-2010',
        toDate: '01-01-2013',
        battalion: 'RAB-1',
        appointment: 'Ops Offr',
      },
    ];
  }

  viewOldProfile(row: any): void {
    console.log('View old profile:', row);
  }

  importProfile(row: any): void {
    console.log('Import from old profile:', row);

    // Example patch
    this.form.patchValue({
      motherOrganizationForm: this.form.get('motherOrganization')?.value,
      appointment: row.appointment,
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    console.log('SUBMIT:', this.form.getRawValue());
  }
}