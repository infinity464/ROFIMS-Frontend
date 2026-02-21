import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';

import { CardModule } from 'primeng/card';
import { TabsModule } from 'primeng/tabs';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { Toast } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { MessageService, ConfirmationService } from 'primeng/api';

import { CourseInfoService } from '@/services/course-info-service';
import { DraftCourseService } from '@/services/draft-course.service';
import { CommonCodeService } from '@/services/common-code-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { EmployeeSearchInfoModel } from '@/models/EmpModel';
import { DraftCourseList, DraftCourseMemberRow } from '@/models/draft-course.model';

interface DropdownOption {
    label: string;
    value: number;
}

interface TrainingInstituteOption extends DropdownOption {
    location: string;
    countryId: number | null;
}

@Component({
    selector: 'app-emp-send-to-course',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        CardModule,
        TabsModule,
        SelectModule,
        TableModule,
        ButtonModule,
        Fluid,
        Toast,
        ConfirmDialogModule,
        ConfirmPopupModule,
        DialogModule,
        InputTextModule,
        DatePickerModule,
        AutoCompleteModule
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './emp-send-to-course.html',
    styleUrl: './emp-send-to-course.scss'
})
export class EmpSendToCourseComponent implements OnInit {
    activeTab = 0;

    /** Tab (a): Create Draft */
    courseOptions: DropdownOption[] = [];
    selectedCourseId: number | null = null;
    employeeList: EmployeeSearchInfoModel[] = [];
    selectedRows: EmployeeSearchInfoModel[] = [];
    isLoadingEmployees = false;
    isAddingToDraft = false;

    /** Tab (b): Send from Draft */
    draftLists: DraftCourseList[] = [];
    selectedDraft: DraftCourseList | null = null;
    isLoadingDrafts = false;
    isSending = false;

    /** Send to Course modal */
    showSendCourseModal = false;
    courseForm!: FormGroup;
    courseTypeOptions: DropdownOption[] = [];
    trainingInstituteOptions: TrainingInstituteOption[] = [];
    countryOptions: DropdownOption[] = [];
    courseResultOptions: { label: string; value: string }[] = [];
    courseResultSuggestions: { label: string; value: string }[] = [];

    constructor(
        private courseInfoService: CourseInfoService,
        private draftCourseService: DraftCourseService,
        private commonCodeService: CommonCodeService,
        private masterBasicSetup: MasterBasicSetupService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private fb: FormBuilder
    ) {
        this.initCourseForm();
    }

    ngOnInit(): void {
        this.loadCourseOptions();
        this.loadDraftLists();
        this.loadSendCourseDropdowns();
        this.courseForm.get('trainingInstitueName')?.valueChanges.subscribe((instituteId) => {
            const inst = this.trainingInstituteOptions.find((o) => o.value === instituteId);
            const countryLabel = inst?.countryId != null ? this.getOptionLabel(this.countryOptions, inst.countryId) : '';
            this.courseForm.patchValue(
                {
                    locationDisplay: inst?.location ?? '',
                    countryDisplay: countryLabel
                },
                { emitEvent: false }
            );
        });
    }

    initCourseForm(): void {
        this.courseForm = this.fb.group({
            courseType: [null],
            courseNameDisplay: [''], // read-only from draft
            trainingInstitueName: [null],
            countryDisplay: [''],
            locationDisplay: [''],
            dateFrom: [null],
            dateTo: [null],
            result: [null],
            auth: [''],
            remarks: ['']
        });
    }

    loadSendCourseDropdowns(): void {
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
        this.commonCodeService.getAllActiveCommonCodesType('CourseType').subscribe({
            next: (data) => {
                this.courseTypeOptions = (data || []).map((d: any) => ({
                    label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId),
                    value: d.codeId
                }));
            }
        });
        this.commonCodeService.getAllActiveCommonCodesType('Country').subscribe({
            next: (data) => {
                this.countryOptions = (data || []).map((d: any) => ({
                    label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId),
                    value: d.codeId
                }));
            }
        });
        this.masterBasicSetup.getAllInstitute().subscribe({
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

    getOptionLabel(options: DropdownOption[], value: number | null): string {
        if (value == null) return 'N/A';
        const o = options.find((x) => x.value === value);
        return o ? o.label : 'N/A';
    }

    filterCourseResult(event: { query: string }): void {
        const query = (event.query || '').toLowerCase();
        this.courseResultSuggestions = this.courseResultOptions.filter(
            (o) => o.label.toLowerCase().includes(query) || o.value.toLowerCase().includes(query)
        );
    }

    loadCourseOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('CourseName').subscribe({
            next: (data) => {
                this.courseOptions = (data || []).map((d: any) => ({
                    label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId),
                    value: d.codeId
                }));
            }
        });
    }

    onCourseSelect(): void {
        this.selectedRows = [];
        if (this.selectedCourseId == null || this.selectedCourseId === 0) {
            this.employeeList = [];
            return;
        }
        this.isLoadingEmployees = true;
        this.courseInfoService.getEmployeesNotCompletedByCourseName(this.selectedCourseId).subscribe({
            next: (data) => {
                this.employeeList = Array.isArray(data) ? data : [];
                this.isLoadingEmployees = false;
            },
            error: () => {
                this.employeeList = [];
                this.isLoadingEmployees = false;
            }
        });
    }

    toMemberRow(row: EmployeeSearchInfoModel): DraftCourseMemberRow {
        const eid = row.employeeID ?? row.EmployeeID ?? 0;
        return {
            employeeId: eid,
            serviceId: row.serviceId ?? row.ServiceId ?? null,
            rabId: row.rabID ?? row.RABID ?? null,
            fullNameEN: row.fullNameEN ?? row.FullNameEN ?? null,
            rankName: row.rank ?? row.Rank ?? null,
            corpsName: row.corps ?? row.Corps ?? null,
            tradeName: row.trade ?? row.Trade ?? null,
            motherUnitName: row.motherOrganization ?? row.MotherOrganization ?? null
        };
    }

    addToDraft(): void {
        if (!this.selectedCourseId || this.selectedCourseId === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select a course.' });
            return;
        }
        if (!this.selectedRows || this.selectedRows.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select at least one employee.' });
            return;
        }
        this.isAddingToDraft = true;
        const members = this.selectedRows.map((r) => this.toMemberRow(r));
        this.draftCourseService.addToDraftCourseList(this.selectedCourseId, members, 'User').subscribe({
            next: (res) => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: `Added ${members.length} employee(s) to draft (${res.listNo}).`
                });
                this.selectedRows = [];
                this.loadDraftLists();
                this.isAddingToDraft = false;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to add to draft.' });
                this.isAddingToDraft = false;
            }
        });
    }

    loadDraftLists(): void {
        this.isLoadingDrafts = true;
        this.draftCourseService.getDraftCourseLists().subscribe({
            next: (lists) => {
                this.draftLists = lists ?? [];
                this.isLoadingDrafts = false;
            },
            error: () => {
                this.draftLists = [];
                this.isLoadingDrafts = false;
            }
        });
    }

    openSendCourseModal(): void {
        if (!this.selectedDraft) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select a draft.' });
            return;
        }
        this.courseForm.patchValue({
            courseType: null,
            courseNameDisplay: this.selectedDraft.courseName,
            trainingInstitueName: null,
            countryDisplay: '',
            locationDisplay: '',
            dateFrom: null,
            dateTo: null,
            result: null,
            auth: '',
            remarks: ''
        });
        this.showSendCourseModal = true;
    }

    sendFromDraft(): void {
        if (!this.selectedDraft) return;
        const v = this.courseForm.value;
        const toDateStr = (d: Date | null): string | null => {
            if (!d) return null;
            const x = new Date(d);
            return isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10);
        };
        // #region agent log
        fetch('http://127.0.0.1:7682/ingest/24c52934-7935-4f35-a09e-2dbd51502872',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e8ff9'},body:JSON.stringify({sessionId:'7e8ff9',location:'emp-send-to-course.ts:sendFromDraft',message:'Form values before details',data:{rawDateFrom:v.dateFrom,rawDateTo:v.dateTo,rawDateFromType:typeof v.dateFrom,rawDateToType:typeof v.dateTo},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        const resultVal = v.result;
        const resultStr = typeof resultVal === 'string' ? resultVal : (resultVal?.value ?? (resultVal ? String(resultVal) : null));
        const details = {
            courseType: v.courseType ?? null,
            trainingInstituteId: v.trainingInstitueName ?? null,
            dateFrom: toDateStr(v.dateFrom),
            dateTo: toDateStr(v.dateTo),
            result: resultStr && String(resultStr).trim() ? String(resultStr).trim() : null,
            auth: v.auth && String(v.auth).trim() ? String(v.auth).trim() : null,
            remarks: v.remarks && String(v.remarks).trim() ? String(v.remarks).trim() : null
        };
        // #region agent log
        fetch('http://127.0.0.1:7682/ingest/24c52934-7935-4f35-a09e-2dbd51502872',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e8ff9'},body:JSON.stringify({sessionId:'7e8ff9',location:'emp-send-to-course.ts:sendFromDraft',message:'Details object with dates',data:{dateFrom:details.dateFrom,dateTo:details.dateTo},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        this.isSending = true;
        this.showSendCourseModal = false;
        this.draftCourseService.sendFromDraftToCourse(this.selectedDraft.id, 'User', details).subscribe({
            next: (res) => {
                if (res.statusCode === 200) {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: res.description ?? `${res.recordsCreated} employee(s) sent to course.`
                    });
                    this.selectedDraft = null;
                    this.loadDraftLists();
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? 'Failed to send.' });
                }
                this.isSending = false;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to send to course.' });
                this.isSending = false;
            }
        });
    }

    getVal(row: any, ...keys: string[]): string {
        for (const k of keys) {
            const v = row?.[k];
            if (v != null && v !== '') return String(v);
        }
        return 'N/A';
    }
}
