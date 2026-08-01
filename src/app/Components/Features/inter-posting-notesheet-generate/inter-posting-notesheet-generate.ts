import { Component, OnInit, ViewChild , inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { FormBuilder, FormGroup, Validators, FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { SharedService } from '@/shared/services/shared-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { FluidModule } from 'primeng/fluid';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';
import { TextareaModule } from 'primeng/textarea';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { PanelModule } from 'primeng/panel';
import { ToastModule } from 'primeng/toast';
import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';
import { ActivatedRoute, Router } from '@angular/router';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { EmpService } from '@/services/emp-service';
import { PostingService } from '@/services/posting.service';
import { DraftInterPostingDetailDto, DraftInterPostingMasterDto } from '@/models/posting.model';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { NoteSheetEditCacheService } from '@/services/note-sheet-edit-cache.service';
import { NoteSheetType, NoteSheetOperationType, NoteSheetOperationTypeOptions, ApprovalStatus, CodeType } from '@/models/enums';
import { encodeNoteSheetId } from '@/shared/utils/notesheet-id-codec';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { NoteSheetSubjectService, NoteSheetSubjectModel } from '@/Components/basic-setup/shared/services/NoteSheetSubjectService';
import { NotesheetApproverSelectComponent } from '@/Components/Common/notesheet-approver-select/notesheet-approver-select';
import { NoteSheetNumberConfigModel } from '@/Components/basic-setup/shared/models/notesheet-number-config';

@Component({
    selector: 'app-inter-posting-notesheet-generate',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        FormsModule,
        FluidModule,
        InputTextModule,
        ButtonModule,
        SelectModule,
        MultiSelectModule,
        DatePickerModule, FlexibleDateDirective,
        RichEditorComponent,
        TextareaModule,
        ToastModule,
        CheckboxModule,
        DialogModule,
        TableModule,
        PanelModule,
        FileReferencesFormComponent,
        NotesheetApproverSelectComponent
    ],
    templateUrl: './inter-posting-notesheet-generate.html',
    providers: [MessageService],
    styleUrl: './inter-posting-notesheet-generate.scss'
})
export class InterPostingNotesheetGenerateComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    title = 'Generate Inter Posting Note-Sheet';
    form!: FormGroup;
    isSubmitting = false;
    editMode = false;
    editId: number | null = null;
    originalCreatedBy: string | null = null;
    originalSubject: string | null = null;
    textTypeOptions = [
        { label: 'English', value: 'en' },
        { label: 'Bangla', value: 'bn' }
    ];
    draftPostingOptions: { label: string; value: number }[] = [];
    loadingDraftList = false;
    /** Employees of the currently selected draft — shown in a collapsible preview under the form. */
    draftEmployees: DraftInterPostingDetailDto[] = [];
    loadingDraftEmployees = false;
    /** Header info for the selected draft's employee preview. */
    selectedDraftNo = '';
    selectedDraftDate = '';
    /** Full draft masters keyed by id, for resolving draft no/date without an extra call. */
    private draftMastersById = new Map<number, DraftInterPostingMasterDto>();
    /** MemberType map: codeId → { en, bn } for the employee preview table. */
    private memberTypeMap = new Map<number, { en: string; bn: string }>();
    isPreparedByMapped = false;
    fileRows: FileRowData[] = [];
    readonly noteSheetOperationTypeOptions = NoteSheetOperationTypeOptions;
    configOptions: { label: string; value: number }[] = [];
    private _allConfigs: NoteSheetNumberConfigModel[] = [];
    private _typeMap: Record<number, string> = {};
    /** Dynamic paragraphs */
    paragraphs: string[] = [''];

    /** Predefined subjects for Inter Posting note-sheets — picking one fills the Subject
     *  text field. NOT stored as an id; only the resulting text is saved (NoteSheetInfo.Subject). */
    private subjectPickList: NoteSheetSubjectModel[] = [];
    subjectOptions: { label: string; value: number }[] = [];
    showSubjectDialog = false;
    subjectSearch = '';

    @ViewChild('fileReferencesForm') fileReferencesForm!: FileReferencesFormComponent;

    constructor(
        private messageService: MessageService,
        private fb: FormBuilder,
        private sharedService: SharedService,
        private http: HttpClient,
        private empService: EmpService,
        private postingService: PostingService,
        private identityMappingService: IdentityUserMappingService,
        private route: ActivatedRoute,
        private router: Router,
        private noteSheetEditCache: NoteSheetEditCacheService,
        private masterBasicSetupService: MasterBasicSetupService,
        private noteSheetSubjectService: NoteSheetSubjectService
    ) {
        this.form = this.fb.group({
            draftPostingMasterId: [null as number | null, Validators.required],
            textType: ['bn'],
            noteSheetDate: [null as Date | null, Validators.required],
            referenceNumber: [''],
            noteSheetNo: [''],
            noteSheetNumberConfigId: [null as number | null, Validators.required],
            noteSheetNoStaticWord: [''],
            subject: [''],
            mainText: [''],
            note: [''],
            preparedBy: [''],
            preparedByEmployeeId: [null as number | null],
            initiatorId: [null as number | null, Validators.required],
            recommenderIds: [[] as number[]],
            finalApproverId: [null as number | null, Validators.required],
            noteSheetOperationType: [NoteSheetOperationType.Manual as string | null, Validators.required],
            isSecret: [false]
        });
    }

    /** Initiator/final approver are required only for manual note sheets. System-generate note
     *  sheets get the chain from config, so the pickers are hidden and these validators dropped. */
    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadDraftInterPostingMasters();
        this.resolvePreparedByMapping();
        this.loadPreparedByOptions();
        this.loadNoteSheetNumberConfigs();
        this.loadSubjectPickList();

        this.form.get('textType')!.valueChanges.subscribe(() => {
            this.form.get('noteSheetNumberConfigId')?.setValue(null);
            this.rebuildConfigOptions();
            this.buildSubjectOptions();
        });

        // When a draft is selected/cleared: load (or clear) its employee preview.
        this.form.get('draftPostingMasterId')?.valueChanges.subscribe((id: number | null) => {
            this.loadDraftEmployees(id);
        });

        this.route.queryParams.pipe(take(1)).subscribe((params) => {
            const id = params['id'];
            if (id != null && id !== '') {
                const numId = Number(id);
                if (!isNaN(numId) && numId > 0) {
                    this.editId = numId;
                    this.editMode = true;
                    this.title = 'Update Inter Posting Note-Sheet';
                    this.loadNoteSheetForEdit(numId);
                }
            }
        });
    }

    get isBangla(): boolean {
        return this.form?.get('textType')?.value === 'bn';
    }

    /** Header for the draft employees preview panel: "Employees — <no> (<date>)  ·  N member(s)". */
    get draftEmployeesPanelHeader(): string {
        const parts: string[] = ['Employees'];
        if (this.selectedDraftNo) parts.push(`— ${this.selectedDraftNo}`);
        if (this.selectedDraftDate) parts.push(`(${this.selectedDraftDate})`);
        return `${parts.join(' ')}  ·  ${this.draftEmployees.length} member(s)`;
    }

    /** Load the selected draft's employees for the collapsible preview (or clear it when deselected). */
    private loadDraftEmployees(masterId: number | null): void {
        if (masterId == null) {
            this.draftEmployees = [];
            this.selectedDraftNo = '';
            this.selectedDraftDate = '';
            return;
        }
        const master = this.draftMastersById.get(masterId);
        this.selectedDraftNo = master?.draftInterPostingNo ?? '';
        this.selectedDraftDate = master?.draftInterPostingDate ?? '';
        this.loadingDraftEmployees = true;
        this.draftEmployees = [];
        this.postingService.getDraftInterPostingById(masterId).subscribe({
            next: (data) => {
                this.draftEmployees = data?.details ?? [];
                // Prefer the response's own no/date (reliable even before the masters list loads).
                if (data?.draftInterPostingNo) this.selectedDraftNo = data.draftInterPostingNo;
                if (data?.draftInterPostingDate) this.selectedDraftDate = data.draftInterPostingDate;
                this.loadingDraftEmployees = false;
            },
            error: () => {
                this.draftEmployees = [];
                this.loadingDraftEmployees = false;
            }
        });
    }

    /** Member Type display name (reuses the map built for the note-sheet-number config), current language. */
    memberTypeName(id: number | null | undefined): string {
        if (id == null) return '-';
        const mt = this.memberTypeMap.get(id);
        if (!mt) return '-';
        return (this.isBangla ? mt.bn : mt.en) || mt.en || '-';
    }

    /** Load active predefined subjects for Inter Posting note-sheets. */
    private loadSubjectPickList(): void {
        this.noteSheetSubjectService.getActiveByType(NoteSheetType.InterPosting).subscribe({
            next: (list) => {
                this.subjectPickList = Array.isArray(list) ? list : [];
                this.buildSubjectOptions();
            },
            error: () => {
                this.subjectPickList = [];
                this.subjectOptions = [];
            }
        });
    }

    /** Option labels follow the current textType (bn/en). */
    private buildSubjectOptions(): void {
        const isBn = this.isBangla;
        this.subjectOptions = this.subjectPickList.map((s) => ({
            label: (isBn ? s.subjectBN : s.subjectEN) || s.subjectEN || s.subjectBN || '',
            value: s.id
        }));
    }

    /** Subjects filtered by the modal search box (matches the current-language label). */
    get filteredSubjects(): { label: string; value: number }[] {
        const term = (this.subjectSearch || '').trim().toLowerCase();
        if (!term) return this.subjectOptions;
        return this.subjectOptions.filter((o) => o.label.toLowerCase().includes(term));
    }

    openSubjectDialog(): void {
        this.subjectSearch = '';
        this.showSubjectDialog = true;
    }

    /** Copy the chosen subject's text into the editable Subject field (no id stored). */
    pickSubject(opt: { label: string; value: number }): void {
        this.form.get('subject')?.setValue(opt.label);
        this.showSubjectDialog = false;
    }

    loadDraftInterPostingMasters(): void {
        this.loadingDraftList = true;
        this.postingService.getDraftInterPostingMasters().subscribe({
            next: (list) => {
                const currentMasterId = this.form.get('draftPostingMasterId')?.value;
                const arr = list ?? [];
                this.draftMastersById = new Map(arr.map((m) => [m.id, m]));
                this.draftPostingOptions = arr
                    .filter((m) => !m.hasNoteSheet || (this.editMode && m.id === currentMasterId))
                    .map((m) => ({
                        label: `${m.draftInterPostingNo} (${m.draftInterPostingDate})`,
                        value: m.id
                    }));
                this.loadingDraftList = false;
                // Masters may arrive after the form value was set (edit mode) — refresh the preview.
                if (currentMasterId) this.loadDraftEmployees(currentMasterId);
            },
            error: (err: any) => {
                this.loadingDraftList = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load Draft Inter Posting list.' });
            }
        });
    }

    loadNoteSheetNumberConfigs(): void {
        forkJoin({
            configs: this.masterBasicSetupService.getAllNoteSheetNumberConfig(),
            memberTypes: this.masterBasicSetupService.getAllByType(CodeType.EmployeeType)
        }).subscribe({
            next: ({ configs, memberTypes }) => {
                this._typeMap = {};
                this.memberTypeMap.clear();
                (memberTypes ?? []).forEach((t) => {
                    this._typeMap[t.codeId] = t.codeValueEN;
                    this.memberTypeMap.set(t.codeId, {
                        en: t.codeValueEN ?? '',
                        bn: t.codeValueBN ?? t.codeValueEN ?? ''
                    });
                });
                this._allConfigs = (configs ?? []).filter((c) => c.noteSheetType === 'InterPosting' && c.status);
                this.rebuildConfigOptions();
            },
            error: () => {}
        });
    }

    private rebuildConfigOptions(): void {
        const bangla = this.isBangla;
        this.configOptions = this._allConfigs.map((c) => {
            const prefix = (bangla && c.prefixBN) ? c.prefixBN : c.prefix;
            const memberLabel = (c.memberTypeIds ?? '').split(',').filter(Boolean)
                .map(id => this._typeMap[+id]).filter(Boolean).join(', ');
            return { label: memberLabel ? `${prefix}  ${memberLabel}` : prefix, value: c.configId };
        });
    }

    preparedByOptions: { label: string; value: number }[] = [];

    private loadPreparedByOptions(): void {
        this.postingService.getApprovalEmployees().subscribe({
            next: (opts) => { this.preparedByOptions = opts ?? []; },
            error: () => {}
        });
    }

    private resolvePreparedByMapping(): void {
        const userId = this.sharedService.getCurrentUserId?.();
        if (!userId) {
            this.isPreparedByMapped = false;
            const user = this.sharedService.getCurrentUser?.() ?? '';
            this.form.get('preparedBy')?.setValue(user);
            return;
        }
        this.identityMappingService.getEmployeeIdForUser(userId).subscribe({
            next: (empId) => {
                if (empId) {
                    this.isPreparedByMapped = true;
                    this.form.get('preparedByEmployeeId')?.setValue(empId);
                    this.empService.getEmployeeById(empId).subscribe({
                        next: (emp: any) => {
                            const name = emp?.FullNameEN || emp?.fullNameEN || '';
                            const rabId = emp?.RABID || emp?.rabid || emp?.Rabid || '';
                            const serviceId = emp?.ServiceId || emp?.serviceId || '';
                            const parts = [name, rabId ? `RAB: ${rabId}` : '', serviceId ? `SVC: ${serviceId}` : ''].filter(Boolean);
                            this.form.get('preparedBy')?.setValue(parts.join(' | ') || `Employee #${empId}`);
                        }
                    });
                } else {
                    this.isPreparedByMapped = false;
                    const user = this.sharedService.getCurrentUser?.() ?? '';
                    this.form.get('preparedBy')?.setValue(user);
                }
            },
            error: (err: any) => {
                this.isPreparedByMapped = false;
                const user = this.sharedService.getCurrentUser?.() ?? '';
                this.form.get('preparedBy')?.setValue(user);
            }
        });
    }

    private loadNoteSheetForEdit(noteSheetId: number): void {
        const cached = this.noteSheetEditCache.get(noteSheetId);
        if (cached != null && typeof cached === 'object') {
            this.applyCachedNoteSheetToForm(cached);
            return;
        }
        const api = `${environment.apis.core}/NoteSheetInfo`;
        this.http.get<any>(`${api}/GetFilteredByKeysAsyn/${noteSheetId}`).subscribe({
            next: (data) => {
                const raw = data != null && typeof data === 'object' ? (data.data ?? data.value ?? data) : data;
                const list = Array.isArray(raw) ? raw : raw != null && typeof raw === 'object' && !Array.isArray(raw) ? [raw] : [];
                const row = list[0];
                if (row) this.applyCachedNoteSheetToForm(row);
            },
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load note-sheet for edit.' })
        });
    }

    private applyCachedNoteSheetToForm(d: any): void {
        const user = this.sharedService.getCurrentUser?.() ?? '';
        this.originalCreatedBy = d.createdBy ?? d.CreatedBy ?? d.lastUpdatedBy ?? d.LastUpdatedBy ?? user ?? null;
        this.originalSubject = d.subject ?? d.Subject ?? null;

        const noteSheetDate = (d.noteSheetDate ?? d.NoteSheetDate) != null ? this.parseDate(d.noteSheetDate ?? d.NoteSheetDate) : null;

        let recommenderIds: number[] = [];
        const rawJson = d.recommendersJson ?? d.RecommendersJson ?? d.recommenderIdsJson ?? d.RecommenderIdsJson;
        if (rawJson && typeof rawJson === 'string') {
            try {
                const arr = JSON.parse(rawJson);
                if (Array.isArray(arr) && arr.length > 0) {
                    if (typeof arr[0] === 'object' && arr[0] !== null) {
                        recommenderIds = arr.map((r: any) => r.recomender_id ?? r.recomenderId ?? r.RecomenderId).filter(Boolean);
                    } else {
                        recommenderIds = arr.filter((x: any) => typeof x === 'number');
                    }
                }
            } catch {}
        }

        this.form.patchValue({
            draftPostingMasterId: d.draftPostingMasterId ?? d.DraftPostingMasterId ?? null,
            textType: (d.textType ?? d.TextType) === 1 ? 'bn' : 'en',
            noteSheetNo: String(d.noteSheetNo ?? d.NoteSheetNo ?? ''),
            noteSheetDate,
            referenceNumber: String(d.referenceNumber ?? d.ReferenceNumber ?? ''),
            subject: String(d.subject ?? d.Subject ?? ''),
            mainText: String(d.mainText ?? d.MainText ?? ''),
            note: String(d.note ?? d.Note ?? ''),
            preparedBy: d.createdBy ?? d.CreatedBy ?? d.lastUpdatedBy ?? d.LastUpdatedBy ?? user,
            preparedByEmployeeId: d.preparedByEmployeeId ?? d.PreparedByEmployeeId ?? null,
            initiatorId: d.initiatorId ?? d.InitiatorId ?? null,
            recommenderIds,
            finalApproverId: d.finalApprovalId ?? d.FinalApprovalId ?? null,
            noteSheetOperationType: d.noteSheetOperationType ?? d.NoteSheetOperationType ?? null,
            isSecret: !!(d.isSecret ?? d.IsSecret ?? false)
        });

        const filesReferences = d.filesReferences ?? d.FilesReferences;
        if (filesReferences && typeof filesReferences === 'string') {
            try {
                const refs = JSON.parse(filesReferences) as { FileId?: number; fileId?: number; fileName?: string; FileName?: string }[];
                this.fileRows = Array.isArray(refs)
                    ? refs.map((r) => ({ displayName: r.fileName ?? r.FileName ?? '', file: null, fileId: r.FileId ?? r.fileId }))
                    : [];
            } catch {}
        }

        // Load paragraphs
        const paragraphText = d.paragraphText ?? d.ParagraphText;
        if (paragraphText && typeof paragraphText === 'string') {
            try {
                const arr = JSON.parse(paragraphText);
                if (Array.isArray(arr) && arr.length > 0) {
                    this.paragraphs = arr.map((p: any) => String(p ?? ''));
                }
            } catch {}
        }
    }

    private parseDate(value: string | Date | null | undefined): Date | null {
        if (value == null) return null;
        if (value instanceof Date) return value;
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    onFileRowsChange(event: FileRowData[]): void {
        if (event && Array.isArray(event)) this.fileRows = event;
    }

    onDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to download file.' })
        });
    }

    private resetForm(): void {
        this.form.reset({
            draftPostingMasterId: null,
            textType: 'bn',
            noteSheetNo: '',
            noteSheetNumberConfigId: null,
            noteSheetNoStaticWord: '',
            noteSheetDate: null,
            referenceNumber: '',
            subject: '',
            mainText: '',
            note: '',
            preparedBy: '',
            preparedByEmployeeId: null,
            initiatorId: null,
            recommenderIds: [],
            finalApproverId: null,
            noteSheetOperationType: 'manual',
            isSecret: false
        });
        this.fileRows = [];
        this.paragraphs = [''];
        this.resolvePreparedByMapping();
    }

    addParagraph(): void {
        this.paragraphs.push('');
    }

    removeParagraph(index: number): void {
        if (this.paragraphs.length > 1) {
            this.paragraphs.splice(index, 1);
        }
    }

    trackByIndex(index: number): number {
        return index;
    }

    submit(): void {
        // Guard against double submission while a save is already in flight.
        if (this.isSubmitting) return;
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Draft Inter Posting List and Date.' });
            return;
        }
        this.isSubmitting = true;
        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const doSave = (filesReferencesJson: string | null) => {
            try {
                const payload = this.buildPayload(filesReferencesJson);
                if (this.editMode && this.editId != null) {
                    (payload as any).noteSheetId = this.editId;
                }
                const api = `${environment.apis.core}/NoteSheetInfo`;
                const endpoint = this.editMode && this.editId != null ? '/UpdateAsyn' : '/SaveAsyn';
                this.http.post<any>(api + endpoint, payload).subscribe({
                    next: (resp) => {
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Note Sheet',
                            detail: this.editMode ? 'Note Sheet updated successfully.' : 'Note Sheet generated successfully.'
                        });
                        this.isSubmitting = false;
                        const savedId = this.editMode && this.editId != null
                            ? this.editId
                            : (resp?.data?.noteSheetId ?? resp?.data?.NoteSheetId ?? null);
                        // Save → jump straight to preview mode for the saved note-sheet.
                        if (savedId != null && savedId > 0) {
                            this.router.navigate(['/notesheet-preview/posting'], { queryParams: { id: encodeNoteSheetId(savedId) } });
                        } else if (this.editMode) {
                            this.router.navigate(['/notesheet-list/draft-inter-posting']);
                        } else {
                            this.resetForm();
                            this.loadDraftInterPostingMasters();
                        }
                    },
                    error: (err) => {
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
                    const allRefs = [
                        ...existingRefs.map((r) => ({ FileId: r.FileId, fileName: r.fileName })),
                        ...newRefs
                    ];
                    doSave(allRefs.length > 0 ? JSON.stringify(allRefs) : null);
                },
                error: (err: any) => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to upload one or more files.' });
                    this.isSubmitting = false;
                }
            });
            return;
        }
        doSave(existingRefs.length > 0 ? JSON.stringify(existingRefs) : null);
    }

    private getApiErrorMessage(err: any): string {
        if (err?.status === 0 || err?.message === 'Http failure response') return 'Cannot reach server.';
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
        const createdBy = this.editMode && this.originalCreatedBy ? this.originalCreatedBy : preparedBy;
        const subject = (d.subject && String(d.subject).trim()) || this.originalSubject || null;
        const noteSheetNo = 'AUTO';
        const recommenderIds: number[] = Array.isArray(d.recommenderIds) ? d.recommenderIds : [];
        const recommendersJson = recommenderIds.length
            ? JSON.stringify(recommenderIds.map((id: number, idx: number) => ({
                recomender_no: idx + 1,
                recomender_id: id,
                recomender_status: ApprovalStatus.Pending,
                recomender_approve_remark: '',
                recomender_cancel_remark: '',
                recomender_approved_date: null
            })))
            : null;

        const payload: Record<string, unknown> = {
            noteSheetId: 0,
            noteSheetType: NoteSheetType.InterPosting,
            noteSheetNoStaticWord: (d.noteSheetNoStaticWord && String(d.noteSheetNoStaticWord).trim()) || null,
            noteSheetNo,
            noteSheetNumberConfigId: d.noteSheetNumberConfigId ?? null,
            noteSheetDate: dateStr,
            noteSheetTemplateId: null,
            referenceNumber: d.referenceNumber != null ? String(d.referenceNumber) : null,
            subject,
            mainText: d.mainText != null ? String(d.mainText) : '',
            note: d.note != null ? String(d.note) : null,
            textType: d.textType === 'bn' ? 1 : 0,
            isSecret: d.isSecret ?? false,
            noteSheetOperationType: d.noteSheetOperationType ?? null,
            employeeId: d.preparedByEmployeeId ?? null,
            preparedByEmployeeId: d.preparedByEmployeeId ?? null,
            unitId: null,
            wingBattalionId: null,
            branchId: null,
            initiatorId: d.initiatorId ?? 0,
            recommendersJson,
            finalApprovalId: d.finalApproverId ?? null,
            familyInfoJson: null,
            createdBy,
            lastUpdatedBy: preparedBy,
            createdDate: now,
            lastupdate: now,
            draftPostingMasterId: d.draftPostingMasterId ?? null,
            paragraphText: this.paragraphs.some(p => p.trim()) ? JSON.stringify(this.paragraphs.filter(p => p.trim())) : null
        };
        if (filesReferencesJson != null && filesReferencesJson !== '') {
            payload['filesReferences'] = filesReferencesJson;
        }
        return payload;
    }
}
