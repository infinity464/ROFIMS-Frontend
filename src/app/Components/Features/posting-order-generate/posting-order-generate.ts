import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { Toast } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { environment } from '@/Core/Environments/environment';
import { PostingService } from '@/services/posting.service';
import { ApprovedNoteSheetItem } from '@/models/posting.model';
import { NoteSheetType } from '@/models/enums';

interface NoteSheetEmployee {
    employeeId: number;
    serviceId: string | null;
    prefixName: string | null;
    fullNameEN: string | null;
    fullNameBN: string | null;
    rankName: string | null;
    rankNameBN: string | null;
    corpsName: string | null;
    corpsNameBN: string | null;
    tradeName: string | null;
    tradeNameBN: string | null;
    motherUnitName: string | null;
    motherUnitNameBN: string | null;
    permanentDistrictName: string | null;
    permanentDistrictNameBN: string | null;
    spousePresentDistrictName: string | null;
    spousePresentDistrictNameBN: string | null;
    motherOrgLocationName: string | null;
    motherOrgLocationNameBN: string | null;
    transferRabUnitName: string | null;
    remarks: string | null;
    joiningDateInRAB: string | null;
}

@Component({
    selector: 'app-posting-order-generate',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        SelectModule,
        DatePickerModule,
        InputTextModule,
        TextareaModule,
        Toast,
        ConfirmDialogModule
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './posting-order-generate.html',
    styleUrl: './posting-order-generate.scss'
})
export class PostingOrderGenerateComponent implements OnInit {
    private noteSheetApi = `${environment.apis.core}/NoteSheetInfo`;

    postingTypeOptions = [
        { label: 'New Posting', value: NoteSheetType.NewPosting },
        { label: 'Inter Posting', value: NoteSheetType.InterPosting }
    ];

    selectedPostingType: string | null = null;
    approvedNoteSheets: ApprovedNoteSheetItem[] = [];
    selectedNoteSheetId: number | null = null;
    employees: NoteSheetEmployee[] = [];
    loadingNoteSheets = false;
    loadingEmployees = false;
    saving = false;

    /** NoteSheet info displayed above employee table. */
    selectedNoteSheetNo: string | null = null;
    selectedNoteSheetApprovedDate: string | null = null;

    // ─── New form fields ──────────────────────────────────
    postingOrderDate: Date | null = null;
    remarks = '';
    selectedTextType = 'en';
    footerParagraphs: string[] = [];

    /** true = Bangla, false = English */
    get isBangla(): boolean {
        return this.selectedTextType === 'bn';
    }

    constructor(
        private postingService: PostingService,
        private http: HttpClient,
        private messageService: MessageService,
        private confirmationService: ConfirmationService
    ) {}

    ngOnInit(): void {
        this.postingOrderDate = new Date();
    }

    /** When posting type dropdown changes, load approved notesheets of that type
     *  (backend already excludes notesheets with a generated Posting Order). */
    onPostingTypeChange(): void {
        this.approvedNoteSheets = [];
        this.selectedNoteSheetId = null;
        this.employees = [];

        if (!this.selectedPostingType) return;

        this.loadingNoteSheets = true;
        this.postingService.getApprovedNoteSheetsByType(this.selectedPostingType).subscribe({
            next: (notesheets) => {
                this.approvedNoteSheets = notesheets ?? [];
                this.loadingNoteSheets = false;
                if (this.approvedNoteSheets.length === 0) {
                    this.messageService.add({ severity: 'info', summary: 'Info', detail: 'No approved notesheets found for this type.' });
                }
            },
            error: (err) => {
                this.loadingNoteSheets = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message ?? 'Failed to load notesheets.' });
            }
        });
    }

    /** Dropdown options for notesheet select. */
    get noteSheetDropdownOptions() {
        return this.approvedNoteSheets.map(ns => ({
            label: ns.noteSheetNo,
            value: ns.noteSheetId
        }));
    }

    /** When a notesheet is selected, load its employees and set textType from notesheet. */
    onNoteSheetChange(): void {
        this.employees = [];
        this.selectedNoteSheetNo = null;
        this.selectedNoteSheetApprovedDate = null;
        if (!this.selectedNoteSheetId) return;

        this.loadingEmployees = true;

        this.http.get<any[]>(`${this.noteSheetApi}/GetFilteredByKeysAsyn/${this.selectedNoteSheetId}`).subscribe({
            next: (data) => {
                const ns = Array.isArray(data) ? data[0] : data;
                if (!ns) {
                    this.loadingEmployees = false;
                    return;
                }

                this.selectedNoteSheetNo = ns.noteSheetNo;
                this.selectedNoteSheetApprovedDate = ns.finalApprovalApprovedDate ?? ns.lastupdate;
                // Set textType from notesheet (TextType: 1 = Bangla, else English)
                this.selectedTextType = (ns.textType === 1 || ns.textType === '1') ? 'bn' : 'en';

                const draftPostingMasterId = ns.draftPostingMasterId;
                if (draftPostingMasterId) {
                    this.postingService.getDraftPostingEmployees(draftPostingMasterId).subscribe({
                        next: (emps) => {
                            this.employees = (emps ?? []).map(e => ({
                                employeeId: e.employeeId,
                                serviceId: e.serviceId,
                                prefixName: e.prefixName,
                                fullNameEN: e.fullNameEN,
                                fullNameBN: e.fullNameBN,
                                rankName: e.rankName,
                                rankNameBN: e.rankNameBN,
                                corpsName: e.corpsName,
                                corpsNameBN: e.corpsNameBN,
                                tradeName: e.tradeName,
                                tradeNameBN: e.tradeNameBN,
                                motherUnitName: e.motherUnitName,
                                motherUnitNameBN: e.motherUnitNameBN,
                                permanentDistrictName: e.permanentDistrictName,
                                permanentDistrictNameBN: e.permanentDistrictNameBN,
                                spousePresentDistrictName: e.spousePresentDistrictName,
                                spousePresentDistrictNameBN: e.spousePresentDistrictNameBN,
                                motherOrgLocationName: e.motherOrgLocationName,
                                motherOrgLocationNameBN: e.motherOrgLocationNameBN,
                                transferRabUnitName: e.transferRabUnitName,
                                remarks: e.remarks,
                                joiningDateInRAB: e.joiningDateInRAB
                            }));
                            this.loadingEmployees = false;
                        },
                        error: () => {
                            this.loadingEmployees = false;
                            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load employees.' });
                        }
                    });
                } else {
                    this.loadingEmployees = false;
                    this.messageService.add({ severity: 'info', summary: 'Info', detail: 'No draft posting linked to this notesheet.' });
                }
            },
            error: () => {
                this.loadingEmployees = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load notesheet details.' });
            }
        });
    }

    /** Remove employee from the list after confirmation. */
    removeEmployee(emp: NoteSheetEmployee): void {
        const name = (this.isBangla ? emp.fullNameBN : emp.fullNameEN) || emp.fullNameEN || emp.serviceId || '';
        this.confirmationService.confirm({
            message: `"${name}" কে তালিকা থেকে সরাতে চান?`,
            header: 'নিশ্চিত করুন',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'হ্যাঁ',
            rejectLabel: 'না',
            accept: () => {
                this.employees = this.employees.filter(e => e.employeeId !== emp.employeeId);
            }
        });
    }

    // ─── Footer paragraphs ────────────────────────────────

    addFooterParagraph(): void {
        this.footerParagraphs.push('');
    }

    removeFooterParagraph(index: number): void {
        this.footerParagraphs.splice(index, 1);
    }

    trackByIndex(index: number): number {
        return index;
    }

    // ─── Generate ─────────────────────────────────────────

    private formatDateToString(value: Date | null): string {
        if (!value) {
            const today = new Date();
            return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        }
        const y = value.getFullYear(), m = value.getMonth() + 1, d = value.getDate();
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    onGeneratePostingOrder(): void {
        if (!this.selectedPostingType || !this.selectedNoteSheetId || this.employees.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Select posting type, notesheet and ensure employees exist.' });
            return;
        }

        this.saving = true;

        // Build footerText JSON from non-empty paragraphs
        const nonEmptyParagraphs = this.footerParagraphs.filter(p => p.trim().length > 0);
        const footerText = nonEmptyParagraphs.length > 0 ? JSON.stringify(nonEmptyParagraphs) : null;

        this.postingService.createPostingOrder({
            postingOrderNo: '',  // auto-generated by backend
            postingOrderDate: this.formatDateToString(this.postingOrderDate),
            postingType: this.selectedPostingType!,
            noteSheetId: this.selectedNoteSheetId,
            textType: this.selectedTextType === 'bn' ? 'bn' : 'en',
            remarks: this.remarks || null,
            footerText: footerText,
            employeeIds: this.employees.map(e => e.employeeId),
            createdBy: 'system'
        }).subscribe({
            next: (res) => {
                this.saving = false;
                if (res.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Posting Order generated successfully.' });
                    // Reset form
                    this.employees = [];
                    this.selectedNoteSheetId = null;
                    this.selectedNoteSheetNo = null;
                    this.selectedNoteSheetApprovedDate = null;
                    this.remarks = '';
                    this.footerParagraphs = [];
                    this.postingOrderDate = new Date();
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? 'Failed to generate posting order.' });
                }
            },
            error: (err) => {
                this.saving = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? 'Failed to generate posting order.' });
            }
        });
    }

    formatDate(value: string | null | undefined): string {
        if (value == null || value === '') return '-';
        try {
            const d = new Date(value);
            return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return String(value);
        }
    }
}
