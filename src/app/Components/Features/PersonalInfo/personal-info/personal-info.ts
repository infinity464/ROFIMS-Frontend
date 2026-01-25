import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';

import { Card } from 'primeng/card';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from 'primeng/tabs';

import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePicker } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { TextareaModule } from 'primeng/textarea';
import { FileUploadModule } from 'primeng/fileupload';

import { AddressSectionComponent } from '../../Shared/address-section/address-section';

@Component({
  selector: 'app-personal-info',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,

    Card,
    Tabs, TabList, Tab, TabPanels, TabPanel,

    InputTextModule,
    SelectModule,
    DatePicker,
    InputNumberModule,
    CheckboxModule,
    TextareaModule,
    FileUploadModule,

    AddressSectionComponent
  ],
  templateUrl: './personal-info.html',
  styleUrl: './personal-info.scss'
})
export class PersonalInfo implements OnInit {
  form!: FormGroup;

  // Dropdown Data
  bloodGroups = [
    { label: 'A+', value: 'A+' },
    { label: 'AB+', value: 'AB+' },
    { label: 'A-', value: 'A-' },
    { label: 'AB-', value: 'AB-' },
    { label: 'B+', value: 'B+' },
    { label: 'B-', value: 'B-' },
    { label: 'O+', value: 'O+' },
    { label: 'O-', value: 'O-' }
  ];

  religions = [
    { label: 'Islam', value: 'Islam' },
    { label: 'Hindu', value: 'Hindu' },
    { label: 'Christian', value: 'Christian' },
    { label: 'Buddhist', value: 'Buddhist' }
  ];

  maritalStatuses = [
    { label: 'Single', value: 'Single' },
    { label: 'Married', value: 'Married' },
    { label: 'Divorced', value: 'Divorced' },
    { label: 'Widowed', value: 'Widowed' }
  ];

  batches = [
    { label: 'BCS', value: 'BCS' },
    { label: 'Course', value: 'Course' },
    { label: 'Dept', value: 'Dept' },
    { label: 'Other', value: 'Other' }
  ];

  professionalQualifications = [
    { label: 'SSC', value: 'SSC' },
    { label: 'HSC', value: 'HSC' },
    { label: 'Diploma', value: 'Diploma' },
    { label: 'Bachelor', value: 'Bachelor' },
    { label: 'Masters', value: 'Masters' }
  ];

  personalQualifications = [
    { label: 'Sports', value: 'Sports' },
    { label: 'Computer', value: 'Computer' },
    { label: 'Driving', value: 'Driving' },
    { label: 'Other', value: 'Other' }
  ];

  gallantryAwards = [
    { label: 'None', value: 'None' },
    { label: 'Award A', value: 'Award A' },
    { label: 'Award B', value: 'Award B' }
  ];

  lastEducationQualifications = [
    { label: 'SSC', value: 'SSC' },
    { label: 'HSC', value: 'HSC' },
    { label: 'Honours', value: 'Honours' },
    { label: 'Masters', value: 'Masters' }
  ];

  medicalCategories = [
    { label: 'A (AYEE)', value: 'A' },
    { label: 'B', value: 'B' },
    { label: 'C', value: 'C' }
  ];

  yesNoOptions = [
    { label: 'Yes', value: true },
    { label: 'No', value: false }
  ];

  // Address data (your sample)
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

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      // ---------------- Personal Form ----------------
      bloodGroup: [null, Validators.required],
      nidNo: [null, [Validators.required, Validators.pattern(/^\d+$/)]],
      mobileNo: [null, [Validators.required, Validators.pattern(/^(?:\+88)?01[3-9]\d{8}$/)]],
      email: [null, [Validators.required, Validators.email]],
      dateOfBirth: [null, Validators.required],
      religion: ['Islam', Validators.required], // default Islam
      passportNo: [null, Validators.pattern(/^\d+$/)],
      identificationMark: [''],
      maritalStatus: [null, Validators.required],
      emergencyContactNo: [null, [Validators.required, Validators.pattern(/^(?:\+88)?01[3-9]\d{8}$/)]],
      dateOfJoining: [null, Validators.required],
      dateOfCommission: [null, Validators.required],
      batch: [null, Validators.required],

      investigationExperience: [false],
      investigationExperienceDetails: [''],

      professionalQualification: [null, Validators.required],
      personalQualification: [null, Validators.required],
      gallantryAwardsDecoration: [null, Validators.required],
      lastEducationQualification: [null, Validators.required],

      medicalCategory: ['A', Validators.required], // default A (AYEE)
      tribal: [false],
      freedomFighter: [false],

      heightFeet: [null, [Validators.required, Validators.min(0), Validators.max(8)]],
      heightInch: [null, [Validators.required, Validators.min(0), Validators.max(11)]],
      weightKg: [null, [Validators.required, Validators.min(1), Validators.max(300)]],
      weightLbs: [null],

      drivingLicenseNo: [''],
      serviceIdCardNo: [''],

      supportingDocuments: [null],

      // ---------------- Address (prefix = per) ----------------
      perDivision: [null, Validators.required],
      perDistrict: [null, Validators.required],
      perUpazila: [null, Validators.required],
      perPostOffice: [null, Validators.required],
      perVillageEnglish: [''],
      perVillageBangla: [''],
      perHouseRoad: [''],
      perVillageArea: [''],
      perPostCode: ['']
    });

    // enable/disable investigation details
    this.form.get('investigationExperience')?.valueChanges.subscribe((val: boolean) => {
      const ctrl = this.form.get('investigationExperienceDetails');
      if (!ctrl) return;

      if (val) {
        ctrl.setValidators([Validators.required, Validators.minLength(5)]);
        ctrl.enable();
      } else {
        ctrl.clearValidators();
        ctrl.setValue('');
        ctrl.disable();
      }
      ctrl.updateValueAndValidity();
    });

    // initially disable details (because default false)
    this.form.get('investigationExperienceDetails')?.disable();
  }
}
