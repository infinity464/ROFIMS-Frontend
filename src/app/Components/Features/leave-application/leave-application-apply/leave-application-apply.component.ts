import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { environment } from '@/Core/Environments/environment';
import { SharedService } from '@/shared/services/shared-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { EmpService } from '@/services/emp-service';
import { LeaveApplicationService, LeaveApplicationModel, LeaveApplicationDetailModel, LeaveApplicationRecommenderModel, LeaveApplicationReturnHistoryModel } from '@/services/leave-application.service';
import { LeaveInfoService, LeaveInfoModel } from '@/services/leave-info-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { UserMenuService } from '@/services/user-menu.service';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { MessageService } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { CheckboxModule } from 'primeng/checkbox';
import { MultiSelectModule } from 'primeng/multiselect';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { FluidModule } from 'primeng/fluid';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, take } from 'rxjs';
import { RouterModule } from '@angular/router';

interface ApproverOption { label: string; value: number; }

@Component({
    selector: 'app-leave-application-apply',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        FormsModule,
        InputTextModule,
        ButtonModule,
        SelectModule,
        DatePickerModule, FlexibleDateDirective,
        CheckboxModule,
        MultiSelectModule,
        TextareaModule,
        ToastModule,
        FluidModule,
        EmployeeSearchComponent,
        FileReferencesFormComponent,
        RouterModule
    ],
    providers: [MessageService],
    templateUrl: './leave-application-apply.component.html',
    styleUrl: './leave-application-apply.component.scss'
})
export class LeaveApplicationApplyComponent implements OnInit {
    @ViewChild('fileReferencesForm') fileReferencesForm?: FileReferencesFormComponent;

    title = 'ApplyLeave';
    form!: FormGroup;
    applyForSelf = true;
    applicantInfo: EmployeeBasicInfo | null = null;
    applicantEmployeeId: number | null = null;
    leaveTypeOptions: { label: string; value: number }[] = [];
    approverOptions: ApproverOption[] = [];
    processTypeOptions = [
        { label: 'Automatic', value: 'automatic' },
        { label: 'Manual', value: 'manual' }
    ];
    manualDecisionOptions = [
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' }
    ];
    hasReliever = false;
    relieverInfo: EmployeeBasicInfo | null = null;
    isSaving = false;
    editId: number | null = null;
    editMode = false;
    currentUserEmployeeId: number | null = null;
    canInsert = true;
    canUpdate = true;
    canDelete = true;
    fileRows: FileRowData[] = [];
    /** Read-only "Prepared By" display string built from the logged-in user (mirrors notesheet-generate). */
    preparedByDisplay = '';
    /** False when the logged-in user has no employee mapping — show a hint and block submit. */
    isPreparedByMapped = false;
    /** Audit log of "Return to applicant" events on this application. Visible only to the applicant. */
    returnHistory: LeaveApplicationReturnHistoryModel[] = [];
    /** Map of employeeId → formatted name, used to render the Return History entries. */
    private employeeNameCache: Record<number, string> = {};
    /**
     * Existing LeaveInfo ranges (yyyy-MM-dd, in the applicant's local calendar) for the currently
     * loaded applicant. The apply form rejects any date row that intersects one of these — both for
     * immediate UX feedback and to defend against historical LeaveInfo rows that were saved with the
     * `.toISOString()` bug (where the stored UTC date is one day behind the user's intended date).
     */
    private applicantLeaveInfoRanges: { from: string; to: string }[] = [];

    private api = `${environment.apis.core}/EmployeeInfo`;

    constructor(
        private fb: FormBuilder,
        private http: HttpClient,
        private sharedService: SharedService,
        private empService: EmpService,
        private leaveAppService: LeaveApplicationService,
        private leaveInfoService: LeaveInfoService,
        private masterBasicSetup: MasterBasicSetupService,
        private identityMappingService: IdentityUserMappingService,
        private messageService: MessageService,
        private router: Router,
        private route: ActivatedRoute,
        private _userMenuService: UserMenuService
    ) {
        this.initForm();
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this.router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;
        this.loadLeaveTypes();
        this.loadApproverOptions();
        this.resolvePreparedByMapping();
        this.route.queryParams.pipe(take(1)).subscribe((params) => {
            const id = params['id'];
            if (id != null && id !== '') {
                const numId = Number(id);
                if (!isNaN(numId) && numId > 0) {
                    this.editId = numId;
                    this.editMode = true;
                    this.loadForEdit(numId);
                }
            }
        });
        if (this.applyForSelf) this.loadCurrentUserAsApplicant();
    }

    /**
     * Resolve the read-only Prepared By field from the logged-in user. Mirrors the auto-fill in
     * notesheet-generate (SharedService → IdentityUserMappingService → EmpService) and formats as
     * "{FullNameEN} | RAB: {rabid} | SVC: {serviceId}". Falls back to a notice if the user has no
     * employee mapping (leave applications require a mapped user).
     */
    private resolvePreparedByMapping(): void {
        const userId = this.sharedService.getCurrentUserId?.();
        if (!userId) {
            this.isPreparedByMapped = false;
            this.preparedByDisplay = 'No mapped user.';
            return;
        }
        this.identityMappingService.getEmployeeIdForUser(userId).subscribe({
            next: (empId) => {
                if (!empId) {
                    this.isPreparedByMapped = false;
                    this.preparedByDisplay = 'Your account is not mapped to an employee.';
                    return;
                }
                this.isPreparedByMapped = true;
                this.empService.getEmployeeById(empId).subscribe({
                    next: (emp: any) => {
                        const name = emp?.fullNameEN ?? emp?.FullNameEN ?? '';
                        const rabId = emp?.rabid ?? emp?.RABID ?? emp?.Rabid ?? '';
                        const serviceId = emp?.serviceId ?? emp?.ServiceId ?? '';
                        const parts = [name, rabId ? `RAB: ${rabId}` : '', serviceId ? `SVC: ${serviceId}` : ''].filter(Boolean);
                        this.preparedByDisplay = parts.join(' | ') || `Employee #${empId}`;
                    }
                });
            },
            error: () => {
                this.isPreparedByMapped = false;
                this.preparedByDisplay = 'Could not resolve preparer.';
            }
        });
    }

    private initForm(): void {
        this.form = this.fb.group({
            applicantEmployeeId: [null as number | null, Validators.required],
            appliedByEmployeeId: [null as number | null],
            processType: [null as string | null, Validators.required],
            manualDecision: [null as string | null],
            /** Date the manual approval is recorded. Only used when processType=manual and decision=approved. Defaults to today. */
            manualApprovedDate: [new Date() as Date | null],
            relieverEmployeeId: [null as number | null],
            addressDuringLeave: [''],
            remarks: [''],
            finalApproverId: [null as number | null],
            leaveDetails: this.fb.array([this.createLeaveDetailRow()], this.overlapValidator()),
            recommenderIds: [[] as number[]]
        });
        // Refresh the applicant's existing LeaveInfo ranges whenever the applicant changes, so the
        // overlap check in buildAndValidate has up-to-date data. Clears on null/0.
        this.form.get('applicantEmployeeId')!.valueChanges.subscribe((empId: number | null) => {
            if (empId && empId > 0) {
                this.loadApplicantLeaveInfo(empId);
            } else {
                this.applicantLeaveInfoRanges = [];
            }
        });
        this.form.get('processType')!.valueChanges.subscribe((val) => {
            if (val === 'manual') {
                // Manual mode: decision is mandatory, the approval-flow fields are not used.
                // Clear them so they don't leak into the submit payload or sit stale in the UI.
                this.form.get('manualDecision')!.setValidators(Validators.required);
                this.form.get('finalApproverId')!.clearValidators();
                this.form.patchValue({ finalApproverId: null, recommenderIds: [] }, { emitEvent: false });
            } else {
                this.form.get('manualDecision')!.clearValidators();
                this.form.get('manualDecision')!.setValue(null);
                this.form.get('finalApproverId')!.setValidators(Validators.required);
            }
            this.form.get('manualDecision')!.updateValueAndValidity();
            this.form.get('finalApproverId')!.updateValueAndValidity();
        });
    }

    /** Builds an empty leave-detail row FormGroup. */
    private createLeaveDetailRow(initial?: Partial<{ leaveTypeId: number; fromDate: Date; toDate: Date }>): FormGroup {
        return this.fb.group({
            leaveTypeId: [initial?.leaveTypeId ?? null, Validators.required],
            fromDate: [initial?.fromDate ?? null, Validators.required],
            toDate: [initial?.toDate ?? null, Validators.required]
        });
    }

    /** Sorts rows by fromDate and flags any pair with overlapping ranges. */
    private overlapValidator(): ValidatorFn {
        return (control: AbstractControl): ValidationErrors | null => {
            const arr = control as FormArray;
            const rows = arr.controls
                .map((c, idx) => {
                    const v = c.value;
                    return v.fromDate && v.toDate
                        ? { idx, from: new Date(v.fromDate).getTime(), to: new Date(v.toDate).getTime() }
                        : null;
                })
                .filter((r): r is { idx: number; from: number; to: number } => r !== null)
                .sort((a, b) => a.from - b.from);
            for (let i = 1; i < rows.length; i++) {
                if (rows[i].from <= rows[i - 1].to) {
                    return { overlap: true };
                }
            }
            return null;
        };
    }

    get leaveDetails(): FormArray { return this.form.get('leaveDetails') as FormArray; }

    addLeaveDetailRow(): void {
        this.leaveDetails.push(this.createLeaveDetailRow());
    }

    removeLeaveDetailRow(index: number): void {
        if (this.leaveDetails.length <= 1) return; // keep at least one row
        this.leaveDetails.removeAt(index);
    }

    /** Inclusive day count for a row (returns null if either date is missing or invalid). */
    leaveDetailRowDays(index: number): number | null {
        const row = this.leaveDetails.at(index)?.value;
        if (!row?.fromDate || !row?.toDate) return null;
        const from = new Date(row.fromDate);
        const to = new Date(row.toDate);
        if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) return null;
        return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }

    /** Total days across all valid leave-detail rows. */
    get totalDays(): number {
        let sum = 0;
        for (let i = 0; i < this.leaveDetails.length; i++) {
            const d = this.leaveDetailRowDays(i);
            if (d != null) sum += d;
        }
        return sum;
    }

    /** Display label for a leave type from the loaded options (used by the pre-submit summary). */
    getLeaveTypeLabel(leaveTypeId: number | null | undefined): string {
        if (leaveTypeId == null) return '-';
        const opt = this.leaveTypeOptions.find((o) => o.value === leaveTypeId);
        return opt?.label ?? String(leaveTypeId);
    }

    /** dd-mm-yyyy format used by the pre-submit summary table to match the printed leave letter. */
    formatRowDate(d: Date | string | null | undefined): string {
        if (!d) return '-';
        const dt = d instanceof Date ? d : new Date(d);
        if (isNaN(dt.getTime())) return '-';
        const day = String(dt.getDate()).padStart(2, '0');
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        return `${day}-${month}-${dt.getFullYear()}`;
    }

    /** True when at least one leave-detail row has Leave Type + From + To filled — drives summary visibility. */
    get hasFilledLeaveRows(): boolean {
        for (let i = 0; i < this.leaveDetails.length; i++) {
            const v = this.leaveDetails.at(i).value;
            if (v?.leaveTypeId && v?.fromDate && v?.toDate) return true;
        }
        return false;
    }

    loadLeaveTypes(): void {
        this.masterBasicSetup.getAllByType('LeaveType').subscribe({
            next: (list) => {
                this.leaveTypeOptions = (Array.isArray(list) ? list : []).map((c: any) => ({
                    label: c.codeValueEN || c.CodeValueEN || String(c.codeId ?? c.CodeId),
                    value: c.codeId ?? c.CodeId
                }));
            },
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load leave types' })
        });
    }

    loadApproverOptions(): void {
        this.http.get<any[]>(`${this.api}/GetAll`).subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                this.approverOptions = arr.map((e: any) => ({
                    label: `${e.fullNameEN || e.FullNameEN || ''} (${e.rabid || e.Rabid || e.employeeID || e.EmployeeID})`,
                    value: e.employeeID ?? e.EmployeeID
                }));
                const userId = this.sharedService.getCurrentUserId?.();
                if (userId) {
                    this.identityMappingService.getEmployeeIdForUser(userId).subscribe({
                        next: (empId) => { if (empId) this.currentUserEmployeeId = empId; }
                    });
                }
            },
            error: (_err: any) => {}
        });
    }

    loadCurrentUserAsApplicant(): void {
        const userId = this.sharedService.getCurrentUserId?.();
        if (!userId) return;
        this.identityMappingService.getEmployeeIdForUser(userId).subscribe({
            next: (empId) => {
                if (!empId) {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Employee ID not found',
                        detail: 'Your user account is not mapped to an employee. Please contact admin to set Identity User Mapping.'
                    });
                    return;
                }
                this.empService.getEmployeeById(empId).subscribe({
                    next: (emp: any) => {
                        if (!emp) return;
                        const id = emp.employeeID ?? emp.EmployeeID;
                        this.applicantEmployeeId = id;
                        this.applicantInfo = {
                            employeeID: id,
                            fullNameEN: emp.fullNameEN ?? emp.FullNameEN ?? '',
                            fullNameBN: emp.fullNameBN ?? emp.FullNameBN ?? '',
                            rabid: emp.rabid ?? emp.Rabid ?? '',
                            serviceId: emp.serviceId ?? emp.ServiceId ?? '',
                            rankDisplay: emp.rank ?? emp.Rank,
                            corpsDisplay: emp.corps ?? emp.Corps,
                            tradeDisplay: emp.trade ?? emp.Trade,
                            motherOrganizationDisplay: emp.motherOrganization ?? emp.MotherOrganization,
                            memberTypeDisplay: emp.memberType ?? emp.MemberType
                        };
                        this.form.patchValue({ applicantEmployeeId: id, appliedByEmployeeId: id });
                    },
                    error: (err: any) =>
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load employee details' })
                });
            },
            error: (err: any) =>
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to resolve employee mapping' })
        });
    }

    /**
     * Pulls the applicant's existing LeaveInfo records and converts each to a yyyy-MM-dd range in
     * the applicant's local calendar. We compare in this frame (rather than UTC) because LeaveInfo
     * is conceptually a calendar date and historic rows may have been saved with a UTC-shifted ISO.
     */
    private loadApplicantLeaveInfo(employeeId: number): void {
        this.leaveInfoService.getByEmployeeId(employeeId).subscribe({
            next: (rows: LeaveInfoModel[]) => {
                const list = Array.isArray(rows) ? rows : [];
                this.applicantLeaveInfoRanges = list
                    .map((r) => {
                        const from = this.toLocalCalendarDate(r.fromDate);
                        const to = this.toLocalCalendarDate(r.toDate);
                        return from && to ? { from, to } : null;
                    })
                    .filter((x): x is { from: string; to: string } => x !== null);
            },
            error: () => {
                // Silent: a failed fetch shouldn't block the form. Backend overlap check is still in place.
                this.applicantLeaveInfoRanges = [];
            }
        });
    }

    /** yyyy-MM-dd built from local components — matches what the user sees in emp-leave-info's table. */
    private toLocalCalendarDate(val: string | Date | null | undefined): string | null {
        if (!val) return null;
        const d = val instanceof Date ? val : new Date(val);
        if (isNaN(d.getTime())) return null;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    setApplyForSelf(forSelf: boolean): void {
        this.applyForSelf = forSelf;
        this.applicantInfo = null;
        this.applicantEmployeeId = null;
        this.form.patchValue({ applicantEmployeeId: null, appliedByEmployeeId: this.currentUserEmployeeId });
        if (this.applyForSelf) this.loadCurrentUserAsApplicant();
    }

    onApplicantSelected(info: EmployeeBasicInfo | null): void {
        this.applicantInfo = info;
        this.applicantEmployeeId = info?.employeeID ?? null;
        this.form.patchValue({
            applicantEmployeeId: this.applicantEmployeeId,
            appliedByEmployeeId: this.getAppliedByEmployeeId()
        });
    }

    onRelieverSelected(info: EmployeeBasicInfo | null): void {
        this.relieverInfo = info;
        this.form.patchValue({ relieverEmployeeId: info?.employeeID ?? null });
    }

    onRelieverCheckChange(): void {
        if (!this.hasReliever) {
            this.relieverInfo = null;
            this.form.patchValue({ relieverEmployeeId: null });
        }
    }

    onFileRowsChange(rows: FileRowData[]): void {
        this.fileRows = rows;
    }

    onDownloadFile(evt: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(evt.fileId).subscribe({
            next: (blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = evt.fileName || `file-${evt.fileId}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 100);
            },
            error: (err: any) =>
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to download file' })
        });
    }

    private getAppliedByEmployeeId(): number | null {
        if (this.applyForSelf && this.applicantEmployeeId) return this.applicantEmployeeId;
        const user = this.sharedService.getCurrentUser?.();
        if (!user) return null;
        return null;
    }

    loadForEdit(id: number): void {
        this.leaveAppService.getById(id).subscribe({
            next: (d) => {
                if (!d) {
                    this.messageService.add({ severity: 'warn', summary: 'Cannot edit', detail: 'Application not found.' });
                    return;
                }
                // Edit is allowed while the chain hasn't moved yet: Draft (status=1) or Pending
                // (status=2) where no recommender has approved/declined and no final approver has
                // stamped a decision. The Return action also puts an application back into Draft.
                // Approved (3) / Declined (4) / Pending with any chain action are locked.
                const status = d.leaveApplicationStatusId;
                const isEditableStatus = status === 1 || status === 2 || status === 0;
                const anyRecommenderActed = (d.recommenders || []).some((r) => (r.status ?? 1) !== 1);
                const finalApproverActed = (d.approvedByEmployeeId != null && d.approvedByEmployeeId !== 0)
                    || (d.declinedByEmployeeId != null && d.declinedByEmployeeId !== 0);
                if (!isEditableStatus || anyRecommenderActed || finalApproverActed) {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Cannot edit',
                        detail: 'Edit disabled — this application is under processing.'
                    });
                    return;
                }

                // Determine processType: trust backend value, fall back to status-derived for old rows.
                const savedStatus = d.leaveApplicationStatusId;
                const isManual = savedStatus === 3 || savedStatus === 4;
                const manualDecision = savedStatus === 3 ? 'approved' : savedStatus === 4 ? 'rejected' : null;
                const processType = d.processType || (isManual ? 'manual' : 'automatic');

                const savedApprovedDate = d.approvedDate ?? (d as any).ApprovedDate ?? null;
                this.form.patchValue({
                    applicantEmployeeId: d.applicantEmployeeId ?? (d as any).ApplicantEmployeeId,
                    processType: processType,
                    manualDecision: manualDecision,
                    manualApprovedDate: savedApprovedDate ? new Date(savedApprovedDate) : new Date(),
                    relieverEmployeeId: d.relieverEmployeeId ?? (d as any).RelieverEmployeeId ?? null,
                    addressDuringLeave: d.addressDuringLeave ?? (d as any).AddressDuringLeave ?? '',
                    remarks: d.remarks ?? (d as any).Remarks ?? '',
                    finalApproverId: d.finalApproverId ?? (d as any).FinalApproverId ?? null
                });

                // Rehydrate leave-detail rows from the response (or fall back to summary fields for legacy data).
                this.leaveDetails.clear();
                const detailRows = (d.leaveDetails && d.leaveDetails.length > 0)
                    ? d.leaveDetails.map((r) => ({
                        leaveTypeId: r.leaveTypeId,
                        fromDate: r.fromDate ? new Date(r.fromDate) : null,
                        toDate: r.toDate ? new Date(r.toDate) : null
                    }))
                    : [{
                        leaveTypeId: (d.leaveTypeId ?? null) as number | null,
                        fromDate: d.fromDate ? new Date(d.fromDate) : null,
                        toDate: d.toDate ? new Date(d.toDate) : null
                    }];
                detailRows.forEach((r: any) => this.leaveDetails.push(this.createLeaveDetailRow(r)));
                if (this.leaveDetails.length === 0) this.leaveDetails.push(this.createLeaveDetailRow());

                // Recommenders — preserve sequence order from the backend.
                const orderedRecommenderIds = (d.recommenders || [])
                    .slice()
                    .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0))
                    .map((r) => r.employeeId);
                this.form.patchValue({ recommenderIds: orderedRecommenderIds });

                // Attachments → file-references-form rows (existing fileId, no local file).
                this.fileRows = (d.attachments || []).map((a) => ({
                    displayName: a.fileName || `file-${a.fileId}`,
                    file: null,
                    fileId: a.fileId
                } as FileRowData));

                // Reliever info.
                this.applicantEmployeeId = d.applicantEmployeeId ?? (d as any).ApplicantEmployeeId;
                const relieverId = d.relieverEmployeeId ?? (d as any).RelieverEmployeeId;
                this.hasReliever = relieverId != null && relieverId !== 0;
                if (this.hasReliever && relieverId) {
                    this.empService.getEmployeeById(relieverId).subscribe({
                        next: (emp: any) => {
                            if (emp)
                                this.relieverInfo = {
                                    employeeID: emp.employeeID ?? emp.EmployeeID,
                                    fullNameEN: emp.fullNameEN ?? emp.FullNameEN ?? '',
                                    rabid: emp.rabid ?? emp.Rabid ?? '',
                                    serviceId: emp.serviceId ?? emp.ServiceId ?? '',
                                    rankDisplay: emp.rank ?? emp.Rank,
                                    corpsDisplay: emp.corps ?? emp.Corps,
                                    tradeDisplay: emp.trade ?? emp.Trade,
                                    motherOrganizationDisplay: emp.motherOrganization ?? emp.MotherOrganization,
                                    memberTypeDisplay: emp.memberType ?? emp.MemberType
                                };
                        }
                    });
                }
                this.empService.getEmployeeById(this.applicantEmployeeId!).subscribe({
                    next: (emp: any) => {
                        if (emp)
                            this.applicantInfo = {
                                employeeID: emp.employeeID ?? emp.EmployeeID,
                                fullNameEN: emp.fullNameEN ?? emp.FullNameEN ?? '',
                                rabid: emp.rabid ?? emp.Rabid ?? '',
                                serviceId: emp.serviceId ?? emp.ServiceId ?? '',
                                rankDisplay: emp.rank ?? emp.Rank,
                                corpsDisplay: emp.corps ?? emp.Corps,
                                tradeDisplay: emp.trade ?? emp.Trade,
                                motherOrganizationDisplay: emp.motherOrganization ?? emp.MotherOrganization,
                                memberTypeDisplay: emp.memberType ?? emp.MemberType
                            };
                    }
                });

                // Return history — visible only when the current user is the applicant.
                // We pre-fetch each returner's display name so the card can render names eagerly.
                this.returnHistory = (d.returnHistory ?? [])
                    .slice()
                    .sort((a, b) => (b.returnedDate ?? '').localeCompare(a.returnedDate ?? ''));
                const uniqReturnerIds = Array.from(new Set(this.returnHistory.map((h) => h.returnedByEmployeeId).filter((id) => !!id)));
                uniqReturnerIds.forEach((empId) => {
                    if (this.employeeNameCache[empId]) return;
                    this.empService.getEmployeeById(empId).subscribe({
                        next: (emp: any) => {
                            const name = emp?.fullNameEN ?? emp?.FullNameEN ?? '';
                            const rabId = emp?.rabid ?? emp?.RABID ?? emp?.Rabid ?? '';
                            const serviceId = emp?.serviceId ?? emp?.ServiceId ?? '';
                            const parts = [name, rabId ? `RAB: ${rabId}` : '', serviceId ? `SVC: ${serviceId}` : ''].filter(Boolean);
                            this.employeeNameCache[empId] = parts.join(' | ') || `Employee #${empId}`;
                        }
                    });
                });
            },
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load application' })
        });
    }

    /** Returns the cached returner name; falls back to the employee id while the lookup is pending. */
    getReturnerName(employeeId: number): string {
        return this.employeeNameCache[employeeId] ?? `Employee #${employeeId}`;
    }

    /** Format the ReturnedDate for display (locale dd-mm-yyyy with hh:mm). */
    formatReturnDate(d: string | null | undefined): string {
        if (!d) return '-';
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return d;
        return dt.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    /** Show the Return History card only to the applicant on this application. */
    get showReturnHistory(): boolean {
        if (!this.editMode || this.returnHistory.length === 0) return false;
        // applicantEmployeeId is set for editMode; current user is the applicant if their employee
        // id matches. We compare against currentUserEmployeeId which is resolved by loadApproverOptions.
        return this.currentUserEmployeeId != null && this.applicantEmployeeId === this.currentUserEmployeeId;
    }

    submitForApproval(): void {
        if (this.editMode ? !this.canUpdate : !this.canInsert) {
            this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You do not have permission to perform this action.' });
            return;
        }
        if (!this.buildAndValidate()) return;
        const processType = this.form.get('processType')?.value;
        // Upload any pending files first, then submit with the resolved attachment fileIds.
        this.resolveAttachmentsThen((attachmentFileIds) => {
            if (processType === 'manual') {
                this.submitManual(attachmentFileIds);
            } else {
                this.submitAutomatic(attachmentFileIds);
            }
        });
    }

    /** Saves the current form as a Draft (status 1) without triggering the approval workflow. */
    saveDraft(): void {
        if (this.editMode ? !this.canUpdate : !this.canInsert) {
            this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You do not have permission to perform this action.' });
            return;
        }
        if (!this.buildAndValidate()) return;
        this.resolveAttachmentsThen((attachmentFileIds) => {
            const payload = this.buildPayload(1, attachmentFileIds);
            this.isSaving = true;
            const obs = this.editId
                ? this.leaveAppService.update({ ...payload, leaveApplicationId: this.editId })
                : this.leaveAppService.save(payload);
            obs.subscribe({
                next: (res) => {
                    this.isSaving = false;
                    const code = res.statusCode ?? res.StatusCode ?? 0;
                    const msg = res.description ?? res.Description ?? '';
                    if (code === 200) {
                        this.messageService.add({ severity: 'success', summary: 'Draft Saved', detail: 'Your draft has been saved.' });
                        const data = res.data as any;
                        const id = data?.leaveApplicationId ?? data?.LeaveApplicationId ?? this.editId;
                        if (id && !this.editId) this.router.navigate(['/leave-application/apply'], { queryParams: { id } });
                    } else {
                        this.messageService.add({ severity: 'warn', summary: this.failureSummary('Save failed', msg), detail: msg || 'Save failed.' });
                    }
                },
                error: (err: any) => {
                    this.isSaving = false;
                    const detail = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Failed to save draft';
                    this.messageService.add({ severity: 'error', summary: this.failureSummary('Error', detail), detail });
                }
            });
        });
    }

    /** Discards changes and navigates back to the list. */
    cancel(): void {
        this.router.navigate(['/leave-application/list']);
    }

    /**
     * Resets the form to its pristine "new application" state — same as a fresh page load.
     * Used after a successful save/submit so the user can immediately enter another application
     * without a redirect.
     */
    private resetForm(): void {
        // Reset scalar form fields first, then rebuild the FormArray. Doing the FormArray rebuild
        // AFTER form.reset avoids form.reset() also iterating into the freshly-pushed row and
        // re-emitting null values that can leave the bound p-select / p-datepicker out of sync.
        this.form.reset({
            applicantEmployeeId: null,
            appliedByEmployeeId: null,
            processType: null,
            manualDecision: null,
            manualApprovedDate: new Date(),
            relieverEmployeeId: null,
            addressDuringLeave: '',
            remarks: '',
            finalApproverId: null,
            recommenderIds: []
        });

        // Rebuild leave-detail rows: drop everything, add a single fresh empty row. The template
        // tracks rows by FormGroup reference, so the new row mounts fresh DOM (and fresh PrimeNG
        // component state) instead of reusing the previous row's nodes.
        while (this.leaveDetails.length > 0) this.leaveDetails.removeAt(0);
        this.leaveDetails.push(this.createLeaveDetailRow());

        this.form.markAsPristine();
        this.form.markAsUntouched();

        // Reset side state held outside the FormGroup.
        this.applyForSelf = true;
        this.applicantInfo = null;
        this.applicantEmployeeId = null;
        this.hasReliever = false;
        this.relieverInfo = null;
        this.fileRows = [];
        this.returnHistory = [];

        // Drop edit mode + remove the ?id= query param from the URL.
        if (this.editId != null || this.editMode) {
            this.editId = null;
            this.editMode = false;
            this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
        }

        // Re-resolve the current user as applicant (default "For myself" path).
        this.loadCurrentUserAsApplicant();

        // Scroll to top so the user sees the cleared form.
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    }

    /** Uploads any locally-selected files via EmpService, then invokes the callback with the full set of fileIds (existing + newly uploaded). */
    private resolveAttachmentsThen(cb: (attachmentFileIds: number[]) => void): void {
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];
        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const existingIds = existingRefs.map((r) => r.FileId);

        if (filesToUpload.length === 0) {
            cb(existingIds);
            return;
        }

        this.isSaving = true;
        const uploads = filesToUpload.map((r: FileRowData) =>
            this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name)
        );
        forkJoin(uploads).subscribe({
            next: (results: { fileId: number; fileName: string }[]) => {
                const newIds = (Array.isArray(results) ? results : []).map((r) => r.fileId);
                cb([...existingIds, ...newIds]);
            },
            error: (err: any) => {
                this.isSaving = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to upload one or more files' });
            }
        });
    }

    private submitManual(attachmentFileIds: number[]): void {
        const decision = this.form.get('manualDecision')?.value;
        if (!decision) {
            this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Please select Approved or Rejected.' });
            return;
        }
        const statusId = decision === 'approved' ? 3 : 4;
        const payload = this.buildPayload(statusId, attachmentFileIds);
        this.isSaving = true;

        const obs = this.editId
            ? this.leaveAppService.update({ ...payload, leaveApplicationId: this.editId })
            : this.leaveAppService.save(payload);

        obs.subscribe({
            next: (res) => {
                this.isSaving = false;
                const code = res.statusCode ?? res.StatusCode ?? 0;
                const msg = res.description ?? res.Description ?? '';
                if (code === 200) {
                    const label = statusId === 3 ? 'Approved' : 'Rejected';
                    this.messageService.add({ severity: 'success', summary: label, detail: `Leave application saved as ${label}.` });
                    this.resetForm();
                } else {
                    this.messageService.add({ severity: 'warn', summary: this.failureSummary('Save failed', msg), detail: msg || 'Save failed.' });
                }
            },
            error: (err: any) => {
                this.isSaving = false;
                const detail = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Failed to save';
                this.messageService.add({ severity: 'error', summary: this.failureSummary('Error', detail), detail });
            }
        });
    }

    private submitAutomatic(attachmentFileIds: number[]): void {
        const finalApproverId = this.form.get('finalApproverId')?.value;
        if (!finalApproverId) {
            this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Please select Final Approver before submitting.' });
            return;
        }
        const payload = this.buildPayload(1, attachmentFileIds);
        this.isSaving = true;
        const doSubmit = (id: number) => {
            this.leaveAppService.submitForApproval(id).subscribe({
                next: (res) => {
                    this.isSaving = false;
                    const code = res.statusCode ?? res.StatusCode ?? 0;
                    const msg = res.description ?? res.Description ?? '';
                    if (code === 200) {
                        this.messageService.add({ severity: 'success', summary: 'Submitted', detail: 'Leave application submitted for approval.' });
                        this.resetForm();
                    } else {
                        this.messageService.add({ severity: 'warn', summary: this.failureSummary('Submit failed', msg), detail: msg || 'Submit failed.' });
                    }
                },
                error: (err: any) => {
                    this.isSaving = false;
                    const detail = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Failed to submit';
                    this.messageService.add({ severity: 'error', summary: this.failureSummary('Error', detail), detail });
                }
            });
        };
        if (this.editId) {
            this.leaveAppService.update({ ...payload, leaveApplicationId: this.editId }).subscribe({
                next: (res) => {
                    const code = res.statusCode ?? res.StatusCode ?? 0;
                    if (code === 200) {
                        doSubmit(this.editId!);
                    } else {
                        this.isSaving = false;
                        const failMsg = res.description ?? res.Description ?? '';
                        this.messageService.add({ severity: 'warn', summary: this.failureSummary('Save failed', failMsg), detail: failMsg });
                    }
                },
                error: (err: any) => {
                    this.isSaving = false;
                    const detail = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Failed to save';
                    this.messageService.add({ severity: 'error', summary: this.failureSummary('Error', detail), detail });
                }
            });
        } else {
            this.leaveAppService.save(payload).subscribe({
                next: (res) => {
                    const code = res.statusCode ?? res.StatusCode ?? 0;
                    const data = res.data as any;
                    const id = data?.leaveApplicationId ?? data?.LeaveApplicationId;
                    if (code === 200 && id) {
                        doSubmit(id);
                    } else {
                        this.isSaving = false;
                        const failMsg = res.description ?? res.Description ?? '';
                        this.messageService.add({ severity: 'warn', summary: this.failureSummary('Submit failed', failMsg), detail: failMsg });
                    }
                },
                error: (err: any) => {
                    this.isSaving = false;
                    const detail = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Failed to submit';
                    this.messageService.add({ severity: 'error', summary: this.failureSummary('Error', detail), detail });
                }
            });
        }
    }

    private buildAndValidate(): boolean {
        const applicantId = this.form.get('applicantEmployeeId')?.value
            ?? this.applicantEmployeeId
            ?? this.applicantInfo?.employeeID
            ?? null;
        if (applicantId != null && applicantId > 0) {
            this.form.patchValue({ applicantEmployeeId: applicantId });
        } else {
            this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Please select an applicant.' });
            return false;
        }
        const user = this.sharedService.getCurrentUser?.();
        if (!user && !this.editId) {
            this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Current user not found.' });
            return false;
        }
        this.form.markAllAsTouched();

        // Surface specific row-level errors before the generic "Validation" message.
        for (let i = 0; i < this.leaveDetails.length; i++) {
            const row = this.leaveDetails.at(i).value;
            if (!row.fromDate || !row.toDate || !row.leaveTypeId) {
                this.messageService.add({ severity: 'warn', summary: 'Validation', detail: `Row ${i + 1}: please fill Leave Type, From Date, and To Date.` });
                return false;
            }
            if (new Date(row.toDate) < new Date(row.fromDate)) {
                this.messageService.add({ severity: 'warn', summary: 'Validation', detail: `Row ${i + 1}: To Date must be on or after From Date.` });
                return false;
            }
        }
        if (this.leaveDetails.errors?.['overlap']) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Leave date ranges cannot overlap.' });
            return false;
        }
        // Cross-record overlap: each row vs the applicant's existing LeaveInfo ranges.
        for (let i = 0; i < this.leaveDetails.length; i++) {
            const v = this.leaveDetails.at(i).value;
            const rowFrom = this.toLocalCalendarDate(v.fromDate);
            const rowTo = this.toLocalCalendarDate(v.toDate);
            if (!rowFrom || !rowTo) continue;
            const clash = this.applicantLeaveInfoRanges.find((r) => rowFrom <= r.to && rowTo >= r.from);
            if (clash) {
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Date Conflict',
                    detail: 'Dates overlap with an existing leave record'
                });
                return false;
            }
        }
        if (this.form.invalid) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please fill all required fields.' });
            return false;
        }
        return true;
    }

    private buildPayload(statusId: number, attachmentFileIds: number[]): Partial<LeaveApplicationModel> {
        const applicantId = this.form.get('applicantEmployeeId')?.value ?? this.applicantEmployeeId;
        const user = this.sharedService.getCurrentUser?.() ?? '';
        const appliedBy = this.currentUserEmployeeId ?? applicantId ?? this.form.get('appliedByEmployeeId')?.value;
        const isManualApproval = statusId === 3 || statusId === 4;
        // ApprovedDate / DeclinedDate on the backend are DateOnly — yyyy-MM-dd, not ISO datetime.
        const today = this.toIsoDate(new Date());

        const details: LeaveApplicationDetailModel[] = this.leaveDetails.controls
            .map((c, idx) => {
                const v = c.value;
                const from = v.fromDate ? new Date(v.fromDate) : null;
                const to = v.toDate ? new Date(v.toDate) : null;
                if (!from || !to || !v.leaveTypeId) return null;
                const days = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                return {
                    leaveTypeId: v.leaveTypeId,
                    fromDate: this.toIsoDate(from),
                    toDate: this.toIsoDate(to),
                    days,
                    sequenceNo: idx + 1
                } as LeaveApplicationDetailModel;
            })
            .filter((d): d is LeaveApplicationDetailModel => d !== null);

        // Summary fields (also computed server-side, but we set them so list views work even pre-DB-trip).
        const firstRow = details[0];
        const minFrom = details.reduce((min, d) => !min || d.fromDate < min ? d.fromDate : min, '' as string);
        const maxTo = details.reduce((max, d) => !max || d.toDate > max ? d.toDate : max, '' as string);

        const recommenderIds: number[] = (this.form.get('recommenderIds')?.value as number[] | null) ?? [];
        const recommenders: LeaveApplicationRecommenderModel[] = recommenderIds.map((employeeId, idx) => ({
            employeeId,
            sequenceNo: idx + 1,
            status: 1
        }));

        return {
            applicantEmployeeId: applicantId,
            appliedByEmployeeId: appliedBy ?? applicantId,
            processType: this.form.get('processType')?.value,
            leaveTypeId: firstRow?.leaveTypeId ?? null,
            fromDate: minFrom || null,
            toDate: maxTo || null,
            relieverEmployeeId: this.form.get('relieverEmployeeId')?.value ?? null,
            addressDuringLeave: this.form.get('addressDuringLeave')?.value ?? '',
            remarks: this.form.get('remarks')?.value ?? '',
            finalApproverId: this.form.get('finalApproverId')?.value ?? null,
            leaveApplicationStatusId: statusId,
            approvedByEmployeeId: isManualApproval && statusId === 3 ? (this.currentUserEmployeeId ?? appliedBy) : null,
            // Manual approval date: prefer the user-picked Manual Approved Date; fall back to today.
            approvedDate: isManualApproval && statusId === 3
                ? (this.form.get('manualApprovedDate')?.value ? this.toIsoDate(this.form.get('manualApprovedDate')!.value as Date) : today)
                : null,
            declinedByEmployeeId: isManualApproval && statusId === 4 ? (this.currentUserEmployeeId ?? appliedBy) : null,
            declinedDate: isManualApproval && statusId === 4 ? today : null,
            createdBy: user,
            lastUpdatedBy: user,
            leaveDetails: details,
            recommenders,
            attachments: attachmentFileIds.map((fileId) => ({ fileId }))
        };
    }

    /**
     * Picks a friendlier toast summary based on the backend's failure message — overlap errors
     * surface as "Date Conflict" so the user immediately recognises why the submission was blocked.
     */
    private failureSummary(defaultSummary: string, detail: string | null | undefined): string {
        const msg = (detail ?? '').toLowerCase();
        if (msg.includes('overlap')) return 'Date Conflict';
        return defaultSummary;
    }

    private toIsoDate(d: Date): string {
        // yyyy-MM-dd in local time (matches the DateOnly contract on the backend).
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
}
