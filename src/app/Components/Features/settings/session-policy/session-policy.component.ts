import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { Toast } from 'primeng/toast';
import { Fluid } from 'primeng/fluid';
import { MessageService } from 'primeng/api';
import { SessionPolicyService } from '@/shared/services/session-policy.service';
import { SharedService } from '@/shared/services/shared-service';

interface IdlePreset { label: string; minutes: number; }

@Component({
  selector: 'app-session-policy',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    InputNumberModule,
    ToggleSwitchModule,
    Toast,
    Fluid
  ],
  providers: [MessageService],
  template: `
    <p-toast position="top-center" />
    <p-fluid>
      <div class="card">
        <!-- Header -->
        <div class="flex items-start gap-3 mb-1">
          <i class="pi pi-shield text-primary text-2xl mt-1"></i>
          <div>
            <div class="font-semibold text-2xl">Session policy</div>
            <p class="text-sm text-color-secondary mt-1 mb-0">
              Global rules applied to every signed-in user. Changes take effect on next sign-in;
              active sessions update on page refresh.
            </p>
          </div>
        </div>

        @if (!hasFullAccess) {
          <div class="mt-6 p-4 rounded border border-amber-300 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-700 text-sm text-amber-900 dark:text-amber-100">
            Only administrators with full reset permission may change the session policy.
          </div>
        } @else {
          <form [formGroup]="form" (ngSubmit)="onSubmit()" class="mt-6 flex flex-col">

            <!-- Idle timeout row -->
            <div class="flex flex-col md:flex-row md:items-start gap-6 py-5 border-t border-surface">
              <div class="md:w-1/3 leading-snug">
                <div class="font-semibold mb-1">Idle timeout</div>
                <p class="text-sm text-color-secondary m-0">
                  Auto sign-out after this period without mouse or keyboard activity.
                  A 60-second warning toast appears first.
                </p>
              </div>
              <div class="md:flex-1">
                <!-- Row 1: presets -->
                <div class="flex flex-wrap items-center gap-2">
                  @for (p of idlePresets; track p.minutes) {
                    <button
                      type="button"
                      (click)="setPreset(p.minutes)"
                      class="px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
                      [class.bg-primary]="isPresetActive(p.minutes)"
                      [class.text-primary-contrast]="isPresetActive(p.minutes)"
                      [class.border-primary]="isPresetActive(p.minutes)"
                      [class.bg-transparent]="!isPresetActive(p.minutes)"
                      [class.border-surface]="!isPresetActive(p.minutes)"
                      [class.text-color]="!isPresetActive(p.minutes)"
                    >
                      {{ p.label }}
                    </button>
                  }
                </div>
                <!-- Row 2: Custom input + min suffix -->
                <div class="flex items-center gap-2 mt-3">
                  <p-inputNumber
                    inputId="customMinutes"
                    formControlName="idleTimeoutMinutes"
                    [min]="1"
                    [max]="1440"
                    [showButtons]="false"
                    [useGrouping]="false"
                    placeholder="Custom"
                    [style]="{ width: '6rem' }"
                    inputStyleClass="text-center"
                  />
                  <span class="text-sm text-color-secondary">min</span>
                </div>
                @if (form.get('idleTimeoutMinutes')?.invalid && form.get('idleTimeoutMinutes')?.touched) {
                  <small class="text-red-500 block mt-2">Enter a value between 1 and 1440 (24 hours).</small>
                }
              </div>
            </div>

            <!-- End session on browser close row -->
            <div class="flex flex-col md:flex-row md:items-start gap-6 py-5 border-t border-surface">
              <div class="md:w-1/3 leading-snug">
                <div class="font-semibold mb-1">End session on browser close</div>
                <p class="text-sm text-color-secondary m-0">
                  Auth token lives in
                  <code class="px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-800 text-xs font-mono">sessionStorage</code>,
                  so closing the tab or browser ends the session immediately.
                </p>
              </div>
              <div class="md:flex-1 flex md:justify-end">
                <p-toggleswitch formControlName="logoutOnBrowserClose" />
              </div>
            </div>

            <!-- Live summary banner -->
            <div class="mt-3 mb-3 p-4 rounded-lg border border-surface bg-surface-50 dark:bg-surface-800 flex items-start gap-3">
              <i class="pi pi-info-circle text-color-secondary mt-0.5"></i>
              <div class="text-sm leading-relaxed">
                Users are signed out after
                <strong>{{ humanizedTimeout }}</strong>
                of inactivity{{ form.get('logoutOnBrowserClose')?.value ? ', or as soon as ' : '. ' }}
                @if (form.get('logoutOnBrowserClose')?.value) {
                  <strong>they close the browser</strong>.
                } @else {
                  Sessions persist across browser restarts.
                }
              </div>
            </div>

            <!-- Footer buttons -->
            <div class="flex justify-end items-center gap-2 pt-4 border-t border-surface">
              <p-button label="Reset" severity="secondary" [outlined]="true" type="button" (onClick)="onReset()" [disabled]="isSubmitting" />
              <p-button label="Save policy" type="submit" [loading]="isSubmitting" [disabled]="form.invalid || isSubmitting" />
            </div>
          </form>
        }
      </div>
    </p-fluid>
  `
})
export class SessionPolicyComponent implements OnInit {
  private fb = inject(FormBuilder);
  private policy = inject(SessionPolicyService);
  private sharedService = inject(SharedService);
  private messageService = inject(MessageService);

  hasFullAccess = false;
  form!: FormGroup;
  isSubmitting = false;

  /** Quick-pick presets shown as pill buttons; "Custom" input handles anything else. */
  readonly idlePresets: ReadonlyArray<IdlePreset> = [
    { label: '1m', minutes: 1 },
    { label: '5m', minutes: 5 },
    { label: '15m', minutes: 15 },
    { label: '30m', minutes: 30 },
    { label: '1h', minutes: 60 },
    { label: '4h', minutes: 240 }
  ];

  ngOnInit(): void {
    this.hasFullAccess = this.sharedService.getCurrentResetRoleIds().includes('*');
    this.form = this.fb.group({
      idleTimeoutMinutes: [10, [Validators.required, Validators.min(1), Validators.max(1440)]],
      logoutOnBrowserClose: [false]
    });

    this.policy.load().subscribe({
      next: (p) => this.form.patchValue(p),
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Load failed',
          detail: 'Could not load session policy. Showing defaults.',
          life: 5000
        });
      }
    });
  }

  isPresetActive(minutes: number): boolean {
    return this.form?.get('idleTimeoutMinutes')?.value === minutes;
  }

  setPreset(minutes: number): void {
    this.form.get('idleTimeoutMinutes')?.setValue(minutes);
    this.form.get('idleTimeoutMinutes')?.markAsDirty();
  }

  /** Formats the current idle-timeout for the summary banner. */
  get humanizedTimeout(): string {
    const min = Number(this.form?.get('idleTimeoutMinutes')?.value ?? 0);
    if (!min || min < 1) return '0 minutes';
    if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`;
    if (min % 60 === 0) {
      const h = min / 60;
      return `${h} hour${h === 1 ? '' : 's'}`;
    }
    return `${min} minutes`;
  }

  onSubmit(): void {
    if (this.form.invalid || this.isSubmitting) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.isSubmitting = true;
    this.policy.update({
      idleTimeoutMinutes: value.idleTimeoutMinutes,
      logoutOnBrowserClose: !!value.logoutOnBrowserClose
    }).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        this.messageService.add({
          severity: res.isSuccess ? 'success' : 'error',
          summary: res.isSuccess ? 'Saved' : 'Save failed',
          detail: res.message,
          life: 5000
        });
      },
      error: (err: any) => {
        this.isSubmitting = false;
        this.messageService.add({
          severity: 'error',
          summary: 'Save failed',
          detail: err?.error?.message ?? 'Could not save session policy.',
          life: 5000
        });
      }
    });
  }

  onReset(): void {
    const current = this.policy.current();
    this.form.patchValue(current);
  }
}
