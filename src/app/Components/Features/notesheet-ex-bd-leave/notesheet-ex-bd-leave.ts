import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
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
import { ToastModule } from 'primeng/toast';
import { CommonCode } from '@/Components/basic-setup/shared/models/common-code';
import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { EmpService } from '@/services/emp-service';
import { FamilyInfoService, FamilyInfoModel } from '@/services/family-info-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs/operators';
import { RouterLink } from '@angular/router';
import { NoteSheetEditCacheService } from '@/services/note-sheet-edit-cache.service';

@Component({
    selector: 'app-notesheet-ex-bd-leave',
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
        FileReferencesFormComponent,
        EmployeeSearchComponent,
        RouterLink
    ],
    templateUrl: './notesheet-ex-bd-leave.html',
    providers: [MessageService],
    styleUrl: './notesheet-ex-bd-leave.scss'
})
export class NotesheetExBdLeaveComponent implements OnInit {
    title = 'a(3) Note-Sheet for Ex-BD Leave';
    form!: FormGroup;
    isSubmitting = false;
    editMode = false;
    editId: number | null = null;
    editLoading = false;
    editLoadFailed = false;
    textTypeOptions = [
        { label: 'English', value: 'en' },
        { label: 'Bangla', value: 'bn' }
    ];
    unitOptions: { label: string; labelBn: string | null; value: number }[] = [];
    wingOptions: { label: string; labelBn: string | null; value: number }[] = [];
    branchOptions: { label: string; labelBn: string | null; value: number }[] = [];
    purposeOfLeaveOptions: { label: string; labelBn: string | null; value: number }[] = [];
    countryOptions: { label: string; labelBn: string | null; value: number }[] = [];
    initiatorOptions: { label: string; labelBn: string | null; value: number }[] = [];
    recommenderOptions: { label: string; labelBn: string | null; value: number }[] = [];
    finalApproverOptions: { label: string; labelBn: string | null; value: number }[] = [];
    familyMemberOptions: { label: string; labelBn?: string; value: number; fmid: number; employeeId: number; relationLabel?: string }[] = [];
    relationshipOptions: { label: string; labelBn: string | null; value: number }[] = [];
    fileRows: FileRowData[] = [];
    /** Selected employee from RAB ID search (auto-fill wing, branch, etc.) */
    selectedEmployee: EmployeeBasicInfo | null = null;
    selectedEmployeeId: number | null = null;

    @ViewChild('fileReferencesForm') fileReferencesForm!: FileReferencesFormComponent;

    constructor(
        private masterBasicSetupService: MasterBasicSetupService,
        private messageService: MessageService,
        private fb: FormBuilder,
        private sharedService: SharedService,
        private http: HttpClient,
        private empService: EmpService,
        private familyInfoService: FamilyInfoService,
        private route: ActivatedRoute,
        private router: Router,
        private noteSheetEditCache: NoteSheetEditCacheService
    ) {
        this.form = this.fb.group({
            textType: ['en'],
            noteSheetDate: [null as Date | null, Validators.required],
            unitId: [null as number | null],
            wingBattalionId: [null as number | null],
            branchId: [null as number | null],
            referenceNumber: [''],
            noteSheetNo: [''],
            rabIdEmployeeId: [null as number | null], // employee ID when RAB ID selected
            subject: ['', Validators.required],
            purposeOfExBdLeaveId: [null as number | null],
            destinationCountryId: [null as number | null],
            dateOfVisitFrom: [null as Date | null],
            dateOfVisitTo: [null as Date | null],
            totalDays: [0],
            familyMemberIds: [[] as number[]], // selected FMIDs for family list
            mainText: [''],
            preparedBy: [''],
            initiatorId: [null as number | null],
            recommenderIds: [[] as number[]],
            finalApproverId: [null as number | null]
        });
    }

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
    get purposeOptionsDisplay(): { label: string; value: number }[] {
        return this.purposeOfLeaveOptions.map((o) => ({ label: this.isBangla && o.labelBn ? o.labelBn : o.label, value: o.value }));
    }
    get countryOptionsDisplay(): { label: string; value: number }[] {
        return this.countryOptions.map((o) => ({ label: this.isBangla && o.labelBn ? o.labelBn : o.label, value: o.value }));
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

    ngOnInit(): void {
        this.loadUnits();
        this.loadBranches();
        this.loadRelationships();
        this.loadPurposeOfLeave();
        this.loadCountries();
        this.loadApproverOptions();
        const user = this.sharedService.getCurrentUser?.() ?? '';
        this.form.get('preparedBy')?.setValue(user);
        this.form.get('dateOfVisitFrom')?.valueChanges.subscribe(() => this.calculateTotalDays());
        this.form.get('dateOfVisitTo')?.valueChanges.subscribe(() => this.calculateTotalDays());
        this.form.get('unitId')?.valueChanges.subscribe((unitId: number | null) => {
            this.onUnitChange();
        });
        this.route.queryParams.pipe(take(1)).subscribe((params) => {
            const id = params['id'];
            if (id != null && id !== '') {
                const numId = Number(id);
                if (!isNaN(numId) && numId > 0) {
                    this.editId = numId;
                    this.editMode = true;
                    this.title = 'Update Draft Note-Sheet (Ex-BD Leave)';
                    this.loadNoteSheetForEdit(numId);
                }
            }
        });
    }

    private parseDate(value: string | Date | null | undefined): Date | null {
        if (value == null) return null;
        if (value instanceof Date) return value;
        const dt = new Date(value);
        return isNaN(dt.getTime()) ? null : dt;
    }

    private toNum(v: unknown): number | null {
        if (v == null) return null;
        if (typeof v === 'number' && !isNaN(v)) return v;
        const n = Number(v);
        return isNaN(n) ? null : n;
    }

    private applyNoteSheetToForm(d: any): void {
        let recommenderIds: number[] = [];
        const recommenderIdsJson = d.recommenderIdsJson ?? d.RecommenderIdsJson;
        try {
            if (recommenderIdsJson && typeof recommenderIdsJson === 'string') {
                const arr = JSON.parse(recommenderIdsJson) as number[] | { employeeId?: number; EmployeeId?: number }[];
                recommenderIds = Array.isArray(arr) ? arr.map((r) => (typeof r === 'number' ? r : (r.employeeId ?? r.EmployeeId ?? 0))) : [];
            }
        } catch { /* ignore */ }
        let familyMemberIds: number[] = [];
        const familyInfoJson = d.familyInfoJson ?? d.FamilyInfoJson;
        try {
            if (familyInfoJson && typeof familyInfoJson === 'string') {
                const arr = JSON.parse(familyInfoJson) as { familyMemberId?: number; FamilyMemberId?: number; fmid?: number; FMID?: number; employeeId?: number }[];
                if (Array.isArray(arr)) {
                    familyMemberIds = arr
                        .map((f) => this.toNum(f.familyMemberId ?? f.FamilyMemberId ?? f.fmid ?? f.FMID) ?? 0)
                        .filter((id) => id > 0);
                }
            }
        } catch { /* ignore */ }
        const empId = this.toNum(d.employeeId ?? d.EmployeeId);
        this.selectedEmployeeId = empId && empId > 0 ? empId : null;
        if (this.selectedEmployeeId) this.loadFamilyMembersForEmployee(this.selectedEmployeeId, familyMemberIds);
        const noteSheetDate = d.noteSheetDate ?? d.NoteSheetDate;
        const fromDate = d.dateOfVisitFrom ?? d.FromDate ?? d.fromDate;
        const toDate = d.dateOfVisitTo ?? d.ToDate ?? d.toDate;
        const purposeId = this.toNum(d.purposeOfExBdLeaveId ?? d.PurposeId ?? d.purposeId);
        const destCountryId = this.toNum(d.destinationCountryId ?? d.DestinationCountryId);
        let totalDays = this.toNum(d.totalDays ?? d.TotalDays) ?? 0;
        if (totalDays === 0 && fromDate && toDate) {
            const from = this.parseDate(fromDate);
            const to = this.parseDate(toDate);
            if (from && to) totalDays = Math.max(0, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        }
        const unitIdVal = this.toNum(d.unitId ?? d.UnitId);
        const wingId = this.toNum(d.wingBattalionId ?? d.WingBattalionId ?? d.WingsBattalionId);
        const branchIdVal = this.toNum(d.branchId ?? d.BranchId);
        if (unitIdVal != null && unitIdVal > 0) this.loadWingsForUnit(unitIdVal, () => {});
        const initiatorIdVal = this.toNum(d.initiatorId ?? d.InitiatorId);
        const finalApproverIdVal = this.toNum(d.finalApproverId ?? d.FinalApproverId);
        const refNum = d.referenceNumber ?? d.ReferenceNumber;
        const noteNo = d.noteSheetNo ?? d.NoteSheetNo;
        this.form.patchValue({
            textType: (d.textType ?? d.TextType) === 1 ? 'bn' : 'en',
            noteSheetDate: this.parseDate(noteSheetDate),
            unitId: unitIdVal,
            wingBattalionId: wingId,
            branchId: branchIdVal,
            referenceNumber: refNum != null ? String(refNum) : '',
            noteSheetNo: noteNo != null ? String(noteNo) : '',
            rabIdEmployeeId: this.selectedEmployeeId,
            subject: String(d.subject ?? d.Subject ?? ''),
            purposeOfExBdLeaveId: purposeId,
            destinationCountryId: destCountryId,
            dateOfVisitFrom: this.parseDate(fromDate),
            dateOfVisitTo: this.parseDate(toDate),
            totalDays,
            familyMemberIds: familyMemberIds,
            mainText: String(d.mainText ?? d.MainText ?? ''),
            preparedBy: String(d.createdBy ?? d.CreatedBy ?? d.lastUpdatedBy ?? d.LastUpdatedBy ?? this.sharedService.getCurrentUser?.() ?? ''),
            initiatorId: initiatorIdVal,
            recommenderIds,
            finalApproverId: finalApproverIdVal
        });
        this.calculateTotalDays();
        const filesRefs = d.filesReferences ?? d.FilesReferences;
        try {
            if (filesRefs && typeof filesRefs === 'string') {
                const refs = JSON.parse(filesRefs) as { FileId?: number; fileId?: number; fileName?: string; FileName?: string }[];
                this.fileRows = Array.isArray(refs)
                    ? refs.map((r) => ({
                          displayName: String(r.fileName ?? r.FileName ?? ''),
                          file: null,
                          fileId: r.FileId ?? r.fileId ?? 0
                      }))
                    : [];
            }
        } catch { /* ignore */ }
    }

    private loadNoteSheetForEdit(noteSheetId: number): void {
        const cached = this.noteSheetEditCache.get(noteSheetId);
        if (cached != null && typeof cached === 'object') {
            this.editLoading = false;
            this.applyNoteSheetToForm(cached);
            return;
        }
        this.editLoading = true;
        const api = `${environment.apis.core}/NoteSheetInfo`;
        this.http.get<any>(`${api}/GetFilteredByKeysAsyn/${noteSheetId}`).subscribe({
            next: (data) => {
                try {
                    this.editLoading = false;
                    const raw = data != null && typeof data === 'object'
                        ? (data.data ?? data.value ?? data.result ?? data.items ?? data) : data;
                    const list = Array.isArray(raw) ? raw : (raw != null && typeof raw === 'object' && !Array.isArray(raw) ? [raw] : []);
                    const d = list[0];
                    if (!d) {
                        this.editLoadFailed = true;
                        this.messageService.add({ severity: 'warn', summary: 'No data', detail: 'Note sheet not found or no data returned for update.' });
                        return;
                    }
                    this.noteSheetEditCache.set(noteSheetId, d);
                    this.applyNoteSheetToForm(d);
                } catch (e) {
                    this.editLoading = false;
                    this.editLoadFailed = true;
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Load failed',
                        detail: e instanceof Error ? e.message : 'Could not load note sheet data.'
                    });
                }
            },
            error: (err) => {
                this.editLoading = false;
                this.editLoadFailed = true;
                const detail = err?.error?.message ?? err?.message ?? 'Failed to load note-sheet for edit.';
                this.messageService.add({ severity: 'error', summary: 'Error', detail });
            }
        });
    }

    loadUnits(): void {
        const mapList = (list: CommonCode[] | unknown) =>
            (Array.isArray(list) ? list : []).map((c: CommonCode) => ({
                label: c.codeValueEN || c.codeValueBN || String(c.codeId),
                labelBn: c.codeValueBN ?? null,
                value: c.codeId
            }));
        this.masterBasicSetupService.getAllByType('RabUnit').subscribe({
            next: (list) => {
                const opts = mapList(list);
                if (opts.length > 0) {
                    this.unitOptions = opts;
                    return;
                }
                this.masterBasicSetupService.getAllByType('RABUNIT').subscribe({
                    next: (list2) => {
                        this.unitOptions = mapList(list2);
                    },
                    error: () => {}
                });
            },
            error: () => {
                this.masterBasicSetupService.getAllByType('RABUNIT').subscribe({
                    next: (list) => {
                        this.unitOptions = mapList(list);
                    },
                    error: () => {}
                });
            }
        });
    }

    onUnitChange(): void {
        const unitId = this.form.get('unitId')?.value;
        this.form.patchValue({ wingBattalionId: null }, { emitEvent: false });
        this.loadWingsForUnit(unitId ?? null);
    }

    loadWingsForUnit(unitId: number | null, done?: () => void): void {
        if (unitId == null || unitId <= 0) {
            this.wingOptions = [];
            done?.();
            return;
        }
        this.masterBasicSetupService.getByParentId(unitId).subscribe({
            next: (list) => {
                this.wingOptions = (Array.isArray(list) ? list : []).map((c: CommonCode) => ({
                    label: c.codeValueEN || c.codeValueBN || String(c.codeId),
                    labelBn: c.codeValueBN ?? null,
                    value: c.codeId
                }));
                done?.();
            },
            error: () => {
                this.wingOptions = [];
                done?.();
            }
        });
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

    loadPurposeOfLeave(): void {
        this.masterBasicSetupService.getAllByType('ExBDLeavePurpose').subscribe({
            next: (list) => {
                this.purposeOfLeaveOptions = (Array.isArray(list) ? list : []).map((c: CommonCode) => ({
                    label: c.codeValueEN || c.codeValueBN || String(c.codeId),
                    labelBn: c.codeValueBN ?? null,
                    value: c.codeId
                }));
            },
            error: () => {
                this.purposeOfLeaveOptions = [
                    { label: 'Personal', labelBn: 'ব্যক্তিগত', value: 1 },
                    { label: 'Official', labelBn: 'দাপ্তরিক', value: 2 }
                ];
            }
        });
    }

    loadCountries(): void {
        this.masterBasicSetupService.getAllByType('Country').subscribe({
            next: (list) => {
                this.countryOptions = (Array.isArray(list) ? list : []).map((c: CommonCode) => ({
                    label: c.codeValueEN || c.codeValueBN || String(c.codeId),
                    labelBn: c.codeValueBN ?? null,
                    value: c.codeId
                }));
            },
            error: () => {}
        });
    }

    loadApproverOptions(): void {
        this.http.get<any[]>(`${environment.apis.core}/EmployeeInfo/GetAll`).subscribe({
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

    onEmployeeSelected(info: EmployeeBasicInfo | null): void {
        this.selectedEmployee = info;
        this.selectedEmployeeId = info?.employeeID ?? null;
        this.form.patchValue({ rabIdEmployeeId: this.selectedEmployeeId });
        if (info) {
            this.form.patchValue({
                wingBattalionId: info.unit ?? null,
                branchId: info.branch ?? null
            });
            this.loadFamilyMembersForEmployee(info.employeeID);
        } else {
            this.familyMemberOptions = [];
            this.form.patchValue({ familyMemberIds: [] });
        }
    }

    loadRelationships(): void {
        this.masterBasicSetupService.getAllByType('Relationship').subscribe({
            next: (list) => {
                this.relationshipOptions = (Array.isArray(list) ? list : []).map((c: CommonCode) => ({
                    label: c.codeValueEN || c.codeValueBN || String(c.codeId),
                    labelBn: c.codeValueBN ?? null,
                    value: c.codeId
                }));
            },
            error: () => {}
        });
    }

    private getRelationLabel(relationId: number | null | undefined, forBangla: boolean): string {
        if (relationId == null) return '';
        const o = this.relationshipOptions.find((r) => r.value === relationId);
        if (!o) return '';
        return forBangla && o.labelBn ? o.labelBn : o.label;
    }

    loadFamilyMembersForEmployee(employeeId: number, restoreSelectedIds?: number[]): void {
        this.familyInfoService.getByEmployeeId(employeeId).subscribe({
            next: (data: FamilyInfoModel[] | any) => {
                const list = Array.isArray(data) ? data : (data?.data ?? data?.value ?? []);
                this.familyMemberOptions = (list || []).map((item: any) => {
                    const fmid = item.fmid ?? item.FMID ?? 0;
                    const name = (item.nameEN ?? item.NameEN ?? item.nameBN ?? item.NameBN ?? `FM ${fmid}`) || `FM ${fmid}`;
                    const relationId = item.relation ?? item.Relation;
                    const relationEn = this.getRelationLabel(relationId, false);
                    const relationBn = this.getRelationLabel(relationId, true);
                    const relationPart = relationEn ? ` (${relationEn})` : '';
                    const relationPartBn = relationBn ? ` (${relationBn})` : '';
                    const label = String(name).trim() + relationPart;
                    const labelBn = (this.isBangla && relationPartBn) ? String(name).trim() + relationPartBn : undefined;
                    return {
                        label,
                        labelBn,
                        value: fmid,
                        fmid,
                        employeeId: item.employeeId ?? item.EmployeeId ?? employeeId,
                        relationLabel: relationEn || relationBn || undefined
                    };
                });
                const ids = restoreSelectedIds ?? this.form.get('familyMemberIds')?.value ?? [];
                const toSet = Array.isArray(ids) ? ids : [];
                this.form.patchValue({ familyMemberIds: toSet });
                setTimeout(() => this.form.patchValue({ familyMemberIds: toSet }), 0);
            },
            error: () => {
                this.familyMemberOptions = [];
            }
        });
    }

    calculateTotalDays(): void {
        const from = this.form.get('dateOfVisitFrom')?.value;
        const to = this.form.get('dateOfVisitTo')?.value;
        if (!from || !to) {
            this.form.patchValue({ totalDays: 0 }, { emitEvent: false });
            return;
        }
        const fromDate = from instanceof Date ? from : new Date(from);
        const toDate = to instanceof Date ? to : new Date(to);
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            this.form.patchValue({ totalDays: 0 }, { emitEvent: false });
            return;
        }
        const diff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        this.form.patchValue({ totalDays: diff >= 0 ? diff : 0 }, { emitEvent: false });
    }

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

    /** Selected family members with relation, e.g. "Name (Son)", "Name (Wife)" - like recommender list. */
    getSelectedFamilyMemberLabels(): string[] {
        const ids = this.form.get('familyMemberIds')?.value as number[] | null;
        if (!Array.isArray(ids) || ids.length === 0) return [];
        return ids
            .map((id) => {
                const o = this.familyMemberOptions.find((op) => op.value === id);
                return o ? (this.isBangla && o.labelBn ? o.labelBn : o.label) : '';
            })
            .filter((l) => !!l);
    }

    onFileRowsChange(event: FileRowData[]): void {
        if (event && Array.isArray(event)) this.fileRows = event;
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
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: this.isBangla ? 'অনুগ্রহ করে আবশ্যক ক্ষেত্র পূরণ করুন।' : 'Please fill required fields.' });
            return;
        }
        this.isSubmitting = true;
        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];
        const doSave = (filesReferencesJson: string | null) => {
            try {
                const payload = this.buildPayload(filesReferencesJson);
                if (this.editMode && this.editId != null) (payload as any).noteSheetId = this.editId;
                const api = `${environment.apis.core}/NoteSheetInfo`;
                const endpoint = this.editMode && this.editId != null ? '/UpdateAsyn' : '/SaveAsyn';
                this.http.post(api + endpoint, payload).subscribe({
                    next: () => {
                        this.messageService.add({
                            severity: 'success',
                            summary: this.isBangla ? 'মন্তব্যপত্র' : 'Note Sheet',
                            detail: this.editMode
                                ? (this.isBangla ? 'মন্তব্যপত্র আপডেট হয়েছে।' : 'Note Sheet updated successfully.')
                                : (this.isBangla ? 'এক্স-বিডি ছুটির মন্তব্যপত্র সফলভাবে তৈরি হয়েছে।' : 'Ex-BD Leave Note Sheet generated successfully.')
                        });
                        this.isSubmitting = false;
                        if (this.editMode) this.router.navigate(['/notesheet-list/draft']);
                    },
                    error: (err) => {
                        const detail = err?.error?.message || err?.message || (this.isBangla ? 'মন্তব্যপত্র তৈরি ব্যর্থ।' : 'Failed to generate note sheet.');
                        this.messageService.add({ severity: 'error', summary: 'Error', detail });
                        this.isSubmitting = false;
                    }
                });
            } catch (e) {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: e instanceof Error ? e.message : 'Failed.' });
                this.isSubmitting = false;
            }
        };
        if (filesToUpload.length > 0) {
            const uploads = filesToUpload.map((r: FileRowData) =>
                this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name)
            );
            forkJoin(uploads).subscribe({
                next: (results: unknown) => {
                    const arr = Array.isArray(results) ? results : [];
                    const newRefs = (arr as { fileId: number; fileName: string }[]).map((r) => ({ FileId: r.fileId, fileName: r.fileName }));
                    const allRefs = [...existingRefs.map((r) => ({ FileId: r.FileId, fileName: r.fileName })), ...newRefs];
                    doSave(JSON.stringify(allRefs));
                },
                error: () => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to upload files.' });
                    this.isSubmitting = false;
                }
            });
            return;
        }
        doSave(existingRefs.length > 0 ? JSON.stringify(existingRefs) : null);
    }

    private formatDate(value: Date | string | null | undefined): string {
        if (value instanceof Date) {
            const y = value.getFullYear(), m = value.getMonth(), d = value.getDate();
            return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    private buildPayload(filesReferencesJson: string | null): any {
        const d = this.form.getRawValue();
        const now = new Date().toISOString();
        const preparedBy = (d.preparedBy && String(d.preparedBy).trim()) || 'system';
        const familyIds = (d.familyMemberIds as number[]) || [];
        const familyInfoJson = familyIds.length && this.selectedEmployeeId
            ? JSON.stringify(familyIds.map((fmid) => ({ employeeId: this.selectedEmployeeId, familyMemberId: fmid })))
            : null;
        return {
            noteSheetId: 0,
            noteSheetTypeId: 3,
            employeeId: d.rabIdEmployeeId ?? 0,
            fileNumber: 0,
            noteSheetNo: (d.noteSheetNo && String(d.noteSheetNo).trim()) || 'AUTO',
            noteSheetDate: this.formatDate(d.noteSheetDate),
            subject: d.subject != null ? String(d.subject) : '',
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
            unitId: d.unitId ?? null,
            wingBattalionId: d.wingBattalionId ?? null,
            branchId: d.branchId ?? null,
            referenceNumber: d.referenceNumber != null ? String(d.referenceNumber) : null,
            preparedByEmployeeId: null,
            recommenderIdsJson: d.recommenderIds?.length ? JSON.stringify(d.recommenderIds) : null,
            finalApproverId: d.finalApproverId ?? null,
            familyInfoJson,
            filesReferences: filesReferencesJson,
            purposeId: d.purposeOfExBdLeaveId ?? null,
            PurposeId: d.purposeOfExBdLeaveId ?? null,
            destinationCountryId: d.destinationCountryId ?? null,
            fromDate: this.formatDate(d.dateOfVisitFrom),
            toDate: this.formatDate(d.dateOfVisitTo),
            totalDays: d.totalDays ?? 0
        };
    }
}
