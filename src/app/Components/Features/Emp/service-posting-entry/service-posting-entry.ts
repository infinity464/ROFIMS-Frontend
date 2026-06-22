import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, of, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { Fluid } from 'primeng/fluid';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { EmpService } from '@/services/emp-service';
import { CommonCodeService } from '@/services/common-code-service';
import { PreviousRABServiceService, PreviousRABServiceInfoModel } from '@/services/previous-rab-service.service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { PresentStatusInfoService } from '@/services/present-status-info.service';
import { UserMenuService } from '@/services/user-menu.service';
import { PostingStatus, PresentStatusType } from '@/models/enums';
import { DatePrecision, toDateOnlyWithPrecision } from '@/shared/utils/partial-date.util';

/** UI-level precision for the service From date. Maps to DB's 'D'|'M'|'Y' at save. */
type ServicePrecision = 'full' | 'month-year' | 'year';
const UI_TO_DB_PRECISION: Record<ServicePrecision, DatePrecision> = { 'full': 'D', 'month-year': 'M', 'year': 'Y' };

/**
 * Service Posting Entry — Direct Join / Direct Transfer.
 *
 * Searches an existing **Serving** or **Supernumerary** member, then captures a
 * single Service Information record (the new posting) and applies it:
 *  - Supernumerary  → "Direct Join": flip PostingStatus to Servings AND add the
 *    entered service as the active Previous-RAB-Service record.
 *  - Servings       → "Direct Transfer": close the current active Previous-RAB
 *    -Service record (serviceTo = new From date, isCurrentlyActive = false) and
 *    add the entered service as the new active record.
 */
@Component({
    selector: 'app-service-posting-entry',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        Fluid,
        ButtonModule,
        SelectModule,
        InputTextModule,
        DatePickerModule,
        ToastModule,
        EmployeeSearchComponent
    ],
    providers: [MessageService],
    templateUrl: './service-posting-entry.html',
    styleUrl: './service-posting-entry.scss'
})
export class ServicePostingEntry implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;

    pageTitle = 'Direct Join / Transfer (Service Posting)';

    // Selected member
    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeInfo: EmployeeBasicInfo | null = null;
    /** Raw employee record (for the status-flip update). */
    private rawEmployee: any = null;
    /** Posting status of the selected member ('Supernumerary' | 'Servings' | ...). */
    memberStatus: string | null = null;
    /** Note-sheet pipeline status. When set, the member is mid note-sheet/posting and is blocked. */
    notesheetStatus: string | null = null;
    /** All existing Previous-RAB-Service records (used to compute the next id). */
    private allServiceRecords: PreviousRABServiceInfoModel[] = [];
    /** Existing active Previous-RAB-Service records (closed on transfer). */
    private activeServiceRecords: PreviousRABServiceInfoModel[] = [];

    isLoadingMember = false;
    isSaving = false;

    // Service Information form (the new posting)
    serviceForm!: FormGroup;
    rabUnitOptions: { label: string; value: number }[] = [];
    rabWingOptions: { label: string; value: number }[] = [];
    rabBranchOptions: { label: string; value: number }[] = [];
    rabSubBranchOptions: { label: string; value: number }[] = [];
    rabSectionOptions: { label: string; value: number }[] = [];
    rabSubSectionOptions: { label: string; value: number }[] = [];
    appointmentOptions: { label: string; value: number }[] = [];

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private commonCodeService: CommonCodeService,
        private previousRABService: PreviousRABServiceService,
        private presentStatusService: PresentStatusInfoService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        const perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = perms.canInsert;
        this.canUpdate = perms.canUpdate;

        this.buildServiceForm();
        this.loadDropdowns();
    }

    // ---- Member type helpers ----

    get isSupernumerary(): boolean {
        return this.memberStatus === PostingStatus.Supernumerary;
    }
    get isServing(): boolean {
        return this.memberStatus === PostingStatus.Servings;
    }
    /** True when the selected member has a generated RAB ID. */
    get hasRabId(): boolean {
        const r = this.employeeInfo?.rabid ?? (this.rawEmployee?.RABID ?? this.rawEmployee?.rabid);
        return r != null && String(r).trim() !== '';
    }
    /** True when a note-sheet / posting is already in process for this member. */
    get hasPendingNotesheet(): boolean {
        const s = this.notesheetStatus;
        return s != null && String(s).trim() !== '';
    }
    /** Only Serving + Supernumerary, with a RAB ID and no in-process note-sheet, can be processed here. */
    get isActionable(): boolean {
        return (this.isSupernumerary || this.isServing) && this.hasRabId && !this.hasPendingNotesheet;
    }
    get actionLabel(): string {
        if (this.isSupernumerary) return 'Direct Join';
        if (this.isServing) return 'Direct Transfer';
        return '';
    }

    // ---- Service Information form ----

    private buildServiceForm(): void {
        this.serviceForm = this.fb.group({
            rabUnitCodeId: [null, Validators.required],
            rabWingCodeId: [null],
            rabBranchCodeId: [null],
            rabSubBranchCodeId: [null],
            rabSectionCodeId: [null],
            rabSubSectionCodeId: [null],
            appointment: [null],
            precision: ['full' as ServicePrecision],
            serviceFrom: [null, Validators.required],
            postingAuth: [''],
            remarks: ['']
        });

        this.serviceForm.get('rabUnitCodeId')?.valueChanges.subscribe((v) => this.onParentChange(v, 'rabWingOptions', ['rabWingCodeId', 'rabBranchCodeId', 'rabSubBranchCodeId', 'rabSectionCodeId', 'rabSubSectionCodeId']));
        this.serviceForm.get('rabWingCodeId')?.valueChanges.subscribe((v) => this.onParentChange(v, 'rabBranchOptions', ['rabBranchCodeId', 'rabSubBranchCodeId', 'rabSectionCodeId', 'rabSubSectionCodeId']));
        this.serviceForm.get('rabBranchCodeId')?.valueChanges.subscribe((v) => this.onParentChange(v, 'rabSubBranchOptions', ['rabSubBranchCodeId', 'rabSectionCodeId', 'rabSubSectionCodeId']));
        this.serviceForm.get('rabSubBranchCodeId')?.valueChanges.subscribe((v) => this.onParentChange(v, 'rabSectionOptions', ['rabSectionCodeId', 'rabSubSectionCodeId']));
        this.serviceForm.get('rabSectionCodeId')?.valueChanges.subscribe((v) => this.onParentChange(v, 'rabSubSectionOptions', ['rabSubSectionCodeId']));
    }

    private mapOption(item: any): { label: string; value: number } {
        return {
            label: item?.codeValueEN ?? item?.CodeValueEN ?? String(item?.codeId ?? item?.CodeId ?? ''),
            value: item?.codeId ?? item?.CodeId
        };
    }

    private loadDropdowns(): void {
        this.commonCodeService.getAllActiveCommonCodesType('RabUnit').subscribe({
            next: (res: any[]) => (this.rabUnitOptions = (Array.isArray(res) ? res : []).map((i) => this.mapOption(i))),
            error: (err) => console.error('Failed to load RAB units', err)
        });
        this.commonCodeService.getAllActiveCommonCodesType('AppointmentCategory').subscribe({
            next: (res: any[]) => (this.appointmentOptions = (Array.isArray(res) ? res : []).map((i) => this.mapOption(i))),
            error: (err) => console.error('Failed to load appointments', err)
        });
    }

    /** Cascade: clear descendants then load immediate children for the selected parent. */
    private onParentChange(parentId: number | null, childOptionsProp: 'rabWingOptions' | 'rabBranchOptions' | 'rabSubBranchOptions' | 'rabSectionOptions' | 'rabSubSectionOptions', childControls: string[]): void {
        const optionProps: Array<typeof childOptionsProp> = ['rabWingOptions', 'rabBranchOptions', 'rabSubBranchOptions', 'rabSectionOptions', 'rabSubSectionOptions'];
        optionProps.slice(optionProps.indexOf(childOptionsProp)).forEach((p) => (this[p] = []));

        const patch: Record<string, null> = {};
        childControls.forEach((c) => (patch[c] = null));
        this.serviceForm.patchValue(patch, { emitEvent: false });

        if (parentId == null) return;
        this.commonCodeService.getAllActiveCommonCodesByParentId(parentId).subscribe({
            next: (list: any[]) => (this[childOptionsProp] = (Array.isArray(list) ? list : []).map((i) => this.mapOption(i))),
            error: () => (this[childOptionsProp] = [])
        });
    }

    private resetServiceForm(): void {
        this.serviceForm.reset({
            rabUnitCodeId: null, rabWingCodeId: null, rabBranchCodeId: null,
            rabSubBranchCodeId: null, rabSectionCodeId: null, rabSubSectionCodeId: null,
            appointment: null, precision: 'full', serviceFrom: null, postingAuth: '', remarks: ''
        });
        this.rabWingOptions = [];
        this.rabBranchOptions = [];
        this.rabSubBranchOptions = [];
        this.rabSectionOptions = [];
        this.rabSubSectionOptions = [];
    }

    // ---- Member search ----

    onEmployeeFound(info: EmployeeBasicInfo): void {
        this.selectedEmployeeId = info.employeeID;
        this.employeeInfo = info;
        this.isLoadingMember = true;
        this.memberStatus = null;
        this.notesheetStatus = null;
        this.allServiceRecords = [];
        this.activeServiceRecords = [];
        this.rawEmployee = null;

        forkJoin({
            employee: this.empService.getEmployeeById(info.employeeID).pipe(catchError(() => of(null))),
            services: this.previousRABService.getByEmployeeId(info.employeeID).pipe(catchError(() => of([] as PreviousRABServiceInfoModel[])))
        }).subscribe({
            next: ({ employee, services }) => {
                this.rawEmployee = employee;
                this.memberStatus = (employee?.PostingStatus ?? (employee as any)?.postingStatus ?? null) as string | null;
                this.notesheetStatus = ((employee as any)?.isSendingNotesheetStatus ?? (employee as any)?.IsSendingNotesheetStatus ?? null) as string | null;
                this.allServiceRecords = Array.isArray(services) ? services : [];
                this.activeServiceRecords = this.allServiceRecords.filter(
                    (s: any) => (s.isCurrentlyActive ?? s.IsCurrentlyActive) === true || (s.isCurrentlyActive ?? s.IsCurrentlyActive) === 1
                );
                this.employeeFound = true;
                this.isLoadingMember = false;
                this.resetServiceForm();

                if (!this.hasRabId && (this.isSupernumerary || this.isServing)) {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'RAB ID Not Generated',
                        detail: 'This member does not have a RAB ID yet. A RAB ID must be generated before a direct join or transfer can be saved.',
                        life: 7000
                    });
                } else if (this.hasPendingNotesheet) {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Note-Sheet In Process',
                        detail: 'A note-sheet / posting is already in process for this member. Direct join or transfer is not allowed until it is completed.',
                        life: 7000
                    });
                } else if (!this.isActionable) {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Not Allowed',
                        detail: `This member's status is "${this.memberStatus ?? 'Unknown'}". Only Serving or Supernumerary members can be processed here.`,
                        life: 7000
                    });
                }
            },
            error: () => {
                this.isLoadingMember = false;
                this.employeeFound = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load member details.' });
            }
        });
    }

    onSearchReset(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeInfo = null;
        this.rawEmployee = null;
        this.memberStatus = null;
        this.notesheetStatus = null;
        this.allServiceRecords = [];
        this.activeServiceRecords = [];
        this.resetServiceForm();
    }

    // ---- Save ----

    save(): void {
        if (!this.canInsert || !this.canUpdate) {
            this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You do not have permission to perform this action.' });
            return;
        }
        if (!this.selectedEmployeeId || !this.rawEmployee) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please search and select a member first.' });
            return;
        }
        if (!this.hasRabId) {
            this.messageService.add({ severity: 'warn', summary: 'RAB ID Not Generated', detail: 'This member does not have a RAB ID. Please generate the RAB ID before saving a direct join or transfer.' });
            return;
        }
        if (this.hasPendingNotesheet) {
            this.messageService.add({ severity: 'warn', summary: 'Note-Sheet In Process', detail: 'A note-sheet / posting is already in process for this member. Direct join or transfer is not allowed until it is completed.' });
            return;
        }
        if (!this.isActionable) {
            this.messageService.add({ severity: 'warn', summary: 'Not Allowed', detail: 'Only Serving or Supernumerary members can be processed here.' });
            return;
        }
        if (this.serviceForm.invalid) {
            Object.keys(this.serviceForm.controls).forEach((k) => this.serviceForm.get(k)?.markAsTouched());
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please fill Service Information (Battalion Name and From date).' });
            return;
        }

        const v = this.serviceForm.getRawValue();
        const dbPrecision = UI_TO_DB_PRECISION[(v.precision as ServicePrecision) ?? 'full'];
        const serviceFrom = toDateOnlyWithPrecision(v.serviceFrom, dbPrecision);
        const now = new Date().toISOString();

        // Composite key {EmployeeID, PreviousRABServiceID} is assigned by the client.
        // Compute the next id from all existing records so the insert doesn't collide
        // with (or be tracked twice as) an existing key.
        const nextServiceId = this.allServiceRecords.length > 0
            ? Math.max(...this.allServiceRecords.map((r: any) => Number(r.previousRABServiceID ?? r.PreviousRABServiceID ?? 0))) + 1
            : 1;

        const newRecord: Partial<PreviousRABServiceInfoModel> = {
            employeeID: this.selectedEmployeeId,
            previousRABServiceID: nextServiceId,
            rabUnitCodeId: v.rabUnitCodeId ?? null,
            rabWingCodeId: v.rabWingCodeId ?? null,
            rabBranchCodeId: v.rabBranchCodeId ?? null,
            rabSubBranchCodeId: v.rabSubBranchCodeId ?? null,
            rabSectionCodeId: v.rabSectionCodeId ?? null,
            rabSubSectionCodeId: v.rabSubSectionCodeId ?? null,
            serviceFrom,
            serviceTo: null,
            serviceFromPrecision: dbPrecision,
            serviceToPrecision: dbPrecision,
            isCurrentlyActive: true,
            appointment: v.appointment ?? null,
            postingAuth: v.postingAuth || null,
            remarks: v.remarks || null,
            filesReferences: null,
            createdBy: 'user',
            createdDate: now,
            lastUpdatedBy: 'user',
            lastupdate: now
        };

        this.isSaving = true;

        // When an appointment is chosen, mirror it onto the EmployeeInfo record.
        const newAppointment = v.appointment ?? null;
        const employeeNeedsUpdate = this.isSupernumerary || newAppointment != null;
        const updatedEmployee = employeeNeedsUpdate
            ? {
                ...this.rawEmployee,
                ...(this.isSupernumerary ? { PostingStatus: PostingStatus.Servings, postingStatus: PostingStatus.Servings } : {}),
                ...(newAppointment != null ? { Appointment: newAppointment, appointment: newAppointment } : {})
            }
            : null;

        // Step 1: prepare the "close previous posting / flip status / appointment" operations.
        const preOps: Observable<any>[] = [];

        if (this.isServing) {
            // Direct Transfer: close every currently-active record with the new From date.
            for (const rec of this.activeServiceRecords) {
                preOps.push(
                    this.previousRABService.saveUpdate({
                        ...rec,
                        isCurrentlyActive: false,
                        serviceTo: serviceFrom,
                        serviceToPrecision: dbPrecision,
                        lastUpdatedBy: 'user',
                        lastupdate: now
                    })
                );
            }
        } else if (this.isSupernumerary) {
            // Direct Join: record an "On Duty" present-status entry (status flip happens via the employee update below).
            preOps.push(this.presentStatusService.save(this.buildOnDutyPayload(this.selectedEmployeeId, now)));
        }

        // Update EmployeeInfo for the status flip (supernumerary) and/or new appointment.
        if (updatedEmployee) {
            preOps.push(this.empService.updateEmployee(updatedEmployee));
        }

        const pre$ = preOps.length > 0 ? forkJoin(preOps) : of([]);

        pre$
            .pipe(catchError((err) => { throw err; }))
            .subscribe({
                next: () => {
                    // Step 2: add the new active service record.
                    this.previousRABService.saveUpdate(newRecord).subscribe({
                        next: () => {
                            this.isSaving = false;
                            this.messageService.add({
                                severity: 'success',
                                summary: this.actionLabel || 'Saved',
                                detail: this.isSupernumerary
                                    ? 'Member joined directly: status updated to Serving and new posting added.'
                                    : 'Member transferred: previous posting closed and new posting added.'
                            });
                            this.onSearchReset();
                        },
                        error: (err) => {
                            this.isSaving = false;
                            console.error('Failed to save new service record', err);
                            this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to save the new posting record.' });
                        }
                    });
                },
                error: (err) => {
                    this.isSaving = false;
                    console.error('Failed to prepare posting change', err);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.message || (this.isSupernumerary ? 'Failed to update member status.' : 'Failed to close the previous posting.')
                    });
                }
            });
    }

    /** Build an "On Duty" PresentStatusInfo record for a directly-joined member. */
    private buildOnDutyPayload(employeeId: number, nowIso: string): any {
        return {
            EmployeeID: employeeId,
            PresentStatusType: PresentStatusType.OnDuty,
            Dated: nowIso.split('T')[0],
            ProfileShift: false,
            TransferredUnitID: null,
            MotherOrgTransferredUnitID: null,
            DateOfRelease: null,
            ReduceFromRABStrength: null,
            RTUCause: null,
            AbsentTypeID: null,
            AbsentReport: null,
            InquiryReport: null,
            IncidentDetails: null,
            DeceasedPlace: null,
            DeceasedReason: null,
            SupportingDocFilesReferences: null,
            IsActive: true,
            CreatedBy: 'user',
            CreatedDate: nowIso,
            LastUpdatedBy: 'user',
            Lastupdate: nowIso
        };
    }

    isFieldInvalid(field: string): boolean {
        const c = this.serviceForm.get(field);
        return !!c && c.invalid && c.touched;
    }
}
