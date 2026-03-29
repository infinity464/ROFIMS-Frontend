import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { EmployeeListService } from '@/services/employee-list.service';
import { PostingService } from '@/services/posting.service';
import { SharedService } from '@/shared/services/shared-service';
import { EmployeeList } from '@/models/employee-list.model';
import { DraftInterPostingMasterDto, DraftInterPostingMasterWithDetailsDto, DraftInterPostingDetailDto } from '@/models/posting.model';
import { DraftPostingStatusOptions } from '@/models/enums';

@Component({
    selector: 'app-add-draft-inter-posting',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        InputTextModule,
        DatePickerModule,
        SelectModule,
        Toast
    ],
    providers: [MessageService],
    templateUrl: './add-draft-inter-posting.html',
    styleUrl: './add-draft-inter-posting.scss'
})
export class AddDraftInterPostingComponent implements OnInit {
    draftPostingDate: Date | null = null;
    draftPostingListNo = '';
    list: EmployeeList[] = [];
    selectedRows: EmployeeList[] = [];
    loading = false;
    saving = false;
    draftMastersList: DraftInterPostingMasterDto[] = [];
    loadingMasters = false;
    /** Edit mode: loaded draft id and data */
    editDraftId: number | null = null;
    editDraft: DraftInterPostingMasterWithDetailsDto | null = null;
    editDraftStatus = '';
    draftPostingStatusOptions = DraftPostingStatusOptions;

    constructor(
        private employeeListService: EmployeeListService,
        private postingService: PostingService,
        private sharedService: SharedService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.loadData();
        this.loadDraftMasters();
    }

    get isEditMode(): boolean {
        return this.editDraftId != null;
    }

    /** Display list: employees in add mode, draft details in edit mode. */
    get displayList(): (EmployeeList | DraftInterPostingDetailDto)[] {
        if (this.isEditMode && this.editDraft?.details) {
            return this.editDraft.details;
        }
        return this.list;
    }

    /** Save: create Draft Inter Posting (add) or update master (edit). */
    onSave(): void {
        if (!this.draftPostingDate) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select a date.' });
            return;
        }
        const dateStr = this.formatDateForApi(this.draftPostingDate);
        if (!dateStr) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Invalid date format.' });
            return;
        }

        if (!this.draftPostingListNo?.trim()) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please enter Draft Inter Posting List No.' });
            return;
        }

        const trimmedNo = this.draftPostingListNo.trim();
        const duplicate = this.draftMastersList.find(
            (m) => m.draftInterPostingNo?.toLowerCase() === trimmedNo.toLowerCase() && m.id !== this.editDraftId
        );
        if (duplicate) {
            this.messageService.add({ severity: 'warn', summary: 'Duplicate', detail: `Draft Inter Posting List No "${trimmedNo}" already exists.` });
            return;
        }

        if (this.isEditMode && this.editDraftId) {
            this.saving = true;
            this.postingService.updateDraftInterPosting(this.editDraftId, trimmedNo, dateStr, this.editDraftStatus).subscribe({
                next: (res: { statusCode?: number; description?: string }) => {
                    this.saving = false;
                    const ok = res?.statusCode === 200;
                    this.messageService.add({
                        severity: ok ? 'success' : 'warn',
                        summary: 'Update',
                        detail: res?.description ?? (ok ? 'Draft updated.' : 'Update failed.')
                    });
                    if (ok) {
                        this.onCancelEdit();
                        this.loadDraftMasters();
                    }
                },
                error: (err: { error?: { description?: string }; message?: string }) => {
                    this.saving = false;
                    this.messageService.add({ severity: 'error', summary: 'Update', detail: err?.error?.description ?? err?.message ?? 'Failed to update.' });
                }
            });
            return;
        }

        const employeeIds = this.selectedRows?.map((r) => r.employeeID) ?? [];
        if (employeeIds.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select at least one employee from the table.' });
            return;
        }

        const createdBy = this.sharedService.getCurrentUser() ?? 'system';
        this.saving = true;
        this.postingService.saveDraftInterPosting(trimmedNo, dateStr, employeeIds, createdBy).subscribe({
            next: (res: { statusCode?: number; description?: string }) => {
                this.saving = false;
                const ok = res?.statusCode === 200;
                this.messageService.add({
                    severity: ok ? 'success' : 'warn',
                    summary: 'Save',
                    detail: res?.description ?? (ok ? 'Draft Inter Posting saved.' : 'Save failed.')
                });
                if (ok) {
                    this.loadData();
                    this.loadDraftMasters();
                    this.selectedRows = [];
                    this.draftPostingDate = null;
                    this.draftPostingListNo = '';
                }
            },
            error: (err: { error?: { description?: string }; message?: string }) => {
                this.saving = false;
                this.messageService.add({ severity: 'error', summary: 'Save', detail: err?.error?.description ?? err?.message ?? 'Failed to save.' });
            }
        });
    }

    loadDraftMasters(): void {
        this.loadingMasters = true;
        this.postingService.getDraftInterPostingMasters().subscribe({
            next: (data: DraftInterPostingMasterDto[]) => {
                this.draftMastersList = data ?? [];
                this.loadingMasters = false;
            },
            error: () => {
                this.loadingMasters = false;
            }
        });
    }

    formatDateForApi(d: Date | null): string | null {
        if (!d) return null;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    loadData(): void {
        this.loading = true;
        this.employeeListService.getServingEmployeesAvailableForPosting().subscribe({
            next: (data) => {
                this.list = data ?? [];
                this.loading = false;
            },
            error: (err) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message ?? 'Failed to load serving employees' });
                this.loading = false;
            }
        });
    }

    onAddAll(): void {
        if (this.list.length === 0) {
            this.messageService.add({ severity: 'info', summary: 'Select All', detail: 'No employees available to select.' });
            return;
        }
        this.selectedRows = [...this.list];
        this.messageService.add({ severity: 'success', summary: 'Select All', detail: `${this.list.length} employee(s) selected.` });
    }

    onEditDraft(row: DraftInterPostingMasterDto): void {
        this.loading = true;
        this.postingService.getDraftInterPostingById(row.id).subscribe({
            next: (data: DraftInterPostingMasterWithDetailsDto) => {
                this.editDraft = data;
                this.editDraftId = data.id;
                this.draftPostingListNo = data.draftInterPostingNo ?? '';
                this.draftPostingDate = data.draftInterPostingDate ? this.parseDateFromApi(data.draftInterPostingDate) : null;
                this.editDraftStatus = data.draftInterPostingStatus ?? '';
                this.loading = false;
            },
            error: (err: { error?: { description?: string }; message?: string }) => {
                this.loading = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Edit',
                    detail: err?.error?.description ?? err?.message ?? 'Failed to load draft.'
                });
            }
        });
    }

    onCancelEdit(): void {
        this.editDraftId = null;
        this.editDraft = null;
        this.editDraftStatus = '';
        this.draftPostingDate = null;
        this.draftPostingListNo = '';
        this.selectedRows = [];
        this.loadData();
    }

    parseDateFromApi(value: string): Date | null {
        if (!value?.trim()) return null;
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
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

    getDraftPostingStatusLabel(value: string | null | undefined): string {
        if (value == null || value === '') return '-';
        const opt = this.draftPostingStatusOptions.find((o) => o.value === value);
        return opt?.label ?? value;
    }
}
