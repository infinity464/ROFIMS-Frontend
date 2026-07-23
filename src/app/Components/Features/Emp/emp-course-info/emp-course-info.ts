import { Component, EventEmitter, Input, OnInit, Output, ViewChild , inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { AutoCompleteModule } from 'primeng/autocomplete';

import { EmpService } from '@/services/emp-service';
import { CourseInfoService, CourseInfoModel } from '@/services/course-info-service';
import { CommonCodeService } from '@/services/common-code-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { CommonCode } from '@/Components/basic-setup/shared/models/common-code';
import { SharedService } from '@/shared/services/shared-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { FileReferencesFormComponent, FileRowData } from '@components/Common/file-references-form/file-references-form';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

interface DropdownOption {
    label: string;
    value: number;
}

interface CourseNameOption extends DropdownOption {
    parentCodeId: number | null;
    /** Mother Org that owns this Course Name. null/0 = global (available to every org). */
    orgId: number | null;
}

interface TrainingInstituteOption extends DropdownOption {
    location: string;
    countryId: number | null;
}

@Component({
    selector: 'app-emp-course-info',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, InputTextModule, ButtonModule, Fluid, TooltipModule, TableModule, SelectModule, DialogModule, ConfirmDialogModule, DatePickerModule, AutoCompleteModule, EmployeeSearchComponent, FileReferencesFormComponent, FlexibleDateDirective],
    providers: [ConfirmationService],
    templateUrl: './emp-course-info.html',
    styleUrl: './emp-course-info.scss'
})
export class EmpCourseInfoComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    @ViewChild('fileReferencesForm') fileReferencesForm!: any;

    @Input() hideTitle = false;

    @Input() embedMode = false;
    @Input() externalEmployeeId: number | null = null;
    @Output() saved = new EventEmitter<void>();
    @Output() cancelled = new EventEmitter<void>();

    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;

    courseList: CourseInfoModel[] = [];
    isLoading = false;

    displayDialog = false;
    showInlineForm = false;
    isEditMode = false;
    isSaving = false;
    courseForm!: FormGroup;
    editingCourseId: number | null = null;

    fileRows: FileRowData[] = [];
    courseTypeOptions: DropdownOption[] = [];
    /** Options shown in the form's Course Name dropdown — filtered by the currently selected Course Type. */
    courseNameOptions: DropdownOption[] = [];
    /** Full Course Name list kept around so the table can resolve labels for rows whose type isn't currently selected. */
    private allCourseNameOptions: CourseNameOption[] = [];
    /** Selected employee's Mother Org — Course Names are scoped to this org (plus global ones). */
    private employeeOrgId: number | null = null;
    trainingInstituteOptions: TrainingInstituteOption[] = [];
    countryOptions: DropdownOption[] = [];
    courseResultOptions: { label: string; value: string }[] = [];
    courseResultSuggestions: { label: string; value: string }[] = [];

    // Add Training Institute dialog
    showInstituteDialog = false;
    newInstituteNameEN = '';
    newInstituteNameBN = '';
    newInstituteCountryId: number | null = null;
    newInstituteLocation = '';
    isSavingInstitute = false;

    // Generic "Add CommonCode" dialog — shared by Course Type, Course Name, Course Result, and Country.
    showAddCodeDialog = false;
    addingCodeType: 'CourseType' | 'CourseName' | 'CourseGrade' | 'Country' | null = null;
    addingCodeTypeLabel = '';
    /** Captured at open time for Course Name; drives the read-only parent dropdown in the dialog. */
    addingCodeParentId: number | null = null;
    newCodeValueEN = '';
    newCodeValueBN = '';
    isSavingCode = false;

    constructor(
        private empService: EmpService,
        private courseInfoService: CourseInfoService,
        private commonCodeService: CommonCodeService,
        private masterBasicSetupService: MasterBasicSetupService,
        private sharedService: SharedService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private route: ActivatedRoute,
        private router: Router,
        private fb: FormBuilder
    ) {
        this.initForm();
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadDropdowns();
        this.courseForm.get('trainingInstitueName')?.valueChanges.subscribe((instituteId) => {
            const institute = this.trainingInstituteOptions.find((o) => o.value === instituteId);
            // Pre-fill Country and Address from the selected institute as a convenience.
            // Both fields remain user-editable and the user's edits are what actually get saved.
            this.courseForm.patchValue(
                {
                    country: institute?.countryId ?? null,
                    address: institute?.location ?? ''
                },
                { emitEvent: false }
            );
        });
        this.courseForm.get('courseType')?.valueChanges.subscribe((courseTypeId: number | null) => {
            this.courseNameOptions = this.filterCourseNames(courseTypeId);
            // Clear the selected Course Name if it no longer belongs to the new Course Type.
            const currentName = this.courseForm.get('courseName')?.value;
            if (currentName != null && !this.courseNameOptions.some((o) => o.value === currentName)) {
                this.courseForm.get('courseName')?.setValue(null);
            }
        });
        if (this.embedMode && this.externalEmployeeId != null) {
            this.mode = 'edit';
            this.isReadonly = false;
            this.selectedEmployeeId = this.externalEmployeeId;
            this.employeeFound = true;
            this.loadEmployeeById(this.externalEmployeeId);
            return;
        }
        this.checkRouteParams();
    }

    initForm(): void {
        this.courseForm = this.fb.group({
            employeeId: [0],
            courseId: [0],
            courseType: [null, Validators.required],
            courseName: [null, Validators.required],
            trainingInstitueName: [null],
            country: [null],
            address: [''],
            dateFrom: [null],
            dateTo: [null],
            result: [null],
            auth: [''],
            remarks: ['']
        });
    }

    loadDropdowns(): void {
        // Course Result from Course Grade Setup (CommonCode type 'CourseGrade')
        this.commonCodeService.getAllActiveCommonCodesType('CourseGrade').subscribe({
            next: (data) => {
                const strOpts = (data || []).map((d: any) => ({
                    label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId),
                    value: (d.codeValueEN || d.displayCodeValueEN || String(d.codeId)) as string
                }));
                this.courseResultOptions = strOpts;
                this.courseResultSuggestions = strOpts;
            }
        });
        const codeTypes = ['CourseType', 'Country'];
        codeTypes.forEach((codeType) => {
            this.commonCodeService.getAllActiveCommonCodesType(codeType).subscribe({
                next: (data) => {
                    const opts = (data || []).map((d: any) => ({
                        label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId),
                        value: d.codeId
                    }));
                    switch (codeType) {
                        case 'CourseType':
                            this.courseTypeOptions = opts;
                            break;
                        case 'Country':
                            this.countryOptions = opts;
                            break;
                    }
                }
            });
        });
        // Course Name depends on Course Type via parentCodeId. Fetch the full list once (kept in
        // allCourseNameOptions for table label resolution) and let the courseType valueChanges
        // subscriber filter it into courseNameOptions for the form dropdown.
        this.commonCodeService.getAllActiveCommonCodesType('CourseName').subscribe({
            next: (data) => {
                this.allCourseNameOptions = (data || []).map((d: any) => ({
                    label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId),
                    value: d.codeId,
                    parentCodeId: d.parentCodeId ?? null,
                    orgId: d.orgId ?? d.OrgId ?? null
                }));
                // If a Course Type is already selected (edit flow), populate the filtered list now.
                const currentType: number | null = this.courseForm.get('courseType')?.value ?? null;
                if (currentType != null) {
                    this.courseNameOptions = this.filterCourseNames(currentType);
                }
            }
        });
        // Training Institute: include location and countryId for auto-load in form
        this.masterBasicSetupService.getAllInstitute().subscribe({
            next: (data) => {
                this.trainingInstituteOptions = (data || []).map((d: any) => ({
                    label: d.trainingInstituteNameEN ?? d.TrainingInstituteNameEN ?? String(d.trainingInstituteId),
                    value: d.trainingInstituteId ?? d.TrainingInstituteId,
                    location: d.location ?? d.Location ?? '',
                    countryId: d.countryId ?? d.CountryId ?? null
                }));
            }
        });
    }

    /**
     * Course Names available for a given Course Type, scoped to the selected employee's Mother Org.
     * A Course Name is shown when its parentCodeId matches the Course Type AND it either belongs to
     * the employee's Mother Org or is global (orgId null/0, i.e. Mother Org not set).
     */
    private filterCourseNames(courseTypeId: number | null): DropdownOption[] {
        if (courseTypeId == null) return [];
        const orgId = this.employeeOrgId;
        return this.allCourseNameOptions.filter(
            (o) => o.parentCodeId === courseTypeId && (o.orgId == null || o.orgId === 0 || o.orgId === orgId)
        );
    }

    checkRouteParams(): void {
        this.route.queryParams.subscribe((params) => {
            const employeeId = params['id'];
            const mode = params['mode'];
            if (employeeId) {
                this.mode = mode === 'edit' ? 'edit' : 'view';
                this.isReadonly = this.mode === 'view';
                this.loadEmployeeById(parseInt(employeeId, 10));
            }
        });
    }

    loadEmployeeById(employeeId: number): void {
        this.empService.getEmployeeById(employeeId).subscribe({
            next: (employee: any) => {
                if (employee) {
                    this.employeeFound = true;
                    this.selectedEmployeeId = employee.employeeID || employee.EmployeeID;
                    this.employeeBasicInfo = employee;
                    this.employeeOrgId = employee.orgId ?? employee.OrgId ?? null;
                    // Re-apply the Mother Org scope to the Course Name list now that the org is known.
                    this.courseNameOptions = this.filterCourseNames(this.courseForm.get('courseType')?.value ?? null);
                    this.loadCourseList();
                }
            },
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load employee' })
        });
    }

    loadCourseList(): void {
        if (!this.selectedEmployeeId) return;
        this.isLoading = true;
        this.courseInfoService.getByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (data: any) => {
                const list = Array.isArray(data) ? data : [];
                this.courseList = list.map((item: any) => ({
                    employeeId: item.employeeId ?? item.EmployeeId,
                    courseId: item.courseId ?? item.CourseId,
                    courseType: item.courseType ?? item.CourseType,
                    courseName: item.courseName ?? item.CourseName,
                    trainingInstitueName: item.trainingInstitueName ?? item.TrainingInstitueName,
                    country: item.country ?? item.Country ?? null,
                    address: item.address ?? item.Address ?? null,
                    dateFrom: item.dateFrom ?? item.DateFrom,
                    dateTo: item.dateTo ?? item.DateTo,
                    result: item.result ?? item.Result,
                    auth: item.auth ?? item.Auth,
                    remarks: item.remarks ?? item.Remarks,
                    filesReferences: item.filesReferences ?? item.FilesReferences ?? null
                }));
                this.isLoading = false;
            },
            error: (err: any) => {
                this.isLoading = false;
            }
        });
    }

    parseFileRowsFromReferences(refsJson: string | null | undefined): FileRowData[] {
        if (!refsJson || typeof refsJson !== 'string') return [];
        try {
            const refs = JSON.parse(refsJson) as { FileId?: number; fileName?: string }[];
            if (!Array.isArray(refs)) return [];
            return refs.map((r) => ({ displayName: r.fileName ?? '', file: null, fileId: r.FileId }));
        } catch {
            return [];
        }
    }

    onFileRowsChange(event: FileRowData[]): void {
        if (event && Array.isArray(event)) this.fileRows = event;
    }

    onDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: (err) => {
                console.error('Download failed', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to download file' });
            }
        });
    }

    getOptionLabel(options: DropdownOption[], value: number | null): string {
        if (value == null) return 'N/A';
        const o = options.find((x) => x.value === value);
        return o ? o.label : 'N/A';
    }

    /** Table label lookup for Course Name — uses the full (unfiltered) list so rows of any Course Type resolve. */
    getCourseNameLabel(value: number | null): string {
        return this.getOptionLabel(this.allCourseNameOptions, value);
    }

    /** Address: saved value from CourseInfo (pre-filled from institute on add/edit, but user-editable). */
    getAddressDisplay(row: CourseInfoModel): string {
        return row.address && String(row.address).trim() ? String(row.address) : 'N/A';
    }

    /** Country: saved CommonCode id from CourseInfo (pre-filled from institute on add/edit, but user-editable). */
    getCountryDisplay(row: CourseInfoModel): string {
        return row.country != null ? this.getOptionLabel(this.countryOptions, row.country) : 'N/A';
    }

    formatDate(d: string | null): string {
        if (!d) return 'N/A';
        try {
            const date = new Date(d);
            return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString();
        } catch {
            return 'N/A';
        }
    }

    getNextCourseId(): number {
        if (this.courseList.length === 0) return 1;
        const maxId = Math.max(...this.courseList.map((c) => c.courseId));
        return maxId + 1;
    }

    openAddDialog(): void {
        this.isEditMode = false;
        this.editingCourseId = null;
        this.fileRows = [];
        this.courseForm.reset({
            employeeId: this.selectedEmployeeId ?? 0,
            courseId: 0,
            courseType: null,
            courseName: null,
            trainingInstitueName: null,
            country: null,
            address: '',
            dateFrom: null,
            dateTo: null,
            result: null,
            auth: '',
            remarks: ''
        });
        this.showInlineForm = true;
    }

    openEditDialog(row: CourseInfoModel): void {
        this.isEditMode = true;
        this.editingCourseId = row.courseId;
        this.fileRows = this.parseFileRowsFromReferences(row.filesReferences);
        const dateFrom = row.dateFrom ? new Date(row.dateFrom) : null;
        const dateTo = row.dateTo ? new Date(row.dateTo) : null;
        this.courseForm.patchValue({
            employeeId: row.employeeId,
            courseId: row.courseId,
            courseType: row.courseType,
            courseName: row.courseName,
            trainingInstitueName: row.trainingInstitueName,
            country: row.country ?? null,
            address: row.address ?? '',
            dateFrom,
            dateTo,
            result: row.result ?? '',
            auth: row.auth ?? '',
            remarks: row.remarks ?? ''
        });
        this.showInlineForm = true;
    }

    saveCourse(): void {
        if (this.selectedEmployeeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected' });
            return;
        }
        if (this.courseForm.invalid) {
            this.courseForm.markAllAsTouched();
            return;
        }
        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const doSave = (filesReferencesJson: string | null) => {
            const formValue = this.courseForm.value;
            const toDateStr = (d: Date | null): string | null => {
                if (!d) return null;
                const x = new Date(d);
                return isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10);
            };
            const resultVal = formValue.result;
            const resultStr = typeof resultVal === 'string' ? resultVal : (resultVal?.value ?? (resultVal ? String(resultVal) : null));
            const payload: Partial<CourseInfoModel> = {
                employeeId: this.selectedEmployeeId!,
                courseId: this.isEditMode ? (this.editingCourseId ?? 0) : 0,
                courseType: formValue.courseType ?? null,
                courseName: formValue.courseName ?? null,
                trainingInstitueName: formValue.trainingInstitueName ?? null,
                country: formValue.country ?? null,
                address: formValue.address && String(formValue.address).trim() ? String(formValue.address).trim() : null,
                dateFrom: toDateStr(formValue.dateFrom),
                dateTo: toDateStr(formValue.dateTo),
                result: resultStr && String(resultStr).trim() ? String(resultStr).trim() : null,
                auth: formValue.auth && String(formValue.auth).trim() ? String(formValue.auth).trim() : null,
                remarks: formValue.remarks && String(formValue.remarks).trim() ? String(formValue.remarks).trim() : null,
                filesReferences: filesReferencesJson ?? undefined,
                createdBy: 'system',
                lastUpdatedBy: 'system'
            };

            this.isSaving = true;
            const req = this.isEditMode ? this.courseInfoService.update(payload) : this.courseInfoService.save(payload);

            req.subscribe({
                next: () => {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: this.isEditMode ? 'Course updated.' : 'Course added.' });
                    this.showInlineForm = false;
                    this.loadCourseList();
                    this.isSaving = false;
                },
                error: (err: any) => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to save course' });
                    this.isSaving = false;
                }
            });
        };

        if (filesToUpload.length > 0) {
            const uploads = filesToUpload.map((r: FileRowData) =>
                this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name)
            );
            forkJoin(uploads).subscribe({
                next: (results: unknown) => {
                    const resultsArray = Array.isArray(results) ? results : [];
                    const newRefs = (resultsArray as { fileId: number; fileName: string }[]).map((r) => ({ FileId: r.fileId, fileName: r.fileName }));
                    const allRefs: { FileId: number; fileName: string }[] = [...existingRefs.map((r: { FileId: number; fileName: string }) => ({ FileId: r.FileId, fileName: r.fileName })), ...newRefs];
                    const filesReferencesJson = allRefs.length > 0 ? JSON.stringify(allRefs) : null;
                    doSave(filesReferencesJson);
                },
                error: (err) => {
                    console.error('Error uploading files', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to upload one or more files' });
                }
            });
            return;
        }
        const filesReferencesJson = existingRefs.length > 0 ? JSON.stringify(existingRefs) : null;
        doSave(filesReferencesJson);
    }

    confirmDelete(row: CourseInfoModel): void {
        this.confirmationService.confirm({
            message: 'Delete this course record?',
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Delete', severity: 'danger' },
            accept: () => this.deleteCourse(row)
        });
    }

    deleteCourse(row: CourseInfoModel): void {
        this.courseInfoService.delete(row.employeeId, row.courseId).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Course deleted.' });
                this.loadCourseList();
            },
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to delete' })
        });
    }

    filterCourseResult(event: { query: string }): void {
        const query = (event.query || '').toLowerCase();
        this.courseResultSuggestions = this.courseResultOptions.filter((o) => o.label.toLowerCase().includes(query) || o.value.toLowerCase().includes(query));
    }

    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.employeeOrgId = employee.orgId ?? employee.motherOrganization ?? null;
        // Re-apply the Mother Org scope to the Course Name list now that the org is known.
        this.courseNameOptions = this.filterCourseNames(this.courseForm.get('courseType')?.value ?? null);
        this.isReadonly = true;
        this.loadCourseList();
    }

    onEmployeeSearchReset(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.employeeOrgId = null;
        this.courseList = [];
    }

    enableEditMode(): void {
        this.mode = 'edit';
        this.isReadonly = false;
    }

    goBack(): void {
        if (this.embedMode) {
            this.cancelled.emit();
            return;
        }
        this.router.navigate(['/emp-list']);
    }

    openAddInstituteDialog(): void {
        this.newInstituteNameEN = '';
        this.newInstituteNameBN = '';
        this.newInstituteCountryId = null;
        this.newInstituteLocation = '';
        this.showInstituteDialog = true;
    }

    /** + button next to Course Type — open shared dialog in CourseType mode. */
    openAddCourseTypeDialog(): void {
        this.openAddCodeDialog('CourseType', 'Course Type');
    }

    /** + button next to Course Name — requires a Course Type to be selected so the new code has a parent. */
    openAddCourseNameDialog(): void {
        const courseTypeId: number | null = this.courseForm.get('courseType')?.value ?? null;
        if (courseTypeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Select Course Type', detail: 'Please select a Course Type before adding a Course Name.' });
            return;
        }
        this.addingCodeParentId = courseTypeId;
        this.openAddCodeDialog('CourseName', 'Course Name');
    }

    /** + button next to Course Result — Course Grade CommonCode. */
    openAddCourseResultDialog(): void {
        this.openAddCodeDialog('CourseGrade', 'Course Result');
    }

    /** + button next to Country — Country CommonCode. */
    openAddCountryDialog(): void {
        this.openAddCodeDialog('Country', 'Country');
    }

    private openAddCodeDialog(codeType: 'CourseType' | 'CourseName' | 'CourseGrade' | 'Country', label: string): void {
        this.addingCodeType = codeType;
        this.addingCodeTypeLabel = label;
        if (codeType !== 'CourseName') this.addingCodeParentId = null;
        this.newCodeValueEN = '';
        this.newCodeValueBN = '';
        this.showAddCodeDialog = true;
    }

    saveNewCommonCode(): void {
        if (!this.addingCodeType || !this.newCodeValueEN?.trim()) return;
        this.isSavingCode = true;
        const currentUser = this.sharedService.getCurrentUser();
        const nowIso = new Date().toISOString();
        const payload: CommonCode = {
            // Course Names are scoped to the employee's Mother Org; other code types stay global (0).
            orgId: this.addingCodeType === 'CourseName' ? (this.employeeOrgId ?? 0) : 0,
            codeId: 0,
            codeType: this.addingCodeType,
            codeValueEN: this.newCodeValueEN.trim(),
            codeValueBN: this.newCodeValueBN?.trim() || null,
            commCode: null,
            displayCodeValueEN: null,
            displayCodeValueBN: null,
            status: true,
            parentCodeId: this.addingCodeType === 'CourseName' ? this.addingCodeParentId : null,
            sortOrder: null,
            level: null,
            createdBy: currentUser,
            createdDate: nowIso,
            lastUpdatedBy: currentUser,
            lastupdate: nowIso
        };
        const savedCodeType = this.addingCodeType;
        const savedLabel = this.addingCodeTypeLabel;
        const savedValueEN = payload.codeValueEN;
        this.masterBasicSetupService.create(payload).subscribe({
            next: (res: any) => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: `${savedLabel} created successfully` });
                const newId: number | undefined = res?.codeId ?? res?.CodeId;
                this.reloadCodesAfterSave(savedCodeType, newId, savedValueEN);
                this.showAddCodeDialog = false;
                this.isSavingCode = false;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: `Failed to create ${savedLabel}` });
                this.isSavingCode = false;
            }
        });
    }

    /** Reload the affected dropdown after a new CommonCode is saved, then auto-select the new entry. */
    private reloadCodesAfterSave(codeType: 'CourseType' | 'CourseName' | 'CourseGrade' | 'Country', newId: number | undefined, newValueEN: string): void {
        this.commonCodeService.getAllActiveCommonCodesType(codeType).subscribe({
            next: (data) => {
                if (codeType === 'CourseType') {
                    this.courseTypeOptions = (data || []).map((d: any) => ({
                        label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId),
                        value: d.codeId
                    }));
                    if (newId != null) this.courseForm.patchValue({ courseType: newId });
                } else if (codeType === 'CourseName') {
                    this.allCourseNameOptions = (data || []).map((d: any) => ({
                        label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId),
                        value: d.codeId,
                        parentCodeId: d.parentCodeId ?? null,
                        orgId: d.orgId ?? d.OrgId ?? null
                    }));
                    const currentType: number | null = this.courseForm.get('courseType')?.value ?? null;
                    if (currentType != null) {
                        this.courseNameOptions = this.filterCourseNames(currentType);
                    }
                    if (newId != null) this.courseForm.patchValue({ courseName: newId });
                } else if (codeType === 'CourseGrade') {
                    const strOpts = (data || []).map((d: any) => ({
                        label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId),
                        value: (d.codeValueEN || d.displayCodeValueEN || String(d.codeId)) as string
                    }));
                    this.courseResultOptions = strOpts;
                    this.courseResultSuggestions = strOpts;
                    // Course Result is stored as a string; select the one that matches the newly added English value.
                    const added = strOpts.find((o) => o.label === newValueEN);
                    if (added) this.courseForm.patchValue({ result: added.value });
                } else if (codeType === 'Country') {
                    this.countryOptions = (data || []).map((d: any) => ({
                        label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId),
                        value: d.codeId
                    }));
                    if (newId != null) this.courseForm.patchValue({ country: newId });
                }
            }
        });
    }

    saveNewInstitute(): void {
        if (!this.newInstituteNameEN?.trim()) return;
        this.isSavingInstitute = true;
        const currentUser = this.sharedService.getCurrentUser();
        const payload = {
            trainingInstituteId: 0,
            trainingInstituteNameEN: this.newInstituteNameEN.trim(),
            trainingInstituteNameBN: this.newInstituteNameBN?.trim() || '',
            countryId: this.newInstituteCountryId ?? 0,
            location: this.newInstituteLocation?.trim() || '',
            createdBy: currentUser,
            createdDate: new Date(),
            lastUpdatedBy: currentUser,
            lastUpdate: new Date()
        };
        this.masterBasicSetupService.createInstitute(payload).subscribe({
            next: (res: any) => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Training Institute created successfully' });
                this.showInstituteDialog = false;
                this.isSavingInstitute = false;
                // Reload institute options and auto-select
                this.masterBasicSetupService.getAllInstitute().subscribe({
                    next: (data) => {
                        this.trainingInstituteOptions = (data || []).map((d: any) => ({
                            label: d.trainingInstituteNameEN ?? d.TrainingInstituteNameEN ?? String(d.trainingInstituteId),
                            value: d.trainingInstituteId ?? d.TrainingInstituteId,
                            location: d.location ?? d.Location ?? '',
                            countryId: d.countryId ?? d.CountryId ?? null
                        }));
                        const newId = res?.trainingInstituteId ?? res?.TrainingInstituteId;
                        if (newId) {
                            this.courseForm.patchValue({ trainingInstitueName: newId });
                        }
                    }
                });
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to create training institute' });
                this.isSavingInstitute = false;
            }
        });
    }
}
