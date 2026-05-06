import { Component, HostListener, OnInit } from '@angular/core';
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

    exportDropdownOpen = false;
    exporting = false;

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

    @HostListener('document:click')
    onDocumentClick(): void {
        this.exportDropdownOpen = false;
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    async exportAs(type: 'print' | 'pdf' | 'word'): Promise<void> {
        this.exportDropdownOpen = false;
        if (type !== 'print') this.exporting = true;
        await new Promise(resolve => setTimeout(resolve, 50));
        if (type === 'print') {
            this.printPreview();
        } else if (type === 'pdf') {
            await this.exportPDF();
        } else if (type === 'word') {
            await this.exportWord();
        }
    }

    private getPrintStyles(): string {
        return `
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: 'SolaimanLipi','Noto Sans Bengali','Times New Roman',serif; margin: 0; padding: 0; color: #000; line-height: 1.7; font-size: 10pt; }
  .leave-letter { width: 100%; padding: 0; box-sizing: border-box; }
  .letter-title { text-align: center; font-size: 13pt; font-weight: 700; margin: 0 0 14px; padding-bottom: 4px; border-bottom: 1.5px solid #000; display: inline-block; width: 100%; letter-spacing: 1px; }
  .letter-para { line-height: 1.9; text-align: justify; margin: 10px 0; font-size: 11pt; }
  .letter-table { width: calc(100% - 40px); margin: 12px auto; border-collapse: collapse; font-size: 10pt; }
  .letter-table th, .letter-table td { border: 1px solid #000; padding: 5px 8px; text-align: center; vertical-align: middle; }
  .letter-table th { font-weight: 700; background: #f0f0f0; }
  .letter-table tfoot td { font-weight: 700; }
  .letter-section { margin: 14px 0 0; }
  .letter-section-title { font-weight: 700; display: inline-block; border-bottom: 1px solid #000; padding-bottom: 1px; margin: 0 0 4px; font-size: 11pt; }
  .letter-section-body { margin: 0; white-space: pre-line; font-size: 11pt; }`;
    }

    private printPreview(): void {
        const el = document.getElementById('leave-preview-print');
        if (!el) return;
        const title = this.lang === 'bn' ? 'ছুটির আবেদন' : 'Leave Application';
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
        const el = document.getElementById('leave-preview-print');
        if (!el) return;
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
            this.exporting = false;
        }
    }

    private async exportWord(): Promise<void> {
        if (!this.application) return;
        try {
            const FONT = 'Nirmala UI';
            const isBn = this.lang === 'bn';
            const appId = this.application.applicantEmployeeId;
            const relieverId = this.getRelieverId();

            const noBorders = {
                top: { style: BorderStyle.NONE, size: 0 },
                bottom: { style: BorderStyle.NONE, size: 0 },
                left: { style: BorderStyle.NONE, size: 0 },
                right: { style: BorderStyle.NONE, size: 0 },
            };

            const titleParagraph = new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 240 },
                border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000', space: 4 } },
                children: [new TextRun({
                    text: isBn ? 'ছুটির আবেদন' : 'Leave Application',
                    bold: true,
                    size: 26,
                    font: FONT
                })]
            });

            const descApp = this.getDescriptors(appId);
            const descAppSuffix = descApp ? `, ${descApp}` : '';
            const introBn = `${this.getPrefix(appId)}-${this.getServiceId(appId)} ${this.getRank(appId)} ${this.getName(appId)}${descAppSuffix} নিম্নবর্নিত তারিখে মোট ${this.getTotalDays()} (${this.getTotalDaysWord()}) দিনের ছুটির আবেদন করেছেনঃ`;
            const introEn = `${this.getPrefix(appId)}-${this.getServiceId(appId)} ${this.getRank(appId)} ${this.getName(appId)}${descAppSuffix} has applied for leave for the dates mentioned below totaling ${this.getTotalDays()} (${this.getTotalDaysWord()}) days:`;

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
                titleParagraph,
                introPara,
                detailTable
            ];

            if (relieverId && this.empMap[relieverId]) {
                const descR = this.getDescriptors(relieverId);
                const descRSuffix = descR ? `, ${descR}` : '';
                const apptApplicant = this.getAppointment(appId);
                const dutyBn = apptApplicant ? `ভারপ্রাপ্ত ${apptApplicant} এর দায়িত্ব` : 'তার দায়িত্ব';
                const dutyEn = apptApplicant ? `perform the duties of acting ${apptApplicant}` : 'perform their duties';
                const relieverBn = `উক্ত অফিসার ছুটিতে থাকাকালীন ${this.getPrefix(relieverId)}-${this.getServiceId(relieverId)} ${this.getRank(relieverId)} ${this.getName(relieverId)}${descRSuffix} নিজ দায়িত্ব ছাড়াও ${dutyBn} পালন করবেন।`;
                const relieverEn = `While the above officer is on leave, ${this.getPrefix(relieverId)}-${this.getServiceId(relieverId)} ${this.getRank(relieverId)} ${this.getName(relieverId)}${descRSuffix} will ${dutyEn} in addition to their own duties.`;
                children.push(new Paragraph({
                    spacing: { before: 200, after: 160, line: 360 },
                    alignment: AlignmentType.JUSTIFIED,
                    children: [new TextRun({ text: isBn ? relieverBn : relieverEn, size: 22, font: FONT })]
                }));
            }

            if (this.application.addressDuringLeave) {
                children.push(
                    new Paragraph({
                        spacing: { before: 200, after: 60 },
                        children: [new TextRun({
                            text: isBn ? 'ছুটি থাকাকালীন ঠিকানাঃ' : 'Address During Leave:',
                            bold: true, underline: {}, size: 22, font: FONT
                        })]
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: this.application.addressDuringLeave, size: 22, font: FONT })]
                    })
                );
            }

            if (this.application.remarks) {
                children.push(
                    new Paragraph({
                        spacing: { before: 200, after: 60 },
                        children: [new TextRun({
                            text: isBn ? 'আবেদনকারীর মন্তব্য:' : "Applicant's Remarks:",
                            bold: true, underline: {}, size: 22, font: FONT
                        })]
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: this.application.remarks, size: 22, font: FONT })]
                    })
                );
            }

            // Suppress unused-variable lint for noBorders (kept in case future sections need it)
            void noBorders;

            const doc = new Document({
                sections: [{
                    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
                    children
                }]
            });
            const blob = await Packer.toBlob(doc);
            const fileName = isBn ? 'ছুটির_আবেদন.docx' : 'Leave_Application.docx';
            saveAs(blob, fileName);
        } finally {
            this.exporting = false;
        }
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

    /**
     * English-only formatted employee string used in the approval card —
     * matches the applicant rendering: "BA-9000 Lt Col Md Fahad, BPM, psc, EB, Deputy Director (DD), RAB-2".
     * Independent of the lang toggle.
     */
    formatEmpFullEn(empId: number | null | undefined): string {
        if (empId == null) return '';
        const emp = this.getEmp(empId);
        if (!emp) return '';

        const prefixRaw = emp.prefixRaw || '';
        let prefix = '';
        if (prefixRaw) {
            const numId = Number(prefixRaw);
            prefix = (!isNaN(numId) && numId > 0) ? (this.prefixENMap[numId] || prefixRaw) : prefixRaw;
        }
        const sid = emp.serviceId || '';
        const rank = emp.rankEN || '';
        const name = emp.nameEN || '';
        const apptEn = (emp.appointmentId != null && this.appointmentENMap[emp.appointmentId])
            ? this.appointmentENMap[emp.appointmentId]
            : emp.appointmentEN;
        const descriptors = [
            emp.decorationEN,
            emp.profQualEN,
            emp.corpsEN,
            apptEn,
            emp.rabUnitEN
        ].map(s => (s ?? '').trim()).filter(s => s.length > 0).join(', ');

        const head = (prefix && sid) ? `${prefix}-${sid}` : (prefix || sid);
        const main = [head, rank, name].filter(s => s && s.length > 0).join(' ');
        return descriptors ? `${main}, ${descriptors}` : main;
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

    /** True when the current user is the final approver and all recommenders have already approved. */
    get isCurrentUserFinalApprover(): boolean {
        if (!this.application || this.currentUserEmployeeId <= 0) return false;
        if (this.application.finalApproverId !== this.currentUserEmployeeId) return false;
        const anyRecommenderPending = (this.application.recommenders ?? []).some((r) => r.status === 1);
        return !anyRecommenderPending;
    }

    /** True when the current user is whoever's turn it is to act on the application. */
    get canActOnApplication(): boolean {
        return this.isActionable && (this.isCurrentUserRecommender || this.isCurrentUserFinalApprover);
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
