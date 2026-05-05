import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { take } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { SharedService } from '@/shared/services/shared-service';
import { LeaveApplicationService, LeaveApplicationModel } from '@/services/leave-application.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { UserMenuService } from '@/services/user-menu.service';
import { EmpService } from '@/services/emp-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { CommonCodeService } from '@/services/common-code-service';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';

/**
 * Standalone preview page for a single leave application — opened from the Pending Approval list
 * via /leave-application/preview?id=X. Renders the application as a "Leave Application" letter
 * (matching the Bangla document layout) and lets the current approver Accept or Reject inline,
 * then navigates back to the pending list.
 */
@Component({
    selector: 'app-leave-pending-approval-preview',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, TextareaModule, ToastModule, TooltipModule, RouterModule],
    providers: [MessageService],
    templateUrl: './leave-pending-approval-preview.component.html',
    styleUrl: './leave-pending-approval-preview.component.scss'
})
export class LeavePendingApprovalPreviewComponent implements OnInit {
    application: LeaveApplicationModel | null = null;
    loading = false;
    submitting = false;
    notFound = false;
    remarkText = '';
    currentUserEmployeeId = 0;
    canUpdate = true;

    // ── Lookup maps (same shape as the list component) ──
    employeeNameMap: Record<number, string> = {};
    employeeServiceIdMap: Record<number, string> = {};
    employeeUnitIdMap: Record<number, number> = {};
    employeeAppointmentIdMap: Record<number, number> = {};
    employeePrefixIdMap: Record<number, number> = {};
    employeeRankIdMap: Record<number, number> = {};
    employeeProfQualIdMap: Record<number, number> = {};
    unitNameMap: Record<number, string> = {};
    appointmentNameMap: Record<number, string> = {};
    prefixNameMap: Record<number, string> = {};
    rankNameMap: Record<number, string> = {};
    profQualNameMap: Record<number, string> = {};
    leaveTypeNameMap: Record<number, string> = {};

    constructor(
        private http: HttpClient,
        private route: ActivatedRoute,
        private router: Router,
        private location: Location,
        private sharedService: SharedService,
        private leaveAppService: LeaveApplicationService,
        private identityMappingService: IdentityUserMappingService,
        private masterBasicSetup: MasterBasicSetupService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private _userMenuService: UserMenuService,
        private empService: EmpService
    ) {}

    ngOnInit(): void {
        // Auth on the action itself is enforced server-side (the Approve/Decline handlers reject
        // anyone who isn't the current pending recommender / final approver), so we don't gate
        // the buttons by a menu-route permission lookup here — the lookup misses for this preview
        // route and would hide the buttons even for legitimate recommenders.
        this.canUpdate = true;
        this.loadEmployeeNames();
        this.loadPersonalInfoMap();
        this.loadLeaveTypeNames();
        this.loadUnitNames();
        this.loadAppointmentNames();
        this.loadPrefixNames();
        this.loadRankNames();
        this.loadProfQualNames();

        const userId = this.sharedService.getCurrentUserId?.();
        if (userId) {
            this.identityMappingService.getEmployeeIdForUser(userId).subscribe({
                next: (empId) => { if (empId) this.currentUserEmployeeId = empId; }
            });
        }

        this.route.queryParams.pipe(take(1)).subscribe((params) => {
            const id = Number(params['id']);
            if (id > 0) {
                this.load(id);
            } else {
                this.notFound = true;
            }
        });
    }

    private load(id: number): void {
        this.loading = true;
        this.leaveAppService.getById(id).subscribe({
            next: (full) => {
                this.loading = false;
                if (!full) { this.notFound = true; return; }
                this.application = full;
                this.remarkText = full.remarks ?? full.remark ?? '';
            },
            error: () => {
                this.loading = false;
                this.notFound = true;
            }
        });
    }

    // ── Lookup loaders ────────────────────────────────────────────────────────────
    private loadEmployeeNames(): void {
        this.http.get<any[]>(`${environment.apis.core}/EmployeeInfo/GetAll`).subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                arr.forEach((e: any) => {
                    const id = e.employeeID ?? e.EmployeeID;
                    if (id == null) return;
                    this.employeeNameMap[id] = e.fullNameEN ?? e.FullNameEN ?? String(id);
                    const serviceId = e.serviceId ?? e.ServiceId ?? null;
                    if (serviceId) this.employeeServiceIdMap[id] = String(serviceId);
                    const unitId = e.motherOrganization ?? e.MotherOrganization ?? null;
                    if (unitId != null) this.employeeUnitIdMap[id] = Number(unitId);
                    const apptId = e.appointment ?? e.Appointment ?? null;
                    if (apptId != null) this.employeeAppointmentIdMap[id] = Number(apptId);
                    const prefixId = e.prefix ?? e.Prefix ?? null;
                    if (prefixId != null) this.employeePrefixIdMap[id] = Number(prefixId);
                    const rankId = e.rank ?? e.Rank ?? null;
                    if (rankId != null) this.employeeRankIdMap[id] = Number(rankId);
                });
            }
        });
    }

    private loadPersonalInfoMap(): void {
        this.http.get<any[]>(`${environment.apis.core}/PersonalInfo/GetAll`).subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                arr.forEach((p: any) => {
                    const empId = p.employeeID ?? p.EmployeeID;
                    const profQualId = p.professionalQualification ?? p.ProfessionalQualification ?? null;
                    if (empId != null && profQualId != null) this.employeeProfQualIdMap[empId] = Number(profQualId);
                });
            },
            error: () => {}
        });
    }

    private loadLeaveTypeNames(): void {
        this.masterBasicSetup.getAllByType('LeaveType').subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((c: any) => {
                const id = c.codeId ?? c.CodeId;
                if (id != null) this.leaveTypeNameMap[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
            })
        });
    }

    private loadUnitNames(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((o: any) => {
                const id = o.orgId ?? o.OrgId;
                if (id != null) this.unitNameMap[id] = o.orgNameEN ?? o.OrgNameEN ?? String(id);
            })
        });
    }

    private loadAppointmentNames(): void {
        this.commonCodeService.getAllActiveCommonCodesType('AppointmentCategory').subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((c: any) => {
                const id = c.codeId ?? c.CodeId;
                if (id != null) this.appointmentNameMap[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
            })
        });
    }

    private loadPrefixNames(): void {
        this.masterBasicSetup.getAllByType('Prefix').subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((c: any) => {
                const id = c.codeId ?? c.CodeId;
                if (id != null) this.prefixNameMap[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
            })
        });
    }

    private loadRankNames(): void {
        this.masterBasicSetup.getAllByType('MotherOrgRank').subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((c: any) => {
                const id = c.codeId ?? c.CodeId;
                if (id != null) this.rankNameMap[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
            })
        });
    }

    private loadProfQualNames(): void {
        this.commonCodeService.getAllActiveCommonCodesType('ProfessionalQualification').subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((c: any) => {
                const id = c.codeId ?? c.CodeId;
                if (id != null) this.profQualNameMap[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
            })
        });
    }

    // ── Display helpers ───────────────────────────────────────────────────────────
    getApplicantName(empId: number | null | undefined): string {
        if (empId == null) return '-';
        const name = this.employeeNameMap[empId];
        if (name == null) return String(empId);
        const prefix = this.prefixNameMap[this.employeePrefixIdMap[empId]];
        const rank = this.rankNameMap[this.employeeRankIdMap[empId]];
        const profQual = this.profQualNameMap[this.employeeProfQualIdMap[empId]];
        const serviceId = this.employeeServiceIdMap[empId];
        const idPart = prefix && serviceId ? `${prefix}-${serviceId}` : (serviceId ?? '');
        const left = [idPart, rank, name].filter((p) => !!p).join(' ');
        return profQual ? `${left}, ${profQual}` : left;
    }

    getApplicantFullDescription(empId: number | null | undefined): string {
        if (empId == null) return '-';
        const base = this.getApplicantName(empId);
        if (base === '-' || base === String(empId)) return base;
        const appointment = this.appointmentNameMap[this.employeeAppointmentIdMap[empId]];
        const unit = this.unitNameMap[this.employeeUnitIdMap[empId]];
        const tail = [appointment, unit].filter((p) => !!p).join(', ');
        return tail ? `${base}, ${tail}` : base;
    }

    getLeaveTypeName(leaveTypeId: number | null | undefined): string {
        if (leaveTypeId == null) return '-';
        return this.leaveTypeNameMap[leaveTypeId] ?? String(leaveTypeId);
    }

    formatDate(d: string | null | undefined): string {
        if (!d) return '-';
        const dt = new Date(d);
        return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    getRowDays(fromDate: string | null | undefined, toDate: string | null | undefined): number {
        if (!fromDate || !toDate) return 0;
        const from = new Date(fromDate);
        const to = new Date(toDate);
        if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) return 0;
        return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }

    get totalDays(): number {
        if (!this.application) return 0;
        const details = this.application.leaveDetails ?? [];
        if (details.length > 0) return details.reduce((s, d) => s + this.getRowDays(d.fromDate, d.toDate), 0);
        return this.getRowDays(this.application.fromDate, this.application.toDate);
    }

    get details(): { leaveTypeId: number; fromDate: string; toDate: string; days: number; sequenceNo?: number }[] {
        if (!this.application) return [];
        const ds = this.application.leaveDetails ?? [];
        if (ds.length > 0) {
            return [...ds]
                .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0))
                .map((d) => ({
                    leaveTypeId: d.leaveTypeId,
                    fromDate: d.fromDate,
                    toDate: d.toDate,
                    days: d.days ?? this.getRowDays(d.fromDate, d.toDate),
                    sequenceNo: d.sequenceNo
                }));
        }
        if (this.application.leaveTypeId != null && this.application.fromDate && this.application.toDate) {
            return [{
                leaveTypeId: this.application.leaveTypeId,
                fromDate: this.application.fromDate,
                toDate: this.application.toDate,
                days: this.getRowDays(this.application.fromDate, this.application.toDate)
            }];
        }
        return [];
    }

    numberToWords(n: number): string {
        if (n == null || isNaN(n)) return '';
        if (n === 0) return 'Zero';
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        if (n < 20) return ones[n];
        if (n < 100) {
            const t = Math.floor(n / 10);
            const r = n % 10;
            return r === 0 ? tens[t] : `${tens[t]}-${ones[r]}`;
        }
        return String(n);
    }

    /** Recommender chain sorted by SequenceNo for display. */
    get recommenderRows(): { employeeId: number; sequenceNo: number; status: number; remarkText?: string | null; actionedDate?: string | null }[] {
        if (!this.application) return [];
        return [...(this.application.recommenders ?? [])]
            .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0))
            .map((r) => ({
                employeeId: r.employeeId,
                sequenceNo: r.sequenceNo,
                status: r.status ?? 1,
                remarkText: r.remarkText,
                actionedDate: r.actionedDate
            }));
    }

    /** "Pending" / "Recommended" / "Declined" for a recommender row. Recommender status: 1=Pending, 2=Approved, 3=Declined. */
    getRecommenderStatusLabel(status: number | null | undefined): string {
        switch (status) {
            case 2: return 'Recommended';
            case 3: return 'Declined';
            default: return 'Pending';
        }
    }

    /** CSS class for the status chip (matches our scoped SCSS). */
    getRecommenderStatusClass(status: number | null | undefined): string {
        switch (status) {
            case 2: return 'is-approved';
            case 3: return 'is-declined';
            default: return 'is-pending';
        }
    }

    /**
     * Final-approver status, derived from the application's overall status + recommender chain:
     *  - If app is Approved (3) → "Approved"
     *  - If app is Declined (4) → "Declined" (could be by approver or any recommender — final shows 'Declined' only if all recommenders approved first)
     *  - If app is Pending (2) and any recommender is still Pending (1) → "Waiting" (queued behind the chain)
     *  - If app is Pending (2) and no recommender is still Pending → "Pending"
     *  - Otherwise (e.g. Draft) → "—"
     */
    get finalApproverStatusLabel(): string {
        if (!this.application) return '—';
        const s = this.application.leaveApplicationStatusId;
        if (s === 3) return 'Approved';
        if (s === 4) {
            const declinedByRecommender = (this.application.recommenders ?? []).some((r) => r.status === 3);
            return declinedByRecommender ? 'Skipped' : 'Declined';
        }
        if (s === 2) {
            const anyRecommenderPending = (this.application.recommenders ?? []).some((r) => r.status === 1);
            return anyRecommenderPending ? 'Waiting' : 'Pending';
        }
        return '—';
    }

    get finalApproverStatusClass(): string {
        const lbl = this.finalApproverStatusLabel;
        if (lbl === 'Approved') return 'is-approved';
        if (lbl === 'Declined') return 'is-declined';
        if (lbl === 'Skipped') return 'is-skipped';
        if (lbl === 'Pending') return 'is-pending';
        if (lbl === 'Waiting') return 'is-waiting';
        return '';
    }

    /** True when the application is still actionable (Pending Approval). Approved/Declined applications are read-only. */
    get isActionable(): boolean {
        return this.application?.leaveApplicationStatusId === 2;
    }

    /**
     * True when the current user is the next pending recommender in the chain (i.e. their row has
     * the lowest SequenceNo among recommenders with Status=1 (Pending)). Used to choose between the
     * "Recommend" and "Approve" button label / toast wording.
     */
    get isCurrentUserRecommender(): boolean {
        if (!this.application || this.currentUserEmployeeId <= 0) return false;
        const pending = (this.application.recommenders ?? [])
            .filter((r) => r.status === 1)
            .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0));
        const next = pending[0];
        return !!next && next.employeeId === this.currentUserEmployeeId;
    }

    /** Button label varies with the user's role on this application. */
    get acceptLabel(): string {
        return this.isCurrentUserRecommender ? 'Recommend' : 'Approve';
    }

    /** Toast summary to match the action taken. */
    private get acceptToastSummary(): string {
        return this.isCurrentUserRecommender ? 'Recommended' : 'Approved';
    }

    // ── Actions ───────────────────────────────────────────────────────────────────
    accept(): void {
        if (!this.application || this.submitting) return;
        this.submitting = true;
        const summary = this.acceptToastSummary;
        this.leaveAppService.approve(this.application.leaveApplicationId, this.currentUserEmployeeId, this.remarkText).subscribe({
            next: (res) => this.handleResult(res, summary),
            error: (err) => this.handleError(err)
        });
    }

    reject(): void {
        if (!this.application || this.submitting) return;
        this.submitting = true;
        this.leaveAppService.decline(this.application.leaveApplicationId, this.currentUserEmployeeId, this.remarkText).subscribe({
            next: (res) => this.handleResult(res, 'Declined'),
            error: (err) => this.handleError(err)
        });
    }

    /**
     * Sends the application back to the applicant. The reviewer's remark is mandatory; we surface
     * a clear toast if it's empty rather than letting the backend reject the call.
     */
    returnToApplicant(): void {
        if (!this.application || this.submitting) return;
        const reason = (this.remarkText ?? '').trim();
        if (reason.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Reason required', detail: 'Please add a remark explaining what needs to change before returning.' });
            return;
        }
        this.submitting = true;
        this.leaveAppService.returnApplication(this.application.leaveApplicationId, this.currentUserEmployeeId, reason).subscribe({
            next: (res) => this.handleResult(res, 'Returned'),
            error: (err) => this.handleError(err)
        });
    }

    /** Returns to the previous page in browser history (e.g. the list or pending-approval the user came from). */
    back(): void {
        this.location.back();
    }

    /** Streams the file from the backend and opens it in a new browser tab for preview. */
    previewAttachment(fileId: number): void {
        this.empService.downloadFile(fileId).subscribe({
            next: (blob: Blob) => {
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank', 'noopener,noreferrer');
                // Revoke after a delay so the new tab has time to load it.
                setTimeout(() => URL.revokeObjectURL(url), 30_000);
            },
            error: (err: any) =>
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to open file.' })
        });
    }

    private handleResult(res: any, label: string): void {
        this.submitting = false;
        const code = res?.statusCode ?? res?.StatusCode ?? 0;
        const msg = res?.description ?? res?.Description ?? '';
        if (code === 200) {
            this.messageService.add({ severity: 'success', summary: label, detail: 'Action completed.' });
            setTimeout(() => this.back(), 600);
        } else {
            this.messageService.add({ severity: 'warn', summary: 'Notice', detail: msg || 'Action failed.' });
        }
    }

    private handleError(err: any): void {
        this.submitting = false;
        const detail = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Request failed.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail });
    }
}
