import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { NotesheetSignatoryComponent } from '@/Components/Common/notesheet-signatory/notesheet-signatory';
import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { NotesheetPreviewBase } from '../notesheet-preview-base';
import { NoteSheetCurrentStatus, NoteSheetOperationTypeOptions } from '@/models/enums';
import { environment } from '@/Core/Environments/environment';
import { forkJoin } from 'rxjs';

@Component({
    selector: 'app-notesheet-preview-general',
    standalone: true,
    imports: [
        CommonModule, FormsModule, ButtonModule, ToastModule, TooltipModule,
        InputTextModule, TextareaModule, SelectModule, MultiSelectModule, DatePickerModule,
        NotesheetSignatoryComponent, RichEditorComponent, FileReferencesFormComponent
    ],
    providers: [MessageService],
    templateUrl: './notesheet-preview-general.html',
    styleUrl: '../notesheet-preview.scss'
})
export class NotesheetPreviewGeneralComponent extends NotesheetPreviewBase {

    @ViewChild('fileReferencesForm') fileReferencesForm!: FileReferencesFormComponent;

    // ── Edit state ───────────────────────────────────────────
    editing = false;
    saving = false;

    // ── Employee dropdown options ────────────────────────────
    employeeOptions: { label: string; value: number }[] = [];

    // ── Edit model fields ────────────────────────────────────
    editSubject = '';
    editReferenceNumber = '';
    editMainText = '';
    editNote = '';
    editNoteSheetDate: Date | null = null;
    editInitiatorId: number | null = null;
    editRecommenderIds: number[] = [];
    editFinalApproverId: number | null = null;
    editTextType: string = 'en';
    editOperationType: string | null = null;

    // ── Dropdown options ─────────────────────────────────────
    textTypeOptions = [
        { label: 'English', value: 'en' },
        { label: 'Bangla', value: 'bn' }
    ];
    readonly operationTypeOptions = NoteSheetOperationTypeOptions;

    // ── File references ──────────────────────────────────────
    fileRows: FileRowData[] = [];

    // ── Computed ─────────────────────────────────────────────
    get canEdit(): boolean {
        const status = this.noteSheet?.currentStatus?.toLowerCase();
        return status === NoteSheetCurrentStatus.Draft || status === NoteSheetCurrentStatus.Initiator;
    }

    get isDraftStatus(): boolean {
        return this.noteSheet?.currentStatus?.toLowerCase() === NoteSheetCurrentStatus.Draft;
    }

    get isInitiatorStatus(): boolean {
        return this.noteSheet?.currentStatus?.toLowerCase() === NoteSheetCurrentStatus.Initiator;
    }

    // ── Toggle edit mode ─────────────────────────────────────
    toggleEdit(): void {
        if (!this.noteSheet) return;
        this.editing = true;
        this.editSubject = this.noteSheet.subject ?? '';
        this.editReferenceNumber = this.noteSheet.referenceNumber ?? '';
        this.editMainText = this.noteSheet.mainText ?? '';
        this.editNote = this.noteSheet.note ?? '';
        this.editNoteSheetDate = this.noteSheet.noteSheetDate ? new Date(this.noteSheet.noteSheetDate) : null;
        this.editInitiatorId = this.noteSheet.initiatorId ?? null;
        this.editRecommenderIds = this.parseRecommenderIds();
        this.editFinalApproverId = (this.noteSheet.finalApprovalId && this.noteSheet.finalApprovalId > 0)
            ? this.noteSheet.finalApprovalId
            : (this.noteSheet.finalApproverId && this.noteSheet.finalApproverId > 0 ? this.noteSheet.finalApproverId : null);

        this.editTextType = (this.noteSheet.textType ?? 0) === 1 ? 'bn' : 'en';
        this.editOperationType = this.noteSheet.noteSheetOperationType ?? null;

        // Parse existing file references
        this.fileRows = this.parseFileReferences();

        if (this.employeeOptions.length === 0) {
            this.loadEmployeeOptions();
        }
    }

    cancelEdit(): void {
        this.editing = false;
        this.fileRows = [];
    }

    // ── File references handlers ─────────────────────────────
    onFileRowsChange(event: FileRowData[]): void {
        if (event && Array.isArray(event)) {
            this.fileRows = event;
        }
    }

    onDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download file.' })
        });
    }

    // ── Load employee dropdown options ───────────────────────
    loadEmployeeOptions(): void {
        const api = `${environment.apis.core}/EmployeeInfo`;
        this.http.get<any[]>(`${api}/GetAll`).subscribe({
            next: (list) => {
                this.employeeOptions = (Array.isArray(list) ? list : []).map((e: any) => {
                    const name = e.fullNameEN || e.FullNameEN || '';
                    const rabId = e.rabid || e.Rabid || e.RABID || '';
                    const serviceId = e.serviceId || e.ServiceId || '';
                    const parts = [name, rabId ? `RAB: ${rabId}` : '', serviceId ? `SVC: ${serviceId}` : ''].filter(Boolean);
                    return {
                        label: parts.join(' | ') || `ID ${e.employeeID ?? e.EmployeeID}`,
                        value: e.employeeID ?? e.EmployeeID
                    };
                });
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load employee list.' });
            }
        });
    }

    // ── Save changes ─────────────────────────────────────────
    saveChanges(): void {
        if (!this.noteSheet || this.saving) return;
        this.saving = true;

        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const doSave = (filesReferencesJson: string | null) => {
            const recommendersJson = this.buildRecommendersJson();
            const now = new Date().toISOString();

            const payload: Record<string, unknown> = {
                ...this.noteSheet,
                subject: this.editSubject,
                referenceNumber: this.editReferenceNumber,
                mainText: this.editMainText,
                note: this.editNote || null,
                textType: this.editTextType === 'bn' ? 1 : 0,
                noteSheetOperationType: this.editOperationType,
                noteSheetDate: this.editNoteSheetDate ? this.formatDateOnly(this.editNoteSheetDate) : this.noteSheet!.noteSheetDate,
                initiatorId: this.editInitiatorId ?? 0,
                recommendersJson,
                finalApprovalId: this.editFinalApproverId ?? null,
                lastUpdatedBy: this.noteSheet!.lastUpdatedBy ?? this.noteSheet!.createdBy ?? 'system',
                lastupdate: now
            };

            if (filesReferencesJson != null && filesReferencesJson !== '') {
                payload['filesReferences'] = filesReferencesJson;
            }

            this.http.post(`${this.api}/UpdateAsyn`, payload).subscribe({
                next: () => {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Note-sheet updated successfully.' });
                    this.editing = false;
                    this.saving = false;
                    this.fileRows = [];
                    this.reloadNoteSheet();
                },
                error: () => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update note-sheet.' });
                    this.saving = false;
                }
            });
        };

        // Upload new files first, then save
        if (filesToUpload.length > 0) {
            const uploads = filesToUpload.map((r: FileRowData) =>
                this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name)
            );
            forkJoin(uploads).subscribe({
                next: (results: unknown) => {
                    const resultsArray = Array.isArray(results) ? results : [];
                    const newRefs = (resultsArray as { fileId: number; fileName: string }[]).map(r => ({ FileId: r.fileId, fileName: r.fileName }));
                    const allRefs = [
                        ...existingRefs.map(r => ({ FileId: r.FileId, fileName: r.fileName })),
                        ...newRefs
                    ];
                    doSave(allRefs.length > 0 ? JSON.stringify(allRefs) : null);
                },
                error: () => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to upload files.' });
                    this.saving = false;
                }
            });
            return;
        }

        const filesReferencesJson = existingRefs.length > 0 ? JSON.stringify(existingRefs) : null;
        doSave(filesReferencesJson);
    }

    // ── Reload notesheet after save ──────────────────────────
    private reloadNoteSheet(): void {
        if (!this.noteSheetId) return;
        this.initiatorDetails = null;
        this.approversDetails = [];
        this.preparedByDetails = null;
        this.loadNoteSheet();
    }

    // ── Parse file references from noteSheet ─────────────────
    private parseFileReferences(): FileRowData[] {
        const json = this.noteSheet?.filesReferences;
        if (!json || typeof json !== 'string') return [];
        try {
            const refs = JSON.parse(json) as { FileId?: number; fileId?: number; fileName?: string; FileName?: string }[];
            return Array.isArray(refs)
                ? refs.map(r => ({
                    displayName: r.fileName ?? r.FileName ?? '',
                    file: null,
                    fileId: r.FileId ?? r.fileId
                }))
                : [];
        } catch {
            return [];
        }
    }

    // ── Parse recommender IDs from JSON ──────────────────────
    private parseRecommenderIds(): number[] {
        if (!this.noteSheet) return [];
        const rawJson = this.noteSheet.recommendersJson ?? this.noteSheet.recommenderIdsJson;
        if (!rawJson || typeof rawJson !== 'string') return [];
        try {
            const arr = JSON.parse(rawJson);
            if (!Array.isArray(arr) || arr.length === 0) return [];
            if (typeof arr[0] === 'object' && arr[0] !== null) {
                return arr.map((r: any) => r.recomender_id ?? r.recomenderId ?? r.RecomenderId).filter(Boolean);
            }
            return arr.filter((x: any) => typeof x === 'number');
        } catch {
            return [];
        }
    }

    // ── Build recommenders JSON from selected IDs ────────────
    private buildRecommendersJson(): string | null {
        if (!this.editRecommenderIds || this.editRecommenderIds.length === 0) return null;

        let existingMap: Record<number, any> = {};
        if (this.noteSheet?.recommendersJson) {
            try {
                const arr = JSON.parse(this.noteSheet.recommendersJson);
                if (Array.isArray(arr)) {
                    arr.forEach((r: any) => {
                        const id = r.recomender_id ?? r.recomenderId;
                        if (id) existingMap[id] = r;
                    });
                }
            } catch { /* ignore */ }
        }

        return JSON.stringify(this.editRecommenderIds.map((id, idx) => {
            const existing = existingMap[id];
            return {
                recomender_no: idx + 1,
                recomender_id: id,
                recomender_status: existing?.recomender_status ?? 'pending',
                recomender_approve_remark: existing?.recomender_approve_remark ?? '',
                recomender_cancel_remark: existing?.recomender_cancel_remark ?? '',
                recomender_approved_date: existing?.recomender_approved_date ?? null
            };
        }));
    }

    // ── Format Date as yyyy-MM-dd for backend DateOnly ───────
    private formatDateOnly(d: Date): string {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
}
