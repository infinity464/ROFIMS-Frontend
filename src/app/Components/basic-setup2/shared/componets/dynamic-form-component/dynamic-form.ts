import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FluidModule } from 'primeng/fluid';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { FormBuilder, FormGroup, FormsModule, Validators } from '@angular/forms';
import { TextareaModule } from 'primeng/textarea';
import { MultiSelectModule } from 'primeng/multiselect';
import { SliderModule } from 'primeng/slider';
import { Table, TableModule } from 'primeng/table';
import { ProgressBarModule } from 'primeng/progressbar';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { ToastModule } from 'primeng/toast';
import { CommonModule } from '@angular/common';
import { RatingModule } from 'primeng/rating';
import { RippleModule } from 'primeng/ripple';
import { InputIconModule } from 'primeng/inputicon';
import { IconFieldModule } from 'primeng/iconfield';
import { TagModule } from 'primeng/tag';
import { ReactiveFormsModule } from '@angular/forms';
import { FormConfig } from '../../models/formConfig';

@Component({
  selector: 'app-dynamic-form',
   imports: [
        ReactiveFormsModule,
        InputTextModule,
        FluidModule,
        ButtonModule,
        SelectModule,
        FormsModule,
        TextareaModule,
        TableModule,
        MultiSelectModule,
        SelectModule,
        InputIconModule,
        TagModule,
        InputTextModule,
        SliderModule,
        ProgressBarModule,
        ToggleButtonModule,
        ToastModule,
        CommonModule,
        FormsModule,
        ButtonModule,
        RatingModule,
        RippleModule,
        IconFieldModule
    ],
  templateUrl: './dynamic-form.html',
  styleUrl: './dynamic-form.scss',
})


export class DynamicFormComponent {
    @Input() config!: FormConfig;
    @Input() form!: FormGroup;
    @Input() editingId: number | null = null;
    @Output() save = new EventEmitter<any>();
    @Output() reset = new EventEmitter<void>();

    onSave() {
        if (this.form.invalid) return;
        this.save.emit(this.form.value);
    }

    onReset() {
        this.reset.emit();
    }
}
