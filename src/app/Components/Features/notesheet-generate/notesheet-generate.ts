import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
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
import { DialogModule } from 'primeng/dialog';
import { CommonCode } from '@/Components/basic-setup/shared/models/common-code';
import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { EmpService } from '@/services/emp-service';
import { ActivatedRoute, Router } from '@angular/router';
import { take, map } from 'rxjs/operators';
import { NoteSheetEditCacheService } from '@/services/note-sheet-edit-cache.service';

@Component({
    selector: 'app-notesheet-generate',
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
        DialogModule,
        FileReferencesFormComponent
    ],
    templateUrl: './notesheet-generate.html',
    providers: [MessageService],
    styleUrl: './notesheet-generate.scss'
})
export class NotesheetGenerateComponent implements OnInit {
    title = '1 (a) System Generated Note-Sheet (Approved by System)';
    form!: FormGroup;
    isSubmitting = false;
    /** Edit mode: load by id from query param and submit as UpdateAsyn */
    editMode = false;
    editId: number | null = null;
    /** When editing, keep original preparer (CreatedBy) so draft→approved does not change it */
    originalCreatedBy: string | null = null;
    textTypeOptions = [
        { label: 'English', value: 'en' },
        { label: 'Bangla', value: 'bn' }
    ];
    /** Options with both EN and BN labels; display getters pick by textType. */
    unitOptions: { label: string; labelBn: string | null; value: number }[] = [];
    wingOptions: { label: string; labelBn: string | null; value: number }[] = [];
    branchOptions: { label: string; labelBn: string | null; value: number }[] = [];
    initiatorOptions: { label: string; labelBn: string | null; value: number }[] = [];
    recommenderOptions: { label: string; labelBn: string | null; value: number }[] = [];
    finalApproverOptions: { label: string; labelBn: string | null; value: number }[] = [];
    /** Supporting documents – stored in NoteSheetInfo.FilesReferences (JSON array of { FileId, fileName }). */
    fileRows: FileRowData[] = [];
    showPreviewDialog = false;
    /** Initiator details (show on right, below main text). */
    initiatorDetails: { step: string; name: string; rabId: string; rank: string; serviceRank: string } | null = null;
    /** Approvers on left: Recommender(s) + Final Approver (dynamic). */
    approversDetails: { step: string; name: string; rabId: string; rank: string; serviceRank: string }[] = [];

    @ViewChild('fileReferencesForm') fileReferencesForm!: FileReferencesFormComponent;

    constructor(
        private masterBasicSetupService: MasterBasicSetupService,
        private messageService: MessageService,
        private fb: FormBuilder,
        private sharedService: SharedService,
        private http: HttpClient,
        private empService: EmpService,
        private route: ActivatedRoute,
        private router: Router,
        private sanitizer: DomSanitizer,
        private noteSheetEditCache: NoteSheetEditCacheService
    ) {
        this.form = this.fb.group({
            noteSheetTemplateId: [null as number | null],
            draftPostingListNo: [''],
            textType: ['en'],
            noteSheetDate: [null as Date | null, Validators.required],
            unitId: [null as number | null],
            wingBattalionId: [null as number | null],
            branchId: [null as number | null],
            referenceNumber: [''],
            noteSheetNo: [''],
            subject: ['', Validators.required],
            mainText: [''], // Rich editor (HTML)
            preparedBy: [''],
            initiatorId: [null as number | null],
            recommenderIds: [[] as number[]],
            finalApproverId: [null as number | null]
        });
    }

    ngOnInit(): void {
        this.loadUnits();
        this.loadBranches();
        this.loadApproverOptions();
        const user = this.sharedService.getCurrentUser?.() ?? '';
        this.form.get('preparedBy')?.setValue(user);
        this.route.queryParams.pipe(take(1)).subscribe((params) => {
            const id = params['id'];
            if (id != null && id !== '') {
                const numId = Number(id);
                if (!isNaN(numId) && numId > 0) {
                    this.editId = numId;
                    this.editMode = true;
                    this.title = 'Update Draft Note-Sheet';
                    this.loadNoteSheetForEdit(numId);
                }
            }
        });
    }

    /** Load single note-sheet and patch form (edit mode). Uses cache from draft list when available. */
    private loadNoteSheetForEdit(noteSheetId: number): void {
        const user = this.sharedService.getCurrentUser?.() ?? '';
        const cached = this.noteSheetEditCache.get(noteSheetId);
        if (cached != null && typeof cached === 'object') {
            const d = cached;
            if (d.noteSheetTypeId === 3 || d.NoteSheetTypeId === 3) {
                this.noteSheetEditCache.set(noteSheetId, d);
                this.router.navigate(['/notesheet-ex-bd-leave'], { queryParams: { id: noteSheetId } });
                return;
            }
            this.applyCachedNoteSheetToForm(d, user);
            return;
        }
        const api = `${environment.apis.core}/NoteSheetInfo`;
        this.http.get<any>(`${api}/GetFilteredByKeysAsyn/${noteSheetId}`).subscribe({
            next: (data) => {
                const raw = data != null && typeof data === 'object' ? (data.data ?? data.value ?? data) : data;
                const list = Array.isArray(raw) ? raw : raw != null && typeof raw === 'object' && !Array.isArray(raw) ? [raw] : [];
                const row = list[0];
                if (!row) return;
                const d = row;
                if (d.noteSheetTypeId === 3 || d.NoteSheetTypeId === 3) {
                    this.router.navigate(['/notesheet-ex-bd-leave'], { queryParams: { id: noteSheetId } });
                    return;
                }
                this.applyCachedNoteSheetToForm(d, user);
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load note-sheet for edit.' })
        });
    }

    private applyCachedNoteSheetToForm(d: any, user: string): void {
        this.originalCreatedBy = d.createdBy ?? d.CreatedBy ?? d.lastUpdatedBy ?? d.LastUpdatedBy ?? user ?? null;
        const noteSheetDate = (d.noteSheetDate ?? d.NoteSheetDate) != null ? this.parseDate(d.noteSheetDate ?? d.NoteSheetDate) : null;
        let recommenderIds: number[] = [];
        const recommenderIdsJson = d.recommenderIdsJson ?? d.RecommenderIdsJson;
        if (recommenderIdsJson && typeof recommenderIdsJson === 'string') {
            try {
                const arr = JSON.parse(recommenderIdsJson);
                recommenderIds = Array.isArray(arr) ? arr : [];
            } catch {}
        }
        this.form.patchValue({
            noteSheetTemplateId: d.noteSheetTemplateId ?? d.NoteSheetTemplateId ?? null,
            draftPostingListNo: String(d.draftPostingListNo ?? d.DraftPostingListNo ?? ''),
            textType: (d.textType ?? d.TextType) === 1 ? 'bn' : 'en',
            noteSheetDate,
            unitId: d.unitId ?? d.UnitId ?? null,
            wingBattalionId: d.wingBattalionId ?? d.WingBattalionId ?? null,
            branchId: d.branchId ?? d.BranchId ?? null,
            referenceNumber: String(d.referenceNumber ?? d.ReferenceNumber ?? ''),
            noteSheetNo: String(d.noteSheetNo ?? d.NoteSheetNo ?? ''),
            subject: String(d.subject ?? d.Subject ?? ''),
            mainText: String(d.mainText ?? d.MainText ?? ''),
            preparedBy: d.createdBy ?? d.CreatedBy ?? d.lastUpdatedBy ?? d.LastUpdatedBy ?? user,
            initiatorId: d.initiatorId ?? d.InitiatorId ?? null,
            recommenderIds,
            finalApproverId: d.finalApproverId ?? d.FinalApproverId ?? null
        });
        if (d.createdBy ?? d.CreatedBy) this.form.get('preparedBy')?.setValue(d.createdBy ?? d.CreatedBy);
        const unitId = d.unitId ?? d.UnitId;
        if (unitId) {
            this.masterBasicSetupService.getByParentId(unitId).subscribe({
                next: (list) => {
                    this.wingOptions = (Array.isArray(list) ? list : []).map((c: CommonCode) => ({
                        label: c.codeValueEN || c.codeValueBN || String(c.codeId),
                        labelBn: c.codeValueBN ?? null,
                        value: c.codeId
                    }));
                    this.form.patchValue({ wingBattalionId: d.wingBattalionId ?? d.WingBattalionId ?? null });
                },
                error: () => {}
            });
        }
        const filesReferences = d.filesReferences ?? d.FilesReferences;
        if (filesReferences && typeof filesReferences === 'string') {
            try {
                const refs = JSON.parse(filesReferences) as { FileId?: number; fileId?: number; fileName?: string; FileName?: string }[];
                this.fileRows = Array.isArray(refs)
                    ? refs.map((r) => ({
                          displayName: r.fileName ?? r.FileName ?? '',
                          file: null,
                          fileId: r.FileId ?? r.fileId
                      }))
                    : [];
            } catch {}
        }
    }

    private parseDate(value: string | Date): Date | null {
        if (value instanceof Date) return value;
        if (typeof value !== 'string') return null;
        const dt = new Date(value);
        return isNaN(dt.getTime()) ? null : dt;
    }

    loadUnits(): void {
        this.masterBasicSetupService.getAllByType('RabUnit').subscribe({
            next: (list) => {
                this.unitOptions = (Array.isArray(list) ? list : []).map((c: CommonCode) => ({
                    label: c.codeValueEN || c.codeValueBN || String(c.codeId),
                    labelBn: c.codeValueBN ?? null,
                    value: c.codeId
                }));
            },
            error: () => {}
        });
    }

    onUnitChange(): void {
        const unitId = this.form.get('unitId')?.value;
        this.form.patchValue({ wingBattalionId: null });
        this.wingOptions = [];
        if (unitId) {
            this.masterBasicSetupService.getByParentId(unitId).subscribe({
                next: (list) => {
                    this.wingOptions = (Array.isArray(list) ? list : []).map((c: CommonCode) => ({
                        label: c.codeValueEN || c.codeValueBN || String(c.codeId),
                        labelBn: c.codeValueBN ?? null,
                        value: c.codeId
                    }));
                },
                error: () => {}
            });
        }
    }

    loadBranches(): void {
        this.masterBasicSetupService.getAllByType('RabBranch').subscribe({
            next: (list) => {
                this.branchOptions = (Array.isArray(list) ? list : []).map((c: CommonCode) => ({
                    label: c.codeValueEN || c.codeValueBN || String(c.codeId),
                    labelBn: c.codeValueBN ?? null,
                    value: c.codeId
                }));
            },
            error: () => {}
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

    /** Whether Note-Sheet Text Type is Bangla (show all labels/options in Bangla). */
    get isBangla(): boolean {
        return this.form?.get('textType')?.value === 'bn';
    }

    get unitOptionsDisplay(): { label: string; value: number }[] {
        return this.unitOptions.map((o) => ({ label: this.isBangla && o.labelBn ? o.labelBn : o.label, value: o.value }));
    }
    get wingOptionsDisplay(): { label: string; value: number }[] {
        return this.wingOptions.map((o) => ({ label: this.isBangla && o.labelBn ? o.labelBn : o.label, value: o.value }));
    }
    get branchOptionsDisplay(): { label: string; value: number }[] {
        return this.branchOptions.map((o) => ({ label: this.isBangla && o.labelBn ? o.labelBn : o.label, value: o.value }));
    }
    get initiatorOptionsDisplay(): { label: string; value: number }[] {
        return this.initiatorOptions.map((o) => ({ label: this.isBangla && o.labelBn ? o.labelBn : o.label, value: o.value }));
    }
    get recommenderOptionsDisplay(): { label: string; value: number }[] {
        return this.recommenderOptions.map((o) => ({ label: this.isBangla && o.labelBn ? o.labelBn : o.label, value: o.value }));
    }
    get finalApproverOptionsDisplay(): { label: string; value: number }[] {
        return this.finalApproverOptions.map((o) => ({ label: this.isBangla && o.labelBn ? o.labelBn : o.label, value: o.value }));
    }

    onTextTypeChange(): void {
        // No template; main text is entered manually. Language switch refreshes labels via getters.
    }

    /** Returns names of selected recommenders (shown when assigned); respects text type (Bangla/English). */
    getSelectedRecommenderNames(): string[] {
        const ids = this.form.get('recommenderIds')?.value as number[] | null;
        if (!Array.isArray(ids) || ids.length === 0) return [];
        return ids
            .map((id) => {
                const o = this.recommenderOptions.find((op) => op.value === id);
                return o ? (this.isBangla && o.labelBn ? o.labelBn : o.label) : '';
            })
            .filter((l) => !!l);
    }

    /** Open preview dialog with all form data. Load approval chain (initiator right, approvers left). */
    openPreview(): void {
        this.initiatorDetails = null;
        this.approversDetails = [];
        this.showPreviewDialog = true;
        this.loadPreviewApprovalChain();
    }

    /** Load approval chain for preview: Initiator (right), Recommender(s) + Final Approver (left). */
    private loadPreviewApprovalChain(): void {
        const initiatorId = this.form.get('initiatorId')?.value as number | null;
        const recommenderIds = (this.form.get('recommenderIds')?.value as number[]) ?? [];
        const finalApproverId = this.form.get('finalApproverId')?.value as number | null;
        const approverIds: { empId: number; step: string }[] = [];
        recommenderIds.forEach((id, i) => {
            if (id && id > 0) approverIds.push({ empId: id, step: `Recommender ${recommenderIds.length > 1 ? i + 1 : ''}`.trim() });
        });
        if (finalApproverId && finalApproverId > 0) approverIds.push({ empId: finalApproverId, step: 'Final Approver' });
        const allIds = [...(initiatorId && initiatorId > 0 ? [{ empId: initiatorId, step: 'Initiator' }] : []), ...approverIds];
        if (allIds.length === 0) return;
        const obs = allIds.map(({ empId, step }) =>
            this.empService.getEmployeeSearchInfo(empId).pipe(
                map((info) => {
                    const name = info?.fullNameEN ?? info?.FullNameEN ?? '-';
                    const rabId = info?.rabID ?? info?.RABID ?? '-';
                    const rank = info?.rank ?? info?.Rank ?? '-';
                    return { step, name, rabId, rank, serviceRank: rank };
                })
            )
        );
        forkJoin(obs).subscribe({
            next: (results) => {
                this.initiatorDetails = initiatorId && initiatorId > 0 ? results[0] ?? null : null;
                this.approversDetails = approverIds.length > 0 ? results.slice(initiatorId && initiatorId > 0 ? 1 : 0) : [];
            },
            error: () => {}
        });
    }

    /** Whether preview is in English (textType en = English). */
    isPreviewEnglish(): boolean {
        return this.form.get('textType')?.value !== 'bn';
    }

    /** Sanitized main text for preview. */
    getPreviewMainTextSafe(): SafeHtml {
        const html = this.form.get('mainText')?.value ?? '';
        return this.sanitizer.bypassSecurityTrustHtml(html || '');
    }

    getInitiatorName(): string {
        const id = this.form.get('initiatorId')?.value;
        if (id == null) return '';
        const opt = this.initiatorOptions.find((o) => o.value === id);
        return opt?.label ?? '';
    }

    getFinalApproverName(): string {
        const id = this.form.get('finalApproverId')?.value;
        if (id == null) return '';
        const opt = this.finalApproverOptions.find((o) => o.value === id);
        return opt?.label ?? '';
    }

    formatPreviewDate(): string {
        const d = this.form.get('noteSheetDate')?.value;
        if (!d) return '—';
        try {
            const dt = d instanceof Date ? d : new Date(d);
            return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch {
            return '—';
        }
    }

    /** Returns list of Supporting Documents file names for preview. */
    getSupportingDocumentsList(): string[] {
        if (!Array.isArray(this.fileRows) || this.fileRows.length === 0) return [];
        return this.fileRows
            .map((r) => r.displayName?.trim() || r.file?.name || '')
            .filter((n) => n.length > 0);
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

    submit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please fill required fields.' });
            return;
        }
        this.isSubmitting = true;
        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const doSave = (filesReferencesJson: string | null) => {
            try {
                const payload = this.buildNoteSheetInfoPayload(filesReferencesJson);
                if (this.editMode && this.editId != null) {
                    (payload as any).noteSheetId = this.editId;
                }
                const api = `${environment.apis.core}/NoteSheetInfo`;
                if (!api || api.endsWith('/')) {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'API URL is not configured. Check environment.' });
                    this.isSubmitting = false;
                    return;
                }
                const endpoint = this.editMode && this.editId != null ? '/UpdateAsyn' : '/SaveAsyn';
                this.http.post(api + endpoint, payload).subscribe({
                    next: () => {
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Note Sheet',
                            detail: this.editMode ? 'Note Sheet updated successfully.' : 'Note Sheet generated successfully.'
                        });
                        this.isSubmitting = false;
                        if (this.editMode) this.router.navigate(['/notesheet-list/draft']);
                    },
                    error: (err) => {
                        if (err?.status === 400 && err?.error) {
                            console.error('NoteSheet 400 response:', err.error);
                        }
                        const detail = this.getApiErrorMessage(err);
                        this.messageService.add({ severity: 'error', summary: 'Error', detail });
                        this.isSubmitting = false;
                    }
                });
            } catch (e) {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: e instanceof Error ? e.message : 'Failed to build or send request.' });
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
            return 'Cannot reach server. Check that the API is running at ' + (environment?.apis?.core ?? '') + ' and CORS is allowed.';
        const body = err?.error;
        if (!body) return err?.message || 'Failed to generate Note Sheet.';
        if (typeof body === 'string') return body;
        if (body.description) return body.description;
        if (body.message) return body.message;
        if (body.errors && typeof body.errors === 'object') {
            const parts = Object.entries(body.errors as Record<string, string[]>)
                .flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((s: string) => `${k}: ${s}`));
            if (parts.length) return parts.join(' ');
        }
        return body.title || 'Failed to generate Note Sheet.';
    }

    /** Returns "yyyy-MM-dd" for backend DateOnly; never null (backend model is non-nullable). */
    private formatNoteSheetDate(value: Date | string | null | undefined): string {
        if (value instanceof Date) {
            const y = value.getFullYear(), m = value.getMonth(), d = value.getDate();
            return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))
            return value.slice(0, 10);
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    private buildNoteSheetInfoPayload(filesReferencesJson?: string | null): any {
        const d = this.form.getRawValue();
        const dateStr = this.formatNoteSheetDate(d.noteSheetDate);
        const now = new Date().toISOString();
        const preparedBy = (d.preparedBy && String(d.preparedBy).trim()) || 'system';
        // When editing, never change the original preparer (CreatedBy); only lastUpdatedBy reflects who saved
        const createdBy = this.editMode && this.originalCreatedBy ? this.originalCreatedBy : preparedBy;
        const lastUpdatedBy = preparedBy;
        const payload: Record<string, unknown> = {
            noteSheetId: 0,
            noteSheetTypeId: 1,
            employeeId: 0,
            fileNumber: 0,
            noteSheetNo: (d.noteSheetNo && String(d.noteSheetNo).trim()) || 'AUTO',
            noteSheetDate: dateStr,
            subject: d.subject != null ? String(d.subject) : '',
            mainText: d.mainText != null ? String(d.mainText) : '',
            note: null,
            initiatorId: d.initiatorId ?? 0,
            initiatorStatus: false,
            initiatorComments: (d as any).initiatorComments?.trim() || '-', // [Required] does not allow empty string
            status: false,
            noteSheetStatusId: 1,
            currentApprovalStep: null,
            remark: null,
            createdBy,
            lastUpdatedBy,
            createdDate: now,
            lastupdate: now,
            noteSheetTemplateId: d.noteSheetTemplateId ?? null,
            draftPostingListNo: (d.draftPostingListNo && String(d.draftPostingListNo).trim()) || null,
            textType: d.textType === 'bn' ? 1 : 0,
            unitId: d.unitId ?? null,
            wingBattalionId: d.wingBattalionId ?? null,
            branchId: d.branchId ?? null,
            referenceNumber: d.referenceNumber != null ? String(d.referenceNumber) : null,
            preparedByEmployeeId: null,
            recommenderIdsJson: d.recommenderIds?.length ? JSON.stringify(d.recommenderIds) : null,
            finalApproverId: d.finalApproverId ?? null,
            familyInfoJson: null
        };
        if (filesReferencesJson != null && filesReferencesJson !== '') {
            payload['filesReferences'] = filesReferencesJson;
        }
        return payload;
    }
}
