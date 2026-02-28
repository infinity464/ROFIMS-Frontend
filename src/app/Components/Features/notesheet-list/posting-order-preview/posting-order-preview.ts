import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { EditorModule } from 'primeng/editor';
import { TextareaModule } from 'primeng/textarea';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { environment } from '@/Core/Environments/environment';
import { PostingService } from '@/services/posting.service';
import { DraftPostingEmployeeRow } from '@/models/posting.model';

@Component({
    selector: 'app-posting-order-preview',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, EditorModule, TextareaModule, InputTextModule, TooltipModule],
    templateUrl: './posting-order-preview.html',
    styleUrl: './posting-order-preview.scss'
})
export class PostingOrderPreviewComponent implements OnChanges {
    @Input() noteSheet: any = null;
    @Input() isEnglish = true;
    @Input() initiatorDetails: any = null;
    @Input() approversDetails: any[] = [];

    @Output() saved = new EventEmitter<void>();

    /** Employees from vw_DraftPostingWithEmployees */
    employees: DraftPostingEmployeeRow[] = [];
    loadingEmployees = false;

    /** Edit mode */
    editing = false;
    saving = false;
    editMainText = '';
    editNote = '';
    editReferenceNumber = '';

    private api = `${environment.apis.core}/NoteSheetInfo`;

    constructor(
        private postingService: PostingService,
        private http: HttpClient,
        private messageService: MessageService
    ) {}

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['noteSheet'] && this.noteSheet) {
            this.editing = false;
            const masterId = this.noteSheet.draftPostingMasterId ?? this.noteSheet.DraftPostingMasterId;
            if (masterId) {
                this.loadDraftPostingDetails(masterId);
            }
        }
    }

    private loadDraftPostingDetails(id: number): void {
        this.loadingEmployees = true;
        this.postingService.getDraftPostingEmployees(id).subscribe({
            next: (data) => {
                this.employees = data ?? [];
                this.loadingEmployees = false;
            },
            error: () => {
                this.loadingEmployees = false;
            }
        });
    }

    toggleEdit(): void {
        this.editMainText = this.noteSheet?.mainText ?? '';
        this.editNote = this.noteSheet?.note ?? '';
        this.editReferenceNumber = this.noteSheet?.referenceNumber ?? '';
        this.editing = true;
    }

    cancelEdit(): void {
        this.editing = false;
    }

    saveChanges(): void {
        if (!this.noteSheet) return;
        this.saving = true;
        const payload = {
            ...this.noteSheet,
            mainText: this.editMainText,
            note: this.editNote,
            referenceNumber: this.editReferenceNumber
        };
        this.http.post<{ statusCode?: number }>(`${this.api}/UpdateAsyn`, payload).subscribe({
            next: (res) => {
                this.saving = false;
                if (res?.statusCode === 200) {
                    this.noteSheet.mainText = this.editMainText;
                    this.noteSheet.note = this.editNote;
                    this.noteSheet.referenceNumber = this.editReferenceNumber;
                    this.editing = false;
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Posting order updated.' });
                    this.saved.emit();
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Notice', detail: 'Update failed.' });
                }
            },
            error: () => {
                this.saving = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Update failed.' });
            }
        });
    }

    formatDate(val: string | null | undefined): string {
        if (!val) return '—';
        try {
            const d = new Date(val);
            if (isNaN(d.getTime())) return val;
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch {
            return val;
        }
    }
}
