import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { MessageService } from 'primeng/api';
import { SharedService } from '@/shared/services/shared-service';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { FluidModule } from 'primeng/fluid';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { CheckboxModule } from 'primeng/checkbox';
import { CommonCode } from '@/Components/basic-setup/shared/models/common-code';
import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { EmpService } from '@/services/emp-service';
import { CommonCodeService } from '@/services/common-code-service';
import { FamilyInfoService, FamilyInfoModel } from '@/services/family-info-service';
import { ActivatedRoute, Router } from '@angular/router';
import { take, map, catchError } from 'rxjs/operators';
import { RouterLink } from '@angular/router';
import { NoteSheetEditCacheService } from '@/services/note-sheet-edit-cache.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { NoteSheetType, NoteSheetCurrentStatus, ApprovalStatus, NoteSheetOperationTypeOptions } from '@/models/enums';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NotesheetSignatoryComponent, SignatoryDetail } from '@/Components/Common/notesheet-signatory/notesheet-signatory';
import {
    Document, Packer, Paragraph, TextRun,
    AlignmentType, PageOrientation, ImageRun
} from 'docx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

@Component({
    selector: 'app-notesheet-ex-bd-leave',
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
        DatePickerModule,
        RichEditorComponent,
        ToastModule,
        TooltipModule,
        FileReferencesFormComponent,
        RouterLink,
        NotesheetSignatoryComponent,
        CheckboxModule
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
    readonly noteSheetOperationTypeOptions = NoteSheetOperationTypeOptions;
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
    /** Selected employee from RAB dropdown (auto-fill wing, branch, etc.) */
    selectedEmployee: any = null;
    selectedEmployeeId: number | null = null;
    /** Whether the logged-in user has an employee mapping (show readonly vs dropdown for Prepared By) */
    isPreparedByMapped = false;

    /** View mode */
    viewMode = false;
    viewNoteSheet: any = null;
    viewLoading = false;
    initiatorDetails: SignatoryDetail | null = null;
    approversDetails: SignatoryDetail[] = [];
    preparedByDetails: SignatoryDetail | null = null;
    /** Inline edit in view mode */
    viewEditing = false;
    savingView = false;
    editSubject = '';
    editMainText = '';
    editReferenceNumber = '';
    editPurposeId: number | null = null;
    editDestinationCountryId: number | null = null;
    editDateOfVisitFrom: Date | null = null;
    editDateOfVisitTo: Date | null = null;
    editTotalDays = 0;

    private readonly stepTranslations: Record<string, string> = {
        'Prepared by': 'প্রস্তুতকারী',
        'Initiator': 'সূচনাকারী',
        'Final Approver': 'চূড়ান্ত অনুমোদনকারী'
    };

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
        private noteSheetEditCache: NoteSheetEditCacheService,
        private sanitizer: DomSanitizer,
        private identityMappingService: IdentityUserMappingService,
        private commonCodeService: CommonCodeService
    ) {
        this.form = this.fb.group({
            textType: ['en'],
            noteSheetDate: [null as Date | null, Validators.required],
            unitId: [null as number | null],
            wingBattalionId: [null as number | null],
            branchId: [null as number | null],
            referenceNumber: ['', Validators.required],
            noteSheetNo: [''],
            noteSheetOperationType: [null as string | null, Validators.required],
            isSecret: [false],
            rabIdEmployeeId: [null as number | null, Validators.required], // employee ID when RAB ID selected
            subject: ['', Validators.required],
            purposeOfExBdLeaveId: [null as number | null, Validators.required],
            destinationCountryId: [null as number | null, Validators.required],
            dateOfVisitFrom: [null as Date | null, Validators.required],
            dateOfVisitTo: [null as Date | null, Validators.required],
            totalDays: [0],
            familyMemberIds: [[] as number[]], // selected FMIDs for family list
            mainText: [''],
            preparedBy: [''],
            preparedByEmployeeId: [null as number | null],
            initiatorId: [null as number | null, Validators.required],
            recommenderIds: [[] as number[]],
            finalApproverId: [null as number | null, Validators.required]
        });
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
    get purposeOptionsDisplay(): { label: string; value: number }[] {
        return this.purposeOfLeaveOptions.map((o) => ({ label: o.label, value: o.value }));
    }
    get countryOptionsDisplay(): { label: string; value: number }[] {
        return this.countryOptions.map((o) => ({ label: o.label, value: o.value }));
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
    /** RAB employee dropdown uses the same options as initiator */
    get rabEmployeeOptionsDisplay(): { label: string; value: number }[] {
        return this.initiatorOptions.map((o) => ({ label: o.label, value: o.value }));
    }

    ngOnInit(): void {
        this.route.queryParams.pipe(take(1)).subscribe((params) => {
            const mode = params['mode'];
            const id = params['id'];
            if (mode === 'view' && id != null && id !== '') {
                const numId = Number(id);
                if (!isNaN(numId) && numId > 0) {
                    this.viewMode = true;
                    this.title = 'Ex-BD Leave Note Sheet – Preview';
                    this.loadPurposeOfLeave();
                    this.loadCountries();
                    this.loadNoteSheetForView(numId);
                    return;
                }
            }
            // Form mode (create / edit)
            this.loadUnits();
            this.loadBranches();
            this.loadRelationships();
            this.loadPurposeOfLeave();
            this.loadCountries();
            this.loadApproverOptions();
            const user = this.sharedService.getCurrentUser?.() ?? '';
            this.form.get('preparedBy')?.setValue(user);
            this.resolvePreparedByMapping();
            this.form.get('dateOfVisitFrom')?.valueChanges.subscribe(() => this.calculateTotalDays());
            this.form.get('dateOfVisitTo')?.valueChanges.subscribe(() => this.calculateTotalDays());
            this.form.get('unitId')?.valueChanges.subscribe(() => {
                this.onUnitChange();
            });
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
        const rawJson = d.recommendersJson ?? d.RecommendersJson ?? d.recommenderIdsJson ?? d.RecommenderIdsJson;
        try {
            if (rawJson && typeof rawJson === 'string') {
                const arr = JSON.parse(rawJson) as any[];
                if (Array.isArray(arr) && arr.length > 0) {
                    if (typeof arr[0] === 'object' && arr[0] !== null) {
                        recommenderIds = arr.map((r: any) => r.recomender_id ?? r.recomenderId ?? r.employeeId ?? r.EmployeeId ?? 0).filter(Boolean);
                    } else {
                        recommenderIds = arr.filter((x: any) => typeof x === 'number');
                    }
                }
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
        const finalApproverIdVal = this.toNum(d.finalApprovalId ?? d.FinalApprovalId ?? d.finalApproverId ?? d.FinalApproverId);
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
            noteSheetOperationType: d.noteSheetOperationType ?? d.NoteSheetOperationType ?? null,
            isSecret: !!(d.isSecret ?? d.IsSecret ?? false),
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
            preparedByEmployeeId: d.preparedByEmployeeId ?? d.PreparedByEmployeeId ?? null,
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
        this.commonCodeService.getAllActiveCommonCodesType('VisitType').subscribe({
            next: (list) => {
                this.purposeOfLeaveOptions = (Array.isArray(list) ? list : []).map((c: any) => ({
                    label: c.codeValueEN || c.displayCodeValueEN || c.codeValueBN || String(c.codeId),
                    labelBn: c.codeValueBN ?? null,
                    value: c.codeId
                }));
            },
            error: () => {}
        });
    }

    loadCountries(): void {
        this.commonCodeService.getAllActiveCommonCodesType('Country').subscribe({
            next: (list) => {
                this.countryOptions = (Array.isArray(list) ? list : []).map((c: any) => ({
                    label: c.codeValueEN || c.displayCodeValueEN || c.codeValueBN || String(c.codeId),
                    labelBn: c.codeValueBN ?? null,
                    value: c.codeId
                }));
            },
            error: () => {}
        });
    }

    /** Raw employee list from API, kept for lookup when RAB dropdown changes */
    private allEmployees: any[] = [];

    loadApproverOptions(): void {
        this.http.get<any[]>(`${environment.apis.core}/EmployeeInfo/GetAll`).subscribe({
            next: (list) => {
                this.allEmployees = Array.isArray(list) ? list : [];
                const opts = this.allEmployees.map((e: any) => {
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
                this.initiatorOptions = opts;
                this.recommenderOptions = opts;
                this.finalApproverOptions = opts;
            },
            error: () => {}
        });
    }

    /** Called when the RAB employee dropdown value changes */
    onRabEmployeeChange(employeeId: number | null): void {
        this.selectedEmployeeId = employeeId;
        this.form.patchValue({ rabIdEmployeeId: employeeId });
        if (employeeId) {
            const emp = this.allEmployees.find((e: any) => (e.employeeID ?? e.EmployeeID) === employeeId);
            if (emp) {
                this.form.patchValue({
                    wingBattalionId: emp.unit ?? emp.Unit ?? null,
                    branchId: emp.branch ?? emp.Branch ?? null
                });
            }
            this.loadFamilyMembersForEmployee(employeeId);
        } else {
            this.familyMemberOptions = [];
            this.form.patchValue({ familyMemberIds: [] });
        }
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
                            const rabId = emp?.RABID || emp?.Rabid || emp?.rabid || '';
                            const serviceId = emp?.ServiceId || emp?.serviceId || '';
                            const parts = [name, rabId ? `RAB: ${rabId}` : '', serviceId ? `SVC: ${serviceId}` : ''].filter(Boolean);
                            this.form.get('preparedBy')?.setValue(parts.join(' | ') || `Employee #${empId}`);
                        }
                    });
                } else {
                    this.isPreparedByMapped = false;
                }
            },
            error: () => {
                this.isPreparedByMapped = false;
            }
        });
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
                    const labelBn = relationPartBn ? String(name).trim() + relationPartBn : undefined;
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
                return o ? o.label : '';
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
                return o ? o.label : '';
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
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please fill required fields.' });
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
                            summary: 'Note Sheet',
                            detail: this.editMode
                                ? 'Note Sheet updated successfully.'
                                : 'Ex-BD Leave Note Sheet generated successfully.'
                        });
                        this.isSubmitting = false;
                        if (this.editMode) this.router.navigate(['/notesheet-list/draft']);
                    },
                    error: (err) => {
                        const detail = err?.error?.message || err?.message || 'Failed to generate note sheet.';
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
            noteSheetType: NoteSheetType.ExBDLeave,
            noteSheetNo: 'AUTO',
            noteSheetDate: this.formatDate(d.noteSheetDate),
            noteSheetTemplateId: null,
            referenceNumber: d.referenceNumber != null ? String(d.referenceNumber) : null,
            subject: d.subject != null ? String(d.subject) : '',
            mainText: d.mainText != null ? String(d.mainText) : '',
            note: null,
            textType: d.textType === 'bn' ? 1 : 0,
            isSecret: d.isSecret ?? false,
            noteSheetOperationType: d.noteSheetOperationType ?? null,
            employeeId: d.rabIdEmployeeId ?? null,
            preparedByEmployeeId: d.preparedByEmployeeId ?? null,
            unitId: d.unitId ?? null,
            wingBattalionId: d.wingBattalionId ?? null,
            branchId: d.branchId ?? null,
            initiatorId: d.initiatorId ?? 0,
            recommendersJson,
            finalApprovalId: d.finalApproverId ?? null,
            familyInfoJson,
            purposeId: d.purposeOfExBdLeaveId ?? null,
            destinationCountryId: d.destinationCountryId ?? null,
            fromDate: this.formatDate(d.dateOfVisitFrom),
            toDate: this.formatDate(d.dateOfVisitTo),
            createdBy: preparedBy,
            lastUpdatedBy: preparedBy,
            createdDate: now,
            lastupdate: now
        };
        if (filesReferencesJson != null && filesReferencesJson !== '') {
            payload['filesReferences'] = filesReferencesJson;
        }
        return payload;
    }

    // ─── View Mode ──────────────────────────────────────────────

    private loadNoteSheetForView(noteSheetId: number): void {
        this.viewLoading = true;
        const api = `${environment.apis.core}/NoteSheetInfo`;
        this.http.get<any>(`${api}/GetFilteredByKeysAsyn/${noteSheetId}`).subscribe({
            next: (data) => {
                const raw = data != null && typeof data === 'object' ? (data.data ?? data.value ?? data.result ?? data) : data;
                const list = Array.isArray(raw) ? raw : (raw != null && typeof raw === 'object' ? [raw] : []);
                this.viewNoteSheet = list[0] ?? null;
                if (this.viewNoteSheet) this.loadApprovalChain(this.viewNoteSheet);
                this.viewLoading = false;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load note sheet.' });
                this.viewLoading = false;
            }
        });
    }

    private loadApprovalChain(ns: any): void {
        const preparedByEmpId = ns.preparedByEmployeeId && ns.preparedByEmployeeId > 0 ? ns.preparedByEmployeeId : null;
        const initiatorId = ns.initiatorId && ns.initiatorId > 0 ? ns.initiatorId : null;
        const approverIds: { empId: number; step: string }[] = [];
        try {
            const json = ns.recommenderIdsJson;
            if (json && typeof json === 'string') {
                const arr = JSON.parse(json) as number[] | { EmployeeId?: number; employeeId?: number }[];
                if (Array.isArray(arr)) {
                    arr.forEach((r, i) => {
                        const id = typeof r === 'number' ? r : (r.EmployeeId ?? r.employeeId);
                        if (id && id > 0) approverIds.push({ empId: id, step: `Recommender ${arr.length > 1 ? i + 1 : ''}`.trim() });
                    });
                }
            }
        } catch { /* ignore */ }
        const finalApproverEmpId = (ns.approvedByEmployeeId && ns.approvedByEmployeeId > 0)
            ? ns.approvedByEmployeeId
            : (ns.finalApproverId && ns.finalApproverId > 0 ? ns.finalApproverId : null);
        if (finalApproverEmpId) approverIds.push({ empId: finalApproverEmpId, step: 'Final Approver' });

        const allIds = [
            ...(preparedByEmpId ? [{ empId: preparedByEmpId, step: 'Prepared by' }] : []),
            ...(initiatorId ? [{ empId: initiatorId, step: 'Initiator' }] : []),
            ...approverIds
        ];
        if (allIds.length === 0) return;
        const obs = allIds.map(({ empId, step }) =>
            forkJoin({
                searchInfo: this.empService.getEmployeeSearchInfo(empId),
                empInfo: this.empService.getEmployeeById(empId).pipe(catchError(() => of(null)))
            }).pipe(
                map(({ searchInfo, empInfo }) => {
                    const emp = empInfo as any;
                    const info = searchInfo as any;
                    const name = info?.fullNameEN ?? info?.FullNameEN ?? emp?.FullNameEN ?? emp?.fullNameEN ?? '-';
                    const rabId = emp?.RABID || emp?.Rabid || emp?.rabid || emp?.rabID || emp?.rabId
                        || info?.rabID || info?.RABID || info?.rabid || info?.Rabid || info?.rabId || '-';
                    const rank = info?.rank ?? info?.Rank ?? '-';
                    const appointment = info?.appointment ?? info?.Appointment ?? emp?.Appointment ?? '';
                    return { step, name, rabId, rank, serviceRank: rank, appointment, employeeId: empId } as SignatoryDetail;
                })
            )
        );
        forkJoin(obs).subscribe({
            next: (results) => {
                let idx = 0;
                this.preparedByDetails = preparedByEmpId ? results[idx++] ?? null : null;
                this.initiatorDetails = initiatorId ? results[idx++] ?? null : null;
                this.approversDetails = approverIds.length > 0 ? results.slice(idx) : [];
                this.loadSignaturesForChain();
            },
            error: () => {}
        });
    }

    private loadSignaturesForChain(): void {
        const allDetails = [
            ...(this.preparedByDetails ? [this.preparedByDetails] : []),
            ...(this.initiatorDetails ? [this.initiatorDetails] : []),
            ...this.approversDetails
        ].filter(d => d.employeeId && d.employeeId > 0);

        for (const detail of allDetails) {
            this.empService.getSignatureBlob(detail.employeeId!).subscribe({
                next: (blob) => {
                    if (blob && blob.size > 0) {
                        const reader = new FileReader();
                        reader.onloadend = () => { detail.signatureDataUrl = reader.result as string; };
                        reader.readAsDataURL(blob);
                    }
                },
                error: () => { /* no signature available */ }
            });
        }
    }

    isViewEnglish(): boolean {
        return (this.viewNoteSheet?.textType ?? 0) === 0;
    }

    isViewDraft(): boolean {
        return this.viewNoteSheet?.currentStatus === NoteSheetCurrentStatus.Draft;
    }

    shouldShowSignature(step: string): boolean {
        const ns = this.viewNoteSheet;
        if (!ns) return false;
        if (step === 'Prepared by' || step === 'প্রস্তুতকারী') return true;
        if (step === 'Initiator') return ns.initiatorStatus === ApprovalStatus.Approve;
        if (step.startsWith('Recommender')) {
            const cs: string = ns.currentStatus ?? '';
            return cs === NoteSheetCurrentStatus.Recommender
                || cs === NoteSheetCurrentStatus.FinalApproval
                || cs === NoteSheetCurrentStatus.Cancel;
        }
        if (step === 'Final Approver') return ns.finalApprovalStatus === ApprovalStatus.Approve;
        return false;
    }

    getViewMainTextSafe(): SafeHtml {
        return this.sanitizer.bypassSecurityTrustHtml(this.viewNoteSheet?.mainText ?? '');
    }

    getViewSupportingDocs(): { fileId: number; fileName: string }[] {
        const json = this.viewNoteSheet?.filesReferences;
        if (!json || typeof json !== 'string') return [];
        try {
            const arr = JSON.parse(json) as { FileId?: number; fileId?: number; fileName?: string; FileName?: string }[];
            if (!Array.isArray(arr)) return [];
            return arr
                .filter((r) => (r.FileId ?? r.fileId) != null)
                .map((r) => ({ fileId: r.FileId ?? r.fileId ?? 0, fileName: (r.fileName ?? r.FileName ?? '').trim() || 'download' }))
                .filter((d) => d.fileId > 0);
        } catch { return []; }
    }

    getViewFamilySummary(): string {
        const json = this.viewNoteSheet?.familyInfoJson;
        if (!json || typeof json !== 'string') return '';
        try {
            const arr = JSON.parse(json) as unknown[];
            if (Array.isArray(arr) && arr.length > 0) return `${arr.length} member(s)`;
        } catch { /* ignore */ }
        return '';
    }

    onViewDownloadDoc(fileId: number, fileName: string): void {
        this.empService.downloadFile(fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, fileName),
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download file.' })
        });
    }

    onViewPreviewDoc(fileId: number, fileName: string): void {
        this.empService.downloadFile(fileId).subscribe({
            next: (blob) => {
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                setTimeout(() => URL.revokeObjectURL(url), 60000);
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to open file.' })
        });
    }

    // ─── View inline edit ───

    toggleViewEdit(): void {
        const ns = this.viewNoteSheet;
        this.editSubject = ns?.subject ?? '';
        this.editMainText = ns?.mainText ?? '';
        this.editReferenceNumber = ns?.referenceNumber ?? '';
        this.editPurposeId = ns?.purposeId ?? ns?.purposeOfExBdLeaveId ?? null;
        this.editDestinationCountryId = ns?.destinationCountryId ?? null;
        this.editDateOfVisitFrom = this.parseDate(ns?.fromDate ?? ns?.dateOfVisitFrom);
        this.editDateOfVisitTo = this.parseDate(ns?.toDate ?? ns?.dateOfVisitTo);
        this.editTotalDays = ns?.totalDays ?? 0;
        this.viewEditing = true;
    }

    cancelViewEdit(): void {
        this.viewEditing = false;
    }

    calculateEditTotalDays(): void {
        if (this.editDateOfVisitFrom && this.editDateOfVisitTo) {
            const from = this.editDateOfVisitFrom.getTime();
            const to = this.editDateOfVisitTo.getTime();
            this.editTotalDays = Math.max(0, Math.ceil((to - from) / (1000 * 60 * 60 * 24)) + 1);
        } else {
            this.editTotalDays = 0;
        }
    }

    /** Resolve a codeId to its label from dropdown options */
    getPurposeLabel(id: number | null | undefined): string {
        if (id == null) return '—';
        const o = this.purposeOfLeaveOptions.find((opt) => opt.value === id);
        return o ? o.label : String(id);
    }

    getCountryLabel(id: number | null | undefined): string {
        if (id == null) return '—';
        const o = this.countryOptions.find((opt) => opt.value === id);
        return o ? o.label : String(id);
    }

    saveViewChanges(): void {
        if (!this.viewNoteSheet) return;
        this.savingView = true;
        const payload = {
            ...this.viewNoteSheet,
            subject: this.editSubject,
            mainText: this.editMainText,
            referenceNumber: this.editReferenceNumber,
            purposeId: this.editPurposeId,
            purposeOfExBdLeaveId: this.editPurposeId,
            destinationCountryId: this.editDestinationCountryId,
            fromDate: this.formatDate(this.editDateOfVisitFrom),
            toDate: this.formatDate(this.editDateOfVisitTo),
            totalDays: this.editTotalDays
        };
        const api = `${environment.apis.core}/NoteSheetInfo`;
        this.http.post<{ statusCode?: number }>(`${api}/UpdateAsyn`, payload).subscribe({
            next: (res) => {
                this.savingView = false;
                if (res?.statusCode === 200) {
                    this.viewNoteSheet.subject = this.editSubject;
                    this.viewNoteSheet.mainText = this.editMainText;
                    this.viewNoteSheet.referenceNumber = this.editReferenceNumber;
                    this.viewNoteSheet.purposeId = this.editPurposeId;
                    this.viewNoteSheet.purposeOfExBdLeaveId = this.editPurposeId;
                    this.viewNoteSheet.destinationCountryId = this.editDestinationCountryId;
                    this.viewNoteSheet.fromDate = this.formatDate(this.editDateOfVisitFrom);
                    this.viewNoteSheet.toDate = this.formatDate(this.editDateOfVisitTo);
                    this.viewNoteSheet.totalDays = this.editTotalDays;
                    this.viewEditing = false;
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Note sheet updated.' });
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Notice', detail: 'Update may not have saved.' });
                }
            },
            error: () => {
                this.savingView = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Update failed.' });
            }
        });
    }

    goToEditForm(): void {
        const id = this.viewNoteSheet?.noteSheetId;
        if (id) this.router.navigate(['/notesheet-ex-bd-leave'], { queryParams: { id } });
    }

    // ─── Exports ────────────────────────────────────────────────

    private translateStep(step: string): string {
        if (this.isViewEnglish()) return step;
        if (step.startsWith('Recommender')) {
            const suffix = step.replace('Recommender', '').trim();
            return suffix ? `সুপারিশকারী ${suffix}` : 'সুপারিশকারী';
        }
        return this.stepTranslations[step] ?? step;
    }

    private stripHtml(html: string): string {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    }

    private escapeHtml(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    private dataUrlToUint8Array(dataUrl: string): Uint8Array {
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) { array[i] = binary.charCodeAt(i); }
        return array;
    }

    formatDateView(value: any): string {
        if (!value) return '—';
        const dt = value instanceof Date ? value : new Date(value);
        if (isNaN(dt.getTime())) return String(value);
        return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
    }

    private buildSignatoriesHtml(): string {
        const sigImg = (detail: any, align: string) => detail?.signatureDataUrl && this.shouldShowSignature(detail.step)
            ? `<img src="${detail.signatureDataUrl}" style="width:150px;height:50px;object-fit:contain;display:block;${align === 'right' ? 'margin-left:auto' : ''}" />`
            : '';
        const sigBlock = (detail: any, align: string) => {
            if (!detail) return '';
            const lines = [
                detail.rabId && detail.rabId !== '-' ? `RAB ID: ${detail.rabId}` : '',
                detail.rank && detail.rank !== '-' ? detail.rank : '',
                detail.appointment && detail.appointment !== '-' ? detail.appointment : ''
            ].filter(Boolean);
            return `<div style="text-align:${align};margin-top:20px;line-height:1.6">
                ${sigImg(detail, align)}
                <div style="width:160px;border-bottom:1.5px solid #000;margin-bottom:4px;${align === 'right' ? 'margin-left:auto' : ''}"></div>
                <div style="font-weight:600;font-size:9pt;text-transform:uppercase;color:#000">${this.escapeHtml(this.translateStep(detail.step))}</div>
                <div><strong>${this.escapeHtml(detail.name)}</strong></div>
                ${lines.map((l: string) => `<div style="font-size:10pt">${this.escapeHtml(l)}</div>`).join('')}
            </div>`;
        };

        let rightHtml = '';
        if (this.initiatorDetails) rightHtml += sigBlock(this.initiatorDetails, 'right');
        let leftHtml = '';
        for (const approver of this.approversDetails) leftHtml += sigBlock(approver, 'left');

        if (!leftHtml && !rightHtml) return '';
        return `<div style="margin-top:30px">
            ${rightHtml ? `<div>${rightHtml}</div>` : ''}
            ${leftHtml ? `<div style="margin-top:24px">${leftHtml}</div>` : ''}
        </div>`;
    }

    async exportWord(): Promise<void> {
        const ns = this.viewNoteSheet;
        if (!ns) return;
        const bn = !this.isViewEnglish();
        const font = bn ? 'SutonnyMJ' : 'Times New Roman';

        const titlePara = new Paragraph({
            children: [new TextRun({ text: bn ? 'মন্তব্যপত্র' : 'NOTE SHEET', bold: true, size: 32, font })],
            alignment: AlignmentType.CENTER, spacing: { after: 200 }
        });

        const metaParts: string[] = [];
        if (ns.noteSheetNo) metaParts.push(`${bn ? 'মন্তব্যপত্র নং:' : 'Note-Sheet No:'} ${ns.noteSheetNo}`);
        if (ns.noteSheetDate) metaParts.push(`${bn ? 'তারিখ:' : 'Date:'} ${this.formatDateView(ns.noteSheetDate)}`);
        if (ns.referenceNumber) metaParts.push(`${bn ? 'সুত্র:' : 'Reference:'} ${ns.referenceNumber}`);
        const metaPara = new Paragraph({
            children: [new TextRun({ text: metaParts.join('    '), size: 20, font })],
            spacing: { after: 200 }
        });

        const children: Paragraph[] = [titlePara, metaPara];

        if (ns.subject) {
            children.push(new Paragraph({
                children: [new TextRun({ text: ns.subject, bold: true, size: 24, font })],
                alignment: AlignmentType.CENTER, spacing: { after: 200 }
            }));
        }

        const mainTextPlain = this.stripHtml(ns.mainText ?? '');
        if (mainTextPlain) {
            children.push(new Paragraph({
                children: [new TextRun({ text: mainTextPlain, size: 22, font })],
                spacing: { after: 200 }
            }));
        }

        children.push(new Paragraph({
            children: [new TextRun({ text: bn ? 'আপনার সদয় অনুমোদনের জন্য উপস্থাপন করা হলো।' : 'Presented for your kind approval.', italics: true, size: 20, font })],
            spacing: { before: 200, after: 300 }
        }));

        const buildSigParas = (detail: any, roleLabel: string, align: (typeof AlignmentType)[keyof typeof AlignmentType]): Paragraph[] => {
            const paras: Paragraph[] = [];
            if (!detail) return paras;
            const showSig = detail.signatureDataUrl && this.shouldShowSignature(detail.step ?? roleLabel);
            if (showSig) {
                paras.push(new Paragraph({
                    children: [new ImageRun({ type: 'png', data: this.dataUrlToUint8Array(detail.signatureDataUrl), transformation: { width: 150, height: 50 } })],
                    alignment: align, spacing: { before: 200 }
                }));
            }
            paras.push(new Paragraph({
                children: [new TextRun({ text: '______________________________', size: 20, font })],
                alignment: align, spacing: showSig ? {} : { before: 200 }
            }));
            paras.push(new Paragraph({
                children: [new TextRun({ text: roleLabel, bold: true, size: 20, font })],
                alignment: align
            }));
            const lines = [
                detail.name,
                detail.rabId && detail.rabId !== '-' ? `RAB ID: ${detail.rabId}` : '',
                detail.rank && detail.rank !== '-' ? detail.rank : '',
                detail.appointment && detail.appointment !== '-' ? detail.appointment : ''
            ].filter((l: string) => l && l !== '-' && l !== '—');
            lines.forEach((line: string) => {
                paras.push(new Paragraph({ children: [new TextRun({ text: line, size: 20, font })], alignment: align }));
            });
            return paras;
        };

        if (this.initiatorDetails) {
            children.push(...buildSigParas(this.initiatorDetails, this.translateStep(this.initiatorDetails.step), AlignmentType.RIGHT));
            children.push(new Paragraph({ spacing: { before: 300 } }));
        }
        for (const approver of this.approversDetails) {
            children.push(...buildSigParas(approver, this.translateStep(approver.step), AlignmentType.LEFT));
            children.push(new Paragraph({ spacing: { before: 200 } }));
        }

        const doc = new Document({
            sections: [{ properties: { page: { size: { orientation: PageOrientation.PORTRAIT } } }, children }]
        });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `NoteSheet_ExBD_${ns.noteSheetNo ?? 'export'}.docx`);
    }

    async exportPdf(): Promise<void> {
        const ns = this.viewNoteSheet;
        if (!ns) return;
        const bn = !this.isViewEnglish();
        const fontFamily = bn ? "'Noto Sans Bengali', 'SolaimanLipi', 'Kalpurush', sans-serif" : "'Times New Roman', serif";
        const title = bn ? 'মন্তব্যপত্র' : 'NOTE SHEET';

        const metaParts: string[] = [];
        if (ns.noteSheetNo) metaParts.push(`<span><strong>${bn ? 'মন্তব্যপত্র নং:' : 'Note-Sheet No:'}</strong> ${this.escapeHtml(ns.noteSheetNo)}</span>`);
        if (ns.noteSheetDate) metaParts.push(`<span><strong>${bn ? 'তারিখ:' : 'Date:'}</strong> ${this.escapeHtml(this.formatDateView(ns.noteSheetDate))}</span>`);
        if (ns.referenceNumber) metaParts.push(`<span><strong>${bn ? 'সুত্র:' : 'Reference:'}</strong> ${this.escapeHtml(ns.referenceNumber)}</span>`);

        const sigHtml = this.buildSignatoriesHtml();
        const subjectHtml = ns.subject ? `<div style="text-align:center;font-weight:700;font-size:12pt;margin-bottom:10px;padding:6px;background:#f8fafc;border-radius:4px">${this.escapeHtml(ns.subject)}</div>` : '';
        const closingText = bn ? 'আপনার সদয় অনুমোদনের জন্য উপস্থাপন করা হলো।' : 'Presented for your kind approval.';

        const container = document.createElement('div');
        container.style.cssText = 'position:absolute;left:-9999px;top:0;width:760px;padding:30px;background:#fff;z-index:-1;overflow:visible;box-sizing:border-box';
        container.innerHTML = `
            <style>
                .ns-pdf-wrap, .ns-pdf-wrap * { word-wrap:break-word!important; overflow-wrap:break-word!important; white-space:normal!important; max-width:100%!important; box-sizing:border-box!important; }
                .ns-pdf-wrap img { max-width:100%!important; height:auto!important; }
            </style>
            <div class="ns-pdf-wrap" style="font-family:${fontFamily};font-size:11pt;color:#000;line-height:1.6;width:100%">
                <h1 style="font-size:16pt;text-align:center;margin:0 0 10px 0">${this.escapeHtml(title)}</h1>
                <div style="font-size:10pt;margin-bottom:12px;display:flex;gap:24px;flex-wrap:wrap">${metaParts.join('')}</div>
                ${subjectHtml}
                <div style="margin-bottom:12px">${ns.mainText ?? ''}</div>
                <p style="font-style:italic;color:#64748b;margin-top:16px;padding-top:10px;border-top:1px dashed #ccc">${this.escapeHtml(closingText)}</p>
                ${sigHtml}
            </div>`;
        document.body.appendChild(container);

        try {
            await new Promise(resolve => setTimeout(resolve, 300));
            const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, scrollY: -window.scrollY, height: container.scrollHeight, windowHeight: container.scrollHeight });
            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;

            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth() - 20;
            const pdfPageHeight = pdf.internal.pageSize.getHeight() - 20;
            const ratio = pdfWidth / imgWidth;
            const scaledHeight = imgHeight * ratio;

            if (scaledHeight <= pdfPageHeight) {
                pdf.addImage(imgData, 'JPEG', 10, 10, pdfWidth, scaledHeight);
            } else {
                let remainingHeight = imgHeight;
                let srcY = 0;
                let page = 0;
                const sliceHeight = Math.floor(pdfPageHeight / ratio);
                while (remainingHeight > 0) {
                    if (page > 0) pdf.addPage();
                    const currentSlice = Math.min(sliceHeight, remainingHeight);
                    const sliceCanvas = document.createElement('canvas');
                    sliceCanvas.width = imgWidth;
                    sliceCanvas.height = currentSlice;
                    const ctx = sliceCanvas.getContext('2d')!;
                    ctx.drawImage(canvas, 0, srcY, imgWidth, currentSlice, 0, 0, imgWidth, currentSlice);
                    pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 10, 10, pdfWidth, currentSlice * ratio);
                    srcY += currentSlice;
                    remainingHeight -= currentSlice;
                    page++;
                }
            }
            pdf.save(`NoteSheet_ExBD_${ns.noteSheetNo ?? 'export'}.pdf`);
        } finally {
            document.body.removeChild(container);
        }
    }

    printView(): void {
        const ns = this.viewNoteSheet;
        if (!ns) return;
        const bn = !this.isViewEnglish();
        const fontFamily = bn ? "'Noto Sans Bengali', 'SolaimanLipi', 'Kalpurush', sans-serif" : "'Times New Roman', serif";
        const title = bn ? 'মন্তব্যপত্র' : 'NOTE SHEET';

        const metaParts: string[] = [];
        if (ns.noteSheetNo) metaParts.push(`<strong>${bn ? 'মন্তব্যপত্র নং:' : 'Note-Sheet No:'}</strong> ${this.escapeHtml(ns.noteSheetNo)}`);
        if (ns.noteSheetDate) metaParts.push(`<strong>${bn ? 'তারিখ:' : 'Date:'}</strong> ${this.escapeHtml(this.formatDateView(ns.noteSheetDate))}`);
        if (ns.referenceNumber) metaParts.push(`<strong>${bn ? 'সুত্র:' : 'Reference:'}</strong> ${this.escapeHtml(ns.referenceNumber)}`);

        const sigHtml = this.buildSignatoriesHtml();
        const subjectHtml = ns.subject ? `<div style="text-align:center;font-weight:700;font-size:12pt;margin-bottom:12px;padding:6px;background:#f8fafc;border-radius:4px">${this.escapeHtml(ns.subject)}</div>` : '';
        const closingText = bn ? 'আপনার সদয় অনুমোদনের জন্য উপস্থাপন করা হলো।' : 'Presented for your kind approval.';

        const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${this.escapeHtml(title)}</title>
<style>
    @page { size: A4 portrait; margin: 15mm; }
    body { font-family: ${fontFamily}; font-size: 11pt; margin: 0; padding: 20px; color: #000; line-height: 1.6; }
    h1 { font-size: 16pt; text-align: center; margin: 0 0 12px 0; }
    .meta { font-size: 10pt; margin-bottom: 14px; display: flex; gap: 28px; flex-wrap: wrap; }
    .content { margin-bottom: 14px; }
    .content p { margin: 0 0 0.5rem 0; }
    @media print { body { padding: 0; } }
</style></head><body>
    <h1>${this.escapeHtml(title)}</h1>
    <div class="meta">${metaParts.map(p => `<span>${p}</span>`).join('')}</div>
    ${subjectHtml}
    <div class="content">${ns.mainText ?? ''}</div>
    <p style="font-style:italic;color:#64748b;margin-top:16px;padding-top:10px;border-top:1px dashed #ccc">${this.escapeHtml(closingText)}</p>
    ${sigHtml}
</body></html>`;

        const win = window.open('', '_blank', 'width=800,height=700');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); }, 600);
    }
}
