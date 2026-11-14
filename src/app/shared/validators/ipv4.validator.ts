import { AbstractControl, ValidationErrors } from '@angular/forms';

/** Optional exact IPv4 address; empty/whitespace removes the restriction. */
export function ipv4Validator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) return null;
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^(0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255)
    ? null
    : { ipv4: true };
}
