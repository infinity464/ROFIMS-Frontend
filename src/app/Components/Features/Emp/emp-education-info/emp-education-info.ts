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

import { EmpService } from '@/services/emp-service';
import { EducationInfoService, EducationInfoModel } from '@/services/education-info-service';
import { CommonCodeService } from '@/services/common-code-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { SharedService } from '@/shared/services/shared-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { FileReferencesFormComponent, FileRowData } from '@components/Common/file-references-form/file-references-form';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

interface DropdownOption {
    label: string;
    value: number;
}

@Component({
    selector: 'app-emp-education-info',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, InputTextModule, ButtonModule, Fluid, TooltipModule, TableModule, SelectModule, DialogModule, ConfirmDialogModule, DatePickerModule, EmployeeSearchComponent, FileReferencesFormComponent, FlexibleDateDirective],
    providers: [ConfirmationService],
    templateUrl: './emp-education-info.html',
    styleUrl: './emp-education-info.scss'
})
export class EmpEducationInfoComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    @ViewChild('fileReferencesForm') fileReferencesForm!: any;

    /** When true (e.g. inside tab view), the "Educational Information" title and header actions are hidden. */
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

    educationList: EducationInfoModel[] = [];
    isLoading = false;

    displayDialog = false;
    showInlineForm = false;
    isEditMode = false;
    isSaving = false;
    educationForm!: FormGroup;
    editingEducationId: number | null = null;

    fileRows: FileRowData[] = [];
    qualificationOptions: DropdownOption[] = [];
    institutionTypeOptions: DropdownOption[] = [];
    institutionNameOptions: DropdownOption[] = [];
    departmentOptions: DropdownOption[] = [];
    subjectOptions: DropdownOption[] = [];
    gradeOptions: DropdownOption[] = [];

    // Add Institution dialog
    showInstitutionDialog = false;
    newInstitutionNameEN = '';
    newInstitutionNameBN = '';
    newInstitutionTypeId: number | null = null;
    isSavingInstitution = false;

    // Cascading institution filtering
    allInstitutionData: any[] = [];
    filteredInstitutionNameOptions: DropdownOption[] = [];

    // Cascading department filtering (department depends on selected qualification)
    allDepartmentMappings: { qualificationCodeId: number; departmentCodeId: number }[] = [];
    filteredDepartmentOptions: DropdownOption[] = [];

    // Add Department/Group dialog
    showDepartmentDialog = false;
    newDepartmentNameEN = '';
    newDepartmentNameBN = '';
    isSavingDepartment = false;

    // Add Subject dialog
    showSubjectDialog = false;
    newSubjectNameEN = '';
    newSubjectNameBN = '';
    isSavingSubject = false;

    // Add Result/Grade dialog
    showGradeDialog = false;
    newGradeNameEN = '';
    newGradeNameBN = '';
    isSavingGrade = false;

    // Add Qualification dialog
    showQualificationDialog = false;
    newQualificationNameEN = '';
    newQualificationNameBN = '';
    isSavingQualification = false;

    // Add Board/University Type dialog
    showBoardTypeDialog = false;
    newBoardTypeNameEN = '';
    newBoardTypeNameBN = '';
    isSavingBoardType = false;

    constructor(
        private empService: EmpService,
        private educationInfoService: EducationInfoService,
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
        this.educationForm = this.fb.group({
            employeeId: [0],
            educationId: [0],
            examName: [null, Validators.required],
            instituteType: [null, Validators.required],
            instituteName: [null, Validators.required],
            departmentName: [null],
            subjectName: [null, Validators.required],
            dateFrom: [null],
            dateTo: [null],
            passingYear: [null],
            grade: [null],
            gradePoint: [''],
            remarks: ['']
        });
    }

    loadDropdowns(): void {
        const types = ['EducationQualification', 'EducationInstitutionType', 'EducationInstitution', 'EducationalDepartment', 'EducationSubject', 'EducationResult'];
        types.forEach((codeType) => {
            this.commonCodeService.getAllActiveCommonCodesType(codeType).subscribe({
                next: (data) => {
                    const opts = (data || []).map((d: any) => ({
                        label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId),
                        value: d.codeId
                    }));
                    switch (codeType) {
                        case 'EducationQualification':
                            this.qualificationOptions = opts;
                            break;
                        case 'EducationInstitutionType':
                            this.institutionTypeOptions = opts;
                            break;
                        case 'EducationInstitution':
                            this.allInstitutionData = data || [];
                            this.institutionNameOptions = opts;
                            this.filteredInstitutionNameOptions = opts;
                            break;
                        case 'EducationalDepartment':
                            this.departmentOptions = opts;
                            // Re-apply qualification filter once department options arrive
                            this.onQualificationChange(this.educationForm.get('examName')?.value ?? null);
                            break;
                        case 'EducationSubject':
                            this.subjectOptions = opts;
                            break;
                        case 'EducationResult':
                            this.gradeOptions = opts;
                            break;
                    }
                }
            });
        });

        // Qualification → Department mappings (join table)
        this.masterBasicSetupService.getAllQualificationDepartments().subscribe({
            next: (rows: any[]) => {
                this.allDepartmentMappings = (Array.isArray(rows) ? rows : []).map((r) => ({
                    qualificationCodeId: r.qualificationCodeId ?? r.QualificationCodeId,
                    departmentCodeId: r.departmentCodeId ?? r.DepartmentCodeId
                }));
                this.onQualificationChange(this.educationForm.get('examName')?.value ?? null);
            },
            error: () => { this.allDepartmentMappings = []; }
        });
    }

    /** Hard-coded: SSC/HSC/Dakhil/Alim have a Group instead of a Subject, so the Subject dropdown is hidden. */
    private readonly noSubjectQualifications = ['ssc', 'hsc', 'dakhil', 'alim'];

    get isSubjectHidden(): boolean {
        const qualId = this.educationForm?.get('examName')?.value;
        if (!qualId) return false;
        const qualName = this.qualificationOptions.find((o) => o.value === qualId)?.label?.toLowerCase() ?? '';
        return this.noSubjectQualifications.some((kw) => qualName.includes(kw));
    }

    /** Filter Department options to those mapped to the selected qualification. */
    onQualificationChange(qualificationId: number | null): void {
        const subjectCtrl = this.educationForm.get('subjectName');
        if (subjectCtrl) {
            const qualName = this.qualificationOptions.find((o) => o.value === qualificationId)?.label?.toLowerCase() ?? '';
            if (qualificationId && this.noSubjectQualifications.some((kw) => qualName.includes(kw))) {
                subjectCtrl.clearValidators();
                subjectCtrl.setValue(null);
            } else {
                subjectCtrl.setValidators([Validators.required]);
            }
            subjectCtrl.updateValueAndValidity();
        }
        if (!qualificationId) {
            this.filteredDepartmentOptions = this.departmentOptions;
            return;
        }
        const mappedIds = new Set(
            this.allDepartmentMappings
                .filter((m) => m.qualificationCodeId === qualificationId)
                .map((m) => m.departmentCodeId)
        );
        const filtered = this.departmentOptions.filter((o) => mappedIds.has(o.value));
        // Fallback to all when no mapping is configured for this qualification.
        this.filteredDepartmentOptions = filtered.length > 0 ? filtered : this.departmentOptions;
        // Clear department if current value is not valid for the new qualification.
        const current = this.educationForm.get('departmentName')?.value;
        if (current && !this.filteredDepartmentOptions.find((o) => o.value === current)) {
            this.educationForm.patchValue({ departmentName: null });
        }
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
                    this.loadEducationList();
                }
            },
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load employee' })
        });
    }

    loadEducationList(): void {
        if (!this.selectedEmployeeId) return;
        this.isLoading = true;
        this.educationInfoService.getByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (data: any) => {
                const list = Array.isArray(data) ? data : [];
                this.educationList = list.map((item: any) => ({
                    employeeId: item.employeeId ?? item.EmployeeId,
                    educationId: item.educationId ?? item.EducationId,
                    examName: item.examName ?? item.ExamName,
                    instituteType: item.instituteType ?? item.InstituteType,
                    instituteName: item.instituteName ?? item.InstituteName,
                    departmentName: item.departmentName ?? item.DepartmentName,
                    subjectName: item.subjectName ?? item.SubjectName,
                    dateFrom: item.dateFrom ?? item.DateFrom,
                    dateTo: item.dateTo ?? item.DateTo,
                    passingYear: item.passingYear ?? item.PassingYear,
                    grade: item.grade ?? item.Grade,
                    gradePoint: item.gradePoint ?? item.GradePoint ?? null,
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

    formatDate(d: string | null): string {
        if (!d) return 'N/A';
        try {
            const date = new Date(d);
            return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString();
        } catch {
            return 'N/A';
        }
    }

    openAddDialog(): void {
        this.isEditMode = false;
        this.editingEducationId = null;
        this.fileRows = [];
        this.filteredInstitutionNameOptions = this.institutionNameOptions;
        this.filteredDepartmentOptions = this.departmentOptions;
        this.educationForm.reset({
            employeeId: this.selectedEmployeeId ?? 0,
            educationId: 0,
            examName: null,
            instituteType: null,
            instituteName: null,
            departmentName: null,
            subjectName: null,
            dateFrom: null,
            dateTo: null,
            passingYear: null,
            grade: null,
            gradePoint: '',
            remarks: ''
        });
        this.showInlineForm = true;
    }

    openEditDialog(row: EducationInfoModel): void {
        this.isEditMode = true;
        this.editingEducationId = row.educationId;
        this.fileRows = this.parseFileRowsFromReferences(row.filesReferences);
        const dateFrom = row.dateFrom ? new Date(row.dateFrom) : null;
        const dateTo = row.dateTo ? new Date(row.dateTo) : null;
        // Trigger institution + department filtering for edit mode
        this.onInstitutionTypeChange(row.instituteType);
        this.onQualificationChange(row.examName);
        this.educationForm.patchValue({
            employeeId: row.employeeId,
            educationId: row.educationId,
            examName: row.examName,
            instituteType: row.instituteType,
            instituteName: row.instituteName,
            departmentName: row.departmentName,
            subjectName: row.subjectName,
            dateFrom,
            dateTo,
            passingYear: row.passingYear,
            grade: row.grade,
            gradePoint: row.gradePoint ?? '',
            remarks: row.remarks ?? ''
        });
        this.showInlineForm = true;
    }

    saveEducation(): void {
        if (this.selectedEmployeeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected' });
            return;
        }
        if (this.educationForm.invalid) {
            this.educationForm.markAllAsTouched();
            return;
        }
        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const doSave = (filesReferencesJson: string | null) => {
            const formValue = this.educationForm.value;
            const toDateStr = (d: Date | null): string | null => {
                if (!d) return null;
                const x = new Date(d);
                return isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10);
            };
            const payload: Partial<EducationInfoModel> = {
                employeeId: this.selectedEmployeeId!,
                educationId: this.isEditMode ? (this.editingEducationId ?? 0) : 0,
                examName: formValue.examName ?? null,
                instituteType: formValue.instituteType ?? null,
                instituteName: formValue.instituteName ?? null,
                departmentName: formValue.departmentName ?? null,
                subjectName: this.isSubjectHidden ? null : (formValue.subjectName ?? null),
                dateFrom: toDateStr(formValue.dateFrom),
                dateTo: toDateStr(formValue.dateTo),
                passingYear: formValue.passingYear ?? null,
                grade: formValue.grade ?? null,
                gradePoint: formValue.gradePoint && String(formValue.gradePoint).trim() ? String(formValue.gradePoint).trim() : null,
                remarks: formValue.remarks && String(formValue.remarks).trim() ? String(formValue.remarks).trim() : null,
                filesReferences: filesReferencesJson ?? undefined,
                createdBy: 'system',
                lastUpdatedBy: 'system'
            };

            this.isSaving = true;
            const req = this.isEditMode ? this.educationInfoService.update(payload) : this.educationInfoService.save(payload);

            req.subscribe({
                next: () => {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: this.isEditMode ? 'Education updated.' : 'Education added.' });
                    this.showInlineForm = false;
                    this.loadEducationList();
                    this.isSaving = false;
                },
                error: (err: any) => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to save education' });
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

    confirmDelete(row: EducationInfoModel): void {
        this.confirmationService.confirm({
            message: 'Delete this education record?',
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Delete', severity: 'danger' },
            accept: () => this.deleteEducation(row)
        });
    }

    deleteEducation(row: EducationInfoModel): void {
        this.educationInfoService.delete(row.employeeId, row.educationId).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Education deleted.' });
                this.loadEducationList();
            },
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to delete' })
        });
    }

    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.isReadonly = true;
        this.loadEducationList();
    }

    onEmployeeSearchReset(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.educationList = [];
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

    // --- Cascading: filter Institution Name by Institution Type ---
    onInstitutionTypeChange(selectedTypeId: number | null): void {
        if (!selectedTypeId) {
            this.filteredInstitutionNameOptions = this.institutionNameOptions;
            return;
        }
        const filtered = this.allInstitutionData
            .filter((d: any) => d.parentCodeId === selectedTypeId)
            .map((d: any) => ({
                label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId),
                value: d.codeId
            }));
        // Fallback to all if no linked data exists
        this.filteredInstitutionNameOptions = filtered.length > 0 ? filtered : this.institutionNameOptions;
        // Clear institution if current value not in filtered list
        const current = this.educationForm.get('instituteName')?.value;
        if (current && !this.filteredInstitutionNameOptions.find(o => o.value === current)) {
            this.educationForm.patchValue({ instituteName: null });
        }
    }

    // --- Dynamic label: Group vs Department ---
    get departmentLabel(): string {
        const selectedQualification = this.educationForm?.get('examName')?.value;
        if (!selectedQualification) return 'Department/Group';
        const qualOption = this.qualificationOptions.find(o => o.value === selectedQualification);
        const qualName = qualOption?.label?.toLowerCase() || '';
        const groupLevelKeywords = ['ssc', 'hsc', 'dakhil', 'alim', 'secondary', 'psc', 'jsc', 'jdc'];
        return groupLevelKeywords.some(kw => qualName.includes(kw)) ? 'Group' : 'Department';
    }

    get departmentPlaceholder(): string {
        return this.departmentLabel === 'Group' ? 'Select Group' : 'Select Department';
    }

    // --- Add Department/Group dialog ---
    openAddDepartmentDialog(): void {
        this.newDepartmentNameEN = '';
        this.newDepartmentNameBN = '';
        this.showDepartmentDialog = true;
    }

    saveNewDepartment(): void {
        if (!this.newDepartmentNameEN?.trim()) return;
        this.isSavingDepartment = true;
        const currentUser = this.sharedService.getCurrentUser();
        const currentDateTime = this.sharedService.getCurrentDateTime();
        const payload = {
            codeId: 0, orgId: 0, codeType: 'EducationalDepartment',
            codeValueEN: this.newDepartmentNameEN.trim(),
            codeValueBN: this.newDepartmentNameBN?.trim() || '',
            commCode: null, displayCodeValueEN: null, displayCodeValueBN: null,
            sortOrder: null, level: null, parentCodeId: null, status: true,
            createdBy: currentUser, createdDate: currentDateTime,
            lastUpdatedBy: currentUser, lastupdate: currentDateTime
        } as any;
        this.masterBasicSetupService.create(payload).subscribe({
            next: (res: any) => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: `${this.departmentLabel} added successfully` });
                this.showDepartmentDialog = false;
                this.isSavingDepartment = false;
                this.commonCodeService.getAllActiveCommonCodesType('EducationalDepartment').subscribe({
                    next: (data) => {
                        this.departmentOptions = (data || []).map((d: any) => ({
                            label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId), value: d.codeId
                        }));
                        // The new department isn't mapped yet — show full list so it can be picked.
                        this.filteredDepartmentOptions = this.departmentOptions;
                        const newId = res?.codeId || res?.CodeId;
                        if (newId) this.educationForm.patchValue({ departmentName: newId });
                    }
                });
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: `Failed to add ${this.departmentLabel}` });
                this.isSavingDepartment = false;
            }
        });
    }

    // --- Add Subject dialog ---
    openAddSubjectDialog(): void {
        this.newSubjectNameEN = '';
        this.newSubjectNameBN = '';
        this.showSubjectDialog = true;
    }

    saveNewSubject(): void {
        if (!this.newSubjectNameEN?.trim()) return;
        this.isSavingSubject = true;
        const currentUser = this.sharedService.getCurrentUser();
        const currentDateTime = this.sharedService.getCurrentDateTime();
        const payload = {
            codeId: 0, orgId: 0, codeType: 'EducationSubject',
            codeValueEN: this.newSubjectNameEN.trim(),
            codeValueBN: this.newSubjectNameBN?.trim() || '',
            commCode: null, displayCodeValueEN: null, displayCodeValueBN: null,
            sortOrder: null, level: null, parentCodeId: null, status: true,
            createdBy: currentUser, createdDate: currentDateTime,
            lastUpdatedBy: currentUser, lastupdate: currentDateTime
        } as any;
        this.masterBasicSetupService.create(payload).subscribe({
            next: (res: any) => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Subject added successfully' });
                this.showSubjectDialog = false;
                this.isSavingSubject = false;
                this.commonCodeService.getAllActiveCommonCodesType('EducationSubject').subscribe({
                    next: (data) => {
                        this.subjectOptions = (data || []).map((d: any) => ({
                            label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId), value: d.codeId
                        }));
                        const newId = res?.codeId || res?.CodeId;
                        if (newId) this.educationForm.patchValue({ subjectName: newId });
                    }
                });
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to add Subject' });
                this.isSavingSubject = false;
            }
        });
    }

    // --- Add Qualification dialog ---
    openAddQualificationDialog(): void {
        this.newQualificationNameEN = '';
        this.newQualificationNameBN = '';
        this.showQualificationDialog = true;
    }

    saveNewQualification(): void {
        if (!this.newQualificationNameEN?.trim()) return;
        this.isSavingQualification = true;
        const currentUser = this.sharedService.getCurrentUser();
        const currentDateTime = this.sharedService.getCurrentDateTime();
        const payload = {
            codeId: 0, orgId: 0, codeType: 'EducationQualification',
            codeValueEN: this.newQualificationNameEN.trim(),
            codeValueBN: this.newQualificationNameBN?.trim() || '',
            commCode: null, displayCodeValueEN: null, displayCodeValueBN: null,
            sortOrder: null, level: null, parentCodeId: null, status: true,
            createdBy: currentUser, createdDate: currentDateTime,
            lastUpdatedBy: currentUser, lastupdate: currentDateTime
        } as any;
        this.masterBasicSetupService.create(payload).subscribe({
            next: (res: any) => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Qualification added successfully' });
                this.showQualificationDialog = false;
                this.isSavingQualification = false;
                this.commonCodeService.getAllActiveCommonCodesType('EducationQualification').subscribe({
                    next: (data) => {
                        this.qualificationOptions = (data || []).map((d: any) => ({
                            label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId), value: d.codeId
                        }));
                        const newId = res?.codeId || res?.CodeId;
                        if (newId) this.educationForm.patchValue({ examName: newId });
                    }
                });
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to add Qualification' });
                this.isSavingQualification = false;
            }
        });
    }

    // --- Add Board/University Type dialog ---
    openAddBoardTypeDialog(): void {
        this.newBoardTypeNameEN = '';
        this.newBoardTypeNameBN = '';
        this.showBoardTypeDialog = true;
    }

    saveNewBoardType(): void {
        if (!this.newBoardTypeNameEN?.trim()) return;
        this.isSavingBoardType = true;
        const currentUser = this.sharedService.getCurrentUser();
        const currentDateTime = this.sharedService.getCurrentDateTime();
        const payload = {
            codeId: 0, orgId: 0, codeType: 'EducationInstitutionType',
            codeValueEN: this.newBoardTypeNameEN.trim(),
            codeValueBN: this.newBoardTypeNameBN?.trim() || '',
            commCode: null, displayCodeValueEN: null, displayCodeValueBN: null,
            sortOrder: null, level: null, parentCodeId: null, status: true,
            createdBy: currentUser, createdDate: currentDateTime,
            lastUpdatedBy: currentUser, lastupdate: currentDateTime
        } as any;
        this.masterBasicSetupService.create(payload).subscribe({
            next: (res: any) => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Board/University Type added successfully' });
                this.showBoardTypeDialog = false;
                this.isSavingBoardType = false;
                this.commonCodeService.getAllActiveCommonCodesType('EducationInstitutionType').subscribe({
                    next: (data) => {
                        this.institutionTypeOptions = (data || []).map((d: any) => ({
                            label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId), value: d.codeId
                        }));
                        const newId = res?.codeId || res?.CodeId;
                        if (newId) {
                            this.educationForm.patchValue({ instituteType: newId });
                            this.onInstitutionTypeChange(newId);
                        }
                    }
                });
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to add Board/University Type' });
                this.isSavingBoardType = false;
            }
        });
    }

    // --- Add Result/Grade dialog ---
    openAddGradeDialog(): void {
        this.newGradeNameEN = '';
        this.newGradeNameBN = '';
        this.showGradeDialog = true;
    }

    saveNewGrade(): void {
        if (!this.newGradeNameEN?.trim()) return;
        this.isSavingGrade = true;
        const currentUser = this.sharedService.getCurrentUser();
        const currentDateTime = this.sharedService.getCurrentDateTime();
        const payload = {
            codeId: 0, orgId: 0, codeType: 'EducationResult',
            codeValueEN: this.newGradeNameEN.trim(),
            codeValueBN: this.newGradeNameBN?.trim() || '',
            commCode: null, displayCodeValueEN: null, displayCodeValueBN: null,
            sortOrder: null, level: null, parentCodeId: null, status: true,
            createdBy: currentUser, createdDate: currentDateTime,
            lastUpdatedBy: currentUser, lastupdate: currentDateTime
        } as any;
        this.masterBasicSetupService.create(payload).subscribe({
            next: (res: any) => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Result/Grade added successfully' });
                this.showGradeDialog = false;
                this.isSavingGrade = false;
                this.commonCodeService.getAllActiveCommonCodesType('EducationResult').subscribe({
                    next: (data) => {
                        this.gradeOptions = (data || []).map((d: any) => ({
                            label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId), value: d.codeId
                        }));
                        const newId = res?.codeId || res?.CodeId;
                        if (newId) this.educationForm.patchValue({ grade: newId });
                    }
                });
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to add Result/Grade' });
                this.isSavingGrade = false;
            }
        });
    }

    openAddInstitutionDialog(): void {
        this.newInstitutionNameEN = '';
        this.newInstitutionNameBN = '';
        this.newInstitutionTypeId = this.educationForm.get('instituteType')?.value || null;
        this.showInstitutionDialog = true;
    }

    saveNewInstitution(): void {
        if (!this.newInstitutionNameEN?.trim()) return;
        if (!this.newInstitutionTypeId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select an Institution Type first' });
            return;
        }
        this.isSavingInstitution = true;
        const currentUser = this.sharedService.getCurrentUser();
        const currentDateTime = this.sharedService.getCurrentDateTime();
        const payload = {
            orgId: 0,
            codeId: 0,
            codeType: 'EducationInstitution',
            codeValueEN: this.newInstitutionNameEN.trim(),
            codeValueBN: this.newInstitutionNameBN?.trim() || '',
            parentCodeId: this.newInstitutionTypeId,
            commCode: null,
            displayCodeValueEN: null,
            displayCodeValueBN: null,
            sortOrder: null,
            level: null,
            status: true,
            createdBy: currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime
        } as any;
        this.masterBasicSetupService.create(payload).subscribe({
            next: (res: any) => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Institution created successfully' });
                this.showInstitutionDialog = false;
                this.isSavingInstitution = false;
                // Reload institution options and auto-select
                this.commonCodeService.getAllActiveCommonCodesType('EducationInstitution').subscribe({
                    next: (data) => {
                        this.allInstitutionData = data || [];
                        this.institutionNameOptions = (data || []).map((d: any) => ({
                            label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId),
                            value: d.codeId
                        }));
                        // Re-apply filter based on current institution type
                        const currentType = this.educationForm.get('instituteType')?.value;
                        this.onInstitutionTypeChange(currentType);
                        const newId = res?.codeId || res?.CodeId;
                        if (newId) {
                            this.educationForm.patchValue({ instituteName: newId });
                        }
                    }
                });
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to create institution' });
                this.isSavingInstitution = false;
            }
        });
    }
}
