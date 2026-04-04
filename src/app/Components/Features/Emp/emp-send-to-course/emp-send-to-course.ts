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
import { TooltipModule } from 'primeng/tooltip';
import { MessageService, ConfirmationService } from 'primeng/api';

import { CourseInfoService, EmployeeCourseFilterParams } from '@/services/course-info-service';
import { DraftCourseService } from '@/services/draft-course.service';
import { CommonCodeService } from '@/services/common-code-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { EmployeeSearchInfoModel } from '@/models/EmpModel';
import { DraftCourseList, DraftCourseMemberRow, RftsTrainingRow } from '@/models/draft-course.model';

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
        AutoCompleteModule,
        TooltipModule
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './emp-send-to-course.html',
    styleUrl: './emp-send-to-course.scss'
})
export class EmpSendToCourseComponent implements OnInit {
    activeTab = 0;

    /** Tab (a): Create Draft */
    courseNo = '';
    draftDateFrom: Date | null = null;
    draftDateTo: Date | null = null;
    courseOptions: DropdownOption[] = [];
    employeeList: EmployeeSearchInfoModel[] = [];
    selectedRows: EmployeeSearchInfoModel[] = [];
    isLoadingEmployees = false;
    isAddingToDraft = false;

    /** Filters for Select Employee RFTS */
    filterServiceId = '';
    filterRabId = '';
    filterMotherOrg: string | null = null;
    filterRank: string | null = null;
    filterCorps: string | null = null;
    filterTrade: string | null = null;
    filterDateFrom: Date | null = null;
    filterDateTo: Date | null = null;
    motherOrgFilterOptions: { label: string; value: string }[] = [];
    rankFilterOptions: { label: string; value: string }[] = [];
    corpsFilterOptions: { label: string; value: string }[] = [];
    tradeFilterOptions: { label: string; value: string }[] = [];

    /** Tab (b): Send from Draft */
    draftLists: DraftCourseList[] = [];
    selectedDraft: DraftCourseList | null = null;
    selectedDraftMembers: DraftCourseMemberRow[] = [];
    memberRemarksMap: Map<number, string> = new Map();
    isLoadingDrafts = false;
    isSending = false;
    isRemovingFromDraft = false;
    isDeletingDraft = false;
    showAddToDraftPanel = false;
    addToDraftEmployeeList: EmployeeSearchInfoModel[] = [];
    addToDraftSelectedRows: EmployeeSearchInfoModel[] = [];
    isLoadingAddToDraftEmployees = false;

    /** Tab (c): RFTS Completed */
    rftsCompletedList: RftsTrainingRow[] = [];
    isLoadingCompleted = false;

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
        this.loadFilterOptions();
        this.loadEmployeesWithFilters();
        this.loadRftsCompleted();
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
            courseName: [null],
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
        this.courseResultSuggestions = this.courseResultOptions.filter((o) => o.label.toLowerCase().includes(query) || o.value.toLowerCase().includes(query));
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

    loadEmployeesWithFilters(): void {
        this.isLoadingEmployees = true;
        const filter = this.buildFilterParams();
        this.courseInfoService.getEmployeesNotCompletedByCourseName(0, filter).subscribe({
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

    private buildFilterParams(): EmployeeCourseFilterParams | undefined {
        const hasSvc = (this.filterServiceId || '').trim();
        const hasRab = (this.filterRabId || '').trim();
        const hasMo = !!this.filterMotherOrg?.trim();
        const hasRank = !!this.filterRank?.trim();
        const hasCorps = !!this.filterCorps?.trim();
        const hasTrade = !!this.filterTrade?.trim();
        const hasFrom = !!this.filterDateFrom;
        const hasTo = !!this.filterDateTo;
        if (!hasSvc && !hasRab && !hasMo && !hasRank && !hasCorps && !hasTrade && !hasFrom && !hasTo) return undefined;
        const toDateStr = (d: Date | null): string | undefined => {
            if (!d) return undefined;
            const x = new Date(d);
            return isNaN(x.getTime()) ? undefined : x.toISOString().slice(0, 10);
        };
        return {
            serviceId: hasSvc ? this.filterServiceId.trim() : undefined,
            rabId: hasRab ? this.filterRabId.trim() : undefined,
            motherOrganization: hasMo ? this.filterMotherOrg!.trim() : undefined,
            rank: hasRank ? this.filterRank!.trim() : undefined,
            corps: hasCorps ? this.filterCorps!.trim() : undefined,
            trade: hasTrade ? this.filterTrade!.trim() : undefined,
            joiningDateFrom: toDateStr(this.filterDateFrom),
            joiningDateTo: toDateStr(this.filterDateTo)
        };
    }

    applyFilters(): void {
        this.selectedRows = [];
        this.loadEmployeesWithFilters();
    }

    clearFilters(): void {
        this.resetFilters();
        this.selectedRows = [];
        this.loadEmployeesWithFilters();
    }

    private resetFilters(): void {
        this.filterServiceId = '';
        this.filterRabId = '';
        this.filterMotherOrg = null;
        this.filterRank = null;
        this.filterCorps = null;
        this.filterTrade = null;
        this.filterDateFrom = null;
        this.filterDateTo = null;
    }

    loadFilterOptions(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (data) => {
                const arr = (data || []).filter((o: any) => (o.orgNameEN ?? o.OrgNameEN)?.trim());
                this.motherOrgFilterOptions = arr
                    .map((o: any) => ({ label: o.orgNameEN ?? o.OrgNameEN, value: o.orgNameEN ?? o.OrgNameEN }))
                    .sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label));
            }
        });
        this.commonCodeService.getAllActiveCommonCodesType('Corps').subscribe({
            next: (data) => {
                const arr = (data || []).filter((d: any) => (d.codeValueEN ?? d.CodeValueEN)?.trim());
                this.corpsFilterOptions = arr.map((d: any) => ({
                    label: d.codeValueEN ?? d.CodeValueEN,
                    value: d.codeValueEN ?? d.CodeValueEN
                }));
            }
        });
        this.commonCodeService.getAllActiveCommonCodesType('Trade').subscribe({
            next: (data) => {
                const arr = (data || []).filter((d: any) => (d.codeValueEN ?? d.CodeValueEN)?.trim());
                this.tradeFilterOptions = arr.map((d: any) => ({
                    label: d.codeValueEN ?? d.CodeValueEN,
                    value: d.codeValueEN ?? d.CodeValueEN
                }));
            }
        });
        this.commonCodeService.getAllActiveCommonCodesType('MotherOrgRank').subscribe({
            next: (data) => {
                const arr = (data || []).filter((d: any) => (d.codeValueEN ?? d.CodeValueEN)?.trim());
                this.rankFilterOptions = arr.map((d: any) => ({
                    label: d.codeValueEN ?? d.CodeValueEN,
                    value: d.codeValueEN ?? d.CodeValueEN
                }));
            }
        });
    }

    toMemberRow(row: EmployeeSearchInfoModel): DraftCourseMemberRow {
        const eid = row.employeeID ?? row.EmployeeID ?? 0;
        return {
            employeeId: eid,
            serviceId: row.serviceId ?? row.ServiceId ?? null,
            rabId: (row as { rabid?: string; rabId?: string; rabID?: string; RABID?: string }).rabid ?? (row as { rabid?: string; rabId?: string; rabID?: string; RABID?: string }).rabId ?? row.rabID ?? row.RABID ?? null,
            fullNameEN: row.fullNameEN ?? row.FullNameEN ?? null,
            rankName: row.rank ?? row.Rank ?? null,
            corpsName: row.corps ?? row.Corps ?? null,
            tradeName: row.trade ?? row.Trade ?? null,
            motherUnitName: row.motherOrganization ?? row.MotherOrganization ?? null
        };
    }

    addToDraft(): void {
        if (!this.courseNo?.trim()) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'CourseNo is required.' });
            return;
        }
        if (!this.selectedRows || this.selectedRows.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select at least one employee.' });
            return;
        }
        this.isAddingToDraft = true;
        const members = this.selectedRows.map((r) => this.toMemberRow(r));
        const toDateStr = (d: Date | null): string | null => {
            if (!d) return null;
            const x = new Date(d);
            return isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10);
        };
        const dateFrom = toDateStr(this.draftDateFrom);
        const dateTo = toDateStr(this.draftDateTo);
        this.draftCourseService.addToDraftCourseList(this.courseNo.trim(), null, members, 'User', dateFrom, dateTo).subscribe({
            next: (res) => {
                if (res.statusCode === 200 && res.id) {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: `Added ${members.length} employee(s) to draft (${res.listNo}).`
                    });
                    this.selectedRows = [];
                    this.loadDraftLists();
                    this.courseNo = '';
                    this.draftDateFrom = null;
                    this.draftDateTo = null;
                } else {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: res.description ?? 'Failed to add to draft.'
                    });
                }
                this.isAddingToDraft = false;
            },
            error: (err) => {
                const msg = err?.error?.description ?? err?.error?.message ?? 'Failed to add to draft.';
                this.messageService.add({ severity: 'error', summary: 'Error', detail: msg });
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
        this.showSendCourseModal = true;
    }

    toggleDraftMembers(row: DraftCourseList): void {
        if (this.selectedDraft?.id === row.id) {
            this.selectedDraft = null;
            this.selectedDraftMembers = [];
            this.memberRemarksMap.clear();
            this.showAddToDraftPanel = false;
        } else {
            this.selectedDraft = row;
            this.selectedDraftMembers = [];
            this.memberRemarksMap.clear();
            this.showAddToDraftPanel = false;
        }
    }

    getMemberRemark(employeeId: number): string {
        return this.memberRemarksMap.get(employeeId) ?? '';
    }

    setMemberRemark(employeeId: number, value: string): void {
        this.memberRemarksMap.set(employeeId, value);
    }

    approveAndSave(): void {
        if (!this.selectedDraft) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select a draft.' });
            return;
        }
        this.isSending = true;
        const details = { courseNo: this.selectedDraft.listNo ?? null };
        const memberRemarks: { employeeId: number; remarks: string }[] = [];
        this.memberRemarksMap.forEach((remarks, employeeId) => {
            if (remarks?.trim()) memberRemarks.push({ employeeId, remarks: remarks.trim() });
        });
        this.draftCourseService.sendFromDraftToCourse(this.selectedDraft.id, 'User', details, memberRemarks).subscribe({
            next: (res) => {
                if (res.statusCode === 200) {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: res.description ?? `${res.recordsCreated} employee(s) approved.`
                    });
                    this.selectedDraft = null;
                    this.memberRemarksMap.clear();
                    this.loadDraftLists();
                    this.loadEmployeesWithFilters();
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? 'Failed to approve.' });
                }
                this.isSending = false;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to approve.' });
                this.isSending = false;
            }
        });
    }

    sendFromDraft(): void {
        if (!this.selectedDraft) return;
        const v = this.courseForm.value;
        const toDateStr = (d: Date | null): string | null => {
            if (!d) return null;
            const x = new Date(d);
            return isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10);
        };
        const resultVal = v.result;
        const resultStr = typeof resultVal === 'string' ? resultVal : (resultVal?.value ?? (resultVal ? String(resultVal) : null));
        const details = {
            courseNo: this.selectedDraft?.listNo ?? null,
            courseType: v.courseType ?? null,
            courseName: v.courseName ?? null,
            trainingInstituteId: v.trainingInstitueName ?? null,
            dateFrom: toDateStr(v.dateFrom),
            dateTo: toDateStr(v.dateTo),
            result: resultStr && String(resultStr).trim() ? String(resultStr).trim() : null,
            auth: v.auth && String(v.auth).trim() ? String(v.auth).trim() : null,
            remarks: v.remarks && String(v.remarks).trim() ? String(v.remarks).trim() : null
        };
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

    deleteDraft(): void {
        if (!this.selectedDraft) return;
        this.confirmationService.confirm({
            message: `Delete draft "${this.selectedDraft.listNo}" and all its members? This cannot be undone.`,
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Delete', severity: 'danger' },
            accept: () => {
                this.isDeletingDraft = true;
                this.draftCourseService.deleteDraft(this.selectedDraft!.id).subscribe({
                    next: (res) => {
                        if (res.statusCode === 200) {
                            this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Draft deleted.' });
                            this.selectedDraft = null;
                            this.selectedDraftMembers = [];
                            this.showAddToDraftPanel = false;
                            this.loadDraftLists();
                        } else {
                            this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description });
                        }
                        this.isDeletingDraft = false;
                    },
                    error: (err) => {
                        const msg = err?.error?.description ?? err?.error?.message ?? 'Failed to delete draft.';
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: msg });
                        this.isDeletingDraft = false;
                    }
                });
            }
        });
    }

    deleteDraftRow(row: DraftCourseList): void {
        this.confirmationService.confirm({
            message: `Delete draft "${row.listNo}" and all its members? This cannot be undone.`,
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Delete', severity: 'danger' },
            accept: () => {
                this.isDeletingDraft = true;
                this.draftCourseService.deleteDraft(row.id).subscribe({
                    next: (res) => {
                        if (res.statusCode === 200) {
                            this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Draft deleted.' });
                            if (this.selectedDraft?.id === row.id) {
                                this.selectedDraft = null;
                                this.selectedDraftMembers = [];
                                this.showAddToDraftPanel = false;
                            }
                            this.loadDraftLists();
                        } else {
                            this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description });
                        }
                        this.isDeletingDraft = false;
                    },
                    error: (err) => {
                        const msg = err?.error?.description ?? err?.error?.message ?? 'Failed to delete draft.';
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: msg });
                        this.isDeletingDraft = false;
                    }
                });
            }
        });
    }

    removeFromDraft(): void {
        if (!this.selectedDraft || !this.selectedDraftMembers?.length) return;
        this.confirmationService.confirm({
            message: `Remove ${this.selectedDraftMembers.length} member(s) from draft?`,
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Remove', severity: 'danger' },
            accept: () => {
                this.isRemovingFromDraft = true;
                const ids = this.selectedDraftMembers.map((m) => m.employeeId);
                this.draftCourseService.removeMembersFromDraft(this.selectedDraft!.id, ids).subscribe({
                    next: (res) => {
                        if (res.statusCode === 200) {
                            this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Member(s) removed.' });
                            this.refreshSelectedDraft();
                        } else {
                            this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description });
                        }
                        this.selectedDraftMembers = [];
                        this.isRemovingFromDraft = false;
                    },
                    error: () => {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to remove.' });
                        this.isRemovingFromDraft = false;
                    }
                });
            }
        });
    }

    loadEmployeesForAddToDraft(): void {
        if (!this.selectedDraft) return;
        this.isLoadingAddToDraftEmployees = true;
        this.addToDraftEmployeeList = [];
        this.addToDraftSelectedRows = [];
        const filter = this.buildFilterParams();
        this.courseInfoService.getEmployeesNotCompletedByCourseName(0, filter).subscribe({
            next: (data) => {
                const list = Array.isArray(data) ? data : [];
                const existingIds = new Set((this.selectedDraft?.members ?? []).map((m) => m.employeeId));
                this.addToDraftEmployeeList = list.filter((e) => {
                    const eid = e.employeeID ?? e.EmployeeID ?? 0;
                    return !existingIds.has(eid);
                });
                this.isLoadingAddToDraftEmployees = false;
            },
            error: () => {
                this.addToDraftEmployeeList = [];
                this.isLoadingAddToDraftEmployees = false;
            }
        });
    }

    addToExistingDraft(): void {
        if (!this.selectedDraft || !this.addToDraftSelectedRows?.length) return;
        this.isAddingToDraft = true;
        const members = this.addToDraftSelectedRows.map((r) => this.toMemberRow(r));
        this.draftCourseService.addMembersToDraft(this.selectedDraft.id, members).subscribe({
            next: (res) => {
                if (res.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: `Added ${members.length} employee(s) to draft.` });
                    this.showAddToDraftPanel = false;
                    this.addToDraftSelectedRows = [];
                    this.addToDraftEmployeeList = [];
                    this.refreshSelectedDraft();
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description });
                }
                this.isAddingToDraft = false;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to add to draft.' });
                this.isAddingToDraft = false;
            }
        });
    }

    loadRftsCompleted(): void {
        this.isLoadingCompleted = true;
        this.draftCourseService.getAllRftsTraining().subscribe({
            next: (list) => {
                this.rftsCompletedList = list ?? [];
                this.isLoadingCompleted = false;
            },
            error: () => {
                this.rftsCompletedList = [];
                this.isLoadingCompleted = false;
            }
        });
    }

    private refreshSelectedDraft(): void {
        if (!this.selectedDraft) return;
        this.draftCourseService.getDraftCourseListById(this.selectedDraft.id).subscribe({
            next: (d) => {
                if (d) {
                    this.selectedDraft = d;
                    this.selectedDraftMembers = [];
                }
                this.loadDraftLists();
            }
        });
    }
}
