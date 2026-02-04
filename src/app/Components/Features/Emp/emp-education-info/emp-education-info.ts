import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

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
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';

interface DropdownOption {
    label: string;
    value: number;
}

@Component({
    selector: 'app-emp-education-info',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, InputTextModule, ButtonModule, Fluid, TooltipModule, TableModule, SelectModule, DialogModule, ConfirmDialogModule, DatePickerModule, EmployeeSearchComponent],
    providers: [ConfirmationService],
    templateUrl: './emp-education-info.html',
    styleUrl: './emp-education-info.scss'
})
export class EmpEducationInfoComponent implements OnInit {
    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;

    educationList: EducationInfoModel[] = [];
    isLoading = false;

    displayDialog = false;
    isEditMode = false;
    isSaving = false;
    educationForm!: FormGroup;
    editingEducationId: number | null = null;

    qualificationOptions: DropdownOption[] = [];
    institutionTypeOptions: DropdownOption[] = [];
    institutionNameOptions: DropdownOption[] = [];
    departmentOptions: DropdownOption[] = [];
    subjectOptions: DropdownOption[] = [];
    gradeOptions: DropdownOption[] = [];

    constructor(
        private empService: EmpService,
        private educationInfoService: EducationInfoService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private route: ActivatedRoute,
        private router: Router,
        private fb: FormBuilder
    ) {
        this.initForm();
    }

    ngOnInit(): void {
        this.loadDropdowns();
        this.checkRouteParams();
    }

    initForm(): void {
        this.educationForm = this.fb.group({
            employeeId: [0],
            educationId: [0],
            examName: [null],
            instituteType: [null],
            instituteName: [null],
            departmentName: [null],
            subjectName: [null],
            dateFrom: [null],
            dateTo: [null],
            passingYear: [null],
            grade: [null],
            gradePoint: ['']
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
                            this.institutionNameOptions = opts;
                            break;
                        case 'EducationalDepartment':
                            this.departmentOptions = opts;
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
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load employee' })
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
                    remarks: item.remarks ?? item.Remarks
                }));
                this.isLoading = false;
            },
            error: () => {
                this.isLoading = false;
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
            gradePoint: ''
        });
        this.displayDialog = true;
    }

    openEditDialog(row: EducationInfoModel): void {
        this.isEditMode = true;
        this.editingEducationId = row.educationId;
        const dateFrom = row.dateFrom ? new Date(row.dateFrom) : null;
        const dateTo = row.dateTo ? new Date(row.dateTo) : null;
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
            gradePoint: row.gradePoint ?? ''
        });
        this.displayDialog = true;
    }

    saveEducation(): void {
        if (this.selectedEmployeeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected' });
            return;
        }
        const formValue = this.educationForm.value;
        const toDateStr = (d: Date | null): string | null => {
            if (!d) return null;
            const x = new Date(d);
            return isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10);
        };
        const payload: Partial<EducationInfoModel> = {
            employeeId: this.selectedEmployeeId,
            educationId: this.isEditMode ? (this.editingEducationId ?? 0) : 0,
            examName: formValue.examName ?? null,
            instituteType: formValue.instituteType ?? null,
            instituteName: formValue.instituteName ?? null,
            departmentName: formValue.departmentName ?? null,
            subjectName: formValue.subjectName ?? null,
            dateFrom: toDateStr(formValue.dateFrom),
            dateTo: toDateStr(formValue.dateTo),
            passingYear: formValue.passingYear ?? null,
            grade: formValue.grade ?? null,
            gradePoint: formValue.gradePoint && String(formValue.gradePoint).trim() ? String(formValue.gradePoint).trim() : null,
            remarks: null,
            createdBy: 'system',
            lastUpdatedBy: 'system'
        };

        this.isSaving = true;
        const req = this.isEditMode ? this.educationInfoService.update(payload) : this.educationInfoService.save(payload);

        req.subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: this.isEditMode ? 'Education updated.' : 'Education added.' });
                this.displayDialog = false;
                this.loadEducationList();
                this.isSaving = false;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save education' });
                this.isSaving = false;
            }
        });
    }

    confirmDelete(row: EducationInfoModel): void {
        this.confirmationService.confirm({
            message: 'Delete this education record?',
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => this.deleteEducation(row)
        });
    }

    deleteEducation(row: EducationInfoModel): void {
        this.educationInfoService.delete(row.employeeId, row.educationId).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Education deleted.' });
                this.loadEducationList();
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete' })
        });
    }

    onUploadDocument(row: EducationInfoModel): void {
        this.messageService.add({ severity: 'info', summary: 'Document', detail: 'Upload not implemented. Education ID: ' + row.educationId });
    }

    onUploadDocumentInDialog(): void {
        this.messageService.add({ severity: 'info', summary: 'Document', detail: 'Upload not implemented.' });
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
        this.router.navigate(['/emp-list']);
    }
}
