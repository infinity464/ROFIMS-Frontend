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
import { DraftPostingMasterDto, DraftPostingMasterWithDetailsDto, DraftPostingDetailDto } from '@/models/posting.model';
import { DraftPostingStatusOptions, IsSendingNotesheetStatus } from '@/models/enums';

@Component({
    selector: 'app-add-draft-new-posting',
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
    templateUrl: './add-draft-new-posting.html',
    styleUrl: './add-draft-new-posting.scss'
})
export class AddDraftNewPostingComponent implements OnInit {
    draftPostingDate: Date | null = null;
    draftPostingListNo = '';
    list: EmployeeList[] = [];
    selectedRows: EmployeeList[] = [];
    loading = false;
    saving = false;
    draftMastersList: DraftPostingMasterDto[] = [];
    loadingMasters = false;
    /** Edit mode: loaded draft id and data */
    editDraftId: number | null = null;
    editDraft: DraftPostingMasterWithDetailsDto | null = null;
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
    get displayList(): (EmployeeList | DraftPostingDetailDto)[] {
        if (this.isEditMode && this.editDraft?.details) {
            return this.editDraft.details;
        }
        return this.list;
    }

    /** Save enabled: add mode when employees selected, edit mode always. */
    get isSaveEnabled(): boolean {
        if (this.isEditMode) return true;
        return (this.selectedRows?.length ?? 0) > 0;
    }

    /** Save: create Draft New Posting (add) or update master (edit). */
    onSave(): void {
        const dateStr = this.formatDateForApi(this.draftPostingDate);
        if (!dateStr) {
            this.messageService.add({ severity: 'warn', summary: 'Save', detail: 'Invalid date.' });
            return;
        }
        if (!this.draftPostingListNo?.trim()) {
            this.messageService.add({ severity: 'warn', summary: 'Save', detail: 'Enter Draft Posting List No.' });
            return;
        }

        if (this.isEditMode && this.editDraftId) {
            this.saving = true;
            this.postingService.updateDraftNewPosting(this.editDraftId, this.draftPostingListNo.trim(), dateStr, this.editDraftStatus).subscribe({
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
            this.messageService.add({ severity: 'warn', summary: 'Save', detail: 'Select at least one employee.' });
            return;
        }
        const createdBy = this.sharedService.getCurrentUser() ?? 'system';
        this.saving = true;
        this.postingService.saveDraftNewPosting(this.draftPostingListNo.trim(), dateStr, employeeIds, createdBy).subscribe({
            next: (res: { statusCode?: number; description?: string }) => {
                this.saving = false;
                const ok = res?.statusCode === 200;
                this.messageService.add({
                    severity: ok ? 'success' : 'warn',
                    summary: 'Save',
                    detail: res?.description ?? (ok ? 'Draft New Posting saved.' : 'Save failed.')
                });
                if (ok) {
                    this.loadData();
                    this.loadDraftMasters();
                    this.selectedRows = [];
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
        this.postingService.getDraftNewPostingMasters().subscribe({
            next: (data: DraftPostingMasterDto[]) => {
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
        this.employeeListService.getEmployeesByIsSendingNotesheetStatus(IsSendingNotesheetStatus.Draft).subscribe({
            next: (data) => {
                this.list = data ?? [];
                this.loading = false;
            },
            error: (err) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message ?? 'Failed to load draft list' });
                this.loading = false;
            }
        });
    }

    onAddAll(): void {
        this.messageService.add({ severity: 'info', summary: 'Add All', detail: 'Add All – under development' });
    }

    onEditDraft(row: DraftPostingMasterDto): void {
        this.loading = true;
        this.postingService.getDraftNewPostingById(row.id).subscribe({
            next: (data: DraftPostingMasterWithDetailsDto) => {
                this.editDraft = data;
                this.editDraftId = data.id;
                this.draftPostingListNo = data.draftPostingNo ?? '';
                this.draftPostingDate = data.draftPostingDate ? this.parseDateFromApi(data.draftPostingDate) : null;
                this.editDraftStatus = data.draftPostingStatus ?? '';
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

    /** Parse API date string (yyyy-MM-dd or ISO) to Date for p-datepicker. */
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
