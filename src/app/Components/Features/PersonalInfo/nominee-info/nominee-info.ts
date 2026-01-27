import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { InputNumberModule } from 'primeng/inputnumber';
import { FileUploadModule } from 'primeng/fileupload';
import { TooltipModule } from 'primeng/tooltip';

@Component({
  selector: 'app-nominee-info',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,

    CardModule,
    DividerModule,
    InputTextModule,
    ButtonModule,
    TableModule,
    InputNumberModule,
    FileUploadModule,
    TooltipModule
  ],
  templateUrl: './nominee-info.html',
  styleUrl: './nominee-info.scss'
})
export class NomineeInfo implements OnInit {
  form!: FormGroup;

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

      nominees: this.fb.array([
        this.createNomineeRow(1),
        this.createNomineeRow(2),
        this.createNomineeRow(3),
        this.createNomineeRow(4)
      ]),

      auth: [''],
      remarks: [''],
      document: [null]
    });
  }

  createNomineeRow(ser: number) {
    return this.fb.group({
      ser: [ser],
      relationType: [{ value: 'Auto Set', disabled: true }],
      nomineeName: [{ value: 'Auto Set', disabled: true }],
      nominatedPercentage: [null, [Validators.min(0), Validators.max(100)]]
    });
  }

  get nominees(): FormArray {
    return this.form.get('nominees') as FormArray;
  }

  // example: when user types RAB ID / Service ID -> call API and patch values
  onIdBlur(): void {
    const rabId = this.form.get('rabId')?.value;
    const serviceId = this.form.get('serviceId')?.value;

    // TODO: call API here
    // this.employeeService.getById(rabId/serviceId).subscribe(res => this.form.patchValue({...}))

    // Demo auto-load:
    if (rabId || serviceId) {
      this.form.patchValue({
        name: 'Auto Loaded Name',
        rank: 'Auto Loaded Rank',
        corps: 'Auto Loaded Corps',
        trade: 'Auto Loaded Trade',
        motherOrganization: 'Auto Loaded Org',
        memberType: 'Auto Loaded Type'
      });
    }
  }

  addFamilyMember(): void {
   
    console.log('Add Family Member clicked');
  }

  selectFromFamilyList(): void {
    
    console.log('Select from Family List clicked');
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }


    console.log(this.form.getRawValue());
  }
}
