import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
import { FileUploadModule } from 'primeng/fileupload';

@Component({
  selector: 'app-previous-service-rab',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,

    CardModule,
    DividerModule,
    InputTextModule,
    ButtonModule,
    SelectModule,
    DatePickerModule,
    TableModule,
    FileUploadModule
  ],
  templateUrl: './previous-service.html',
  styleUrl: './previous-service.scss'
})
export class PreviousServiceRab implements OnInit {
  form!: FormGroup;

  // dropdown demo data
  wingBattalionList = [
    { label: 'RAB-1', value: 1 },
    { label: 'RAB-2', value: 2 },
    { label: 'RAB-3', value: 3 }
  ];

  appointmentList = [
    { label: 'Commander', value: 'Commander' },
    { label: 'Officer', value: 'Officer' },
    { label: 'Staff', value: 'Staff' }
  ];

  // bottom table demo
  previousServiceList: any[] = [];

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

      wingBattalionId: [null, Validators.required],
      fromDate: [null], // optional
      toDate: [null], // optional
      appointment: [null, Validators.required],

      postingAuth: [''],
      remarks: [''],
      postingOrderFile: [null]
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

      // TODO: load previous service list from API
      this.previousServiceList = [
        {
          ser: 1,
          from: '2022-01-01',
          to: '2023-01-01',
          wingBattalion: 'RAB-1',
          appointment: 'Officer'
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
