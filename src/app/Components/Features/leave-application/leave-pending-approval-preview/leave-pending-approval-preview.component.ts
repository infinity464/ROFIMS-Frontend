import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { take } from 'rxjs';
import { SharedService } from '@/shared/services/shared-service';
import { LeaveApplicationService, LeaveApplicationModel, LeaveApplicationDetailModel } from '@/services/leave-application.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { UserMenuService } from '@/services/user-menu.service';
import { EmpService } from '@/services/emp-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { ServingMembersService } from '@/services/serving-members.service';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';

interface EmpInfo {
    nameEN: string;
    nameBN: string;
    rabId: string;
    serviceId: string;
    prefixRaw: string;
    rankId: number | null;
    appointmentId: number | null;
    rankEN: string;
    rankBN: string;
    officeEN: string;
    officeBN: string;
    appointmentEN: string;
    appointmentBN: string;
    corpsEN: string;
    corpsBN: string;
    corpsId: number | null;
    decorationEN: string;
    decorationBN: string;
    decorationId: number | null;
    profQualEN: string;
    profQualBN: string;
    profQualId: number | null;
    rabUnitEN: string;
    rabUnitBN: string;
    rabUnitId: number | null;
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

const BN_NUMBER_WORDS: Record<number, string> = {
    1: 'এক', 2: 'দুই', 3: 'তিন', 4: 'চার', 5: 'পাঁচ', 6: 'ছয়', 7: 'সাত',
    8: 'আট', 9: 'নয়', 10: 'দশ', 11: 'এগারো', 12: 'বারো', 13: 'তেরো',
    14: 'চৌদ্দ', 15: 'পনেরো', 16: 'ষোলো', 17: 'সতেরো', 18: 'আঠারো',
    19: 'উনিশ', 20: 'বিশ', 21: 'একুশ', 22: 'বাইশ', 23: 'তেইশ', 24: 'চব্বিশ',
    25: 'পঁচিশ', 26: 'ছাব্বিশ', 27: 'সাতাশ', 28: 'আঠাশ', 29: 'ঊনত্রিশ', 30: 'ত্রিশ'
};

const EN_NUMBER_WORDS: Record<number, string> = {
    1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven',
    8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Eleven', 12: 'Twelve', 13: 'Thirteen',
    14: 'Fourteen', 15: 'Fifteen', 16: 'Sixteen', 17: 'Seventeen', 18: 'Eighteen',
    19: 'Nineteen', 20: 'Twenty', 21: 'Twenty-One', 22: 'Twenty-Two', 23: 'Twenty-Three',
    24: 'Twenty-Four', 25: 'Twenty-Five', 26: 'Twenty-Six', 27: 'Twenty-Seven',
    28: 'Twenty-Eight', 29: 'Twenty-Nine', 30: 'Thirty'
};

/**
 * Standalone preview page for a single leave application — opened from the Pending Approval list
 * via /leave-application/preview?id=X. Renders the application as a "ছুটির আবেদন / Leave Application"
 * letter using the same A4 paper layout as the leave-card, with Bangla/English language toggle and
 * Print/PDF/Word export. Below the paper, recommenders/approver can Accept, Reject, or Return
 * inline; on success we navigate back to the list.
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

    lang: 'bn' | 'en' = 'bn';

    empMap: Record<number, EmpInfo> = {};
    leaveTypeNameMap: Record<number, string> = {};
    leaveTypeNameBNMap: Record<number, string> = {};
    rankENMap: Record<number, string> = {};
    rankBNMap: Record<number, string> = {};
    officeENMap: Record<number, string> = {};
    officeBNMap: Record<number, string> = {};
    prefixENMap: Record<number, string> = {};
    prefixBNMap: Record<number, string> = {};
    appointmentENMap: Record<number, string> = {};
    appointmentBNMap: Record<number, string> = {};
    decorationENMap: Record<number, string> = {};
    decorationBNMap: Record<number, string> = {};
    profQualENMap: Record<number, string> = {};
    profQualBNMap: Record<number, string> = {};
    rabUnitENMap: Record<number, string> = {};
    rabUnitBNMap: Record<number, string> = {};
    corpsENMap: Record<number, string> = {};
    corpsBNMap: Record<number, string> = {};

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private location: Location,
        private sharedService: SharedService,
        private leaveAppService: LeaveApplicationService,
        private identityMappingService: IdentityUserMappingService,
        private masterBasicSetup: MasterBasicSetupService,
        private servingMembersService: ServingMembersService,
        private messageService: MessageService,
        private _userMenuService: UserMenuService,
        private empService: EmpService
    ) {}

    ngOnInit(): void {
        // Auth on the actual Approve/Decline/Return calls is enforced server-side, so we don't
        // gate the buttons with a menu-route permission lookup (this preview route isn't in the
        // user menu and would resolve as no-permission, hiding the buttons even for legitimate
        // recommenders).
        this.canUpdate = true;
        this.loadLeaveTypes();
        this.loadRanks();
        this.loadOffices();
        this.loadPrefixes();
        this.loadAppointments();
        this.loadCommonCodeMap('Decoration', this.decorationENMap, this.decorationBNMap);
        this.loadCommonCodeMap('ProfessionalQualification', this.profQualENMap, this.profQualBNMap);
        this.loadCommonCodeMap('RabUnit', this.rabUnitENMap, this.rabUnitBNMap);
        this.loadCommonCodeMap('Corps', this.corpsENMap, this.corpsBNMap);

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

    toggleLang(): void {
        this.lang = this.lang === 'bn' ? 'en' : 'bn';
    }

    toBn(str: string): string {
        return str.replace(/[0-9]/g, (d) => BN_DIGITS[parseInt(d, 10)]);
    }

    private load(id: number): void {
        this.loading = true;
        this.leaveAppService.getById(id).subscribe({
            next: (full) => {
                this.loading = false;
                if (!full) { this.notFound = true; return; }
                this.application = full;
                this.remarkText = full.remarks ?? full.remark ?? '';

                // Hydrate employee info for everyone we'll render.
                const empIds = new Set<number>();
                if (full.applicantEmployeeId) empIds.add(full.applicantEmployeeId);
                if (full.relieverEmployeeId) empIds.add(full.relieverEmployeeId);
                if (full.finalApproverId) empIds.add(full.finalApproverId);
                (full.recommenders ?? []).forEach((r) => { if (r.employeeId) empIds.add(r.employeeId); });
                empIds.forEach((empId) => this.loadEmployeeInfo(empId));
            },
            error: () => {
                this.loading = false;
                this.notFound = true;
            }
        });
    }

    /**
     * Loads basic-info, search-info display labels, and personal-service-overview (Corps /
     * Decoration / ProfessionalQualification / RAB Unit display strings) for one employee.
     */
    private loadEmployeeInfo(empId: number): void {
        this.empService.getEmployeeById(empId).subscribe({
            next: (emp: any) => {
                if (!emp) return;
                const rankId = emp.Rank ?? emp.rank ?? emp.RankId ?? emp.rankId ?? null;
                const officeId = emp.LastMotherUnit ?? emp.lastMotherUnit ?? null;
                const appointmentRaw = emp.Appointment ?? emp.appointment ?? null;
                const appointmentId = typeof appointmentRaw === 'number' ? appointmentRaw : (appointmentRaw ? Number(appointmentRaw) : null);
                this.empMap[empId] = {
                    nameEN: emp.FullNameEN ?? emp.fullNameEN ?? String(empId),
                    nameBN: emp.FullNameBN ?? emp.fullNameBN ?? emp.FullNameEN ?? emp.fullNameEN ?? String(empId),
                    rabId: String(emp.RABID ?? emp.rabid ?? emp.rabId ?? ''),
                    serviceId: String(emp.ServiceId ?? emp.serviceId ?? ''),
                    prefixRaw: String(emp.Prefix ?? emp.prefix ?? ''),
                    rankId: typeof rankId === 'number' ? rankId : null,
                    appointmentId: (appointmentId != null && !isNaN(appointmentId) && appointmentId > 0) ? appointmentId : null,
                    rankEN: '', rankBN: '',
                    officeEN: '', officeBN: '',
                    appointmentEN: '', appointmentBN: '',
                    corpsEN: '', corpsBN: '', corpsId: null,
                    decorationEN: '', decorationBN: '', decorationId: null,
                    profQualEN: '', profQualBN: '', profQualId: null,
                    rabUnitEN: '', rabUnitBN: '', rabUnitId: null
                };
                this.empService.getEmployeeSearchInfo(empId).subscribe({
                    next: (info: any) => {
                        if (!info || !this.empMap[empId]) return;
                        const rEN = String(info.rank ?? info.Rank ?? '');
                        const oEN = String(info.motherOrganization ?? info.MotherOrganization ?? '');
                        const rId = info.rankId ?? info.RankId ?? this.empMap[empId].rankId;
                        const oId = info.lastMotherUnitId ?? info.LastMotherUnitId ?? officeId;
                        const aId = info.appointmentId ?? info.AppointmentId ?? this.empMap[empId].appointmentId;
                        const aEN = String(info.appointment ?? info.Appointment ?? '');
                        const aBN = String(info.appointmentBN ?? info.AppointmentBN ?? '');
                        this.empMap[empId] = {
                            ...this.empMap[empId],
                            rankEN: rEN,
                            rankBN: (rId != null ? this.rankBNMap[rId] : '') || rEN,
                            officeEN: oEN,
                            officeBN: (oId != null ? this.officeBNMap[oId] : '') || oEN,
                            appointmentId: aId ?? this.empMap[empId].appointmentId,
                            appointmentEN: aEN || (aId != null ? this.appointmentENMap[aId] : '') || '',
                            appointmentBN: aBN || (aId != null ? this.appointmentBNMap[aId] : '') || ''
                        };
                    }
                });
                this.servingMembersService.getEmployeePersonalServiceOverview(empId).subscribe({
                    next: (overview: any) => {
                        if (!overview || !this.empMap[empId]) return;
                        const corpsEN = String(overview.corps ?? overview.Corps ?? '');
                        const corpsBN = String(overview.corpsBN ?? overview.CorpsBN ?? '');
                        const corpsId = this.toIntOrNull(overview.corpsId ?? overview.CorpsId);
                        const decoEN = String(overview.gallantryAwardsDecoration ?? overview.GallantryAwardsDecoration ?? '');
                        const decoBN = String(overview.gallantryAwardsDecorationBN ?? overview.GallantryAwardsDecorationBN ?? '');
                        const decoId = this.toIntOrNull(overview.gallantryAwardsDecorationId ?? overview.GallantryAwardsDecorationId);
                        const profEN = String(overview.professionalQualification ?? overview.ProfessionalQualification ?? '');
                        const profBN = String(overview.professionalQualificationBN ?? overview.ProfessionalQualificationBN ?? '');
                        const profId = this.toIntOrNull(overview.professionalQualificationId ?? overview.ProfessionalQualificationId);
                        const rabUnitEN = String(overview.rabUnit ?? overview.RABUnit ?? '');
                        const rabUnitBN = String(overview.rabUnitBN ?? overview.RABUnitBN ?? '');
                        const rabUnitId = this.toIntOrNull(overview.rabUnitId ?? overview.RABUnitId);
                        this.empMap[empId] = {
                            ...this.empMap[empId],
                            corpsEN, corpsBN: corpsBN || corpsEN, corpsId,
                            decorationEN: decoEN, decorationBN: decoBN || decoEN, decorationId: decoId,
                            profQualEN: profEN, profQualBN: profBN || profEN, profQualId: profId,
                            rabUnitEN, rabUnitBN: rabUnitBN || rabUnitEN, rabUnitId
                        };
                    }
                });
            }
        });
    }

    private loadLeaveTypes(): void {
        this.masterBasicSetup.getAllByType('LeaveType').subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                arr.forEach((c: any) => {
                    const id = c.codeId ?? c.CodeId;
                    if (id != null) {
                        this.leaveTypeNameMap[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
                        this.leaveTypeNameBNMap[id] = c.codeValueBN ?? c.CodeValueBN ?? c.codeValueEN ?? c.CodeValueEN ?? String(id);
                    }
                });
            }
        });
    }

    private loadRanks(): void {
        this.masterBasicSetup.getAllByType('MotherOrgRank').subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                arr.forEach((c: any) => {
                    const id = c.codeId ?? c.CodeId;
                    if (id != null) {
                        this.rankENMap[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
                        this.rankBNMap[id] = c.codeValueBN ?? c.CodeValueBN ?? '';
                    }
                });
            }
        });
    }

    private loadOffices(): void {
        this.masterBasicSetup.getAllByType('MotherOrganization').subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                arr.forEach((c: any) => {
                    const id = c.codeId ?? c.CodeId;
                    if (id != null) {
                        this.officeENMap[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
                        this.officeBNMap[id] = c.codeValueBN ?? c.CodeValueBN ?? '';
                    }
                });
            }
        });
    }

    private loadAppointments(): void {
        this.masterBasicSetup.getAllByType('AppointmentCategory').subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                arr.forEach((c: any) => {
                    const id = c.codeId ?? c.CodeId;
                    if (id != null) {
                        this.appointmentENMap[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
                        this.appointmentBNMap[id] = c.codeValueBN ?? c.CodeValueBN ?? c.codeValueEN ?? c.CodeValueEN ?? String(id);
                    }
                });
            }
        });
    }

    private loadCommonCodeMap(codeType: string, enMap: Record<number, string>, bnMap: Record<number, string>): void {
        this.masterBasicSetup.getAllByType(codeType).subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                arr.forEach((c: any) => {
                    const id = c.codeId ?? c.CodeId;
                    if (id != null) {
                        const en = c.codeValueEN ?? c.CodeValueEN ?? String(id);
                        const bn = c.codeValueBN ?? c.CodeValueBN ?? '';
                        enMap[id] = String(en);
                        bnMap[id] = String(bn || en);
                    }
                });
            }
        });
    }

    private loadPrefixes(): void {
        this.masterBasicSetup.getAllByType('Prefix').subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                arr.forEach((c: any) => {
                    const id = c.codeId ?? c.CodeId;
                    if (id != null) {
                        this.prefixENMap[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
                        this.prefixBNMap[id] = c.codeValueBN ?? c.CodeValueBN ?? c.codeValueEN ?? c.CodeValueEN ?? String(id);
                    }
                });
            }
        });
    }

    private toIntOrNull(v: any): number | null {
        if (v == null || v === '') return null;
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    /** Walks: overview-BN → CommonCode-master-BN → overview-EN → CommonCode-master-EN. */
    private resolveLabel(bn: string, en: string, id: number | null, enMap: Record<number, string>, bnMap: Record<number, string>): string {
        if (this.lang === 'bn') {
            return bn || (id != null ? bnMap[id] : '') || en || (id != null ? enMap[id] : '') || '';
        }
        return en || (id != null ? enMap[id] : '') || bn || (id != null ? bnMap[id] : '') || '';
    }

    getRelieverId(): number | null {
        return this.application?.relieverEmployeeId ?? null;
    }

    getReliever(): EmpInfo | null {
        const id = this.getRelieverId();
        return id != null ? this.empMap[id] ?? null : null;
    }

    getEmp(empId: number | null | undefined): EmpInfo | null {
        if (empId == null) return null;
        return this.empMap[empId] ?? null;
    }

    getName(empId: number | null | undefined): string {
        const emp = this.getEmp(empId);
        if (!emp) return '';
        return this.lang === 'bn' ? emp.nameBN : emp.nameEN;
    }

    getPrefix(empId: number | null | undefined): string {
        const raw = this.getEmp(empId)?.prefixRaw || '';
        if (!raw) return '';
        const numId = Number(raw);
        if (!isNaN(numId) && numId > 0) {
            const map = this.lang === 'bn' ? this.prefixBNMap : this.prefixENMap;
            return map[numId] || this.prefixENMap[numId] || raw;
        }
        return raw;
    }

    getServiceId(empId: number | null | undefined): string {
        const val = this.getEmp(empId)?.serviceId || '';
        if (!val) return '';
        return this.lang === 'bn' ? this.toBn(val) : val;
    }

    getRank(empId: number | null | undefined): string {
        const emp = this.getEmp(empId);
        if (!emp) return '';
        if (this.lang === 'bn') {
            if (emp.rankId != null && this.rankBNMap[emp.rankId]) return this.rankBNMap[emp.rankId];
            return emp.rankBN || emp.rankEN;
        }
        return emp.rankEN;
    }

    getOffice(empId: number | null | undefined): string {
        const emp = this.getEmp(empId);
        if (!emp) return '';
        return this.lang === 'bn' ? (emp.officeBN || emp.officeEN) : emp.officeEN;
    }

    getAppointment(empId: number | null | undefined): string {
        const emp = this.getEmp(empId);
        if (!emp) return '';
        if (this.lang === 'bn') {
            if (emp.appointmentId != null && this.appointmentBNMap[emp.appointmentId]) return this.appointmentBNMap[emp.appointmentId];
            return emp.appointmentBN || emp.appointmentEN;
        }
        if (emp.appointmentId != null && this.appointmentENMap[emp.appointmentId]) return this.appointmentENMap[emp.appointmentId];
        return emp.appointmentEN;
    }

    getCorps(empId: number | null | undefined): string {
        const emp = this.getEmp(empId);
        if (!emp) return '';
        return this.resolveLabel(emp.corpsBN, emp.corpsEN, emp.corpsId, this.corpsENMap, this.corpsBNMap);
    }

    getDecoration(empId: number | null | undefined): string {
        const emp = this.getEmp(empId);
        if (!emp) return '';
        return this.resolveLabel(emp.decorationBN, emp.decorationEN, emp.decorationId, this.decorationENMap, this.decorationBNMap);
    }

    getProfessionalQualification(empId: number | null | undefined): string {
        const emp = this.getEmp(empId);
        if (!emp) return '';
        return this.resolveLabel(emp.profQualBN, emp.profQualEN, emp.profQualId, this.profQualENMap, this.profQualBNMap);
    }

    getRabUnit(empId: number | null | undefined): string {
        const emp = this.getEmp(empId);
        if (!emp) return '';
        return this.resolveLabel(emp.rabUnitBN, emp.rabUnitEN, emp.rabUnitId, this.rabUnitENMap, this.rabUnitBNMap);
    }

    /** Comma-joined descriptors after the rank+name: Decoration, ProfQual, Corps, Appointment, RAB Unit. */
    getDescriptors(empId: number | null | undefined): string {
        return [
            this.getDecoration(empId),
            this.getProfessionalQualification(empId),
            this.getCorps(empId),
            this.getAppointment(empId),
            this.getRabUnit(empId)
        ].map(s => (s ?? '').trim()).filter(s => s.length > 0).join(', ');
    }

    getLeaveType(leaveTypeId: number | null | undefined): string {
        if (leaveTypeId == null) return '';
        if (this.lang === 'bn') return this.leaveTypeNameBNMap[leaveTypeId] ?? String(leaveTypeId);
        return this.leaveTypeNameMap[leaveTypeId] ?? String(leaveTypeId);
    }

    /** All leave detail rows — falls back to a single-row summary if leaveDetails is empty. */
    getLeaveDetails(): LeaveApplicationDetailModel[] {
        if (!this.application) return [];
        const list = this.application.leaveDetails ?? [];
        if (list.length > 0) {
            return [...list].sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0));
        }
        if (this.application.leaveTypeId && this.application.fromDate && this.application.toDate) {
            return [{
                leaveTypeId: this.application.leaveTypeId,
                fromDate: this.application.fromDate,
                toDate: this.application.toDate
            } as LeaveApplicationDetailModel];
        }
        return [];
    }

    getDetailDays(det: LeaveApplicationDetailModel): number {
        if (det?.days != null && det.days > 0) return det.days;
        try {
            const f = new Date(det.fromDate);
            const t = new Date(det.toDate);
            if (isNaN(f.getTime()) || isNaN(t.getTime())) return 0;
            return Math.floor((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        } catch { return 0; }
    }

    getTotalDaysNumeric(): number {
        return this.getLeaveDetails().reduce((sum, d) => sum + this.getDetailDays(d), 0);
    }

    getTotalDays(): string {
        const n = this.getTotalDaysNumeric();
        const str = String(n).padStart(2, '0');
        return this.lang === 'bn' ? this.toBn(str) : str;
    }

    getTotalDaysWord(): string {
        const n = this.getTotalDaysNumeric();
        if (this.lang === 'bn') return BN_NUMBER_WORDS[n] ?? this.toBn(String(n));
        return EN_NUMBER_WORDS[n] ?? String(n);
    }

    formatDays(n: number): string {
        const numStr = String(n).padStart(2, '0');
        if (this.lang === 'bn') return `${this.toBn(numStr)} দিন`;
        return `${numStr} Days`;
    }

    formatDate(d: string | null | undefined): string {
        if (!d) return '';
        try {
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return d;
            const str = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
            return this.lang === 'bn' ? this.toBn(str) : str;
        } catch { return d; }
    }

    formatTableDate(d: string | null | undefined): string {
        if (!d) return '';
        try {
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return d;
            const str = `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`;
            return this.lang === 'bn' ? this.toBn(str) : str;
        } catch { return d; }
    }

    /** Recommender chain sorted by SequenceNo for display in the Approval Flow section. */
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

    getRecommenderStatusLabel(status: number | null | undefined): string {
        switch (status) {
            case 2: return 'Recommended';
            case 3: return 'Declined';
            default: return 'Pending';
        }
    }

    getRecommenderStatusClass(status: number | null | undefined): string {
        switch (status) {
            case 2: return 'is-approved';
            case 3: return 'is-declined';
            default: return 'is-pending';
        }
    }

    /**
     * Final-approver status, derived from the application's overall status + recommender chain.
     * See leave-card / pending-list for the full state-machine mapping.
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

    /** True when the application is still actionable (Pending Approval, status=2). */
    get isActionable(): boolean {
        return this.application?.leaveApplicationStatusId === 2;
    }

    /** True when the current user is the next pending recommender in the chain. */
    get isCurrentUserRecommender(): boolean {
        if (!this.application || this.currentUserEmployeeId <= 0) return false;
        const pending = (this.application.recommenders ?? [])
            .filter((r) => r.status === 1)
            .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0));
        const next = pending[0];
        return !!next && next.employeeId === this.currentUserEmployeeId;
    }

    get acceptLabel(): string {
        return this.isCurrentUserRecommender ? 'Recommend' : 'Approve';
    }

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

    back(): void {
        this.location.back();
    }

    /** Streams the file from the backend and opens it in a new browser tab. */
    previewAttachment(fileId: number): void {
        this.empService.downloadFile(fileId).subscribe({
            next: (blob: Blob) => {
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank', 'noopener,noreferrer');
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
