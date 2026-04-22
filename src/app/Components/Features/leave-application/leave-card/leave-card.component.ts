import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '@/Core/Environments/environment';
import { LeaveApplicationService, LeaveApplicationModel } from '@/services/leave-application.service';
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

@Component({
    selector: 'app-leave-card',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './leave-card.component.html',
    styleUrls: ['./leave-card.component.scss', '../../employee-reports/report-theme-common.scss']
})
export class LeaveCardComponent implements OnInit {
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
        private masterBasicSetup: MasterBasicSetupService
    ) {}

    ngOnInit(): void {
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

    getEmp(empId: number | null | undefined): EmpInfo | null {
        if (empId == null) return null;
        return this.empMap[empId] ?? null;
    }

    getName(empId: number | null | undefined): string {
        const emp = this.getEmp(empId);
        if (!emp) return '-';
        return this.lang === 'bn' ? emp.nameBN : emp.nameEN;
    }

    getPrefix(empId: number | null | undefined): string {
        const raw = this.getEmp(empId)?.prefixRaw || '';
        if (!raw) return '-';
        // If raw is a numeric ID, resolve from code map
        const numId = Number(raw);
        if (!isNaN(numId) && numId > 0) {
            const map = this.lang === 'bn' ? this.prefixBNMap : this.prefixENMap;
            return map[numId] || this.prefixENMap[numId] || raw;
        }
        // Already a display string
        return raw;
    }

    getServiceId(empId: number | null | undefined): string {
        const val = this.getEmp(empId)?.serviceId || '-';
        return this.lang === 'bn' ? this.toBn(val) : val;
    }

    getRabId(empId: number | null | undefined): string {
        const val = this.getEmp(empId)?.rabId || '-';
        return this.lang === 'bn' ? this.toBn(val) : val;
    }

    getRank(empId: number | null | undefined): string {
        const emp = this.getEmp(empId);
        if (!emp) return '';
        if (this.lang === 'bn') {
            // Try BN from code map using rankId
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

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    closeExportDropdown = () => {
        this.exportDropdownOpen = false;
    };

    getLeaveType(leaveTypeId: number | null | undefined): string {
        if (leaveTypeId == null) return '-';
        if (this.lang === 'bn') return this.leaveTypeNameBNMap[leaveTypeId] ?? String(leaveTypeId);
        return this.leaveTypeNameMap[leaveTypeId] ?? String(leaveTypeId);
    }

    formatDate(d: string | null | undefined): string {
        if (!d) return '-';
        try {
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return d;
            const str = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
            return this.lang === 'bn' ? this.toBn(str) : str;
        } catch {
            return d;
        }
    }

    getTotalDays(): string {
        if (!this.row?.fromDate || !this.row?.toDate) return '-';
        try {
            const from = new Date(this.row.fromDate);
            const to = new Date(this.row.toDate);
            if (isNaN(from.getTime()) || isNaN(to.getTime())) return '-';
            const val = String(Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1);
            return this.lang === 'bn' ? this.toBn(val) : val;
        } catch {
            return '-';
        }
    }

    private getPrintStyles(): string {
        return `
  @page { size: A4; margin: 20mm; }
  body { font-family: 'SolaimanLipi','Noto Sans Bengali',sans-serif; margin: 0; padding: 0; color: #000; }
  .leave-card { border: none; padding: 50px 40px; width: 100%; min-height: calc(297mm - 40mm - 100px); box-sizing: border-box; }
  .leave-card-header { text-align: center; font-size: 22px; font-weight: 700; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px; }
  .leave-card-text { line-height: 1.9; text-align: justify; }
  .leave-card-address { margin-top: 16px; }
  .leave-card-address-label { font-weight: 600; text-decoration: underline; text-align: center; display: block; }
  .leave-card-address-text { margin: 4px 0 0; }
  .leave-card-footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px; gap: 16px; }
  .leave-card-footer-left { font-size: 14px; }
  .leave-card-footer-left p { margin: 2px 0; }
  .leave-card-footer-right { margin-right: 15%; }
  .leave-card-signature { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
  .leave-card-approver-name { font-weight: 600; }
  .leave-card-approver-rank { font-size: 13px; color: #555; }
  .leave-card-approver-appointment { font-size: 12px; color: #555; }
  .leave-card-approver-office { font-size: 12px; color: #555; }`;
    }

    async exportAs(type: 'print' | 'pdf' | 'word'): Promise<void> {
        this.exportDropdownOpen = false;
        if (type !== 'print') this.exporting = true;
        // Let Angular close dropdown and show "Generating..." before async work
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
        const title = this.lang === 'bn' ? 'ছুটির সনদপত্র' : 'Leave Certificate';
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
        // Temporarily remove border for clean PDF
        const origBorder = (el as HTMLElement).style.border;
        const origBorderRadius = (el as HTMLElement).style.borderRadius;
        (el as HTMLElement).style.border = 'none';
        (el as HTMLElement).style.borderRadius = '0';
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
            (el as HTMLElement).style.borderRadius = origBorderRadius;
            this.exporting = false;
        }
    }

    private async exportWord(): Promise<void> {
        if (!this.row) return;
        try {
            const title = this.lang === 'bn' ? 'ছুটির সনদপত্র' : 'Leave Certificate';
            const appId = this.row.applicantEmployeeId;
            const approveId = this.getApproverId();

            const bodyText = this.lang === 'bn'
                ? `প্রত্যয়ন করা যাচ্ছে নং ${this.getPrefix(appId)}-${this.getServiceId(appId)} পদবী/পেশাঃ ${this.getRank(appId)} নামঃ ${this.getName(appId)} তাহাকে আগামী ${this.formatDate(this.row.fromDate)} তারিখ হতে ${this.formatDate(this.row.toDate)} তারিখ পর্যন্ত মোট ${this.getTotalDays()} দিনের ${this.getLeaveType(this.row.leaveTypeId)} মঞ্জুর করা হলো।`
                : `It is certified that No. ${this.getPrefix(appId)}-${this.getServiceId(appId)}, Rank/Designation: ${this.getRank(appId)}, Name: ${this.getName(appId)}, has been granted ${this.getLeaveType(this.row.leaveTypeId)} leave for a total of ${this.getTotalDays()} day(s) from ${this.formatDate(this.row.fromDate)} to ${this.formatDate(this.row.toDate)}.`;

            const addressLabel = this.lang === 'bn' ? 'ছুটি থাকাকালীন তাহার ঠিকানা নিম্নরূপঃ' : 'Address during leave:';
            const placeText = this.lang === 'bn' ? 'স্থানঃ প্রশাসন ও অর্থ, র‌্যাব সদর দপ্তর' : 'Place: Administration & Finance, RAB HQ';
            const dateLabel = this.lang === 'bn' ? 'তারিখঃ' : 'Date:';
            const officeText = this.lang === 'bn' ? 'র‌্যাব সদর দপ্তর' : 'RAB HQ';

            const children: Paragraph[] = [
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 1 } }, children: [new TextRun({ text: title, bold: true, size: 32, font: 'Nirmala UI' })] }),
                new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: bodyText, size: 22, font: 'Nirmala UI' })] }),
            ];

            if (this.row.addressDuringLeave) {
                children.push(
                    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: addressLabel, bold: true, underline: {}, size: 22, font: 'Nirmala UI' })] }),
                    new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: this.row.addressDuringLeave, size: 22, font: 'Nirmala UI' })] }),
                );
            }

            const noBorders = {
                top: { style: BorderStyle.NONE, size: 0 },
                bottom: { style: BorderStyle.NONE, size: 0 },
                left: { style: BorderStyle.NONE, size: 0 },
                right: { style: BorderStyle.NONE, size: 0 },
            };

            const footerTable = new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: TableBorders.NONE,
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({
                                width: { size: 50, type: WidthType.PERCENTAGE },
                                borders: noBorders,
                                children: [
                                    new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: placeText, size: 20, font: 'Nirmala UI' })] }),
                                    new Paragraph({ children: [new TextRun({ text: `${dateLabel} ${this.formatDate(this.row.approvedDate)}`, size: 20, font: 'Nirmala UI' })] }),
                                ],
                            }),
                            new TableCell({
                                width: { size: 50, type: WidthType.PERCENTAGE },
                                borders: noBorders,
                                children: [
                                    new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.RIGHT, children: [new TextRun({ text: this.getName(approveId), bold: true, size: 22, font: 'Nirmala UI' })] }),
                                    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: this.getRank(approveId), size: 20, font: 'Nirmala UI' })] }),
                                    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: this.getAppointment(approveId), size: 20, font: 'Nirmala UI' })] }),
                                    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: officeText, size: 20, font: 'Nirmala UI' })] }),
                                ],
                            }),
                        ],
                    }),
                ],
            });

            const doc = new Document({
                sections: [{
                    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
                    children: [...children, footerTable]
                }]
            });
            const blob = await Packer.toBlob(doc);
            const fileName = this.lang === 'bn' ? 'ছুটির_সনদপত্র.docx' : 'Leave_Certificate.docx';
            saveAs(blob, fileName);
        } finally {
            this.exporting = false;
        }
    }

    goBack(): void {
        this.router.navigate(['/leave-application/list'], { queryParams: { section: 'approved' } });
    }
}
