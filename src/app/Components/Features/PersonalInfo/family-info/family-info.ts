import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';
import { CheckboxModule } from 'primeng/checkbox';

import { DynamicFieldComponent } from '../../Shared/shared/components/dynamic-field/dynamic-field';
import { AddressSectionComponent } from "../../Shared/address-section/address-section"; // update path

@Component({
  selector: 'app-family-info',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardModule,
    ButtonModule,
    DividerModule,
    CheckboxModule,
    DynamicFieldComponent,
    AddressSectionComponent
],
  templateUrl: './family-info.html',
  styleUrl: './family-info.scss'
})
export class FamilyInfo implements OnInit {
  form!: FormGroup;

  // dropdown options
  relationshipTypes = [
    { label: 'Father', value: 'Father' },
    { label: 'Mother', value: 'Mother' },
    { label: 'Spouse', value: 'Spouse' },
    { label: 'Child', value: 'Child' }
  ];

  maritalStatuses = [
    { label: 'Married', value: 'Married' },
    { label: 'Unmarried', value: 'Unmarried' }
  ];

  spouseOccupations = [
    { label: 'Service Holder', value: 'ServiceHolder' },
    { label: 'Business', value: 'Business' },
    { label: 'Housewife', value: 'Housewife' },
    { label: 'Other', value: 'Other' }
  ];

  divisions = [
    { label: 'Dhaka', value: 1 },
    { label: 'Chattogram', value: 2 }
  ];

  districts = [
    { label: 'Dhaka', value: 101 },
    { label: 'Gazipur', value: 102 }
  ];

  upazilas = [
    { label: 'Savar', value: 1001 },
    { label: 'Tongi', value: 1002 }
  ];

  postOffices = [
    { label: 'Dhanmondi', value: 2001 },
    { label: 'Uttara', value: 2002 }
  ];

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      familyMembers: this.fb.array([])
    });

    // start with 1 member
    this.addFamilyMember();
  }

  get familyMembers(): FormArray {
    return this.form.get('familyMembers') as FormArray;
  }

  addFamilyMember() {
    this.familyMembers.push(this.createFamilyMemberGroup());
  }

  removeFamilyMember(index: number) {
    this.familyMembers.removeAt(index);
  }

  createFamilyMemberGroup(): FormGroup {
    return this.fb.group({
      relationshipType: [null, Validators.required],
      nameEnglish: ['', Validators.required],
      nameBangla: ['', Validators.required],
      dateOfBirth: [null],
      maritalStatus: [null],
      spouseOccupation: [null],

      organizationName: [''],
      organizationLocation: [null],

      nidNo: [''],
      mobileNo: [''],
      passportNo: [''],
      emailAddress: [''],

      permanentAddress: this.createAddressGroup(),
      presentAddress: this.createAddressGroup(),

      sameAsPermanent: [false]
    });
  }

  createAddressGroup(): FormGroup {
    return this.fb.group({
      division: [null],
      district: [null],
      upazila: [null],
      postOffice: [null],

      villageEnglish: [''],
      villageBangla: [''],
      houseRoadNo: ['']
    });
  }

  toggleSameAsPermanent(index: number) {
    const member = this.familyMembers.at(index) as FormGroup;

    const same = member.get('sameAsPermanent')?.value;
    const per = member.get('permanentAddress') as FormGroup;
    const pre = member.get('presentAddress') as FormGroup;

    if (same) {
      pre.patchValue(per.getRawValue());
      pre.disable();
    } else {
      pre.enable();
    }
  }

  isServiceHolder(index: number): boolean {
    const member = this.familyMembers.at(index) as FormGroup;
    return member.get('spouseOccupation')?.value === 'ServiceHolder';
  }

  submit() {
    console.log(this.form.value);
  }
}
