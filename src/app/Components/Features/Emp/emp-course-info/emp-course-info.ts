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
import { AutoCompleteModule } from 'primeng/autocomplete';

import { EmpService } from '@/services/emp-service';
import { CourseInfoService, CourseInfoModel } from '@/services/course-info-service';
import { CommonCodeService } from '@/services/common-code-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';

interface DropdownOption {
    label: string;
    value: number;
}

interface TrainingInstituteOption extends DropdownOption {
    location: string;
    countryId: number | null;
}

@Component({
    selector: 'app-emp-course-info',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, InputTextModule, ButtonModule, Fluid, TooltipModule, TableModule, SelectModule, DialogModule, ConfirmDialogModule, DatePickerModule, AutoCompleteModule, EmployeeSearchComponent],
    providers: [ConfirmationService],
    templateUrl: './emp-course-info.html',
    styleUrl: './emp-course-info.scss'
})
export class EmpCourseInfoComponent implements OnInit {
    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;

    courseList: CourseInfoModel[] = [];
    isLoading = false;

    displayDialog = false;
    isEditMode = false;
    isSaving = false;
    courseForm!: FormGroup;
    editingCourseId: number | null = null;

    courseTypeOptions: DropdownOption[] = [];
    courseNameOptions: DropdownOption[] = [];
    trainingInstituteOptions: TrainingInstituteOption[] = [];
    countryOptions: DropdownOption[] = [];
    courseResultOptions: { label: string; value: string }[] = [];
    courseResultSuggestions: { label: string; value: string }[] = [];

    constructor(
        private empService: EmpService,
        private courseInfoService: CourseInfoService,
        private commonCodeService: CommonCodeService,
        private masterBasicSetupService: MasterBasicSetupService,
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
        this.courseForm.get('trainingInstitueName')?.valueChanges.subscribe((instituteId) => {
            const institute = this.trainingInstituteOptions.find((o) => o.value === instituteId);
            const countryLabel = institute?.countryId != null ? this.getOptionLabel(this.countryOptions, institute.countryId) : '';
            this.courseForm.patchValue(
                {
                    locationDisplay: institute?.location ?? '',
                    countryDisplay: countryLabel
                },
                { emitEvent: false }
            );
        });
    }

    initForm(): void {
        this.courseForm = this.fb.group({
            employeeId: [0],
            courseId: [0],
            courseType: [null],
            courseName: [null],
            trainingInstitueName: [null],
            countryDisplay: [''], // read-only from Training Institute
            locationDisplay: [''], // read-only from Training Institute
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
        const codeTypes = ['CourseType', 'CourseName', 'Country'];
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
                        case 'CourseName':
                            this.courseNameOptions = opts;
                            break;
                        case 'Country':
                            this.countryOptions = opts;
                            break;
                    }
                }
            });
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
                    this.loadCourseList();
                }
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load employee' })
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
                    dateFrom: item.dateFrom ?? item.DateFrom,
                    dateTo: item.dateTo ?? item.DateTo,
                    result: item.result ?? item.Result,
                    auth: item.auth ?? item.Auth,
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

    /** Location: read-only from Training Institute */
    getLocationDisplay(row: CourseInfoModel): string {
        const inst = row.trainingInstitueName != null ? this.trainingInstituteOptions.find((o) => o.value === row.trainingInstitueName) : null;
        return inst?.location ?? 'N/A';
    }

    /** Country: read-only from Training Institute */
    getCountryDisplay(row: CourseInfoModel): string {
        const inst = row.trainingInstitueName != null ? this.trainingInstituteOptions.find((o) => o.value === row.trainingInstitueName) : null;
        return inst?.countryId != null ? this.getOptionLabel(this.countryOptions, inst.countryId) : 'N/A';
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
        this.courseForm.reset({
            employeeId: this.selectedEmployeeId ?? 0,
            courseId: 0,
            courseType: null,
            courseName: null,
            trainingInstitueName: null,
            countryDisplay: '',
            locationDisplay: '',
            dateFrom: null,
            dateTo: null,
            result: null,
            auth: '',
            remarks: ''
        });
        this.displayDialog = true;
    }

    openEditDialog(row: CourseInfoModel): void {
        this.isEditMode = true;
        this.editingCourseId = row.courseId;
        const dateFrom = row.dateFrom ? new Date(row.dateFrom) : null;
        const dateTo = row.dateTo ? new Date(row.dateTo) : null;
        const inst = row.trainingInstitueName != null ? this.trainingInstituteOptions.find((o) => o.value === row.trainingInstitueName) : null;
        const countryLabel = inst?.countryId != null ? this.getOptionLabel(this.countryOptions, inst.countryId) : '';
        this.courseForm.patchValue({
            employeeId: row.employeeId,
            courseId: row.courseId,
            courseType: row.courseType,
            courseName: row.courseName,
            trainingInstitueName: row.trainingInstitueName,
            countryDisplay: countryLabel,
            locationDisplay: inst?.location ?? '',
            dateFrom,
            dateTo,
            result: row.result ?? '',
            auth: row.auth ?? '',
            remarks: row.remarks ?? ''
        });
        this.displayDialog = true;
    }

    saveCourse(): void {
        if (this.selectedEmployeeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected' });
            return;
        }
        const formValue = this.courseForm.value;
        const toDateStr = (d: Date | null): string | null => {
            if (!d) return null;
            const x = new Date(d);
            return isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10);
        };
        const resultVal = formValue.result;
        const resultStr = typeof resultVal === 'string' ? resultVal : (resultVal?.value ?? (resultVal ? String(resultVal) : null));
        const payload: Partial<CourseInfoModel> = {
            employeeId: this.selectedEmployeeId,
            courseId: this.isEditMode ? (this.editingCourseId ?? 0) : 0,
            courseType: formValue.courseType ?? null,
            courseName: formValue.courseName ?? null,
            trainingInstitueName: formValue.trainingInstitueName ?? null,
            dateFrom: toDateStr(formValue.dateFrom),
            dateTo: toDateStr(formValue.dateTo),
            result: resultStr && String(resultStr).trim() ? String(resultStr).trim() : null,
            auth: formValue.auth && String(formValue.auth).trim() ? String(formValue.auth).trim() : null,
            remarks: formValue.remarks && String(formValue.remarks).trim() ? String(formValue.remarks).trim() : null,
            createdBy: 'system',
            lastUpdatedBy: 'system'
        };

        this.isSaving = true;
        const req = this.isEditMode ? this.courseInfoService.update(payload) : this.courseInfoService.save(payload);

        req.subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: this.isEditMode ? 'Course updated.' : 'Course added.' });
                this.displayDialog = false;
                this.loadCourseList();
                this.isSaving = false;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save course' });
                this.isSaving = false;
            }
        });
    }

    confirmDelete(row: CourseInfoModel): void {
        this.confirmationService.confirm({
            message: 'Delete this course record?',
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => this.deleteCourse(row)
        });
    }

    deleteCourse(row: CourseInfoModel): void {
        this.courseInfoService.delete(row.employeeId, row.courseId).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Course deleted.' });
                this.loadCourseList();
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete' })
        });
    }

    filterCourseResult(event: { query: string }): void {
        const query = (event.query || '').toLowerCase();
        this.courseResultSuggestions = this.courseResultOptions.filter((o) => o.label.toLowerCase().includes(query) || o.value.toLowerCase().includes(query));
    }

    onUploadDocument(row: CourseInfoModel): void {
        this.messageService.add({ severity: 'info', summary: 'Document', detail: 'Upload not implemented. Course ID: ' + row.courseId });
    }

    onUploadDocumentInDialog(): void {
        this.messageService.add({ severity: 'info', summary: 'Document', detail: 'Upload not implemented.' });
    }

    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.isReadonly = true;
        this.loadCourseList();
    }

    onEmployeeSearchReset(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.courseList = [];
    }

    enableEditMode(): void {
        this.mode = 'edit';
        this.isReadonly = false;
    }

    goBack(): void {
        this.router.navigate(['/emp-list']);
    }
}
