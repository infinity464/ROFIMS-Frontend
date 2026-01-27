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
  selector: 'app-rank-confirmation',
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
  templateUrl: './rank-confirmation.html',
  styleUrl: './rank-confirmation.scss'
})
export class RankConfirmation implements OnInit {
  form!: FormGroup;

  rankList = [
    { label: 'Constable', value: 'Constable' },
    { label: 'SI', value: 'SI' },
    { label: 'Inspector', value: 'Inspector' },
    { label: 'ASP', value: 'ASP' }
  ];

  rankHistoryList: any[] = [];

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

      rankName: [null, Validators.required],
      rankConfirmationDate: [null, Validators.required],

      auth: [''],
      remarks: [''],
      rankConfirmationOrderFile: [null]
    });
  }

  onIdBlur(): void {
    const rabId = this.form.get('rabId')?.value;
    const serviceId = this.form.get('serviceId')?.value;

    // TODO: API call -> patchValue
    if (rabId || serviceId) {
      this.form.patchValue({
        name: 'Auto Loaded Name',
        rank: 'Auto Loaded Rank',
        corps: 'Auto Loaded Corps',
        trade: 'Auto Loaded Trade',
        motherOrganization: 'Auto Loaded Org',
        memberType: 'Auto Loaded Type'
      });

      // TODO: Load table from API
      this.rankHistoryList = [
        {
          ser: 1,
          rank: 'SI',
          confirmationDate: '2023-06-10',
          auth: 'HQ'
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
