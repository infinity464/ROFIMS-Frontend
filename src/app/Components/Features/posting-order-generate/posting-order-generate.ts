import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
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
        Toast
    ],
    providers: [MessageService],
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
    /** true = Bangla, false = English */
    isBangla = false;

    constructor(
        private postingService: PostingService,
        private http: HttpClient,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {}

    /** When posting type dropdown changes, load approved notesheets of that type. */
    onPostingTypeChange(): void {
        this.approvedNoteSheets = [];
        this.selectedNoteSheetId = null;
        this.employees = [];

        if (!this.selectedPostingType) return;

        this.loadingNoteSheets = true;
        this.postingService.getApprovedNoteSheetsByType(this.selectedPostingType).subscribe({
            next: (data) => {
                this.approvedNoteSheets = data ?? [];
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

    /** When a notesheet is selected, load its employees. */
    onNoteSheetChange(): void {
        this.employees = [];
        this.selectedNoteSheetNo = null;
        this.selectedNoteSheetApprovedDate = null;
        this.isBangla = false;
        if (!this.selectedNoteSheetId) return;

        this.loadingEmployees = true;

        // Load notesheet details to get employee list via DraftPostingMasterId
        this.http.get<any[]>(`${this.noteSheetApi}/GetFilteredByKeysAsyn/${this.selectedNoteSheetId}`).subscribe({
            next: (data) => {
                const ns = Array.isArray(data) ? data[0] : data;
                if (!ns) {
                    this.loadingEmployees = false;
                    return;
                }

                // Store notesheet info
                this.selectedNoteSheetNo = ns.noteSheetNo;
                this.selectedNoteSheetApprovedDate = ns.finalApprovalApprovedDate ?? ns.lastupdate;
                // TextType: 1 = Bangla, else English (int field)
                this.isBangla = ns.textType === 1 || ns.textType === '1';

                const draftPostingMasterId = ns.draftPostingMasterId;
                if (draftPostingMasterId) {
                    // Load employees from draft posting
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

    /** Remove employee from list. */
    removeEmployee(index: number): void {
        this.employees.splice(index, 1);
        this.employees = [...this.employees];
    }

    /** Generate Posting Order — calls CreatePostingOrder API. PostingOrderNo auto-generated by backend. */
    onGeneratePostingOrder(): void {
        if (!this.selectedPostingType || !this.selectedNoteSheetId || this.employees.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Select posting type, notesheet and ensure employees exist.' });
            return;
        }

        this.saving = true;
        const today = new Date().toISOString().slice(0, 10);

        this.postingService.createPostingOrder({
            postingOrderNo: '',  // auto-generated by backend from PostingOrderNumberConfig
            postingOrderDate: today,
            postingType: this.selectedPostingType!,
            noteSheetId: this.selectedNoteSheetId,
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
