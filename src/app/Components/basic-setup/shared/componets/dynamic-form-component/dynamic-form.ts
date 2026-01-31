import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
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
import { FormConfig, FormField } from '../../models/formConfig';

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


export class DynamicFormComponent implements OnInit {
    @Input() isSubmitting: boolean = false;
    @Input() config!: FormConfig;
    @Input() form!: FormGroup;
    @Input() editingId: number | null = null;
    @Output() save = new EventEmitter<any>();
    @Output() reset = new EventEmitter<void>();
    @Output() fieldChange = new EventEmitter<{ fieldName: string; value: any }>();

    ngOnInit() {
        this.setupCascadingDropdowns();
    }

    setupCascadingDropdowns() {
        // Find all fields that have dependencies
        const dependentFields = this.config.formFields.filter(f => f.dependsOn);

        dependentFields.forEach(field => {
            const parentField = field.dependsOn!;
            const parentControl = this.form.get(parentField);

            if (parentControl) {
                // Subscribe to parent field changes
                parentControl.valueChanges.subscribe(value => {
                    // Clear the dependent field when parent changes
                    const childControl = this.form.get(field.name);
                    if (childControl) {
                        childControl.setValue(null);

                        // Clear options if it's a cascade load field
                        if (field.cascadeLoad) {
                            field.options = [];
                        }
                    }

                    // Emit event to parent component to load new options
                    if (value) {
                        this.fieldChange.emit({
                            fieldName: field.name,
                            value: { parentField, parentValue: value }
                        });
                    }
                });
            }
        });
    }

    onFieldChange(fieldName: string, value: any) {
        this.fieldChange.emit({ fieldName, value });
    }

    isFieldDisabled(field: FormField): boolean {
        if (field.dependsOn) {
            const parentControl = this.form.get(field.dependsOn);
            return !parentControl?.value;
        }
        return false;
    }

    onSave() {
        if (this.form.invalid) return;
        this.save.emit(this.form.value);
    }

    onReset() {
        if (this.isSubmitting) return;
        this.reset.emit();
    }
}
