import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { SharedService } from '@/shared/services/shared-service';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { FluidModule } from 'primeng/fluid';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { EditorModule } from 'primeng/editor';
import { ToastModule } from 'primeng/toast';
import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { EmpService } from '@/services/emp-service';
import { PostingService } from '@/services/posting.service';
import { NoteSheetType } from '@/models/enums';

@Component({
    selector: 'app-posting-notesheet-generate',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        FluidModule,
        InputTextModule,
        ButtonModule,
        SelectModule,
        MultiSelectModule,
        DatePickerModule,
        EditorModule,
        ToastModule,
        FileReferencesFormComponent
    ],
    templateUrl: './posting-notesheet-generate.html',
    providers: [MessageService],
    styleUrl: './posting-notesheet-generate.scss'
})
export class PostingNotesheetGenerateComponent implements OnInit {
    title = 'Generate New Posting Note-Sheet';
    form!: FormGroup;
    isSubmitting = false;
    textTypeOptions = [
        { label: 'English', value: 'en' },
        { label: 'Bangla', value: 'bn' }
    ];
    draftPostingOptions: { label: string; value: number }[] = [];
    loadingDraftList = false;
    initiatorOptions: { label: string; value: number }[] = [];
    recommenderOptions: { label: string; value: number }[] = [];
    finalApproverOptions: { label: string; value: number }[] = [];
    fileRows: FileRowData[] = [];

    @ViewChild('fileReferencesForm') fileReferencesForm!: FileReferencesFormComponent;

    constructor(
        private messageService: MessageService,
        private fb: FormBuilder,
        private sharedService: SharedService,
        private http: HttpClient,
        private empService: EmpService,
        private postingService: PostingService
    ) {
        this.form = this.fb.group({
            draftPostingMasterId: [null as number | null, Validators.required],
            textType: ['en'],
            noteSheetDate: [null as Date | null, Validators.required],
            referenceNumber: [''],
            mainText: [''],
            preparedBy: [''],
            initiatorId: [null as number | null],
            recommenderIds: [[] as number[]],
            finalApproverId: [null as number | null]
        });
    }

    ngOnInit(): void {
        this.loadDraftPostingMasters();
        this.loadApproverOptions();
        const user = this.sharedService.getCurrentUser?.() ?? '';
        this.form.get('preparedBy')?.setValue(user);
    }

    get isBangla(): boolean {
        return this.form?.get('textType')?.value === 'bn';
    }

    get initiatorOptionsDisplay(): { label: string; value: number }[] {
        return this.initiatorOptions.map((o) => ({
            label: this.isBangla ? (o as any).labelBn || o.label : o.label,
            value: o.value
        }));
    }
    get recommenderOptionsDisplay(): { label: string; value: number }[] {
        return this.recommenderOptions.map((o) => ({
            label: this.isBangla ? (o as any).labelBn || o.label : o.label,
            value: o.value
        }));
    }
    get finalApproverOptionsDisplay(): { label: string; value: number }[] {
        return this.finalApproverOptions.map((o) => ({
            label: this.isBangla ? (o as any).labelBn || o.label : o.label,
            value: o.value
        }));
    }

    loadDraftPostingMasters(): void {
        this.loadingDraftList = true;
        this.postingService.getDraftNewPostingMasters().subscribe({
            next: (list) => {
                this.draftPostingOptions = (list ?? []).map((m) => ({
                    label: `${m.draftPostingNo} (${m.draftPostingDate})`,
                    value: m.id
                }));
                this.loadingDraftList = false;
            },
            error: () => {
                this.loadingDraftList = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load Draft Posting list.' });
            }
        });
    }

    loadApproverOptions(): void {
        const api = `${environment.apis.core}/EmployeeInfo`;
        this.http.get<any[]>(`${api}/GetAll`).subscribe({
            next: (list) => {
                const opts = (Array.isArray(list) ? list : []).map((e: any) => ({
                    label: e.fullNameEN || e.FullNameEN || e.rabid || e.Rabid || `ID ${e.employeeID ?? e.EmployeeID}`,
                    labelBn: e.fullNameBN || e.FullNameBN || null,
                    value: e.employeeID ?? e.EmployeeID
                }));
                this.initiatorOptions = opts;
                this.recommenderOptions = opts;
                this.finalApproverOptions = opts;
            },
            error: () => {}
        });
    }

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

    private resetForm(): void {
        const user = this.sharedService.getCurrentUser?.() ?? '';
        this.form.reset({
            draftPostingMasterId: null,
            textType: 'en',
            noteSheetDate: null,
            referenceNumber: '',
            mainText: '',
            preparedBy: user,
            initiatorId: null,
            recommenderIds: [],
            finalApproverId: null
        });
        this.fileRows = [];
    }

    submit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Draft Posting List and Date.' });
            return;
        }
        this.isSubmitting = true;
        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const doSave = (filesReferencesJson: string | null) => {
            try {
                const payload = this.buildPayload(filesReferencesJson);
                const api = `${environment.apis.core}/NoteSheetInfo`;
                const endpoint = '/SaveAsyn';
                this.http.post(api + endpoint, payload).subscribe({
                    next: () => {
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Note Sheet',
                            detail: 'Note Sheet generated successfully.'
                        });
                        this.isSubmitting = false;
                        this.resetForm();
                    },
                    error: (err) => {
                        if (err?.status === 400 || err?.status === 500) {
                            console.error('NoteSheet API error:', err?.status, err?.error);
                        }
                        const detail = this.getApiErrorMessage(err);
                        this.messageService.add({ severity: 'error', summary: 'Error', detail });
                        this.isSubmitting = false;
                    }
                });
            } catch (e) {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: e instanceof Error ? e.message : 'Failed to save.' });
                this.isSubmitting = false;
            }
        };

        if (filesToUpload.length > 0) {
            const uploads = filesToUpload.map((r: FileRowData) =>
                this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name)
            );
            forkJoin(uploads).subscribe({
                next: (results: unknown) => {
                    const resultsArray = Array.isArray(results) ? results : [];
                    const newRefs = (resultsArray as { fileId: number; fileName: string }[]).map((r) => ({ FileId: r.fileId, fileName: r.fileName }));
                    const allRefs: { FileId: number; fileName: string }[] = [
                        ...existingRefs.map((r) => ({ FileId: r.FileId, fileName: r.fileName })),
                        ...newRefs
                    ];
                    const filesReferencesJson = allRefs.length > 0 ? JSON.stringify(allRefs) : null;
                    doSave(filesReferencesJson);
                },
                error: () => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to upload one or more files.' });
                    this.isSubmitting = false;
                }
            });
            return;
        }
        const filesReferencesJson = existingRefs.length > 0 ? JSON.stringify(existingRefs) : null;
        doSave(filesReferencesJson);
    }

    private getApiErrorMessage(err: any): string {
        if (err?.status === 0 || err?.message === 'Http failure response')
            return 'Cannot reach server.';
        const body = err?.error;
        if (!body) return err?.message || 'Failed to generate Note Sheet.';
        if (typeof body === 'string') return body;
        if (body.description) return body.description;
        if (body.message) return body.message;
        return body.title || 'Failed to generate Note Sheet.';
    }

    private formatNoteSheetDate(value: Date | string | null | undefined): string {
        if (value instanceof Date) {
            const y = value.getFullYear(), m = value.getMonth(), d = value.getDate();
            return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    private buildPayload(filesReferencesJson?: string | null): any {
        const d = this.form.getRawValue();
        const dateStr = this.formatNoteSheetDate(d.noteSheetDate);
        const now = new Date().toISOString();
        const preparedBy = (d.preparedBy && String(d.preparedBy).trim()) || 'system';
        const selectedDraft = this.draftPostingOptions.find((o) => o.value === d.draftPostingMasterId);
        const subject = selectedDraft ? `New Posting - ${selectedDraft.label}` : 'New Posting Note-Sheet';
        const payload: Record<string, unknown> = {
            noteSheetId: 0,
            noteSheetTypeId: NoteSheetType.NewPosting,
            noteSheetType: 'NewPosting',
            employeeId: 0,
            fileNumber: 0,
            noteSheetNo: 'AUTO',
            noteSheetDate: dateStr,
            subject,
            mainText: d.mainText != null ? String(d.mainText) : '',
            note: null,
            initiatorId: d.initiatorId ?? 0,
            initiatorStatus: false,
            initiatorComments: '-',
            status: false,
            noteSheetStatusId: 1,
            currentApprovalStep: null,
            remark: null,
            createdBy: preparedBy,
            lastUpdatedBy: preparedBy,
            createdDate: now,
            lastupdate: now,
            noteSheetTemplateId: null,
            textType: d.textType === 'bn' ? 1 : 0,
            unitId: null,
            wingBattalionId: null,
            branchId: null,
            referenceNumber: d.referenceNumber != null ? String(d.referenceNumber) : null,
            preparedByEmployeeId: null,
            recommenderIdsJson: d.recommenderIds?.length ? JSON.stringify(d.recommenderIds) : null,
            finalApproverId: d.finalApproverId ?? null,
            familyInfoJson: null,
            draftPostingMasterId: d.draftPostingMasterId ?? null
        };
        if (filesReferencesJson != null && filesReferencesJson !== '') {
            payload['filesReferences'] = filesReferencesJson;
        }
        return payload;
    }
}
