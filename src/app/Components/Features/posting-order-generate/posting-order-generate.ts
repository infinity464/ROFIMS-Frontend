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
    fullNameEN: string | null;
    rankName: string | null;
    corpsName: string | null;
    tradeName: string | null;
    motherUnitName: string | null;
    rabUnit: string | null;
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
            label: `${ns.noteSheetNo} - ${ns.subject ?? ''}`,
            value: ns.noteSheetId
        }));
    }

    /** When a notesheet is selected, load its employees. */
    onNoteSheetChange(): void {
        this.employees = [];
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

                const draftPostingMasterId = ns.draftPostingMasterId;
                if (draftPostingMasterId) {
                    // Load employees from draft posting
                    this.postingService.getDraftPostingEmployees(draftPostingMasterId).subscribe({
                        next: (emps) => {
                            this.employees = (emps ?? []).map(e => ({
                                employeeId: e.employeeId,
                                serviceId: e.serviceId,
                                fullNameEN: e.fullNameEN,
                                rankName: e.rankName,
                                corpsName: e.corpsName,
                                tradeName: e.tradeName,
                                motherUnitName: e.motherUnitName,
                                rabUnit: e.motherUnitName,
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
