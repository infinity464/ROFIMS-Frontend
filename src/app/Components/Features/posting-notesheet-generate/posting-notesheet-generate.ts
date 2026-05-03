import { Component, OnInit, ViewChild , inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
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
import { ToastModule } from 'primeng/toast';
import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';
import { ActivatedRoute, Router } from '@angular/router';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { EmpService } from '@/services/emp-service';
import { PostingService } from '@/services/posting.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { NoteSheetEditCacheService } from '@/services/note-sheet-edit-cache.service';
import { NoteSheetType, NoteSheetOperationTypeOptions, ApprovalStatus, ApproverRoleType, CodeType } from '@/models/enums';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';

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
        DatePickerModule, FlexibleDateDirective,
        RichEditorComponent,
        TextareaModule,
        ToastModule,
        CheckboxModule,
        FileReferencesFormComponent
    ],
    templateUrl: './posting-notesheet-generate.html',
    providers: [MessageService],
    styleUrl: './posting-notesheet-generate.scss'
})
export class PostingNotesheetGenerateComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    title = 'Generate New Posting Note-Sheet';
    form!: FormGroup;
    isSubmitting = false;
    /** Edit mode: load by id from query param and submit as UpdateAsyn */
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
    isPreparedByMapped = false;
    initiatorOptions: { label: string; value: number }[] = [];
    recommenderOptions: { label: string; value: number }[] = [];
    finalApproverOptions: { label: string; value: number }[] = [];
    fileRows: FileRowData[] = [];
    readonly noteSheetOperationTypeOptions = NoteSheetOperationTypeOptions;
    /** All NoteSheetNumberConfigs for NewPosting */
    private allNoteSheetConfigs: any[] = [];
    /** MemberType map: codeId → { en, bn } */
    private memberTypeMap = new Map<number, { en: string; bn: string }>();
    /** Filtered dropdown options for Note Sheet No config selection */
    noteSheetConfigOptions: { label: string; value: number }[] = [];
    /** Prefix config for notesheet number language swap */
    private noteSheetPrefixEN = '';
    private noteSheetPrefixBN = '';
    /** Dynamic paragraphs */
    paragraphs: string[] = [''];

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
        private masterBasicSetupService: MasterBasicSetupService
    ) {
        this.form = this.fb.group({
            draftPostingMasterId: [null as number | null, Validators.required],
            textType: ['bn'],
            noteSheetDate: [null as Date | null, Validators.required],
            referenceNumber: [''],
            noteSheetNo: [''],
            noteSheetNumberConfigId: [null as number | null, Validators.required],
            mainText: [''],
            note: [''],
            preparedBy: [''],
            preparedByEmployeeId: [null as number | null],
            initiatorId: [null as number | null, Validators.required],
            recommenderIds: [[] as number[]],
            finalApproverId: [null as number | null, Validators.required],
            subject: [''],
            noteSheetOperationType: [null as string | null, Validators.required],
            isSecret: [false]
        });
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadDraftPostingMasters();
        this.loadApproverOptions();
        this.resolvePreparedByMapping();
        this.loadNoteSheetNumberConfig();

        this.route.queryParams.pipe(take(1)).subscribe((params) => {
            const id = params['id'];
            if (id != null && id !== '') {
                const numId = Number(id);
                if (!isNaN(numId) && numId > 0) {
                    this.editId = numId;
                    this.editMode = true;
                    this.title = 'Update New Posting Note-Sheet';
                    this.form.get('noteSheetNumberConfigId')?.clearValidators();
                    this.form.get('noteSheetNumberConfigId')?.updateValueAndValidity();
                    this.loadNoteSheetForEdit(numId);
                }
            }
        });

        // When textType changes: rebuild config dropdown options + swap prefix in edit mode
        this.form.get('textType')?.valueChanges.subscribe((newType: string) => {
            this.buildNoteSheetConfigOptions();
            if (this.editMode) {
                this.transformNoteSheetNo(newType);
            }
        });
    }

    get isBangla(): boolean {
        return this.form?.get('textType')?.value === 'bn';
    }

    get initiatorOptionsDisplay(): { label: string; value: number }[] {
        return this.initiatorOptions.map((o) => ({
            label: o.label,
            value: o.value
        }));
    }
    get recommenderOptionsDisplay(): { label: string; value: number }[] {
        return this.recommenderOptions.map((o) => ({
            label: o.label,
            value: o.value
        }));
    }
    get finalApproverOptionsDisplay(): { label: string; value: number }[] {
        return this.finalApproverOptions.map((o) => ({
            label: o.label,
            value: o.value
        }));
    }

    loadDraftPostingMasters(): void {
        this.loadingDraftList = true;
        this.postingService.getDraftNewPostingMasters().subscribe({
            next: (list) => {
                const currentMasterId = this.form.get('draftPostingMasterId')?.value;
                this.draftPostingOptions = (list ?? [])
                    .filter((m) => !m.hasNoteSheet || (this.editMode && m.id === currentMasterId))
                    .map((m) => ({
                        label: `${m.draftPostingNo} (${m.draftPostingDate})`,
                        value: m.id
                    }));
                this.loadingDraftList = false;
            },
            error: (err: any) => {
                this.loadingDraftList = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load Draft Posting list.' });
            }
        });
    }

    loadApproverOptions(): void {
        const api = `${environment.apis.core}/EmployeeInfo`;
        this.http.get<any[]>(`${api}/GetAll`).subscribe({
            next: (list) => {
                const allOpts = (Array.isArray(list) ? list : []).map((e: any) => {
                    const name = e.fullNameEN || e.FullNameEN || '';
                    const rabId = e.rabid || e.Rabid || e.RABID || '';
                    const serviceId = e.serviceId || e.ServiceId || '';
                    const parts = [name, rabId ? `RAB: ${rabId}` : '', serviceId ? `SVC: ${serviceId}` : ''].filter(Boolean);
                    return {
                        label: parts.join(' | ') || `ID ${e.employeeID ?? e.EmployeeID}`,
                        labelBn: e.fullNameBN || e.FullNameBN || null,
                        value: e.employeeID ?? e.EmployeeID
                    };
                });
                this.masterBasicSetupService.getNoteSheetApproverConfigByType(NoteSheetType.NewPosting).subscribe({
                    next: (configs) => {
                        const cfg = Array.isArray(configs) ? configs[0] : configs;
                        if (cfg?.details?.length) {
                            const initIds = cfg.details.filter((d: any) => d.roleType === ApproverRoleType.Initiator).map((d: any) => d.employeeId);
                            const recIds = cfg.details.filter((d: any) => d.roleType === ApproverRoleType.Recommender).map((d: any) => d.employeeId);
                            const faIds = cfg.details.filter((d: any) => d.roleType === ApproverRoleType.FinalApprover).map((d: any) => d.employeeId);
                            this.initiatorOptions = initIds.length > 0 ? allOpts.filter(o => initIds.includes(o.value)) : allOpts;
                            this.recommenderOptions = recIds.length > 0 ? allOpts.filter(o => recIds.includes(o.value)) : allOpts;
                            this.finalApproverOptions = faIds.length > 0 ? allOpts.filter(o => faIds.includes(o.value)) : allOpts;
                        } else {
                            this.initiatorOptions = allOpts;
                            this.recommenderOptions = allOpts;
                            this.finalApproverOptions = allOpts;
                        }
                    },
                    error: (err: any) => {
                        this.initiatorOptions = allOpts;
                        this.recommenderOptions = allOpts;
                        this.finalApproverOptions = allOpts;
                    }
                });
            },
            error: (err: any) => {}
        });
    }

    /** Check if logged-in user has an employee mapping. If yes, auto-set Prepared By (readonly). If not, show dropdown. */
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
        const recommendersJson = d.recommendersJson ?? d.RecommendersJson;
        const recommenderIdsJson = d.recommenderIdsJson ?? d.RecommenderIdsJson;
        const rawJson = recommendersJson ?? recommenderIdsJson;
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

    private parseDate(value: string | Date | null | undefined): Date | null {
        if (value == null) return null;
        if (value instanceof Date) return value;
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    onFileRowsChange(event: FileRowData[]): void {
        if (event && Array.isArray(event)) {
            this.fileRows = event;
        }
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
            noteSheetOperationType: null,
            isSecret: false
        });
        this.fileRows = [];
        this.paragraphs = [''];
        this.resolvePreparedByMapping();
    }

    /** Fetch NoteSheetNumberConfig for NewPosting + MemberType labels, then build dropdown */
    private loadNoteSheetNumberConfig(): void {
        const configApi = `${environment.apis.core}/NoteSheetNumberConfig`;
        forkJoin([
            this.http.get<any[]>(`${configApi}/GetAll`),
            this.masterBasicSetupService.getAllByType(CodeType.EmployeeType)
        ]).subscribe({
            next: ([configs, memberTypes]) => {
                // Build member type map
                (memberTypes ?? []).forEach(mt => {
                    this.memberTypeMap.set(mt.codeId, {
                        en: mt.codeValueEN ?? '',
                        bn: mt.codeValueBN ?? mt.codeValueEN ?? ''
                    });
                });

                // Keep only active NewPosting configs
                this.allNoteSheetConfigs = (configs ?? []).filter(
                    (c: any) => (c.noteSheetType ?? c.NoteSheetType) === 'NewPosting'
                        && (c.status ?? c.Status) !== false
                );

                // Backward compat: keep first config prefixes for edit-mode transform
                const first = this.allNoteSheetConfigs[0];
                if (first) {
                    this.noteSheetPrefixEN = first.prefix ?? first.Prefix ?? '';
                    this.noteSheetPrefixBN = first.prefixBN ?? first.PrefixBN ?? '';
                }

                this.buildNoteSheetConfigOptions();
            }
        });
    }

    /** Build dropdown options based on current textType */
    private buildNoteSheetConfigOptions(): void {
        const isBn = this.form.get('textType')?.value === 'bn';

        this.noteSheetConfigOptions = this.allNoteSheetConfigs.map((c: any) => {
            const configId = c.configId ?? c.ConfigId;
            const prefix = isBn
                ? (c.prefixBN ?? c.PrefixBN ?? c.prefix ?? c.Prefix ?? '')
                : (c.prefix ?? c.Prefix ?? '');
            const memberTypeId = c.memberTypeId ?? c.MemberTypeId;
            const mt = this.memberTypeMap.get(memberTypeId);
            const memberLabel = mt ? (isBn ? mt.bn : mt.en) : '';
            const includeDate = c.includeDateInNumber ?? c.IncludeDateInNumber ?? false;

            let pattern: string;
            if (includeDate) {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const yearStr = isBn ? BanglaNumerals.toBangla(String(year)) : String(year);
                const monthStr = isBn ? BanglaNumerals.toBangla(month) : month;
                pattern = `${prefix}-${yearStr}-${monthStr}-***`;
            } else {
                pattern = `${prefix}-***`;
            }
            const label = memberLabel ? `${pattern}  (${memberLabel})` : pattern;

            return { label, value: configId };
        });

        // Auto-select if only one option available
        if (this.noteSheetConfigOptions.length === 1) {
            this.form.get('noteSheetNumberConfigId')?.setValue(this.noteSheetConfigOptions[0].value);
        }
    }

    /** Convert Bangla digits back to Western digits */
    private toEnglishDigits(str: string): string {
        return str.replace(/[\u09E6-\u09EF]/g, (c) => String(c.charCodeAt(0) - 0x09E6));
    }

    /** Transform noteSheetNo when textType changes in edit mode */
    private transformNoteSheetNo(newTextType: string): void {
        const currentNo: string = this.form.get('noteSheetNo')?.value ?? '';
        if (!currentNo || (!this.noteSheetPrefixEN && !this.noteSheetPrefixBN)) return;

        let transformed: string;

        if (newTextType === 'bn') {
            // EN → BN: replace English prefix, convert digits to Bangla
            if (this.noteSheetPrefixEN && currentNo.startsWith(this.noteSheetPrefixEN + '-')) {
                const rest = currentNo.substring(this.noteSheetPrefixEN.length);
                const bnPrefix = this.noteSheetPrefixBN || this.noteSheetPrefixEN;
                transformed = bnPrefix + BanglaNumerals.toBangla(rest);
            } else {
                // Prefix doesn't match — just convert digits
                transformed = BanglaNumerals.toBangla(currentNo);
            }
        } else {
            // BN → EN: replace Bangla prefix, convert digits to English
            if (this.noteSheetPrefixBN && currentNo.startsWith(this.noteSheetPrefixBN + '-')) {
                const rest = currentNo.substring(this.noteSheetPrefixBN.length);
                transformed = this.noteSheetPrefixEN + this.toEnglishDigits(rest);
            } else {
                // Prefix doesn't match — just convert digits
                transformed = this.toEnglishDigits(currentNo);
            }
        }

        this.form.get('noteSheetNo')?.setValue(transformed, { emitEvent: false });
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
                if (this.editMode && this.editId != null) {
                    (payload as any).noteSheetId = this.editId;
                }
                const api = `${environment.apis.core}/NoteSheetInfo`;
                const endpoint = this.editMode && this.editId != null ? '/UpdateAsyn' : '/SaveAsyn';
                this.http.post<{ statusCode?: number; description?: string; data?: any }>(api + endpoint, payload).subscribe({
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
                        if (savedId != null && savedId > 0) {
                            this.router.navigate(['/notesheet-preview/posting'], { queryParams: { id: savedId } });
                        } else if (this.editMode) {
                            this.router.navigate(['/notesheet-list/draft']);
                        } else {
                            this.resetForm();
                            this.loadDraftPostingMasters();
                        }
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
                error: (err: any) => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to upload one or more files.' });
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
        const createdBy = this.editMode && this.originalCreatedBy ? this.originalCreatedBy : preparedBy;
        const subject = d.subject != null && String(d.subject).trim() !== '' ? String(d.subject) : null;
        const noteSheetNo = this.editMode ? (d.noteSheetNo || 'AUTO') : 'AUTO';
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
            noteSheetType: NoteSheetType.NewPosting,
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
