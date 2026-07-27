import { Component, OnInit, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { SelectButtonModule } from 'primeng/selectbutton';
import { MultiSelectModule } from 'primeng/multiselect';
import { DialogModule } from 'primeng/dialog';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { from, of } from 'rxjs';
import { catchError, concatMap, map, toArray } from 'rxjs/operators';

import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';

import { CommonCodeService } from '@/services/common-code-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';
import { MovementInfoService } from '@/services/movement-info.service';
import { EmpService } from '@/services/emp-service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { SharedService } from '@/shared/services/shared-service';

import { MovementInfoModel } from '@/models/movement-info.model';
import { CommonCodeModel } from '@/models/common-code-model';
import {
    MovementType,
    MovementTypeOptions,
    MoveOrderType,
    Article47LetterRecipientOptions
} from '@/models/enums';

/** One employee selected for bulk Article 47 (Takeover). */
interface TakeoverEmployeeRow {
    employeeID: number;
    rabid: string;
    serviceId: string;
    fullNameEN: string;
    rankDisplay?: string | null;
    corpsDisplay?: string | null;
    tradeDisplay?: string | null;
    motherUnitDisplay?: string | null;
    /** Current Mother Unit id (lastMotherUnitId) — hydrated on init. */
    unit?: number | null;
    /** CommonCode 'AppointmentCategory' label, Bangla preferred. Often null —
     *  EmployeeInfo.Appointment is optional. Hydrated on init. */
    appointmentBn?: string | null;
}

@Component({
    selector: 'app-article-47-takeover-bulk',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        FormsModule,
        ButtonModule,
        InputTextModule,
        SelectModule,
        DatePickerModule,
        TableModule,
        TooltipModule,
        SelectButtonModule,
        MultiSelectModule,
        DialogModule,
        Toast,
        RichEditorComponent
    ],
    providers: [MessageService],
    templateUrl: './article-47-takeover-bulk.html',
    styleUrls: ['../movement-info/movement-info.scss']
})
export class Article47TakeoverBulkComponent implements OnInit {
    private fb = inject(FormBuilder);
    private movementService = inject(MovementInfoService);
    private commonCodeService = inject(CommonCodeService);
    private masterBasicSetup = inject(MasterBasicSetupService);
    private organizationService = inject(OrganizationService);
    private empService = inject(EmpService);
    private identityMappingService = inject(IdentityUserMappingService);
    private sharedService = inject(SharedService);
    private messageService = inject(MessageService);
    private router = inject(Router);

    canInsert = true;
    saving = false;

    /**
     * When used as a modal, the host supplies the selected employees via this
     * input (instead of router navigation state) and listens to {@link closed}
     * / {@link saved}. When `asModal` is true the component emits events instead
     * of navigating away.
     */
    @Input() asModal = false;
    @Input() set employeesInput(rows: TakeoverEmployeeRow[] | null | undefined) {
        if (Array.isArray(rows)) this.employees = rows;
    }
    /** Emitted when the user cancels (modal host should close the dialog). */
    @Output() closed = new EventEmitter<void>();
    /** Emitted after a successful (or partially successful) generation. */
    @Output() saved = new EventEmitter<void>();
    /**
     * Emitted with the rejection reason when generation fails outright. As a modal
     * this component's own <p-toast> renders inside the host's dialog, where the
     * message is easy to miss — the host relays it to its own toast instead.
     */
    @Output() failed = new EventEmitter<string>();

    form!: FormGroup;
    employees: TakeoverEmployeeRow[] = [];

    movementTypeOptions = MovementTypeOptions;
    movementReasonOptions: { label: string; value: number }[] = [];
    motherUnitOptions: { label: string; value: number }[] = [];
    rabUnitOptions: { label: string; value: number }[] = [];
    approverOptions: { label: string; value: number }[] = [];

    /** Editable list of Article 47 letter recipients (one line each, prefilled). */
    letterRecipientsList: string[] = [];

    joiningLeaveOptions = [
        { label: 'Yes', value: true },
        { label: 'No', value: false }
    ];
    destinedUnitOptions = [
        { label: 'Mother Unit', value: 'mother' },
        { label: 'RAB Unit', value: 'rab' }
    ];

    // Add Reason dialog state
    showAddReasonDialog = false;
    newReasonNameBN = '';
    isSavingReason = false;

    trackByIndex = (index: number): number => index;

    constructor() {
        // Selected employees are handed over via router navigation state.
        const nav = this.router.getCurrentNavigation();
        const state = (nav?.extras?.state ?? history.state) as { employees?: TakeoverEmployeeRow[] };
        this.employees = Array.isArray(state?.employees) ? state!.employees! : [];
    }

    ngOnInit(): void {
        // Access is gated on the Supernumerary List (the only entry point), so this
        // standalone route — which has no menu permission entry — keeps canInsert = true.
        if (this.employees.length === 0) {
            this.messageService.add({
                severity: 'warn',
                summary: 'No employees selected',
                detail: 'Select employees from the Supernumerary List first.'
            });
            return;
        }

        this.initForm();

        // In modal mode the Effective dates and Destination sections are hidden.
        // Generated date and Takeover date are surfaced on their own instead:
        // Generated date defaults to now, Takeover date is left blank for the user
        // to fill in. Release/reduce stay null and the destination is forced to RAB
        // Unit (first option, set once loaded).
        if (this.asModal) {
            this.form.patchValue({ takeoverDate: null, destinedUnitTarget: 'rab' });
        }

        this.loadDropdowns();
        this.hydrateUnits();

        // Prefill recipients with the Article 47 enum labels (editable).
        this.letterRecipientsList = Article47LetterRecipientOptions
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((o) => o.label);
    }

    private initForm(): void {
        this.form = this.fb.group({
            movementType: [MovementType.Permanent, Validators.required],
            movementReasonId: [null],
            destinedUnitTarget: ['mother'],
            destinedMotherUnitId: [null, Validators.required],
            destinedRABUnitId: [null],
            dateOfRelease: [null],
            dateOfReduce: [null],
            takeoverDate: [null],
            isJoiningLeave: [false],
            joiningLeaveFrom: [null],
            joiningLeaveTo: [null],
            auth: [null],
            detailsInformation: [null],
            remarks: [null],
            finalApproverIds: [[] as number[]],
            letterDate: [new Date()],
            // Generated date = the record's Created date, carried on the existing
            // MovementInfo.CreatedDate column (no new backend field). Date + time,
            // defaulted to now.
            generatedDate: [new Date()]
        });

        this.form.get('destinedUnitTarget')!.valueChanges.subscribe((v) => this.onDestinedUnitTargetChange(v));
        this.form.get('isJoiningLeave')!.valueChanges.subscribe((v) => this.onIsJoiningLeaveChange(v));
    }

    private onDestinedUnitTargetChange(target: 'mother' | 'rab'): void {
        const motherCtrl = this.form.get('destinedMotherUnitId')!;
        const rabCtrl = this.form.get('destinedRABUnitId')!;
        if (target === 'mother') {
            motherCtrl.setValidators(Validators.required);
            rabCtrl.clearValidators();
            rabCtrl.setValue(null, { emitEvent: false });
        } else {
            rabCtrl.setValidators(Validators.required);
            motherCtrl.clearValidators();
            motherCtrl.setValue(null, { emitEvent: false });
        }
        motherCtrl.updateValueAndValidity({ emitEvent: false });
        rabCtrl.updateValueAndValidity({ emitEvent: false });
    }

    private onIsJoiningLeaveChange(v: boolean): void {
        if (!v) {
            this.form.patchValue({ joiningLeaveFrom: null, joiningLeaveTo: null });
        }
    }

    get showJoiningLeaveDates(): boolean {
        return !!this.form?.get('isJoiningLeave')!.value;
    }

    private loadDropdowns(): void {
        this.commonCodeService.getAllActiveCommonCodesType('MovementReason').subscribe({
            next: (rows: CommonCodeModel[]) => {
                this.movementReasonOptions = (rows || []).map((r) => ({
                    label: r.codeValueBN || '',
                    value: r.codeId
                }));
            }
        });

        this.organizationService.GetAllOrgUnit().subscribe({
            next: (rows) => {
                this.motherUnitOptions = (rows || []).map((r) => ({
                    label: r.orgNameEN,
                    value: r.orgId
                }));
            }
        });

        this.masterBasicSetup.getAllByType('RabUnit').subscribe({
            next: (rows) => {
                this.rabUnitOptions = (rows || []).map((r) => ({
                    label: r.codeValueEN,
                    value: r.codeId
                }));
                // Modal mode hides the Destination picker: default to the first RAB unit.
                if (this.asModal && this.rabUnitOptions.length > 0 && this.form.get('destinedRABUnitId')!.value == null) {
                    this.form.patchValue({ destinedRABUnitId: this.rabUnitOptions[0].value });
                }
            }
        });

        this.identityMappingService.getMappings().subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                this.approverOptions = arr
                    .map((m: any) => {
                        const empId = m.employeeId ?? m.EmployeeId;
                        if (!empId || empId <= 0) return null;
                        const name = m.employeeName ?? m.EmployeeName ?? '';
                        const rabId = m.rabID ?? m.RABID ?? '';
                        const serviceId = m.serviceId ?? m.ServiceId ?? '';
                        const parts = [name, rabId ? `RAB: ${rabId}` : '', serviceId ? `SVC: ${serviceId}` : ''].filter(Boolean);
                        return {
                            label: parts.join(' | ') || `Employee #${empId}`,
                            value: empId as number
                        };
                    })
                    .filter((o): o is { label: string; value: number } => o !== null)
                    .sort((a, b) => a.label.localeCompare(b.label));
            }
        });
    }

    /** Fetch each employee's current Mother Unit so currentUnitId is set per inserted record. */
    private hydrateUnits(): void {
        for (const emp of this.employees) {
            this.empService.getEmployeeSearchInfo(emp.employeeID).subscribe({
                next: (info: any) => {
                    if (!info) return;
                    emp.unit = info.lastMotherUnitId ?? info.LastMotherUnitId ?? null;
                    emp.appointmentBn = (info.appointmentBN ?? info.AppointmentBN
                        ?? info.appointment ?? info.Appointment ?? null) as string | null;
                }
            });
        }
    }

    removeEmployee(row: TakeoverEmployeeRow): void {
        this.employees = this.employees.filter((e) => e.employeeID !== row.employeeID);
    }

    // ── Add Reason on the fly ─────────────────────────────────────────────
    openAddReasonDialog(): void {
        this.newReasonNameBN = '';
        this.isSavingReason = false;
        this.showAddReasonDialog = true;
    }

    saveNewReason(): void {
        const bn = (this.newReasonNameBN || '').trim();
        if (!bn) return;

        // Bangla-only flow: CommonCode requires an EN value, so mirror BN into EN.
        const currentUser = this.sharedService.getCurrentUser();
        const now = this.sharedService.getCurrentDateTime();

        const payload: any = {
            orgId: 0,
            codeId: 0,
            codeType: 'MovementReason',
            codeValueEN: bn,
            codeValueBN: bn,
            commCode: null,
            displayCodeValueEN: null,
            displayCodeValueBN: null,
            status: true,
            parentCodeId: null,
            sortOrder: null,
            level: null,
            createdBy: currentUser,
            createdDate: now,
            lastUpdatedBy: currentUser,
            lastupdate: now
        };

        this.isSavingReason = true;
        this.masterBasicSetup.create(payload).subscribe({
            next: () => {
                this.commonCodeService.getAllActiveCommonCodesType('MovementReason').subscribe({
                    next: (rows: CommonCodeModel[]) => {
                        this.movementReasonOptions = (rows || []).map((r) => ({
                            label: r.codeValueBN || '',
                            value: r.codeId
                        }));
                        const matchRow = (rows || []).find((r) => r.codeValueBN === bn);
                        if (matchRow) {
                            this.form.patchValue({ movementReasonId: matchRow.codeId });
                        }
                        this.isSavingReason = false;
                        this.showAddReasonDialog = false;
                        this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Movement reason added.' });
                    },
                    error: () => {
                        this.isSavingReason = false;
                        this.showAddReasonDialog = false;
                    }
                });
            },
            error: (err) => {
                console.error('Save reason failed', err);
                this.isSavingReason = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to save movement reason.' });
            }
        });
    }

    // ── Letter recipients ─────────────────────────────────────────────────
    addLetterRecipient(): void {
        this.letterRecipientsList.push('');
    }
    removeLetterRecipient(index: number): void {
        if (index >= 0 && index < this.letterRecipientsList.length) {
            this.letterRecipientsList.splice(index, 1);
        }
    }
    moveLetterRecipient(index: number, direction: -1 | 1): void {
        const target = index + direction;
        if (target < 0 || target >= this.letterRecipientsList.length) return;
        const list = this.letterRecipientsList;
        [list[index], list[target]] = [list[target], list[index]];
    }

    private serialiseLetterRecipients(): string | null {
        const lines = (this.letterRecipientsList || [])
            .map((s) => (s ?? '').trim())
            .filter((s) => s.length > 0);
        return lines.length === 0 ? null : JSON.stringify(lines);
    }

    // ── Submit: one MovementInfo record per employee ──────────────────────
    submit(): void {
        if (!this.canInsert) {
            this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You do not have permission to perform this action.' });
            return;
        }
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            this.messageService.add({ severity: 'error', summary: 'Validation', detail: 'Please fill all required fields.' });
            return;
        }
        if (this.employees.length === 0) {
            this.messageService.add({ severity: 'error', summary: 'No employees', detail: 'No employees to process.' });
            return;
        }

        const v = this.form.value;
        const currentUser = this.sharedService.getCurrentUser();
        const now = this.sharedService.getCurrentDateTime();
        const finalApproverIds: number[] = (v.finalApproverIds as number[] | null) ?? [];
        const letterRecipients = this.serialiseLetterRecipients();

        // In modal mode the Remarks field is hidden; persist the standard Bengali
        // Article 47 takeover declaration behind the scenes. It names the member's own
        // appointment, so it is built per employee inside the map below.

        // Build one payload per employee, sharing the common given input.
        const payloads: MovementInfoModel[] = this.employees.map((emp) => ({
            movementId: 0,
            letterNo: null,
            publicToken: null,
            letterDate: this.toIsoDate(v.letterDate),
            employeeIds: JSON.stringify([emp.employeeID]),
            finalApproverIds: finalApproverIds.length > 0 ? JSON.stringify(finalApproverIds) : null,
            letterRecipients,
            movementType: v.movementType ?? MovementType.Permanent,
            moveOrderType: MoveOrderType.Article47Takeover,
            movementReasonId: v.movementReasonId ?? null,
            currentUnitId: emp.unit ?? null,
            destinedMotherUnitId: v.destinedMotherUnitId ?? null,
            destinedRABUnitId: v.destinedRABUnitId ?? null,
            dateOfRelease: this.toIsoDate(v.dateOfRelease),
            dateOfReduce: this.toIsoDate(v.dateOfReduce),
            takeoverDate: this.toIsoDate(v.takeoverDate),
            handoverDate: null,
            takeoverPersonEmpId: null,
            // Release time is editable for Article 47 (Takeover) on the movement form,
            // so store the Generated date's clock time — otherwise the field would be
            // blank when one of these records is opened for edit.
            releaseTime: this.toTimeString(v.generatedDate),
            vehicle: null,
            isJoiningLeave: !!v.isJoiningLeave,
            joiningLeaveFrom: this.toIsoDate(v.joiningLeaveFrom),
            joiningLeaveTo: this.toIsoDate(v.joiningLeaveTo),
            lastRationCertificate: null,
            payAndAllowance: null,
            railwayWarrant: null,
            auth: v.auth ?? null,
            detailsInformation: v.detailsInformation ?? null,
            remarks: this.asModal && !v.remarks
                ? this.buildDefaultRemark(v.generatedDate, emp.appointmentBn)
                : (v.remarks ?? null),
            filesReferences: null,
            status: true,
            createdBy: currentUser,
            // Generated date drives CreatedDate — that is what "generated" means here,
            // so no extra column is needed. Falls back to now if the field was cleared.
            createdDate: this.toIsoDateTime(v.generatedDate) ?? now,
            lastUpdatedBy: currentUser,
            lastupdate: now
        }));

        this.saving = true;
        // Insert sequentially (one after another) so the backend mints the
        // Movement/Letter number incrementally — parallel inserts would race
        // on the number config and produce duplicate or out-of-order numbers.
        from(payloads).pipe(
            concatMap((p) =>
                this.movementService.save(p).pipe(
                    map((res: any) => {
                        const code = res?.statusCode ?? 200;
                        const ok = code >= 200 && code < 300;
                        const id = res?.data?.movementId ?? res?.Data?.MovementId ?? null;
                        // Keep the rejection reason (no number configured for the unit,
                        // members spanning two units) — a bare "failed" isn't actionable.
                        return { ok, id: ok ? id : null, reason: ok ? null : (res?.description ?? null) };
                    }),
                    catchError((err: any) => of({
                        ok: false,
                        id: null as number | null,
                        reason: err?.error?.description || err?.error?.message || null
                    }))
                )
            ),
            toArray()
        ).subscribe((results) => {
            const total = results.length;
            const okCount = results.filter((r) => r.ok).length;
            const failCount = total - okCount;
            // Every failure in a batch normally shares one cause (the unit has no
            // number configuration), so the first reason explains the rest.
            const firstReason = results.find((r) => !r.ok && r.reason)?.reason ?? null;
            const reasonSuffix = firstReason ? ` ${firstReason}` : '';
            this.saving = false;

            // Open each newly-created Article 47 (Takeover) preview in its own tab.
            const createdIds = results.filter((r) => r.ok && r.id != null).map((r) => r.id as number);
            this.openTakeoverPreviews(createdIds);

            if (okCount === total) {
                // All succeeded.
                this.messageService.add({
                    severity: 'success',
                    summary: 'Article 47 (Takeover) Generated',
                    detail: `Article 47 (Takeover) generated successfully for all ${okCount} member(s).`,
                    life: 5000
                });
            } else if (okCount > 0) {
                // Partial success.
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Partially Generated',
                    detail: `Article 47 (Takeover) generated for ${okCount} of ${total} member(s); ${failCount} failed.${reasonSuffix}`,
                    life: 9000
                });
            } else {
                // All failed — typically one shared cause, e.g. no Movement number
                // configured for the members' unit.
                const detail = `Failed to generate Article 47 (Takeover) for all ${failCount} member(s).${reasonSuffix || ' Please try again.'}`;
                if (this.asModal) {
                    // Hand it to the host: this component's toast sits inside the
                    // host's dialog, where an error is easily missed.
                    this.failed.emit(detail);
                } else {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Generation Failed',
                        detail,
                        life: 9000
                    });
                }
                return;
            }
            // On (at least partial) success: as a modal, notify the host so it can
            // refresh and close; as a route, return to the list. Delay so the
            // success toast is visible before this component is destroyed.
            if (this.asModal) {
                setTimeout(() => this.saved.emit(), 1500);
            } else {
                setTimeout(() => this.router.navigate(['/supernumerary-list']), 1500);
            }
        });
    }

    /** Opens each created movement's Article 47 (Takeover) preview in a new browser tab. */
    private openTakeoverPreviews(ids: number[]): void {
        for (const id of ids) {
            const url = this.router.serializeUrl(
                this.router.createUrlTree(['/movement-preview/article-47-takeover'], { queryParams: { id } })
            );
            window.open(url, '_blank');
        }
    }

    cancel(): void {
        if (this.asModal) {
            this.closed.emit();
            return;
        }
        this.router.navigate(['/supernumerary-list']);
    }

    /**
     * Standard Bengali Article 47 (Takeover) declaration saved silently in modal
     * mode. Both the date and the time-of-day word come from the Generated date
     * field, so the declaration always matches the timestamp on the record:
     * "পূর্বাহ্নে" for an AM time, "অপরাহ্ণে" from 12 PM onwards.
     * Falls back to now when the field was cleared. The role named is the member's
     * own Appointment; EmployeeInfo.Appointment is optional, so when it is absent
     * the phrase drops out entirely and the sentence still reads correctly.
     */
    private buildDefaultRemark(generatedDate: Date | string | null | undefined, appointment: string | null | undefined): string {
        const parsed = generatedDate ? new Date(generatedDate) : null;
        const now = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
        const dateBn = this.toBengaliDate(now);
        const timeOfDay = now.getHours() < 12 ? 'পূর্বাহ্নে' : 'অপরাহ্ণে';
        const appt = (appointment ?? '').trim();
        const role = appt ? `${appt} হিসেবে ` : '';
        return `বেসামরিক হিসাব পদ্ধতির ৪৭ নং অনুচ্ছেদের বিধি অনুযায়ী আমি নিম্নস্বাক্ষরকারী এই মর্মে বিবরণ দিচ্ছি যে, অদ্য ${dateBn} তারিখ (${timeOfDay}) র‍্যাব ফোর্সেস সদর দপ্তর, কুর্মিটোলা, ঢাকায় ${role}কার্যভার গ্রহণ করিলাম।`;
    }

    /** Formats a date as Bengali "dd MonthName yyyy" with Bengali digits. */
    private toBengaliDate(d: Date): string {
        const months = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
        const day = this.toBengaliDigits(String(d.getDate()).padStart(2, '0'));
        const year = this.toBengaliDigits(String(d.getFullYear()));
        return `${day} ${months[d.getMonth()]} ${year}`;
    }

    /** Converts ASCII digits in a string to Bengali digits. */
    private toBengaliDigits(s: string): string {
        const map = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
        return s.replace(/[0-9]/g, (ch) => map[Number(ch)]);
    }

    private toIsoDate(d: Date | string | null | undefined): string | null {
        if (!d) return null;
        if (typeof d === 'string') return d;
        const yyyy = d.getFullYear();
        const mm = `${d.getMonth() + 1}`.padStart(2, '0');
        const dd = `${d.getDate()}`.padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    /**
     * Full ISO timestamp for fields that carry a time as well as a date (Generated
     * date → CreatedDate). Unlike toIsoDate this keeps the clock component.
     */
    private toIsoDateTime(d: Date | string | null | undefined): string | null {
        if (!d) return null;
        if (typeof d === 'string') return d;
        return d.toISOString();
    }

    /**
     * "HH:mm" clock component of a date — the format MovementInfo.ReleaseTime is
     * stored in and that `<input type="time">` on the movement form expects.
     */
    private toTimeString(d: Date | string | null | undefined): string | null {
        if (!d) return null;
        const date = typeof d === 'string' ? new Date(d) : d;
        if (Number.isNaN(date.getTime())) return null;
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
}
