import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlContainer, FormGroup, FormGroupDirective, ReactiveFormsModule } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-address-section',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CheckboxModule,
    SelectModule,
    InputTextModule,
  ],
  templateUrl: './address-section.html',
  styleUrls: ['./address-section.scss'],
  // ✅ FIXED: Add viewProviders to access parent form
  viewProviders: [
    {
      provide: ControlContainer,
      useExisting: FormGroupDirective
    }
  ]
})
export class AddressSectionComponent {
  // Required: Parent form group
  @Input() form!: FormGroup;

  // Section configuration
  @Input() title: string = 'Address';
  @Input() iconClass: string = 'pi pi-home text-primary-600 text-2xl';

  // Form field prefix (per, pre, wifePer, wifePre)
  @Input() prefix: string = '';

  // Required field indicators
  @Input() showRequiredIndicators: boolean = true;

  // Dropdown data sources
  @Input() divisions: any[] = [];
  @Input() districts: any[] = [];
  @Input() upazilas: any[] = [];
  @Input() postOffices: any[] = [];

  // Optional checkbox for "Same as Permanent Address"
  @Input() showCheckbox: boolean = false;
  @Input() checkboxControlName: string = '';
  @Input() checkboxId: string = '';
  @Input() checkboxLabel: string = 'Same as Permanent Address';

  /**
   * Get form control name with prefix
   */
  getControlName(field: string): string {
    return `${this.prefix}${field}`;
  }

  /**
   * Check if a field has an error and is touched
   */
  hasError(field: string): boolean {
    const controlName = this.getControlName(field);
    const control = this.form.get(controlName);
    return !!(control && control.invalid && control.touched);
  }

  /**
   * Get error message for a field
   */
  getErrorMessage(field: string): string {
    const controlName = this.getControlName(field);
    const control = this.form.get(controlName);
    
    if (control?.hasError('required')) {
      return 'This field is required';
    }
    
    return '';
  }
}