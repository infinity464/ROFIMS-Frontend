import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';

import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { Toast } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { TooltipModule } from 'primeng/tooltip';
import { CheckboxModule } from 'primeng/checkbox';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { MessageService, ConfirmationService } from 'primeng/api';

import { CourseInfoService } from '@/services/course-info-service';
import { DraftCourseService } from '@/services/draft-course.service';
import { CommonCodeService } from '@/services/common-code-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { EmployeeSearchInfoModel } from '@/models/EmpModel';
import { DraftCourseList, DraftCourseMemberRow } from '@/models/draft-course.model';
import { RftsNominalRollService } from '@/services/rfts-nominal-roll.service';

interface DropdownOption {
    label: string;
    value: number;
}

interface TrainingInstituteOption extends DropdownOption {
    location: string;
    countryId: number | null;
}

@Component({
    selector: 'app-emp-draft-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        RouterLink,
        CardModule,
        SelectModule,
        TableModule,
        ButtonModule,
        Fluid,
        Toast,
        ConfirmDialogModule,
        DialogModule,
        InputTextModule,
        DatePickerModule,
        AutoCompleteModule,
        TooltipModule,
        CheckboxModule,
        IconFieldModule,
        InputIconModule
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './emp-draft-list.html'
})
export class EmpDraftListComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    draftLists: DraftCourseList[] = [];
    selectedDraft: DraftCourseList | null = null;
    selectedDraftMembers: DraftCourseMemberRow[] = [];
    memberRemarksMap: Map<number, string> = new Map();
    isLoadingDrafts = false;
    isSending = false;
    isRemovingFromDraft = false;
    isDeletingDraft = false;
    isAddingToDraft = false;

    showAddToDraftPanel = false;
    addToDraftEmployeeList: EmployeeSearchInfoModel[] = [];
    addToDraftSelectedRows: EmployeeSearchInfoModel[] = [];
    isLoadingAddToDraftEmployees = false;
    addToDraftPickerValue: EmployeeSearchInfoModel | null = null;

    showSendCourseModal = false;
    courseForm!: FormGroup;
    courseTypeOptions: DropdownOption[] = [];
    courseOptions: DropdownOption[] = [];
    trainingInstituteOptions: TrainingInstituteOption[] = [];
    countryOptions: DropdownOption[] = [];
    courseResultOptions: { label: string; value: string }[] = [];
    courseResultSuggestions: { label: string; value: string }[] = [];

    constructor(
        private courseInfoService: CourseInfoService,
        private draftCourseService: DraftCourseService,
        private commonCodeService: CommonCodeService,
        private masterBasicSetup: MasterBasicSetupService,
        private nominalRoll: RftsNominalRollService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private fb: FormBuilder
    ) {
        this.initCourseForm();
    }

    // ---------- Nominal roll export ----------
    /** Id of the draft whose export is currently being fetched. */
    exportingId: number | null = null;

    /**
     * Fetches the roll then hands it to the chosen renderer. Read fresh each
     * time rather than reusing the panel's members, because the export needs the
     * Bangla names and units the panel never loads.
     *
     * annexureLabel is null here: a draft is not an annexure to anything yet, so
     * the roll drops the "ক্রোড়পত্র ক" line the RFTS course roll carries.
     */
    exportRoll(row: DraftCourseList, format: 'print' | 'word' | 'excel', event: Event): void {
        event.stopPropagation();
        if (this.exportingId != null) return;

        if ((row.members?.length ?? 0) === 0) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Nothing to export',
                detail: `"${row.listNo}" has no members.`
            });
            return;
        }

        this.exportingId = row.id;
        this.draftCourseService.getNominalRoll(row.id).subscribe({
            next: async (roll) => {
                const opts = { annexureLabel: null };
                try {
                    if (format === 'print') {
                        if (!this.nominalRoll.print(roll, opts)) {
                            this.messageService.add({
                                severity: 'warn',
                                summary: 'Popup blocked',
                                detail: 'Allow popups for this site to open the print view.'
                            });
                        }
                    } else if (format === 'word') {
                        await this.nominalRoll.exportWord(roll, opts);
                    } else {
                        this.nominalRoll.exportExcel(roll, opts);
                    }
                } catch {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to build the export.' });
                } finally {
                    this.exportingId = null;
                }
            },
            error: (err) => {
                this.exportingId = null;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.description || err?.error?.message || 'Failed to load the export data.'
                });
            }
        });
    }

    ngOnInit(): void {
        // /emp-draft-list and /emp-rfts-completed were split out of
        // /emp-send-to-course. Until they're added to the user_menu
        // permissions table, fall back to the parent route's perms so
        // the action buttons (Remove from Draft, Delete) stay usable.
        const own = this._userMenuService.getPermissionsByRoute(this._router.url);
        const parent = this._userMenuService.getPermissionsByRoute('/emp-send-to-course');
        const _perms = own.canView ? own : parent;
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadDraftLists();
        this.loadSendCourseDropdowns();
        this.courseForm.get('trainingInstitueName')?.valueChanges.subscribe((instituteId) => {
            const inst = this.trainingInstituteOptions.find((o) => o.value === instituteId);
            const countryLabel = inst?.countryId != null ? this.getOptionLabel(this.countryOptions, inst.countryId) : '';
            this.courseForm.patchValue(
                { locationDisplay: inst?.location ?? '', countryDisplay: countryLabel },
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
        this.commonCodeService.getAllActiveCommonCodesType('CourseName').subscribe({
            next: (data) => {
                this.courseOptions = (data || []).map((d: any) => ({
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
        this.courseResultSuggestions = this.courseResultOptions.filter((o) =>
            o.label.toLowerCase().includes(query) || o.value.toLowerCase().includes(query)
        );
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

    toggleDraftMembers(row: DraftCourseList): void {
        if (this.selectedDraft?.id === row.id) {
            this.selectedDraft = null;
        } else {
            this.selectedDraft = row;
        }
        this.selectedDraftMembers = [];
        this.memberRemarksMap.clear();
        this.showAddToDraftPanel = false;
    }

    getMemberRemark(employeeId: number): string {
        return this.memberRemarksMap.get(employeeId) ?? '';
    }

    setMemberRemark(employeeId: number, value: string): void {
        this.memberRemarksMap.set(employeeId, value);
    }

    /**
     * First approval. Instead of completing the list to RFTS, this moves it to
     * "Pending for Final Approval" — it then disappears from this Draft screen
     * and shows up on /emp-pending-final-approval, where the final approval
     * completes it to course/RFTS.
     */
    approveAndSave(): void {
        if (!this.selectedDraft) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select a draft.' });
            return;
        }
        this.isSending = true;
        this.draftCourseService.moveDraftToPending(this.selectedDraft.id, 'User').subscribe({
            next: (res) => {
                if (res.statusCode === 200) {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: res.description ?? 'Draft sent for final approval.'
                    });
                    this.selectedDraft = null;
                    this.memberRemarksMap.clear();
                    this.loadDraftLists();
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? 'Failed to approve.' });
                }
                this.isSending = false;
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to approve.' });
                this.isSending = false;
            }
        });
    }

    openSendCourseModal(): void {
        if (!this.selectedDraft) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select a draft.' });
            return;
        }
        this.courseForm.patchValue({
            courseType: null, courseName: null, trainingInstitueName: null,
            countryDisplay: '', locationDisplay: '',
            dateFrom: null, dateTo: null, result: null, auth: '', remarks: ''
        });
        this.showSendCourseModal = true;
    }

    sendFromDraft(): void {
        if (!this.selectedDraft) return;
        const v = this.courseForm.value;
        const resultVal = v.result;
        const resultStr = typeof resultVal === 'string' ? resultVal : (resultVal?.value ?? (resultVal ? String(resultVal) : null));
        // Build YYYY-MM-DD from local date components — toISOString() would
        // shift the day for timezones off UTC. See toLocalDateStr().
        const details = {
            courseNo: this.selectedDraft?.listNo ?? null,
            courseType: v.courseType ?? null,
            courseName: v.courseName ?? null,
            trainingInstituteId: v.trainingInstitueName ?? null,
            dateFrom: this.toLocalDateStr(v.dateFrom),
            dateTo: this.toLocalDateStr(v.dateTo),
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
                        detail: res.description ?? `${res.recordsCreated} member(s) sent to course.`
                    });
                    this.selectedDraft = null;
                    this.loadDraftLists();
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? 'Failed to send.' });
                }
                this.isSending = false;
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to send to course.' });
                this.isSending = false;
            }
        });
    }

    deleteDraftRow(row: DraftCourseList): void {
        // Backend rejects deletion of drafts with members. Surface that
        // up-front with a clear instruction instead of waiting for the
        // raw API error to come back.
        const memberCount = row.members?.length ?? 0;
        if (memberCount > 0) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Cannot delete',
                detail: `Draft "${row.listNo}" has ${memberCount} member(s). Remove all members from the draft first, then delete.`,
                life: 6000
            });
            return;
        }
        this.confirmationService.confirm({
            message: `Delete draft "${row.listNo}"? This cannot be undone.`,
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

    /** Per-row remove for the member table (matches the X button next to each row). */
    removeSingleMember(member: DraftCourseMemberRow): void {
        if (!this.selectedDraft) return;
        this.confirmationService.confirm({
            message: `Remove ${member.fullNameEN ?? 'this member'} from draft?`,
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Remove', severity: 'danger' },
            accept: () => {
                this.isRemovingFromDraft = true;
                this.draftCourseService.removeMembersFromDraft(this.selectedDraft!.id, [member.employeeId]).subscribe({
                    next: (res) => {
                        if (res.statusCode === 200) {
                            this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Member removed.' });
                            this.refreshSelectedDraft();
                        } else {
                            this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description });
                        }
                        this.isRemovingFromDraft = false;
                    },
                    error: (err: any) => {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to remove.' });
                        this.isRemovingFromDraft = false;
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
                    error: (err: any) => {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to remove.' });
                        this.isRemovingFromDraft = false;
                    }
                });
            }
        });
    }

    searchEmployeesForAddToDraft(event: { query: string }): void {
        if (!this.selectedDraft) {
            this.addToDraftEmployeeList = [];
            return;
        }
        const query = (event?.query ?? '').trim();
        if (query.length === 0) {
            this.addToDraftEmployeeList = [];
            return;
        }
        this.isLoadingAddToDraftEmployees = true;
        this.courseInfoService.getEmployeesNotCompletedByCourseName(0, { query, take: 50 }).subscribe({
            next: (data) => {
                const list = Array.isArray(data) ? data : [];
                const existingIds = new Set((this.selectedDraft?.members ?? []).map((m) => m.employeeId));
                const selectedIds = new Set(this.addToDraftSelectedRows.map((r) => r.employeeID ?? r.EmployeeID ?? 0));
                this.addToDraftEmployeeList = list.filter((e) => {
                    const eid = e.employeeID ?? e.EmployeeID ?? 0;
                    return !existingIds.has(eid) && !selectedIds.has(eid);
                });
                this.isLoadingAddToDraftEmployees = false;
            },
            error: () => {
                this.addToDraftEmployeeList = [];
                this.isLoadingAddToDraftEmployees = false;
            }
        });
    }

    onPickAddToDraftEmployee(event: { value: EmployeeSearchInfoModel } | EmployeeSearchInfoModel): void {
        const row = (event as { value?: EmployeeSearchInfoModel })?.value ?? (event as EmployeeSearchInfoModel);
        if (!row) return;
        const eid = row.employeeID ?? row.EmployeeID ?? 0;
        if (eid <= 0) return;
        const exists = this.addToDraftSelectedRows.some((r) => (r.employeeID ?? r.EmployeeID ?? 0) === eid);
        if (!exists) this.addToDraftSelectedRows = [...this.addToDraftSelectedRows, row];
        setTimeout(() => { this.addToDraftPickerValue = null; }, 0);
    }

    removeAddToDraftEmployee(row: EmployeeSearchInfoModel): void {
        const eid = row.employeeID ?? row.EmployeeID ?? 0;
        this.addToDraftSelectedRows = this.addToDraftSelectedRows.filter((r) => (r.employeeID ?? r.EmployeeID ?? 0) !== eid);
    }

    addToExistingDraft(): void {
        if (!this.selectedDraft || !this.addToDraftSelectedRows?.length) return;
        this.isAddingToDraft = true;
        const members = this.addToDraftSelectedRows.map((r) => this.toMemberRow(r));
        this.draftCourseService.addMembersToDraft(this.selectedDraft.id, members).subscribe({
            next: (res) => {
                if (res.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: `Added ${members.length} member(s) to draft.` });
                    this.showAddToDraftPanel = false;
                    this.addToDraftSelectedRows = [];
                    this.addToDraftEmployeeList = [];
                    this.refreshSelectedDraft();
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description });
                }
                this.isAddingToDraft = false;
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to add to draft.' });
                this.isAddingToDraft = false;
            }
        });
    }

    private toMemberRow(row: EmployeeSearchInfoModel): DraftCourseMemberRow {
        const eid = row.employeeID ?? row.EmployeeID ?? 0;
        return {
            employeeId: eid,
            serviceId: row.serviceId ?? row.ServiceId ?? null,
            rabId: (row as { rabid?: string; rabId?: string; rabID?: string; RABID?: string }).rabid
                ?? (row as { rabid?: string; rabId?: string; rabID?: string; RABID?: string }).rabId
                ?? row.rabID ?? row.RABID ?? null,
            fullNameEN: row.fullNameEN ?? row.FullNameEN ?? null,
            rankName: row.rank ?? row.Rank ?? null,
            corpsName: row.corps ?? row.Corps ?? null,
            tradeName: row.trade ?? row.Trade ?? null,
            motherUnitName: row.motherOrganization ?? row.MotherOrganization ?? null
        };
    }

    getVal(row: any, ...keys: string[]): string {
        for (const k of keys) {
            const v = row?.[k];
            if (v != null && v !== '') return String(v);
        }
        return 'N/A';
    }

    private toLocalDateStr(d: Date | null): string | null {
        if (!d) return null;
        const x = new Date(d);
        if (isNaN(x.getTime())) return null;
        const yyyy = x.getFullYear();
        const mm = String(x.getMonth() + 1).padStart(2, '0');
        const dd = String(x.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    /**
     * Inclusive day count between two ISO date strings — both start and
     * end days count, so 01 May → 22 May is 22 days, not 21.
     * Returns 0 when either is missing or invalid.
     */
    daysBetween(fromIso: string | null | undefined, toIso: string | null | undefined): number {
        if (!fromIso || !toIso) return 0;
        const a = new Date(fromIso).getTime();
        const b = new Date(toIso).getTime();
        if (isNaN(a) || isNaN(b)) return 0;
        const diff = Math.round((b - a) / 86_400_000);
        return Math.max(0, diff + 1);
    }

    /** Card-style member rows manage their own checkbox state — pTableCheckbox is table-bound only. */
    isMemberSelected(row: DraftCourseMemberRow): boolean {
        return this.selectedDraftMembers.some((m) => m.employeeId === row.employeeId);
    }

    toggleMember(row: DraftCourseMemberRow): void {
        const i = this.selectedDraftMembers.findIndex((m) => m.employeeId === row.employeeId);
        if (i >= 0) {
            this.selectedDraftMembers = this.selectedDraftMembers.filter((_, idx) => idx !== i);
        } else {
            this.selectedDraftMembers = [...this.selectedDraftMembers, row];
        }
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
