import { AfterViewInit, Component, ElementRef, OnInit, Output, EventEmitter, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { Fluid } from 'primeng/fluid';

import { EmpService } from '@/services/emp-service';
import { CommonCodeService } from '@/services/common-code-service';
import { MotherOrganizationModel } from '@/models/mother-org-model';
import { EmpModel } from '@/models/EmpModel';
import { PostingStatus } from '@/models/enums';
import { PreviousRABServiceService, VwPreviousRABServiceInfoModel } from '@/services/previous-rab-service.service';
import { TableModule } from 'primeng/table';
import { forkJoin, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { PartialDatePipe } from '@/shared/pipes/partial-date.pipe';

@Component({
    selector: 'app-emp-present-member-check',
    standalone: true,
    imports: [CommonModule, FormsModule, InputNumberModule, InputTextModule, ButtonModule, SelectModule, DialogModule, Fluid, TableModule, PartialDatePipe],
    templateUrl: './emp-present-member-check.component.html',
    styleUrl: './emp-present-member-check.component.scss'
})
export class EmpPresentMemberCheckComponent implements OnInit, AfterViewInit {
    @ViewChild('serviceIdInput', { read: ElementRef }) serviceIdInput?: ElementRef<HTMLElement>;

    motherOrgId: number | null = null;
    serviceId: number | null = null;
    nid: string = '';

    motherOrganizations: MotherOrganizationModel[] = [];
    isSearching = false;

    showInfoDialog = false;
    infoDialogHeader = '';
    infoDialogMessage = '';
    infoDialogIcon: 'info' | 'warn' | 'error' | 'success' = 'info';
    private onInfoDialogClose: (() => void) | null = null;

    showPickerDialog = false;
    pickerRows: {
        employee: EmpModel;
        displayName: string;
        orgName: string;
        postingStatus: string;
        isExMember: boolean;
        sortKey: string;
    }[] = [];

    showConfirmDialog = false;
    confirmDialogHeader = '';
    confirmDialogMessage = '';
    private onConfirmYes: (() => void) | null = null;
    private onConfirmNo: (() => void) | null = null;

    get confirmDialogDetails(): string {
        const idx = (this.confirmDialogMessage || '').indexOf('\n\n\n');
        return idx >= 0 ? this.confirmDialogMessage.slice(0, idx) : this.confirmDialogMessage;
    }
    get confirmDialogQuestion(): string {
        const idx = (this.confirmDialogMessage || '').indexOf('\n\n\n');
        return idx >= 0 ? this.confirmDialogMessage.slice(idx + 3) : '';
    }

    private readonly statusListLabel: Record<string, string> = {
        [PostingStatus.Supernumerary]: 'Supernumerary',
        [PostingStatus.Servings]: 'Serving',
        [PostingStatus.ExMember]: 'Ex-Member',
        [PostingStatus.PendingForJoining]: 'Pending for Joining',
        [PostingStatus.Pending]: 'Pending'
    };

    exMemberEmployee: EmpModel | null = null;
    exMemberViewList: VwPreviousRABServiceInfoModel[] = [];
    isLoadingExMemberData = false;
    exMemberDetailsText: string = '';

    /** Emitted when search completes and no employee is found (so parent can show the entry form). */
    @Output() employeeNotFound = new EventEmitter<void>();
    /** Emitted when search finds an employee (present or ex-member), so parent can hide the entry form. */
    @Output() employeeFound = new EventEmitter<void>();
    /** Emitted when user clicks View Old Profile: parent should show form and load this employee id. */
    @Output() loadOldProfile = new EventEmitter<number>();

    constructor(
        private empService: EmpService,
        private commonCodeService: CommonCodeService,
        private previousRABService: PreviousRABServiceService
    ) {}

    private showInfo(
        header: string,
        message: string,
        icon: 'info' | 'warn' | 'error' | 'success' = 'info',
        onClose?: () => void
    ): void {
        this.infoDialogHeader = header;
        this.infoDialogMessage = message;
        this.infoDialogIcon = icon;
        this.onInfoDialogClose = onClose ?? null;
        this.showInfoDialog = true;
    }

    closeInfoDialog(): void {
        this.showInfoDialog = false;
        const cb = this.onInfoDialogClose;
        this.onInfoDialogClose = null;
        cb?.();
    }

    private showConfirm(header: string, message: string, onYes: () => void, onNo?: () => void): void {
        this.confirmDialogHeader = header;
        this.confirmDialogMessage = message;
        this.onConfirmYes = onYes;
        this.onConfirmNo = onNo ?? null;
        this.showConfirmDialog = true;
    }

    onConfirmYesClick(): void {
        this.showConfirmDialog = false;
        const cb = this.onConfirmYes;
        this.onConfirmYes = null;
        this.onConfirmNo = null;
        cb?.();
    }

    onConfirmNoClick(): void {
        this.showConfirmDialog = false;
        const cb = this.onConfirmNo;
        this.onConfirmYes = null;
        this.onConfirmNo = null;
        cb?.();
    }

    private formatMemberDetails(employee: EmpModel, rankName: string, prefixLabel: string): string {
        const emp = employee as any;
        const serviceId = emp.ServiceId ?? emp.serviceId ?? '';
        const fullName = emp.FullNameEN ?? emp.fullNameEN ?? '';
        const parts: string[] = [];
        if (prefixLabel && serviceId) parts.push(`${prefixLabel}-${serviceId}`);
        else if (prefixLabel) parts.push(prefixLabel);
        else if (serviceId) parts.push(serviceId);
        if (rankName) parts.push(rankName);
        if (fullName) parts.push(fullName);
        return parts.join(' ');
    }

    private handleFoundEmployee(employee: EmpModel): void {
        this.employeeFound.emit();
        this.showMemberFoundDialog(employee);
    }

    private openPickerOrHandleSingle(employees: EmpModel[]): void {
        if (employees.length === 1) {
            this.handleFoundEmployee(employees[0]);
        } else {
            this.buildPickerRows(employees);
        }
    }

    private buildPickerRows(employees: EmpModel[]): void {
        const distinctOrgIds = Array.from(new Set(
            employees
                .map((e) => (e as any).orgId ?? (e as any).OrgId)
                .filter((id) => id != null && !Number.isNaN(Number(id)))
                .map((id) => Number(id))
        ));

        const prefix$ = distinctOrgIds.length > 0
            ? forkJoin(
                distinctOrgIds.map((orgId) =>
                    this.commonCodeService
                        .getAllActiveCommonCodesByOrgIdAndType(orgId, 'Prefix')
                        .pipe(map((list) => ({ orgId, list })))
                )
            )
            : of([] as { orgId: number; list: any[] }[]);

        const rankInfo$ = forkJoin(
            employees.map((e) => {
                const empId = (e as any).EmployeeID ?? (e as any).employeeID;
                return empId != null && !Number.isNaN(Number(empId))
                    ? this.empService.getEmployeeSearchInfo(Number(empId)).pipe(
                        map((info) => ({ empId: Number(empId), rankName: (info as any)?.rank ?? (info as any)?.Rank ?? '' }))
                    )
                    : of({ empId: Number(empId) || 0, rankName: '' });
            })
        );

        forkJoin({ prefixes: prefix$, ranks: rankInfo$ }).subscribe({
            next: ({ prefixes, ranks }) => {
                const prefixMap = new Map<string, string>();
                for (const { orgId, list } of prefixes) {
                    for (const p of (list as any[])) {
                        prefixMap.set(`${orgId}:${p?.codeId}`, p?.codeValueEN ?? '');
                    }
                }
                const rankMap = new Map<number, string>();
                for (const { empId, rankName } of ranks) {
                    rankMap.set(empId, rankName);
                }
                this.pickerRows = this.makePickerRows(employees, prefixMap, rankMap);
                this.showPickerDialog = true;
            },
            error: (err: any) => {
                this.pickerRows = this.makePickerRows(employees, new Map(), new Map());
                this.showPickerDialog = true;
            }
        });
    }

    private makePickerRows(
        employees: EmpModel[],
        prefixMap: Map<string, string>,
        rankMap: Map<number, string>
    ): typeof this.pickerRows {
        const rows = employees.map((e) => {
            const emp = e as any;
            const orgId = emp.orgId ?? emp.OrgId;
            const prefixId = Number(emp.Prefix ?? emp.prefix);
            const prefixLabel = orgId != null ? (prefixMap.get(`${orgId}:${prefixId}`) ?? '') : '';
            const serviceId = emp.ServiceId ?? emp.serviceId ?? '';
            const orgName = this.motherOrganizations.find((o) => o.orgId === orgId)?.orgNameEN ?? '';
            const status = emp.PostingStatus ?? emp.postingStatus ?? '';
            const empId = Number(emp.EmployeeID ?? emp.employeeID);
            const rankName = rankMap.get(empId) ?? '';
            const displayName = this.formatMemberDetails(e, rankName, prefixLabel);
            const isExMember = (status ?? '').trim().toLowerCase() === PostingStatus.ExMember.toLowerCase()
                || (status ?? '').trim().toLowerCase() === 'ex-member';
            return {
                employee: e,
                displayName,
                orgName,
                postingStatus: this.statusListLabel[status] ?? status,
                isExMember,
                sortKey: `${orgName.toLowerCase()}|${prefixLabel.toLowerCase()}|${String(serviceId).padStart(10, '0')}`
            };
        });
        rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        return rows;
    }

    pickerYes(): void {
        this.showPickerDialog = false;
        this.pickerRows = [];
        this.employeeNotFound.emit();
    }

    pickerNo(): void {
        this.showPickerDialog = false;
        this.pickerRows = [];
    }

    pickerShowHistory(row: { employee: EmpModel; displayName: string }): void {
        this.showPickerDialog = false;
        this.pickerRows = [];
        this.exMemberEmployee = row.employee;
        this.exMemberDetailsText = row.displayName;
        const empId = (row.employee as any).EmployeeID ?? (row.employee as any).employeeID;
        const id = Number(empId);
        if (!Number.isNaN(id) && id > 0) {
            this.loadExMemberViewData(id);
        }
    }

    private showMemberFoundDialog(employee: EmpModel): void {
        const emp = employee as any;
        const status: string = emp.PostingStatus ?? emp.postingStatus ?? '';
        const listLabel = this.statusListLabel[status] ?? status ?? 'Unknown';
        const header = `Member Found in ${listLabel} List.`;
        const empId = emp.EmployeeID ?? emp.employeeID;
        const orgId = emp.orgId ?? emp.OrgId;
        const prefixId = Number(emp.Prefix ?? emp.prefix);
        const onYes = () => this.employeeNotFound.emit();

        const rankInfo$ = empId != null && !Number.isNaN(Number(empId))
            ? this.empService.getEmployeeSearchInfo(Number(empId))
            : of(null);

        const prefixes$ = orgId != null && !Number.isNaN(Number(orgId))
            ? this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(Number(orgId), 'Prefix')
            : of([] as any[]);

        forkJoin({ info: rankInfo$, prefixes: prefixes$ }).subscribe({
            next: ({ info, prefixes }) => {
                const rankName = (info as any)?.rank ?? (info as any)?.Rank ?? '';
                const prefixLabel = (prefixes as any[])?.find((p: any) => p?.codeId === prefixId)?.codeValueEN ?? '';
                this.openMemberFoundDialog(header, employee, empId, this.formatMemberDetails(employee, rankName, prefixLabel), onYes);
            },
            error: (err: any) => {
                this.openMemberFoundDialog(header, employee, empId, this.formatMemberDetails(employee, '', ''), onYes);
            }
        });
    }

    private openMemberFoundDialog(header: string, employee: EmpModel, empId: any, details: string, onYes: () => void): void {
        const onNo = () => {
            this.exMemberEmployee = employee;
            this.exMemberDetailsText = details;
            const id = Number(empId);
            if (!Number.isNaN(id) && id > 0) {
                this.loadExMemberViewData(id);
            }
        };
        this.showConfirm(header, `${details}\n\n\nDo you want to Add New Member?`, onYes, onNo);
    }

    ngOnInit(): void {
        this.loadMotherOrgs();
    }

    ngAfterViewInit(): void {
        this.focusServiceId();
    }

    /** Focus the Service ID input in the search bar. Deferred via setTimeout so it works right after view updates. */
    focusServiceId(): void {
        setTimeout(() => {
            const host = this.serviceIdInput?.nativeElement;
            const input = host?.querySelector('input') as HTMLInputElement | null;
            input?.focus();
        });
    }

    /** Clear search inputs and ex-member results, then focus the Service ID input — use after save completes to start the next entry. */
    resetForNewSearch(): void {
        this.motherOrgId = null;
        this.serviceId = null;
        this.nid = '';
        this.exMemberEmployee = null;
        this.exMemberViewList = [];
        this.exMemberDetailsText = '';
        this.focusServiceId();
    }

    loadMotherOrgs(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (res: MotherOrganizationModel[]) => {
                this.motherOrganizations = res;
            },
            error: (err: any) => {
                this.showInfo('Error', 'Failed to load Mother Organizations', 'error');
            }
        });
    }

    search(): void {
        const nidStr = (this.nid ?? '').trim();
        const serviceIdStr = this.serviceId != null ? String(this.serviceId).trim() : '';

        if (!nidStr && !serviceIdStr) {
            this.showInfo('Required', 'Please enter NID or Service ID (at least one)', 'warn');
            return;
        }

        this.isSearching = true;
        this.exMemberEmployee = null;
        this.exMemberViewList = [];
        this.exMemberDetailsText = '';

        const motherOrgId = this.motherOrgId != null && this.motherOrgId > 0 ? this.motherOrgId : undefined;
        this.empService.searchListByRabIdOrServiceId(undefined, serviceIdStr, true, motherOrgId, nidStr || undefined).subscribe({
            next: (employees: EmpModel[]) => {
                if (employees && employees.length > 0) {
                    this.isSearching = false;
                    this.openPickerOrHandleSingle(employees);
                    return;
                }
                this.checkExMemberAndLoadView(serviceIdStr, nidStr, motherOrgId);
            },
            error: (err) => {
                this.isSearching = false;
                console.error('Search failed', err);
                this.showInfo('Error', err?.error?.message ?? 'Failed to search employee.', 'error');
            }
        });
    }

    private checkExMemberAndLoadView(serviceIdStr: string, nidStr: string, motherOrgId: number | undefined): void {
        this.empService.searchListByRabIdOrServiceId(undefined, serviceIdStr, false, motherOrgId, nidStr || undefined).subscribe({
            next: (employees: EmpModel[]) => {
                this.isSearching = false;
                if (!employees || employees.length === 0) {
                    this.showInfo(
                        'Member Not Found',
                        'No Member found with the given NID/Service ID.',
                        'info',
                        () => this.employeeNotFound.emit()
                    );
                    return;
                }
                this.openPickerOrHandleSingle(employees);
            },
            error: (err) => {
                this.isSearching = false;
                console.error('Search failed', err);
                this.showInfo('Error', err?.error?.message ?? 'Failed to search employee.', 'error');
            }
        });
    }

    private loadExMemberViewData(employeeId: number): void {
        const id = employeeId ?? (this.exMemberEmployee as any)?.employeeID ?? (this.exMemberEmployee as any)?.EmployeeID;
        if (id == null || id === undefined || Number.isNaN(Number(id))) {
            this.isLoadingExMemberData = false;
            this.showInfo('Error', 'Employee ID is missing.', 'warn');
            return;
        }
        this.isLoadingExMemberData = true;
        this.previousRABService.getViewByEmployeeId(Number(id)).subscribe({
            next: (list) => {
                this.isLoadingExMemberData = false;
                this.exMemberViewList = list;
            },
            error: (err) => {
                this.isLoadingExMemberData = false;
                console.error('Failed to load previous RAB service view', err);
                this.showInfo('Error', 'Failed to load previous service data.', 'error');
            }
        });
    }

    clearExMemberSection(): void {
        this.exMemberEmployee = null;
        this.exMemberViewList = [];
    }

    /** Open old profile in a new browser tab in view mode. */
    viewOldProfile(): void {
        if (!this.exMemberEmployee) return;
        const id = (this.exMemberEmployee as any).employeeID ?? (this.exMemberEmployee as any).EmployeeID;
        if (id != null) {
            window.open(`/emp-basic-info?id=${id}&mode=view`, '_blank');
        }
    }
}
