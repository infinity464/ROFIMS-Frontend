import { AfterViewInit, Directive, ElementRef, OnDestroy, Optional } from '@angular/core';
import { NgControl } from '@angular/forms';
import { parseAnyFlexibleDate } from '../utils/flexible-date.util';

/**
 * Auto-applies flexible date parsing to every <p-datepicker> in a standalone
 * component that imports this directive. Accepts user-typed dates in any of:
 *   Full date:  DD-MM-YYYY, DD/MM/YYYY, DDMMYYYY
 *   Month+year: MM-YYYY, MM/YYYY, MMYYYY
 *   Year only:  YYYY
 * Patches the bound form control with a Date on blur (day/month snap to 1 when
 * the input was partial).
 *
 * Usage: add `FlexibleDateDirective` to the component's `imports: [...]` array.
 * No template changes are required — the directive hooks every p-datepicker inside.
 */
@Directive({
    selector: 'p-datepicker',
    standalone: true
})
export class FlexibleDateDirective implements AfterViewInit, OnDestroy {
    private blurListener = (ev: Event) => this.onBlur(ev);

    constructor(
        private el: ElementRef<HTMLElement>,
        @Optional() private ngControl: NgControl | null
    ) {}

    ngAfterViewInit(): void {
        // Capture-phase listener on the host catches blur from the internal <input>.
        this.el.nativeElement.addEventListener('blur', this.blurListener, true);
    }

    ngOnDestroy(): void {
        this.el.nativeElement.removeEventListener('blur', this.blurListener, true);
    }

    private onBlur(event: Event): void {
        const target = event.target as HTMLInputElement | null;
        if (!target || target.tagName !== 'INPUT') return;
        const raw = target.value ?? '';
        const control = this.ngControl?.control;
        if (!control) return;
        // If the datepicker already holds a valid Date, nothing to do.
        const current = control.value;
        if (current instanceof Date && !Number.isNaN(current.getTime())) return;
        const parsed = parseAnyFlexibleDate(raw);
        if (parsed) {
            control.setValue(parsed);
        }
    }
}
