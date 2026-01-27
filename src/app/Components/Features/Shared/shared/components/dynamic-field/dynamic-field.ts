import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
// import { InputTextareaModule } from 'primeng/inputtextarea';

export type DynamicFieldType = 'text' | 'select' | 'date' | 'number' | 'textarea';

@Component({
  selector: 'app-dynamic-field',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    SelectModule,
    DatePickerModule,
    InputNumberModule,
    // InputTextareaModule
  ],
  templateUrl: './dynamic-field.html'
})
export class DynamicFieldComponent {
  @Input({ required: true }) form!: FormGroup;

  @Input({ required: true }) type!: DynamicFieldType;
  @Input({ required: true }) controlName!: string;

  @Input() label: string = '';
  @Input() placeholder: string = '';
  @Input() required: boolean = false;

  // select
  @Input() options: any[] = [];
  @Input() optionLabel: string = 'label';
  @Input() optionValue: string = 'value';

  // number
  @Input() min?: number;
  @Input() max?: number;
}
