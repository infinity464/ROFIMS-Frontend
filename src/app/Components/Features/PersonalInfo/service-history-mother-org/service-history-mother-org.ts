import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
@Component({
  selector: 'app-service-history-mother-org',
   imports: [
    CommonModule,
    ReactiveFormsModule,

    CardModule,
    DividerModule,
    InputTextModule,
    ButtonModule,
    SelectModule,
    DatePickerModule,
    TableModule
  ],
  templateUrl: './service-history-mother-org.html',
  styleUrl: './service-history-mother-org.scss'
})
export class ServiceHistoryMotherOrg {
  form!: FormGroup;

  unitNameList = [
    { label: 'Unit A', value: 1 },
    { label: 'Unit B', value: 2 },
    { label: 'Unit C', value: 3 }
  ];

  unitLocationList = [
    { label: 'Dhaka', value: 'Dhaka' },
    { label: 'Chattogram', value: 'Chattogram' },
    { label: 'Sylhet', value: 'Sylhet' }
  ];

  appointmentList = [
    { label: 'Officer', value: 'Officer' },
    { label: 'Staff', value: 'Staff' },
    { label: 'Commander', value: 'Commander' }
  ];

  serviceHistoryList: any[] = [];

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      rabId: [''],
      serviceId: [''],

      name: [{ value: '', disabled: true }],
      rank: [{ value: '', disabled: true }],
      corps: [{ value: '', disabled: true }],
      trade: [{ value: '', disabled: true }],
      motherOrganization: [{ value: '', disabled: true }],
      memberType: [{ value: '', disabled: true }],

      organizationUnitNameId: [null, Validators.required],
      organizationUnitLocation: [null, Validators.required],

      fromDate: [null], // optional
      toDate: [null], // optional

      auth: [''],
      appointment: [null],
      remarks: ['']
    });
  }

  onIdBlur(): void {
    const rabId = this.form.get('rabId')?.value;
    const serviceId = this.form.get('serviceId')?.value;

    // TODO: call API -> patchValue
    if (rabId || serviceId) {
      this.form.patchValue({
        name: 'Auto Loaded Name',
        rank: 'Auto Loaded Rank',
        corps: 'Auto Loaded Corps',
        trade: 'Auto Loaded Trade',
        motherOrganization: 'Auto Loaded Org',
        memberType: 'Auto Loaded Type'
      });

      // TODO: load history table from API
      this.serviceHistoryList = [
        {
          ser: 1,
          unitServed: 'Unit A',
          location: 'Dhaka',
          from: '2021-01-01',
          to: '2022-01-01',
          appointment: 'Officer',
          remarks: 'N/A'
        }
      ];
    }
  }

  onSave(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    console.log('FORM:', this.form.getRawValue());
  }
}
