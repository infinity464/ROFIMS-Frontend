import { AbstractControl, ValidationErrors } from '@angular/forms';

export function organizationScopeValidator(form: AbstractControl): ValidationErrors | null {
  const mode = form.get('organizationMode')?.value;
  const ids = form.get('organizationIds')?.value;
  return mode === 'specific' && (!Array.isArray(ids) || ids.length === 0)
    ? { organizationRequired: true } : null;
}
