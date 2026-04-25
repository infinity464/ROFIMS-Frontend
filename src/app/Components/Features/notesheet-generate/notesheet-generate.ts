import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
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
import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';
import { CommonCode } from '@/Components/basic-setup/shared/models/common-code';
import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { EmpService } from '@/services/emp-service';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs/operators';
import { NoteSheetEditCacheService } from '@/services/note-sheet-edit-cache.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { NoteSheetType, NoteSheetOperationTypeOptions, ApprovalStatus, ApproverRoleType } from '@/models/enums';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { CheckboxModule } from 'primeng/checkbox';

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
        RichEditorComponent,
        FileReferencesFormComponent,
        TooltipModule,
        ToastModule,
        CheckboxModule
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
    /** Whether the logged-in user has an employee mapping (show readonly vs dropdown) */
    isPreparedByMapped = false;
    textTypeOptions = [
        { label: 'English', value: 'en' },
        { label: 'Bangla', value: 'bn' }
    ];
    readonly noteSheetOperationTypeOptions = NoteSheetOperationTypeOptions;
    /** Options with both EN and BN labels; display getters pick by textType. */
    unitOptions: { label: string; labelBn: string | null; value: number }[] = [];
    wingOptions: { label: string; labelBn: string | null; value: number }[] = [];
    branchOptions: { label: string; labelBn: string | null; value: number }[] = [];
    initiatorOptions: { label: string; labelBn: string | null; value: number }[] = [];
    recommenderOptions: { label: string; labelBn: string | null; value: number }[] = [];
    finalApproverOptions: { label: string; labelBn: string | null; value: number }[] = [];
    /** Reference employees – stored in NoteSheetReferenceEmployee table (multi-select). */
    referenceEmployeeOptions: { label: string; labelBn: string | null; value: number }[] = [];
    /** Supporting documents – stored in NoteSheetInfo.FilesReferences (JSON array of { FileId, fileName }). */
    fileRows: FileRowData[] = [];
    /** Prefix config for notesheet number language swap */
    private noteSheetPrefixEN = '';
    private noteSheetPrefixBN = '';

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
        private noteSheetEditCache: NoteSheetEditCacheService,
        private identityMappingService: IdentityUserMappingService
    ) {
        this.form = this.fb.group({
            noteSheetTemplateId: [null as number | null],
            textType: ['en'],
            noteSheetDate: [null as Date | null, Validators.required],
            unitId: [null as number | null],
            wingBattalionId: [null as number | null],
            branchId: [null as number | null],
            referenceNumber: ['', Validators.required],
            noteSheetNo: [''],
            subject: ['', Validators.required],
            mainText: [''], // Rich editor (HTML)
            preparedBy: [''],
            preparedByEmployeeId: [null as number | null],
            initiatorId: [null as number | null, Validators.required],
            recommenderIds: [[] as number[]],
            finalApproverId: [null as number | null, Validators.required],
            isSecret: [false],
            noteSheetOperationType: [null as string | null, Validators.required],
            referenceEmployeeIds: [[] as number[]]
        });
    }

    ngOnInit(): void {
        this.loadUnits();
        this.loadBranches();
        this.loadApproverOptions();
        this.loadReferenceEmployeeOptions();
        this.loadNoteSheetNumberConfig();
        const user = this.sharedService.getCurrentUser?.() ?? '';
        this.form.get('preparedBy')?.setValue(user);
        this.resolvePreparedByMapping();
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

        // In edit mode, swap noteSheetNo prefix/digits when textType changes
        this.form.get('textType')?.valueChanges.subscribe((newType: string) => {
            if (this.editMode) {
                this.transformNoteSheetNo(newType);
            }
        });
    }

    /** Load single note-sheet and patch form (edit mode). Uses cache from draft list when available. */
    private loadNoteSheetForEdit(noteSheetId: number): void {
        const user = this.sharedService.getCurrentUser?.() ?? '';
        const cached = this.noteSheetEditCache.get(noteSheetId);
        if (cached != null && typeof cached === 'object') {
            const d = cached;
            if (d.noteSheetType === NoteSheetType.ExBDLeave || d.NoteSheetType === NoteSheetType.ExBDLeave) {
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
                if (d.noteSheetType === NoteSheetType.ExBDLeave || d.NoteSheetType === NoteSheetType.ExBDLeave) {
                    this.router.navigate(['/notesheet-ex-bd-leave'], { queryParams: { id: noteSheetId } });
                    return;
                }
                this.applyCachedNoteSheetToForm(d, user);
            },
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load note-sheet for edit.' })
        });
    }

    private applyCachedNoteSheetToForm(d: any, user: string): void {
        this.originalCreatedBy = d.createdBy ?? d.CreatedBy ?? d.lastUpdatedBy ?? d.LastUpdatedBy ?? user ?? null;
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
                        // New format: array of recommender objects
                        recommenderIds = arr.map((r: any) => r.recomender_id ?? r.recomenderId ?? r.RecomenderId).filter(Boolean);
                    } else {
                        // Legacy format: plain array of IDs
                        recommenderIds = arr.filter((x: any) => typeof x === 'number');
                    }
                }
            } catch {}
        }
        this.form.patchValue({
            noteSheetTemplateId: d.noteSheetTemplateId ?? d.NoteSheetTemplateId ?? null,
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
            preparedByEmployeeId: d.preparedByEmployeeId ?? d.PreparedByEmployeeId ?? null,
            initiatorId: d.initiatorId ?? d.InitiatorId ?? null,
            recommenderIds,
            finalApproverId: d.finalApprovalId ?? d.FinalApprovalId ?? null,
            isSecret: !!(d.isSecret ?? d.IsSecret ?? false),
            noteSheetOperationType: d.noteSheetOperationType ?? d.NoteSheetOperationType ?? null
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
                error: (err: any) => {}
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
        // Load existing reference employees in edit mode
        const noteSheetId = d.noteSheetId ?? d.NoteSheetId;
        if (noteSheetId) {
            const refApi = `${environment.apis.core}/NoteSheetReferenceEmployee`;
            this.http.get<any[]>(`${refApi}/GetByNoteSheetId/${noteSheetId}`).subscribe({
                next: (list) => {
                    const ids = (Array.isArray(list) ? list : []).map((r: any) => r.employeeId ?? r.EmployeeId).filter(Boolean);
                    this.form.patchValue({ referenceEmployeeIds: ids });
                },
                error: (err: any) => {}
            });
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
            error: (err: any) => {}
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
                error: (err: any) => {}
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
            error: (err: any) => {}
        });
    }

    /** Check if logged-in user has an employee mapping. If yes, auto-set Prepared By (readonly). If not, show dropdown. */
    private resolvePreparedByMapping(): void {
        const userId = this.sharedService.getCurrentUserId?.();
        if (!userId) {
            this.isPreparedByMapped = false;
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
                }
            },
            error: (err: any) => {
                this.isPreparedByMapped = false;
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
                this.masterBasicSetupService.getNoteSheetApproverConfigByType(NoteSheetType.General).subscribe({
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

    /** Load presently serving employees for the Reference Employee multi-select. */
    loadReferenceEmployeeOptions(): void {
        const api = `${environment.apis.core}/EmployeeInfo`;
        this.http.get<any[]>(`${api}/GetBasicServiceInformationOfServingMember`).subscribe({
            next: (list) => {
                this.referenceEmployeeOptions = (Array.isArray(list) ? list : []).map((e: any) => {
                    const name = e.nameEnglish || e.NameEnglish || '';
                    const rabId = e.rabId || e.RabId || '';
                    const serviceId = e.serviceId || e.ServiceId || '';
                    const parts = [name, rabId ? `RAB: ${rabId}` : '', serviceId ? `SVC: ${serviceId}` : ''].filter(Boolean);
                    return {
                        label: parts.join(' | ') || `ID ${e.employeeID ?? e.EmployeeID}`,
                        labelBn: e.nameBN || e.NameBN || null,
                        value: e.employeeID ?? e.EmployeeID
                    };
                });
            },
            error: (err: any) => {}
        });
    }

    /** Load NoteSheetNumberConfig for General type (prefix EN/BN for number generation). */
    private loadNoteSheetNumberConfig(): void {
        const api = `${environment.apis.core}/NoteSheetNumberConfig`;
        this.http.get<any[]>(`${api}/GetAll`).subscribe({
            next: (configs) => {
                const config = (configs ?? []).find(
                    (c: any) => (c.noteSheetType ?? c.NoteSheetType) === 'General'
                );
                if (config) {
                    this.noteSheetPrefixEN = config.prefix ?? config.Prefix ?? '';
                    this.noteSheetPrefixBN = config.prefixBN ?? config.PrefixBN ?? '';
                }
            }
        });
    }

    /** Convert Bangla digits back to Western digits */
    private toEnglishDigits(str: string): string {
        return str.replace(/[\u09E6-\u09EF]/g, (c) => String(c.charCodeAt(0) - 0x09E6));
    }

    /** Transform noteSheetNo when textType changes in edit mode (swap prefix + digits EN↔BN). */
    private transformNoteSheetNo(newTextType: string): void {
        const currentNo: string = this.form.get('noteSheetNo')?.value ?? '';
        if (!currentNo || (!this.noteSheetPrefixEN && !this.noteSheetPrefixBN)) return;

        let transformed: string;

        if (newTextType === 'bn') {
            if (this.noteSheetPrefixEN && currentNo.startsWith(this.noteSheetPrefixEN + '-')) {
                const rest = currentNo.substring(this.noteSheetPrefixEN.length);
                const bnPrefix = this.noteSheetPrefixBN || this.noteSheetPrefixEN;
                transformed = bnPrefix + BanglaNumerals.toBangla(rest);
            } else {
                transformed = BanglaNumerals.toBangla(currentNo);
            }
        } else {
            if (this.noteSheetPrefixBN && currentNo.startsWith(this.noteSheetPrefixBN + '-')) {
                const rest = currentNo.substring(this.noteSheetPrefixBN.length);
                transformed = this.noteSheetPrefixEN + this.toEnglishDigits(rest);
            } else {
                transformed = this.toEnglishDigits(currentNo);
            }
        }

        this.form.get('noteSheetNo')?.setValue(transformed, { emitEvent: false });
    }

    /** Whether Note-Sheet Text Type is Bangla (show all labels/options in Bangla). */
    get isBangla(): boolean {
        return this.form?.get('textType')?.value === 'bn';
    }

    get unitOptionsDisplay(): { label: string; value: number }[] {
        return this.unitOptions.map((o) => ({ label: o.label, value: o.value }));
    }
    get wingOptionsDisplay(): { label: string; value: number }[] {
        return this.wingOptions.map((o) => ({ label: o.label, value: o.value }));
    }
    get branchOptionsDisplay(): { label: string; value: number }[] {
        return this.branchOptions.map((o) => ({ label: o.label, value: o.value }));
    }
    get initiatorOptionsDisplay(): { label: string; value: number }[] {
        return this.initiatorOptions.map((o) => ({ label: o.label, value: o.value }));
    }
    get recommenderOptionsDisplay(): { label: string; value: number }[] {
        return this.recommenderOptions.map((o) => ({ label: o.label, value: o.value }));
    }
    get finalApproverOptionsDisplay(): { label: string; value: number }[] {
        return this.finalApproverOptions.map((o) => ({ label: o.label, value: o.value }));
    }
    get referenceEmployeeOptionsDisplay(): { label: string; value: number }[] {
        return this.referenceEmployeeOptions.map((o) => ({ label: o.label, value: o.value }));
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
                return o ? o.label : '';
            })
            .filter((l) => !!l);
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

    /** Reset form after successful save (create mode). */
    private resetForm(): void {
        const user = this.sharedService.getCurrentUser?.() ?? '';
        this.form.reset({
            noteSheetTemplateId: null,
            textType: 'en',
            noteSheetDate: null,
            unitId: null,
            wingBattalionId: null,
            branchId: null,
            referenceNumber: '',
            noteSheetNo: '',
            subject: '',
            mainText: '',
            preparedBy: user,
            preparedByEmployeeId: null,
            initiatorId: null,
            recommenderIds: [],
            finalApproverId: null,
            isSecret: false,
            noteSheetOperationType: null,
            referenceEmployeeIds: []
        });
        this.fileRows = [];
        this.resolvePreparedByMapping();
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
                this.http.post<any>(api + endpoint, payload).subscribe({
                    next: (res) => {
                        // Sync reference employees after notesheet is saved
                        const refEmpIds: number[] = this.form.get('referenceEmployeeIds')?.value ?? [];
                        const noteSheetId = this.editMode && this.editId != null
                            ? this.editId
                            : (res?.data?.noteSheetId ?? res?.data?.NoteSheetId ?? res?.Data?.NoteSheetId ?? null);

                        if (noteSheetId && refEmpIds.length > 0) {
                            const refApi = `${environment.apis.core}/NoteSheetReferenceEmployee`;
                            const syncPayload = {
                                noteSheetId,
                                employeeIds: refEmpIds,
                                updatedBy: payload.createdBy ?? payload.lastUpdatedBy ?? 'system'
                            };
                            this.http.post(refApi + '/Sync', syncPayload).subscribe({
                                error: (err: any) => this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Note Sheet saved but failed to sync reference employees.' })
                            });
                        } else if (noteSheetId && refEmpIds.length === 0 && this.editMode) {
                            // Clear all reference employees on edit if none selected
                            const refApi = `${environment.apis.core}/NoteSheetReferenceEmployee`;
                            this.http.post(refApi + '/Sync', { noteSheetId, employeeIds: [], updatedBy: payload.lastUpdatedBy ?? 'system' }).subscribe();
                        }

                        this.messageService.add({
                            severity: 'success',
                            summary: 'Note Sheet',
                            detail: this.editMode ? 'Note Sheet updated successfully.' : 'Note Sheet generated successfully.'
                        });
                        this.isSubmitting = false;
                        if (this.editMode) {
                            this.router.navigate(['/notesheet-list/draft']);
                        } else {
                            this.resetForm();
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

        const recommenderIds: number[] = Array.isArray(d.recommenderIds) ? d.recommenderIds : [];
        const recommendersJson = recommenderIds.length
            ? JSON.stringify(recommenderIds.map((id, idx) => ({
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
            noteSheetType: NoteSheetType.General,
            noteSheetNo: this.editMode ? (d.noteSheetNo || 'AUTO') : 'AUTO',
            noteSheetDate: dateStr,
            noteSheetTemplateId: d.noteSheetTemplateId ?? null,
            referenceNumber: d.referenceNumber != null ? String(d.referenceNumber) : null,
            subject: d.subject != null ? String(d.subject) : '',
            mainText: d.mainText != null ? String(d.mainText) : '',
            note: null,
            textType: d.textType === 'bn' ? 1 : 0,
            isSecret: d.isSecret ?? false,
            noteSheetOperationType: d.noteSheetOperationType ?? null,
            employeeId: null,
            preparedByEmployeeId: d.preparedByEmployeeId ?? null,
            unitId: d.unitId ?? null,
            wingBattalionId: d.wingBattalionId ?? null,
            branchId: d.branchId ?? null,
            initiatorId: d.initiatorId ?? 0,
            recommendersJson,
            finalApprovalId: d.finalApproverId ?? null,
            familyInfoJson: null,
            createdBy,
            lastUpdatedBy,
            createdDate: now,
            lastupdate: now
        };
        if (filesReferencesJson != null && filesReferencesJson !== '') {
            payload['filesReferences'] = filesReferencesJson;
        }
        return payload;
    }
}
