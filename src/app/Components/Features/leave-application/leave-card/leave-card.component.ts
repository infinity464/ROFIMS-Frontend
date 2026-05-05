import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { UserMenuService } from '@/services/user-menu.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '@/Core/Environments/environment';
import { LeaveApplicationService, LeaveApplicationModel, LeaveApplicationDetailModel } from '@/services/leave-application.service';
import { EmpService } from '@/services/emp-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType, TableBorders } from 'docx';
import { saveAs } from 'file-saver';

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

const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

@Component({
    selector: 'app-leave-card',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './leave-card.component.html',
    styleUrls: ['./leave-card.component.scss', '../../employee-reports/report-theme-common.scss']
})
export class LeaveCardComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    row: LeaveApplicationModel | null = null;
    loading = true;
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
    exportDropdownOpen = false;
    exporting = false;

    private api = `${environment.apis.core}/EmployeeInfo`;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private http: HttpClient,
        private leaveAppService: LeaveApplicationService,
        private empService: EmpService,
        private masterBasicSetup: MasterBasicSetupService,
        private _userMenuService: UserMenuService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this.router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadLeaveTypes();
        this.loadRanks();
        this.loadOffices();
        this.loadPrefixes();
        this.loadAppointments();
        this.route.queryParams.subscribe((params) => {
            const id = Number(params['id']);
            if (id > 0) {
                this.loadApplication(id);
            } else {
                this.loading = false;
            }
        });
    }

    @HostListener('document:click')
    onDocumentClick(): void {
        this.exportDropdownOpen = false;
    }

    toggleLang(): void {
        this.lang = this.lang === 'bn' ? 'en' : 'bn';
    }

    /** Convert English digits to Bangla digits */
    toBn(str: string): string {
        return str.replace(/[0-9]/g, (d) => BN_DIGITS[parseInt(d, 10)]);
    }

    private loadApplication(id: number): void {
        this.leaveAppService.getById(id).subscribe({
            next: (d) => {
                this.row = d;
                this.loading = false;
                if (d) {
                    const empIds = new Set<number>();
                    if (d.applicantEmployeeId) empIds.add(d.applicantEmployeeId);
                    const approverId = d.approvedByEmployeeId ?? d.finalApproverId ?? d.appliedByEmployeeId;
                    if (approverId) empIds.add(approverId);
                    if (d.relieverEmployeeId) empIds.add(d.relieverEmployeeId);
                    empIds.forEach((empId) => this.loadEmployeeInfo(empId));
                }
            },
            error: () => {
                this.loading = false;
            }
        });
    }

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
                    rankEN: '',
                    rankBN: '',
                    officeEN: '',
                    officeBN: '',
                    appointmentEN: '',
                    appointmentBN: ''
                };
                // Load display names from search info view
                this.empService.getEmployeeSearchInfo(empId).subscribe({
                    next: (info: any) => {
                        if (!info || !this.empMap[empId]) return;
                        const rEN = String(info.rank ?? info.Rank ?? '');
                        const oEN = String(info.motherOrganization ?? info.MotherOrganization ?? '');
                        // Try to get BN from code maps using the rank/office IDs
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

    getApproverId(): number | null {
        if (!this.row) return null;
        return this.row.approvedByEmployeeId ?? this.row.finalApproverId ?? this.row.appliedByEmployeeId ?? null;
    }

    /**
     * Display the certificate number from the backend, converting digits to Bangla in `bn` mode.
     * Falls back to the "(Auto Generated)" placeholder when the application is not yet approved
     * (or when no LeaveCardNumberConfig has been set up by the admin).
     */
    getCertificateNoDisplay(): string {
        const v = this.row?.leaveCertificateNo;
        if (!v) return this.lang === 'bn' ? '(স্বয়ংক্রিয়ভাবে তৈরি)' : '(Auto Generated)';
        return this.lang === 'bn' ? this.toBn(v) : v;
    }

    getRelieverId(): number | null {
        return this.row?.relieverEmployeeId ?? null;
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

    getRabId(empId: number | null | undefined): string {
        const val = this.getEmp(empId)?.rabId || '';
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

    /** Unit name on the header — uses approver's office (where the certificate is issued from). */
    getUnitName(): string {
        return this.getOffice(this.getApproverId());
    }

    /** Unit address on the header — not currently captured anywhere; left blank for the operator to fill in print. */
    getUnitAddress(): string {
        return '';
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    closeExportDropdown = () => {
        this.exportDropdownOpen = false;
    };

    getLeaveType(leaveTypeId: number | null | undefined): string {
        if (leaveTypeId == null) return '';
        if (this.lang === 'bn') return this.leaveTypeNameBNMap[leaveTypeId] ?? String(leaveTypeId);
        return this.leaveTypeNameMap[leaveTypeId] ?? String(leaveTypeId);
    }

    /** All leave detail rows. Falls back to a single-row summary if leaveDetails is empty. */
    getLeaveDetails(): LeaveApplicationDetailModel[] {
        if (!this.row) return [];
        const list = this.row.leaveDetails ?? [];
        if (list.length > 0) {
            return [...list].sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0));
        }
        if (this.row.leaveTypeId && this.row.fromDate && this.row.toDate) {
            return [{
                leaveTypeId: this.row.leaveTypeId,
                fromDate: this.row.fromDate,
                toDate: this.row.toDate
            } as LeaveApplicationDetailModel];
        }
        return [];
    }

    /** Days for a single detail row (falls back to from/to-date diff if `days` is missing). */
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

    /** Total days as a digit string in the active language (e.g. "১৪" / "14"). */
    getTotalDays(): string {
        const n = this.getTotalDaysNumeric();
        const str = String(n).padStart(2, '0');
        return this.lang === 'bn' ? this.toBn(str) : str;
    }

    /** Total days spelled out (e.g. "চৌদ্দ" / "Fourteen"). Falls back to digit string for >30. */
    getTotalDaysWord(): string {
        const n = this.getTotalDaysNumeric();
        if (this.lang === 'bn') return BN_NUMBER_WORDS[n] ?? this.toBn(String(n));
        return EN_NUMBER_WORDS[n] ?? String(n);
    }

    /** "05 দিন" / "05 Days" formatting for table cells */
    formatDays(n: number): string {
        const numStr = String(n).padStart(2, '0');
        if (this.lang === 'bn') return `${this.toBn(numStr)} দিন`;
        return `${numStr} Days`;
    }

    /** dd/MM/yyyy in active language (e.g. ৩০/০৪/২০২৬) — used for date in number/date row */
    formatDate(d: string | null | undefined): string {
        if (!d) return '';
        try {
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return d;
            const str = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
            return this.lang === 'bn' ? this.toBn(str) : str;
        } catch {
            return d;
        }
    }

    /** dd-MM-yyyy in active language — used inside the leave detail table */
    formatTableDate(d: string | null | undefined): string {
        if (!d) return '';
        try {
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return d;
            const str = `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`;
            return this.lang === 'bn' ? this.toBn(str) : str;
        } catch {
            return d;
        }
    }

    /** "৩০ এপ্রিল ২০২৬" / "30 April 2026" — used in signature footer */
    formatLongDate(d: string | null | undefined): string {
        if (!d) return '';
        try {
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return d;
            const day = String(dt.getDate()).padStart(2, '0');
            const month = this.lang === 'bn' ? BN_MONTHS[dt.getMonth()] : EN_MONTHS[dt.getMonth()];
            const year = String(dt.getFullYear());
            return this.lang === 'bn' ? `${this.toBn(day)} ${month} ${this.toBn(year)}` : `${day} ${month} ${year}`;
        } catch {
            return d;
        }
    }

    private getPrintStyles(): string {
        return `
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: 'SolaimanLipi','Noto Sans Bengali','Times New Roman',serif; margin: 0; padding: 0; color: #000; line-height: 1.6; font-size: 11pt; }
  .lc-paper { width: 100%; padding: 0; box-sizing: border-box; }
  .lc-org-header { text-align: center; margin-bottom: 14px; }
  .lc-org-line { font-weight: 600; font-size: 12pt; line-height: 1.5; }
  .lc-org-line--underline { display: inline-block; padding: 0 30px; border-bottom: 1px solid #000; }
  .lc-org-line__hint { display: inline-block; margin-left: 6px; font-weight: 400; }
  .lc-title { text-align: center; margin-bottom: 16px; }
  .lc-title__text { font-weight: 700; font-size: 13pt; border-bottom: 1px solid #000; padding-bottom: 1px; }
  .lc-meta-row { display: flex; justify-content: space-between; margin-bottom: 14px; font-weight: 600; }
  .lc-body-text { margin: 10px 0; line-height: 1.9; text-align: justify; }
  .lc-table-wrap { margin: 10px 40px; }
  .lc-table { width: 100%; border-collapse: collapse; }
  .lc-table th, .lc-table td { border: 1px solid #000; padding: 4px 8px; text-align: center; vertical-align: middle; font-size: 11pt; }
  .lc-table th { font-weight: 700; background: #fff; }
  .lc-table__total td { font-weight: 700; }
  .lc-address-block { margin: 18px 0 0; }
  .lc-address-label { font-weight: 600; text-decoration: underline; margin-bottom: 4px; }
  .lc-address-text { white-space: pre-line; }
  .lc-footer { display: flex; justify-content: flex-end; margin-top: 28px; }
  .lc-footer__signature { text-align: left; min-width: 240px; }
  .lc-footer__sysnote { font-style: italic; margin-bottom: 4px; }
  .lc-footer__name { font-weight: 700; }
  .lc-footer__rank, .lc-footer__appointment { }
  .lc-footer__date { margin-top: 4px; }`;
    }

    async exportAs(type: 'print' | 'pdf' | 'word'): Promise<void> {
        this.exportDropdownOpen = false;
        if (type !== 'print') this.exporting = true;
        await new Promise(resolve => setTimeout(resolve, 50));
        if (type === 'print') {
            this.printCard();
        } else if (type === 'pdf') {
            await this.exportPDF();
        } else if (type === 'word') {
            await this.exportWord();
        }
    }

    private printCard(): void {
        const el = document.getElementById('leave-card-print');
        if (!el) return;
        const title = this.lang === 'bn' ? 'ছুটির সনদপত্র/অফিস আদেশ' : 'Leave Certificate / Office Order';
        const w = window.open('', '_blank', 'width=800,height=600');
        if (!w) return;
        w.document.write(`<html><head><title>${title}</title><style>${this.getPrintStyles()}</style></head><body>${el.outerHTML}</body></html>`);
        w.document.close();
        w.onload = () => {
            w.focus();
            w.print();
        };
    }

    private async exportPDF(): Promise<void> {
        const el = document.getElementById('leave-card-print');
        if (!el) return;
        const origBorder = (el as HTMLElement).style.border;
        const origBoxShadow = (el as HTMLElement).style.boxShadow;
        (el as HTMLElement).style.border = 'none';
        (el as HTMLElement).style.boxShadow = 'none';
        try {
            const canvas = await html2canvas(el, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false
            });
            const pdf = new jsPDF('p', 'mm', 'a4');
            const marginMm = 10;
            const pdfWidth = pdf.internal.pageSize.getWidth() - marginMm * 2;
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', marginMm, marginMm, pdfWidth, imgHeight);
            const pdfBlob = pdf.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, '_blank');
        } finally {
            (el as HTMLElement).style.border = origBorder;
            (el as HTMLElement).style.boxShadow = origBoxShadow;
            this.exporting = false;
        }
    }

    private async exportWord(): Promise<void> {
        if (!this.row) return;
        try {
            const FONT = 'Nirmala UI';
            const appId = this.row.applicantEmployeeId;
            const approveId = this.getApproverId();
            const relieverId = this.getRelieverId();

            const isBn = this.lang === 'bn';

            const noBorders = {
                top: { style: BorderStyle.NONE, size: 0 },
                bottom: { style: BorderStyle.NONE, size: 0 },
                left: { style: BorderStyle.NONE, size: 0 },
                right: { style: BorderStyle.NONE, size: 0 },
            };

            const center = (text: string, opts: { bold?: boolean; size?: number; underline?: boolean } = {}) =>
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({
                        text,
                        bold: !!opts.bold,
                        underline: opts.underline ? {} : undefined,
                        size: opts.size ?? 22,
                        font: FONT
                    })]
                });

            const headerLines: Paragraph[] = isBn ? [
                center('গণপ্রজাতন্ত্রী বাংলাদেশ সরকার', { bold: true, size: 24 }),
                center('বাংলাদেশ পুলিশ', { bold: true, size: 24 }),
                center(`${this.getUnitName() || '...........................'}   (সংশ্লিষ্ট ইউনিটের নাম)`, { underline: true, size: 22 }),
                center(`${this.getUnitAddress() || '...........................'}   (সংশ্লিষ্ট ইউনিটের ঠিকানা)`, { underline: true, size: 22 }),
            ] : [
                center("Government of the People's Republic of Bangladesh", { bold: true, size: 24 }),
                center('Bangladesh Police', { bold: true, size: 24 }),
                center(`${this.getUnitName() || '...........................'}   (Concerned Unit Name)`, { underline: true, size: 22 }),
                center(`${this.getUnitAddress() || '...........................'}   (Concerned Unit Address)`, { underline: true, size: 22 }),
            ];

            const titleParagraph = new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 240, after: 200 },
                children: [new TextRun({
                    text: isBn ? 'ছুটির সনদপত্র/অফিস আদেশ' : 'Leave Certificate / Office Order',
                    bold: true,
                    underline: {},
                    size: 26,
                    font: FONT
                })]
            });

            const metaTable = new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: TableBorders.NONE,
                rows: [new TableRow({
                    children: [
                        new TableCell({
                            width: { size: 50, type: WidthType.PERCENTAGE },
                            borders: noBorders,
                            children: [new Paragraph({
                                children: [new TextRun({
                                    text: `${isBn ? 'ছুটির সনদপত্র নং-' : 'Leave Certificate No.-'}${this.getCertificateNoDisplay()}`,
                                    bold: true, size: 22, font: FONT
                                })]
                            })]
                        }),
                        new TableCell({
                            width: { size: 50, type: WidthType.PERCENTAGE },
                            borders: noBorders,
                            children: [new Paragraph({
                                alignment: AlignmentType.RIGHT,
                                children: [new TextRun({
                                    text: `${isBn ? 'তারিখঃ' : 'Date:'} ${this.formatDate(this.row.approvedDate)}`,
                                    bold: true, size: 22, font: FONT
                                })]
                            })]
                        }),
                    ]
                })]
            });

            const apptApp = this.getAppointment(appId);
            const introBn = `${this.getPrefix(appId)}-${this.getServiceId(appId)} ${this.getRank(appId)} ${this.getName(appId)}, ${apptApp ? apptApp + ', ' : ''}${this.getOffice(appId)}'কে নিম্নবর্নিত তারিখে মোট ${this.getTotalDays()} (${this.getTotalDaysWord()}) দিনের ছুটি ভোগের মঞ্জুরী প্রদান করা হয়েছেঃ`;
            const introEn = `${this.getPrefix(appId)}-${this.getServiceId(appId)} ${this.getRank(appId)} ${this.getName(appId)}, ${apptApp ? apptApp + ', ' : ''}${this.getOffice(appId)} has been granted a total of ${this.getTotalDays()} (${this.getTotalDaysWord()}) days of leave on the dates noted below:`;

            const introPara = new Paragraph({
                spacing: { before: 160, after: 160, line: 360 },
                alignment: AlignmentType.JUSTIFIED,
                children: [new TextRun({ text: isBn ? introBn : introEn, size: 22, font: FONT })]
            });

            const tableHeader = (text: string) => new TableCell({
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 6 },
                    bottom: { style: BorderStyle.SINGLE, size: 6 },
                    left: { style: BorderStyle.SINGLE, size: 6 },
                    right: { style: BorderStyle.SINGLE, size: 6 },
                },
                children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text, bold: true, size: 22, font: FONT })]
                })]
            });
            const tableCell = (text: string, bold = false) => new TableCell({
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 6 },
                    bottom: { style: BorderStyle.SINGLE, size: 6 },
                    left: { style: BorderStyle.SINGLE, size: 6 },
                    right: { style: BorderStyle.SINGLE, size: 6 },
                },
                children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text, bold, size: 22, font: FONT })]
                })]
            });

            const detailRows = this.getLeaveDetails().map(d => new TableRow({
                children: [
                    tableCell(this.getLeaveType(d.leaveTypeId)),
                    tableCell(this.formatTableDate(d.fromDate)),
                    tableCell(this.formatTableDate(d.toDate)),
                    tableCell(this.formatDays(this.getDetailDays(d))),
                ]
            }));

            const totalRow = new TableRow({
                children: [
                    new TableCell({
                        columnSpan: 3,
                        borders: {
                            top: { style: BorderStyle.SINGLE, size: 6 },
                            bottom: { style: BorderStyle.SINGLE, size: 6 },
                            left: { style: BorderStyle.SINGLE, size: 6 },
                            right: { style: BorderStyle.SINGLE, size: 6 },
                        },
                        children: [new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: isBn ? 'সর্বমোট' : 'Total', bold: true, size: 22, font: FONT })]
                        })]
                    }),
                    tableCell(this.formatDays(this.getTotalDaysNumeric()), true),
                ]
            });

            const detailTable = new Table({
                width: { size: 80, type: WidthType.PERCENTAGE },
                alignment: AlignmentType.CENTER,
                rows: [
                    new TableRow({
                        tableHeader: true,
                        children: [
                            tableHeader(isBn ? 'ছুটির ধরন' : 'Leave Type'),
                            tableHeader(isBn ? 'হইতে' : 'From'),
                            tableHeader(isBn ? 'পর্যন্ত' : 'To'),
                            tableHeader(isBn ? 'দিন' : 'Days'),
                        ]
                    }),
                    ...detailRows,
                    totalRow
                ]
            });

            const children: (Paragraph | Table)[] = [
                ...headerLines,
                titleParagraph,
                metaTable,
                introPara,
                detailTable
            ];

            if (relieverId && this.empMap[relieverId]) {
                const apptR = this.getAppointment(relieverId);
                const relieverBn = `উক্ত অফিসার ছুটিতে থাকাকালীন ${this.getPrefix(relieverId)}-${this.getServiceId(relieverId)} ${this.getRank(relieverId)} ${this.getName(relieverId)}, ${apptR ? apptR + ', ' : ''}${this.getOffice(relieverId)} নিজ দায়িত্ব ছাড়াও ভারপ্রাপ্ত অধিনায়কের দায়িত্ব পালন করবেন। ছুটি শেষে উক্ত অফিসার প্রত্যাবর্তনের পর উভয়েই স্ব স্ব দায়িত্বে বহাল থাকছেন।`;
                const relieverEn = `While the above officer is on leave, ${this.getPrefix(relieverId)}-${this.getServiceId(relieverId)} ${this.getRank(relieverId)} ${this.getName(relieverId)}, ${apptR ? apptR + ', ' : ''}${this.getOffice(relieverId)} will perform the duties of acting commander in addition to their own duties. After the leave, both officers will resume their respective duties.`;
                children.push(new Paragraph({
                    spacing: { before: 200, after: 160, line: 360 },
                    alignment: AlignmentType.JUSTIFIED,
                    children: [new TextRun({ text: isBn ? relieverBn : relieverEn, size: 22, font: FONT })]
                }));
            }

            if (this.row.addressDuringLeave) {
                children.push(
                    new Paragraph({
                        spacing: { before: 160, after: 60 },
                        children: [new TextRun({
                            text: isBn ? 'ছুটি থাকাকালীন ঠিকানাঃ' : 'Address during leave:',
                            bold: true, underline: {}, size: 22, font: FONT
                        })]
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: this.row.addressDuringLeave, size: 22, font: FONT })]
                    })
                );
            }

            const sysNote = isBn ? '(সিস্টেম জেনারেটেড লিভ কার্ড, স্বাক্ষর প্রয়োজন নেই)' : '(System Generated Leave Card, Signature not Required)';
            const dateLabel = isBn ? 'তারিখঃ' : 'Date:';

            const footerTable = new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: TableBorders.NONE,
                rows: [new TableRow({
                    children: [
                        new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorders, children: [new Paragraph({})] }),
                        new TableCell({
                            width: { size: 50, type: WidthType.PERCENTAGE },
                            borders: noBorders,
                            children: [
                                new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: sysNote, italics: true, size: 20, font: FONT })] }),
                                new Paragraph({ children: [new TextRun({ text: this.getName(approveId), bold: true, size: 22, font: FONT })] }),
                                new Paragraph({ children: [new TextRun({ text: this.getRank(approveId), size: 20, font: FONT })] }),
                                new Paragraph({ children: [new TextRun({ text: this.getAppointment(approveId), size: 20, font: FONT })] }),
                                new Paragraph({ children: [new TextRun({ text: `${dateLabel} ${this.formatLongDate(this.row.approvedDate)}`, size: 20, font: FONT })] }),
                            ]
                        }),
                    ]
                })]
            });

            children.push(footerTable);

            const doc = new Document({
                sections: [{
                    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
                    children
                }]
            });
            const blob = await Packer.toBlob(doc);
            const fileName = isBn ? 'ছুটির_সনদপত্র.docx' : 'Leave_Certificate.docx';
            saveAs(blob, fileName);
        } finally {
            this.exporting = false;
        }
    }

    goBack(): void {
        this.router.navigate(['/leave-application/list'], { queryParams: { section: 'approved' } });
    }
}
