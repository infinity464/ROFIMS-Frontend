import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { PostingService } from '@/services/posting.service';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmpService } from '@/services/emp-service';
import { PostingOrderEmployeeRow } from '@/models/posting.model';
import { HttpClient } from '@angular/common/http';
import { environment } from '@/Core/Environments/environment';
import { firstValueFrom } from 'rxjs';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, PageOrientation, TabStopType, TabStopPosition, TableLayoutType, ImageRun
} from 'docx';
import { saveAs } from 'file-saver';

@Component({
    selector: 'app-posting-order-preview',
    standalone: true,
    imports: [CommonModule, ButtonModule, Toast, TooltipModule],
    providers: [MessageService],
    templateUrl: './posting-order-preview.html',
    styleUrl: './posting-order-preview.scss'
})
export class PostingOrderPreviewPageComponent implements OnInit {
    loading = false;
    error = false;
    exportingPdf = false;
    printingPreview = false;
    employees: PostingOrderEmployeeRow[] = [];
    isBangla = false;

    // Master info extracted from first row
    postingOrderNo = '';
    postingOrderDate = '';
    postingType = '';
    subject = '';
    mainText = '';
    textType = '';
    filesReferences = '';
    status = '';
    masterRemarks = '';
    noteSheetNo = '';
    referenceNumber = '';
    footerParagraphs: string[] = [];

    // Final approver info
    approverName = '';
    approverNameBN = '';
    approverRank = '';
    approverRankBN = '';
    approverAppointment = '';
    approverAppointmentBN = '';
    approverPhone = '';
    approverSignatureUrl = '';

    // Initiator info
    initiatorName = '';
    initiatorNameBN = '';
    initiatorRank = '';
    initiatorRankBN = '';
    initiatorAppointment = '';
    initiatorAppointmentBN = '';
    initiatorPhone = '';
    initiatorSignatureUrl = '';

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private postingService: PostingService,
        private servingMembersService: ServingMembersService,
        private empService: EmpService,
        private http: HttpClient,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.route.queryParams.subscribe(params => {
            const id = params['id'];
            if (id) {
                this.loadOrder(+id);
            } else {
                this.error = true;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No posting order ID provided.' });
            }
        });
    }

    goBack(): void {
        this.router.navigate(['/posting/posting-order-list']);
    }

    private loadOrder(id: number): void {
        this.loading = true;
        this.postingService.getPostingOrderEmployees(id).subscribe({
            next: (rows) => {
                this.employees = rows ?? [];
                if (this.employees.length > 0) {
                    const first = this.employees[0];
                    this.postingOrderNo = first.postingOrderNo ?? '';
                    this.postingOrderDate = first.postingOrderDate ?? '';
                    this.postingType = first.postingType ?? '';
                    this.subject = first.subject ?? '';
                    this.mainText = first.mainText ?? '';
                    this.textType = first.textType ?? '';
                    this.filesReferences = first.filesReferences ?? '';
                    this.status = first.status ?? '';
                    this.masterRemarks = first.masterRemarks ?? '';
                    this.noteSheetNo = first.noteSheetNo ?? '';
                    this.referenceNumber = first.referenceNumber ?? '';
                    this.isBangla = first.nsTextType === 1 || this.textType === 'bn' || this.textType === '1' || this.textType === 'Bangla';

                    // Parse footer paragraphs from JSON
                    try {
                        this.footerParagraphs = first.footerText ? JSON.parse(first.footerText) : [];
                    } catch { this.footerParagraphs = []; }

                    // Load final approver info from notesheet
                    if (first.noteSheetId) {
                        this.loadApproverInfo(first.noteSheetId);
                    }
                }
                this.loading = false;
            },
            error: () => {
                this.loading = false;
                this.error = true;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load posting order.' });
            }
        });
    }

    private loadApproverInfo(noteSheetId: number): void {
        const nsApi = `${environment.apis.core}/NoteSheetInfo`;
        this.http.get<any[]>(`${nsApi}/GetFilteredByKeysAsyn/${noteSheetId}`).subscribe({
            next: (data) => {
                const ns = Array.isArray(data) ? data[0] : data;
                // Load initiator info
                if (ns?.initiatorId) {
                    this.servingMembersService.getEmployeePersonalServiceOverview(ns.initiatorId).subscribe({
                        next: (emp) => {
                            if (emp) {
                                this.initiatorName = emp.nameEnglish ?? '';
                                this.initiatorNameBN = emp.nameBN ?? '';
                                this.initiatorRank = emp.armyRank ?? '';
                                this.initiatorRankBN = emp.armyRankBN ?? '';
                                this.initiatorAppointment = emp.appointment ?? '';
                                this.initiatorAppointmentBN = emp.appointmentBN ?? '';
                                this.initiatorPhone = emp.mobileNo ?? '';
                            }
                        }
                    });
                    this.empService.getSignatureBlob(ns.initiatorId).subscribe({
                        next: (blob) => {
                            if (blob && blob.size > 0) {
                                const reader = new FileReader();
                                reader.onloadend = () => { this.initiatorSignatureUrl = reader.result as string; };
                                reader.readAsDataURL(blob);
                            }
                        },
                        error: () => { /* no signature */ }
                    });
                }

                if (ns?.finalApprovalId) {
                    this.servingMembersService.getEmployeePersonalServiceOverview(ns.finalApprovalId).subscribe({
                        next: (emp) => {
                            if (emp) {
                                this.approverName = emp.nameEnglish ?? '';
                                this.approverNameBN = emp.nameBN ?? '';
                                this.approverRank = emp.armyRank ?? '';
                                this.approverRankBN = emp.armyRankBN ?? '';
                                this.approverAppointment = emp.appointment ?? '';
                                this.approverAppointmentBN = emp.appointmentBN ?? '';
                                this.approverPhone = emp.mobileNo ?? '';
                            }
                        }
                    });
                    // Load signature image
                    this.empService.getSignatureBlob(ns.finalApprovalId).subscribe({
                        next: (blob) => {
                            if (blob && blob.size > 0) {
                                const reader = new FileReader();
                                reader.onloadend = () => { this.approverSignatureUrl = reader.result as string; };
                                reader.readAsDataURL(blob);
                            }
                        },
                        error: () => { /* no signature available */ }
                    });
                }
            }
        });
    }

    // ─── Dynamic body text with mother org names ────────

    get bodyText(): string {
        if (this.employees.length === 0) return '';
        const bn = this.isBangla;

        // Collect distinct mother org names
        const orgSet = new Set<string>();
        for (const emp of this.employees) {
            const org = bn ? (emp.motherUnitNameBN || emp.motherUnitName) : emp.motherUnitName;
            if (org) orgSet.add(org);
        }
        const orgNames = Array.from(orgSet);

        if (bn) {
            const orgText = orgNames.length > 0 ? orgNames.join(', ') : 'সেনাবাহিনী';
            return `র‌্যাপিড এ্যাকশন ব্যাটালিয়নের প্রেষণে কর্মরত বাংলাদেশ ${orgText}'র নিম্নবর্ণিত সদস্যদেরকে তাদের নামের পার্শ্বে উল্লিখিত স্থানে জনস্বার্থে বদলি করা হলোঃ`;
        } else {
            const orgText = orgNames.length > 0 ? orgNames.join(', ') : 'Army';
            return `The following members of Bangladesh ${orgText} serving in the Rapid Action Battalion are hereby transferred to the places mentioned against their names in the public interest:`;
        }
    }

    // ─── Display helpers ──────────────────────────────────

    get previewDate(): string {
        if (!this.postingOrderDate) return '';
        return this.isBangla
            ? this.formatDateBangla(this.postingOrderDate)
            : this.formatDate(this.postingOrderDate);
    }

    formatDate(value: string | null | undefined): string {
        if (value == null || value === '') return '-';
        try {
            const d = new Date(value);
            return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch { return String(value); }
    }

    formatDateBangla(value: string | null | undefined): string {
        if (value == null || value === '') return '-';
        try {
            const d = new Date(value);
            if (isNaN(d.getTime())) return String(value);
            const months = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
            return `${this.toBanglaDigits(String(d.getDate()))} ${months[d.getMonth()]} ${this.toBanglaDigits(String(d.getFullYear()))}`;
        } catch { return String(value); }
    }

    toBanglaDigits(input: string): string {
        return input.replace(/[0-9]/g, d => String.fromCharCode(0x09E6 + parseInt(d)));
    }

    empServiceId(emp: PostingOrderEmployeeRow): string {
        const prefix = this.isBangla ? (emp.prefixNameBN || emp.prefixName) : emp.prefixName;
        let sid = emp.serviceId || '-';
        if (this.isBangla && sid !== '-') sid = this.toBanglaDigits(sid);
        return prefix ? `${prefix}-${sid}` : sid;
    }

    empRank(emp: PostingOrderEmployeeRow): string {
        return (this.isBangla ? (emp.rankNameBN || emp.rankName) : emp.rankName) || '-';
    }

    empTrade(emp: PostingOrderEmployeeRow): string {
        return (this.isBangla ? (emp.tradeNameBN || emp.tradeName) : emp.tradeName) || 'N/A';
    }

    empName(emp: PostingOrderEmployeeRow): string {
        return (this.isBangla ? (emp.fullNameBN || emp.fullNameEN) : emp.fullNameEN) || '-';
    }

    empDistrict(emp: PostingOrderEmployeeRow): string {
        return (this.isBangla ? (emp.permanentDistrictNameBN || emp.permanentDistrictName) : emp.permanentDistrictName) || '-';
    }

    empPrevWorkplace(emp: PostingOrderEmployeeRow): string {
        return (this.isBangla ? (emp.motherOrgLocationNameBN || emp.motherOrgLocationName) : emp.motherOrgLocationName) || '-';
    }

    empTransferUnit(emp: PostingOrderEmployeeRow): string {
        return (this.isBangla ? (emp.transferRabUnitNameBN || emp.transferRabUnitName) : emp.transferRabUnitName) || '-';
    }

    empRabId(emp: PostingOrderEmployeeRow): string {
        return emp.rabID || '-';
    }

    // ─── Export Word ──────────────────────────────────────

    async exportWord(): Promise<void> {
        if (this.employees.length === 0) return;
        const doc = this.buildWordDocument();
        saveAs(await Packer.toBlob(doc), `PostingOrder_${this.postingOrderNo || 'export'}.docx`);
    }

    // ─── Export PDF (backend Word-to-PDF conversion) ──────

    async exportPdf(): Promise<void> {
        if (this.employees.length === 0) return;
        this.exportingPdf = true;
        try {
            const doc = this.buildWordDocument();
            const docxBlob = await Packer.toBlob(doc);
            const form = new FormData();
            form.append('file', docxBlob, 'document.docx');
            const pdfBlob = await firstValueFrom(
                this.http.post(`${environment.apis.core}/Document/ConvertToPdf`, form, { responseType: 'blob' })
            );
            saveAs(pdfBlob, `PostingOrder_${this.postingOrderNo || 'export'}.pdf`);
        } catch {
            this.messageService.add({ severity: 'error', summary: 'Export Error', detail: 'Failed to generate PDF.' });
        } finally {
            this.exportingPdf = false;
        }
    }

    // ─── Print Preview (backend Word-to-PDF, open in new tab) ──

    async printPreview(): Promise<void> {
        if (this.employees.length === 0) return;
        this.printingPreview = true;
        try {
            const doc = this.buildWordDocument();
            const docxBlob = await Packer.toBlob(doc);
            const form = new FormData();
            form.append('file', docxBlob, 'document.docx');
            const pdfBlob = await firstValueFrom(
                this.http.post(`${environment.apis.core}/Document/ConvertToPdf`, form, { responseType: 'blob' })
            );
            const url = URL.createObjectURL(pdfBlob);
            window.open(url, '_blank');
        } catch {
            this.messageService.add({ severity: 'error', summary: 'Preview Error', detail: 'Failed to generate print preview.' });
        } finally {
            this.printingPreview = false;
        }
    }

    // ─── Shared Word Document Builder ─────────────────────

    private buildWordDocument(): Document {
        const bn = this.isBangla;
        const font = bn
            ? { ascii: 'Nirmala UI', hAnsi: 'Nirmala UI', cs: 'Nirmala UI', hint: 'cs' as const }
            : 'Times New Roman';
        const csSize = bn ? 20 : undefined;
        const lang = bn ? { value: 'bn-BD', bidirectional: 'bn-BD' } : undefined;
        const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
        const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

        // ── Government Header (11pt, bold, centered) ──
        const headerLines = bn
            ? ['গণপ্রজাতন্ত্রী বাংলাদেশ সরকার', 'বাংলাদেশ পুলিশ', 'র‌্যাব ফোর্সেস সদর দপ্তর', 'কুর্মিটোলা, ঢাকা']
            : ['Government of the Peoples Republic of Bangladesh', 'Bangladesh Police', 'RAB Forces Headquarters', 'Kurmitola, Dhaka'];

        const headerParas = headerLines.map(line => new Paragraph({
            children: [new TextRun({ text: line, bold: true, size: 22, sizeComplexScript: bn ? 22 : undefined, font, language: lang })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 }
        }));

        // ── Title (14pt, bold, underlined, centered) ──
        const titlePara = new Paragraph({
            children: [new TextRun({ text: bn ? 'প্রজ্ঞাপন' : 'NOTIFICATION', bold: true, size: 28, sizeComplexScript: bn ? 28 : undefined, font, underline: {}, language: lang })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 200 }
        });

        // ── Order No & Date (10pt, space-between via tab stop) ──
        const orderLine = new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            children: [
                new TextRun({ text: bn ? `ফোর্স অর্ডার নং: ${this.postingOrderNo}` : `Force Order No: ${this.postingOrderNo}`, size: 20, sizeComplexScript: csSize, font, language: lang }),
                new TextRun({ text: '\t', font }),
                new TextRun({ text: bn ? `তারিখ: ${this.previewDate}` : `Date: ${this.previewDate}`, size: 20, sizeComplexScript: csSize, font, language: lang })
            ],
            spacing: { after: 160 }
        });

        // ── Body Text (10pt, justified) ──
        const bodyPara = new Paragraph({
            children: [new TextRun({ text: this.bodyText, size: 20, sizeComplexScript: csSize, font, language: lang })],
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 160 }
        });

        // ── Employee Table (header 8.5pt, data 9pt) ──
        const cols = bn
            ? ['ক্রমিক', 'ব্যক্তিগত নম্বর', 'পদবি', 'ট্রেড', 'নাম', 'নিজ জেলা', 'পূর্ববর্তী কর্মস্থল', 'বদলিকৃত কর্মস্থল', 'র‌্যাব আইডি', 'মন্তব্য']
            : ['Ser', 'Service ID', 'Rank', 'Trade', 'Name', 'Own District', 'Previous Workplace', 'Transfer Unit', 'RAB ID', 'Remarks'];
        // Column widths in DXA – must sum to full content width (page 12240 - margins 567*2 = 11106)
        //         Ser  SvcID  Rank  Trade  Name   OwnDist PrevWk TrUnit RabID Remarks
        const colW = [630, 1200, 860, 974, 1374, 1260, 1374, 1374, 1030, 1030];

        const headerRow = new TableRow({
            tableHeader: true,
            children: cols.map((col, ci) => new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: col, bold: true, size: 17, sizeComplexScript: bn ? 17 : undefined, font, language: lang })], alignment: AlignmentType.CENTER })],
                borders: cellBorders, width: { size: colW[ci], type: WidthType.DXA }
            }))
        });

        const dataRows = this.employees.map((emp, i) => new TableRow({
            children: [
                bn ? this.toBanglaDigits(String(i + 1)) : String(i + 1),
                this.empServiceId(emp), this.empRank(emp), this.empTrade(emp), this.empName(emp),
                this.empDistrict(emp), this.empPrevWorkplace(emp), this.empTransferUnit(emp),
                this.empRabId(emp), emp.noteSheetRemarks ?? ''
            ].map((val, ci) => new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: val, size: 18, sizeComplexScript: bn ? 18 : undefined, font, language: lang })], spacing: { after: 20 } })],
                borders: cellBorders, width: { size: colW[ci], type: WidthType.DXA }
            }))
        }));

        const empTable = new Table({
            width: { size: 11106, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            indent: { size: 0, type: WidthType.DXA },
            rows: [headerRow, ...dataRows],
            columnWidths: colW
        });

        // ── Signature Block (10pt, right-aligned) ──
        const approverNameText = (bn ? this.approverNameBN : this.approverName) || this.approverName || '...................................';
        const approverRankText = (bn ? this.approverRankBN : this.approverRank) || this.approverRank || '............................';
        const approverApptText = (bn ? this.approverAppointmentBN : this.approverAppointment) || this.approverAppointment || '............................';
        const approverPhoneText = this.approverPhone || '...............';
        const sigParas: Paragraph[] = [
            new Paragraph({ spacing: { before: 600 } }),
        ];
        if (this.approverSignatureUrl) {
            sigParas.push(new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
                children: [
                    new TextRun({ text: '\t', font }),
                    new ImageRun({ type: 'png', data: this.dataUrlToUint8Array(this.approverSignatureUrl), transformation: { width: 150, height: 50 } })
                ]
            }));
        }
        sigParas.push(
            new Paragraph({ children: [new TextRun({ text: approverNameText, size: 20, sizeComplexScript: csSize, font, language: lang })], alignment: AlignmentType.RIGHT }),
            new Paragraph({ children: [new TextRun({ text: approverRankText, size: 20, sizeComplexScript: csSize, font, language: lang })], alignment: AlignmentType.RIGHT }),
            new Paragraph({ children: [new TextRun({ text: approverApptText, size: 20, sizeComplexScript: csSize, font, language: lang })], alignment: AlignmentType.RIGHT }),
            new Paragraph({ children: [new TextRun({ text: `${bn ? 'টেলিঃ' : 'Tel:'} ${approverPhoneText}`, size: 20, sizeComplexScript: csSize, font, language: lang })], alignment: AlignmentType.RIGHT }),
            new Paragraph({ children: [new TextRun({ text: bn ? `তারিখঃ ${this.previewDate}` : `Date: ${this.previewDate}`, size: 20, sizeComplexScript: csSize, font, language: lang })], alignment: AlignmentType.RIGHT, spacing: { before: 100 } })
        );

        // ── Copy Distribution (10pt, bold) ──
        const copyPara = new Paragraph({
            children: [new TextRun({ text: bn ? 'অনুলিপি (জ্যেষ্ঠতার ভিত্তিতে নহে)ঃ' : 'Copy (not in order of seniority):', bold: true, size: 20, sizeComplexScript: csSize, font, language: lang })],
            spacing: { before: 300 }
        });

        // ── Footer paragraphs (10pt) ──
        const footerParas = this.footerParagraphs.map((p, i) => new Paragraph({
            children: [new TextRun({ text: `${bn ? this.toBanglaDigits(String(i + 1)) : (i + 1)}। ${p}`, size: 20, sizeComplexScript: csSize, font, language: lang })],
            spacing: { after: 100 }
        }));

        // ── Page borders (same as notesheet-preview-posting) ──
        const pageBorder = { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 10 };

        return new Document({
            styles: bn ? { default: { document: { run: { language: { value: 'bn-BD', bidirectional: 'bn-BD' } } } } } : undefined,
            sections: [{
                properties: {
                    page: {
                        size: { orientation: PageOrientation.PORTRAIT, width: 12240, height: 20160 },
                        margin: { top: 567, right: 567, bottom: 567, left: 567 },
                        borders: {
                            pageBorderTop: pageBorder,
                            pageBorderBottom: pageBorder,
                            pageBorderLeft: pageBorder,
                            pageBorderRight: pageBorder,
                        },
                    }
                },
                children: [...headerParas, titlePara, orderLine, bodyPara, empTable, ...sigParas, copyPara, ...footerParas]
            }]
        });
    }

    private dataUrlToUint8Array(dataUrl: string): Uint8Array {
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
        }
        return array;
    }
}
