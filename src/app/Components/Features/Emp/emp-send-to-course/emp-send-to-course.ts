import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { Toast } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { TooltipModule } from 'primeng/tooltip';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { MessageService } from 'primeng/api';

import { CourseInfoService } from '@/services/course-info-service';
import { DraftCourseService } from '@/services/draft-course.service';
import { EmployeeSearchInfoModel } from '@/models/EmpModel';
import { DraftCourseMemberRow } from '@/models/draft-course.model';

@Component({
    selector: 'app-emp-send-to-course',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        CardModule,
        TableModule,
        ButtonModule,
        Fluid,
        Toast,
        ConfirmDialogModule,
        InputTextModule,
        DatePickerModule,
        AutoCompleteModule,
        TooltipModule,
        IconFieldModule,
        InputIconModule
    ],
    providers: [MessageService],
    templateUrl: './emp-send-to-course.html',
    styleUrl: './emp-send-to-course.scss'
})
export class EmpSendToCourseComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    courseNo = '';
    draftDateFrom: Date | null = null;
    draftDateTo: Date | null = null;

    /**
     * Members the user has accumulated in the picker. The "Selected members"
     * table renders this list; addToDraft() sends it. The autocomplete itself
     * is search-only (single-select binding to {@link employeePickerValue}) —
     * picking a row pushes it here and resets the input so it never shows chips.
     */
    selectedRows: EmployeeSearchInfoModel[] = [];
    /** ngModel target for the search-only autocomplete. Cleared after every pick. */
    employeePickerValue: EmployeeSearchInfoModel | null = null;
    /** Current autocomplete suggestion buffer (server returns top-50 per query). */
    employeeSuggestions: EmployeeSearchInfoModel[] = [];
    isLoadingEmployees = false;
    isAddingToDraft = false;

    constructor(
        private courseInfoService: CourseInfoService,
        private draftCourseService: DraftCourseService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;
    }

    /**
     * Server-side autocomplete handler. Fires on every keystroke (with PrimeNG's
     * built-in debouncing). Hits /GetEmployeesNotCompletedByCourseName with the
     * search term — backend returns top 50 matches across Name / Service ID /
     * RAB ID. Skips already-selected members client-side so the dropdown
     * doesn't show duplicates.
     */
    searchEmployees(event: { query: string }): void {
        const query = (event?.query ?? '').trim();
        if (query.length === 0) {
            this.employeeSuggestions = [];
            return;
        }
        this.isLoadingEmployees = true;
        this.courseInfoService.getEmployeesNotCompletedByCourseName(0, { query, take: 50 }).subscribe({
            next: (data) => {
                const list = Array.isArray(data) ? data : [];
                const selectedIds = new Set(this.selectedRows.map((r) => r.employeeID ?? r.EmployeeID ?? 0));
                this.employeeSuggestions = list.filter((e) => {
                    const eid = e.employeeID ?? e.EmployeeID ?? 0;
                    return !selectedIds.has(eid);
                });
                this.isLoadingEmployees = false;
            },
            error: () => {
                this.employeeSuggestions = [];
                this.isLoadingEmployees = false;
            }
        });
    }

    /**
     * AutoComplete (onSelect) — fires when the user picks a suggestion. Adds
     * the row to {@link selectedRows} if not already there, then resets the
     * input so the autocomplete stays empty (no chip clutter) and is ready
     * for the next search. Duplicate picks are silently ignored.
     */
    onPickEmployee(event: { value: EmployeeSearchInfoModel } | EmployeeSearchInfoModel): void {
        const row = (event as { value?: EmployeeSearchInfoModel })?.value ?? (event as EmployeeSearchInfoModel);
        if (!row) return;
        const eid = row.employeeID ?? row.EmployeeID ?? 0;
        if (eid <= 0) return;
        const exists = this.selectedRows.some((r) => (r.employeeID ?? r.EmployeeID ?? 0) === eid);
        if (!exists) this.selectedRows = [...this.selectedRows, row];
        // setTimeout queues the reset after PrimeNG's own ngModel write,
        // otherwise the value sticks for a render cycle.
        setTimeout(() => { this.employeePickerValue = null; }, 0);
    }

    removeSelectedEmployee(row: EmployeeSearchInfoModel): void {
        const eid = row.employeeID ?? row.EmployeeID ?? 0;
        this.selectedRows = this.selectedRows.filter((r) => (r.employeeID ?? r.EmployeeID ?? 0) !== eid);
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

    addToDraft(): void {
        if (!this.courseNo?.trim()) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'CourseNo is required.' });
            return;
        }
        if (!this.draftDateFrom || !this.draftDateTo) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'From and To dates are required.' });
            return;
        }
        if (!this.selectedRows || this.selectedRows.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select at least one member.' });
            return;
        }
        this.isAddingToDraft = true;
        const members = this.selectedRows.map((r) => this.toMemberRow(r));
        // toISOString() converts to UTC, which shifts the calendar day
        // for any timezone west of UTC (and for parts of the day east of
        // UTC) — e.g. picking 2026-05-01 in UTC+6 would round-trip as
        // 2026-04-30. Use local date components so the day the user picks
        // is the day the backend stores.
        const dateFrom = this.toLocalDateStr(this.draftDateFrom);
        const dateTo = this.toLocalDateStr(this.draftDateTo);
        this.draftCourseService.addToDraftCourseList(this.courseNo.trim(), null, members, 'User', dateFrom, dateTo).subscribe({
            next: (res) => {
                if (res.statusCode === 200 && res.id) {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: `Added ${members.length} member(s) to draft (${res.listNo}).`
                    });
                    this.selectedRows = [];
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

    private toLocalDateStr(d: Date | null): string | null {
        if (!d) return null;
        const x = new Date(d);
        if (isNaN(x.getTime())) return null;
        const yyyy = x.getFullYear();
        const mm = String(x.getMonth() + 1).padStart(2, '0');
        const dd = String(x.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    getVal(row: any, ...keys: string[]): string {
        for (const k of keys) {
            const v = row?.[k];
            if (v != null && v !== '') return String(v);
        }
        return 'N/A';
    }
}
