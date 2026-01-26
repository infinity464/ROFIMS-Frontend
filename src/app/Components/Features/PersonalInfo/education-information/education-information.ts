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
  selector: 'app-educational-info',
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
  templateUrl: './education-information.html',
  styleUrl: './education-information.scss'
})
export class EducationalInformation implements OnInit {
  form!: FormGroup;

  examDegreeList = [
    { label: 'SSC', value: 'SSC' },
    { label: 'HSC', value: 'HSC' },
    { label: 'BSc', value: 'BSc' },
    { label: 'MSc', value: 'MSc' }
  ];

  institutionTypeList = [
    { label: 'School', value: 'School' },
    { label: 'College', value: 'College' },
    { label: 'University', value: 'University' }
  ];

  institutionNameList = [
    { label: 'Dhaka College', value: 'Dhaka College' },
    { label: 'DU', value: 'DU' },
    { label: 'BUET', value: 'BUET' }
  ];

  departmentList = [
    { label: 'Science', value: 'Science' },
    { label: 'Arts', value: 'Arts' },
    { label: 'CSE', value: 'CSE' }
  ];

  gradeList = [
    { label: 'A+', value: 'A+' },
    { label: 'A', value: 'A' },
    { label: 'B', value: 'B' },
    { label: '1st Class', value: '1st Class' }
  ];

  educationList: any[] = [];

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

      examDegree: [null, Validators.required],
      institutionType: [null, Validators.required],

      institutionName: [null, Validators.required], // dropdown/manual
      departmentSubjectName: [null, Validators.required], // dropdown/manual

      fromDate: [null],
      toDate: [null],

      passingYear: [null],
      grade: [null],
      gpaCgpa: [''],

      certificateFile: [null]
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

      // TODO: load education list from API
      this.educationList = [
        {
          from: '2018-01-01',
          to: '2022-01-01',
          institution: 'BUET',
          examDegree: 'BSc',
          subjectDepartment: 'CSE',
          result: 'A',
          passingYear: '2022',
          remarks: ''
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
