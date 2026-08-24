import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { EmpService } from '@/services/emp-service';
import { CommonCodeService } from '@/services/common-code-service';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { ServingMembersService } from '@/services/serving-members.service';
import { PreviousRABServiceService, VwPreviousRABServiceInfoModel } from '@/services/previous-rab-service.service';
import { PresentStatusInfoService } from '@/services/present-status-info.service';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';
import { SharedService } from '@/shared/services/shared-service';
import { MotherOrganizationModel } from '@/models/mother-org-model';
import { PostingStatus, PresentStatusType, PresentStatusTypeOptions } from '@/models/enums';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';

export interface EmployeeBasicInfo {
    employeeID: number;
    fullNameEN: string;
    fullNameBN?: string;
    rabid: string;
    serviceId: string;
    motherOrganization?: number;
    rank?: number;
    unit?: number;
    branch?: number;
    trade?: number;
    memberType?: number;
    /** CommonCode id of the employee's Prefix (EmployeeInfo.Prefix). */
    prefix?: number;
    /** Display names from vw_EmployeeSearchInfo (Rank, Corps, Trade, MotherOrganization, MemberType) */
    rankDisplay?: string;
    corpsDisplay?: string;
    tradeDisplay?: string;
    motherOrganizationDisplay?: string;
    memberTypeDisplay?: string;
    /** Mother Unit / RAB Unit display names from vw_EmployeePersonalServiceOverview.
     *  Only populated when the host enables showMotherUnit / showRabUnit. */
    motherUnitDisplay?: string;
    rabUnitDisplay?: string;
    orgId?: number;
    /** CommonCode id of the employee's current appointment (for pre-filling forms). */
    appointmentId?: number;
    /** Display name of the appointment (e.g. "Director General"). */
    appointment?: string;
    /** EmployeeInfo.PostingStatus (e.g. 'Servings', 'ExMember') so hosts can react to ex-members. */
    postingStatus?: string;
}

/** One entry in the search result chip. `danger` renders the value in red (e.g. Ex-Member). */
interface ChipField {
    label: string;
    value: string;
    danger?: boolean;
}

@Component({
    selector: 'app-employee-search',
    standalone: true,
    imports: [CommonModule, FormsModule, InputTextModule, ButtonModule, DialogModule, TableModule],
    template: `
        <div class="surface-50 border-round-2xl py-4 mb-4">
            <div class="flex flex-wrap align-items-end gap-3">
                <div style="min-width: 140px; max-width: 160px;">
                    <label class="font-semibold block mb-2 text-700">RAB ID</label>
                    <input pInputText class="w-full" placeholder="RAB ID" inputmode="numeric" [(ngModel)]="searchRabId" (ngModelChange)="onRabIdInput($event)" (keypress)="onNumericKeypress($event, false)" (paste)="onRabIdPaste()" (keydown.enter)="$event.preventDefault(); search()" />
                </div>
                <div style="min-width: 140px; max-width: 160px;">
                    <label class="font-semibold block mb-2 text-700">Service ID</label>
                    <input pInputText class="w-full" placeholder="Service ID" inputmode="numeric" [(ngModel)]="searchServiceId" (ngModelChange)="onServiceIdInput($event)" (keypress)="onNumericKeypress($event, true)" (paste)="onServiceIdPaste()" (keydown.enter)="$event.preventDefault(); search()" />
                </div>
                <div>
                    <label class="font-semibold block mb-2 text-700">&nbsp;</label>
                    <button type="button" pButton label="Search" icon="pi pi-search" [loading]="isSearching" [disabled]="isSearching" (click)="$event.preventDefault(); $event.stopPropagation(); search()"></button>
                </div>
                <div>
                    <label class="font-semibold block mb-2 text-700">&nbsp;</label>
                    <button type="button" pButton label="Clear" icon="pi pi-times" severity="secondary" (click)="$event.preventDefault(); $event.stopPropagation(); reset()"></button>
                </div>
            </div>

            @if (employeeFound && employeeInfo) {
                <div class="flex align-items-stretch flex-wrap gap-3 mt-3">
                    <div
                        class="flex align-items-stretch flex-wrap flex-1 shadow-1"
                        style="min-width: 0; border: 1px solid var(--primary-color); border-radius: 0.85rem; background: var(--primary-50, rgba(16,185,129,0.06)); overflow: hidden;">
                        @for (f of chipFields; track f.label) {
                            <div
                                class="flex align-items-center gap-2 px-3 py-2"
                                [style.border-left]="$first ? 'none' : '1px solid var(--surface-border, rgba(0,0,0,0.08))'">
                                <span class="text-sm" style="color: var(--text-color-secondary, #6b7280);">{{ f.label }}:</span>
                                <span
                                    class="text-sm font-semibold white-space-nowrap"
                                    [class.text-900]="!f.danger"
                                    [style.color]="f.danger ? 'var(--p-red-500, #ef4444)' : null"
                                    [style.font-weight]="f.danger ? '700' : null">{{ f.value }}</span>
                            </div>
                        }
                    </div>
                    <button
                        type="button"
                        pButton
                        label="View Profile"
                        icon="pi pi-user"
                        class="align-self-stretch"
                        (click)="$event.preventDefault(); $event.stopPropagation(); openEmployeeProfile()"></button>
                </div>
            }
        </div>

        <p-dialog
            [(visible)]="showPickerDialog"
            header="Multiple Members Found — Please Select"
            [modal]="true"
            [closable]="false"
            [style]="{ width: '820px' }"
            [draggable]="false"
            [resizable]="false"
            [contentStyle]="{ 'border-top': '2px solid var(--primary-color)' }">
            <p class="m-0 mt-3 mb-3 text-600">The search matched more than one member. Pick the correct one to continue.</p>
            <p-table [value]="pickerRows" styleClass="p-datatable-sm">
                <ng-template pTemplate="header">
                    <tr>
                        <th style="width: 5%">#</th>
                        <th>Name</th>
                        <th>Mother Organization</th>
                        <th>Status</th>
                        <th style="width: 110px">Action</th>
                    </tr>
                </ng-template>
                <ng-template pTemplate="body" let-row let-i="rowIndex">
                    <tr>
                        <td>{{ i + 1 }}</td>
                        <td class="font-semibold">{{ row.displayName || '-' }}</td>
                        <td>{{ row.orgName || '-' }}</td>
                        <td>{{ row.postingStatus || '-' }}</td>
                        <td>
                            <p-button type="button" label="Select" size="small" (onClick)="selectPickerRow(row)"></p-button>
                        </td>
                    </tr>
                </ng-template>
            </p-table>
            <ng-template pTemplate="footer">
                <p-button type="button" label="Cancel" severity="secondary" [outlined]="true" (onClick)="closePickerDialog()"></p-button>
            </ng-template>
        </p-dialog>

        <!-- Ex-Member notice: hosts that set [exMemberNotice]="true" see this before the member is emitted. -->
        <p-dialog
            header="Ex-Member"
            [(visible)]="showExMemberNotice"
            [modal]="true"
            [draggable]="false"
            [resizable]="false"
            [style]="{ width: '34rem' }"
            (onHide)="onExMemberNoticeHide()">
            <div class="flex gap-3">
                <i class="pi pi-exclamation-triangle text-2xl" style="color: var(--p-orange-500, #f97316);"></i>
                <div class="flex-1">
                    <p class="mt-0 mb-3">
                        @if (exMemberNoticeName) {
                            <b>{{ exMemberNoticeName }}</b> is an <b>Ex-Member</b>.
                        } @else {
                            This member is an <b>Ex-Member</b>.
                        }
                    </p>
                    @for (row of exMemberNoticeRows; track row.label) {
                        <div class="flex gap-2 mb-1">
                            <span class="text-600" style="min-width: 8.5rem;">{{ row.label }}:</span>
                            <span class="font-semibold">{{ row.value }}</span>
                        </div>
                    }
                </div>
            </div>
            <ng-template #footer>
                <p-button type="button" label="View Profile" icon="pi pi-user" severity="secondary" (onClick)="viewExMemberProfileFromNotice()"></p-button>
                <p-button type="button" label="Continue" icon="pi pi-check" (onClick)="acceptExMemberNotice()"></p-button>
            </ng-template>
        </p-dialog>
    `
})
export class EmployeeSearchComponent implements OnChanges {
    /** When set (e.g. in edit mode), load and display this employee so RAB info shows on Update. */
    @Input() initialEmployeeId: number | null = null;

    /** Result-chip field visibility. Default across the app: hide Corps/Trade, show
     *  Mother Unit + RAB Unit. Any host can override per-usage (e.g. [showCorps]="true").
     *  Hiding a field only removes it from the chip — the underlying data is still fetched
     *  and emitted via onEmployeeFound so other consumers keep working. */
    @Input() showCorps = false;
    @Input() showTrade = false;
    @Input() showMotherUnit = true;
    @Input() showRabUnit = true;

    /** When true, an ex-member is announced in a dialog and only emitted once the user continues.
     *  Off by default so bulk/list hosts that legitimately handle ex-members are unaffected. */
    @Input() exMemberNotice = false;

    @Output() onEmployeeFound = new EventEmitter<EmployeeBasicInfo>();
    @Output() onSearchReset = new EventEmitter<void>();

    searchRabId: string = '';
    searchServiceId: string = '';
    isSearching: boolean = false;
    employeeFound: boolean = false;
    employeeInfo: EmployeeBasicInfo | null = null;

    showExMemberNotice: boolean = false;
    exMemberNoticeName: string = '';
    exMemberNoticeRows: { label: string; value: string }[] = [];
    /** Extra result-chip entries shown for an ex-member. Empty for everyone else. */
    private exMemberChipFields: ChipField[] = [];
    private pendingExMember: EmployeeBasicInfo | null = null;

    showPickerDialog: boolean = false;
    pickerRows: Array<{
        employee: any;
        displayName: string;
        orgName: string;
        postingStatus: string;
        sortKey: string;
    }> = [];

    private motherOrganizations: MotherOrganizationModel[] = [];

    private readonly statusListLabel: Record<string, string> = {
        [PostingStatus.Supernumerary]: 'Supernumerary',
        [PostingStatus.Servings]: 'Serving',
        [PostingStatus.ExMember]: 'Ex-Member',
        [PostingStatus.PendingForJoining]: 'Pending for Joining',
        [PostingStatus.Pending]: 'Pending'
    };

    constructor(
        private empService: EmpService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private router: Router,
        private memberTypeAccess: IdentityUserMemberTypeAccessService,
        private sharedService: SharedService,
        private servingMembersService: ServingMembersService,
        private previousRabService: PreviousRABServiceService,
        private presentStatusService: PresentStatusInfoService,
        private organizationService: OrganizationService
    ) {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (res) => (this.motherOrganizations = res ?? []),
            error: (err: any) => {}
        });
    }

    /** Central permission check. Returns true when the user is allowed to view this memberType. */
    private isMemberTypeAllowed(memberTypeId: number | null | undefined): boolean {
        if (memberTypeId == null) return true;
        const userId = this.sharedService.getCurrentUserId?.() ?? null;
        if (!userId) return true;
        const allowed = this.memberTypeAccess.getCachedMemberTypeIds(userId);
        if (allowed === null) return true;
        return allowed.includes(memberTypeId as number);
    }

    /**
     * Enriches the loaded basic info with display names + reliable memberTypeId from
     * vw_EmployeeSearchInfo, then either emits onEmployeeFound (allowed) or shows a
     * permission-denied toast and emits onSearchReset (denied).
     *
     * The banner is kept hidden (`employeeFound = false`) until the permission check
     * passes, so denied users never see a flash of the employee's name/rank.
     */
    private finalizeAndEmit(employeeID: number): void {
        this.empService.getEmployeeSearchInfo(employeeID).subscribe({
            next: (searchInfo) => {
                if (searchInfo && this.employeeInfo && this.employeeInfo.employeeID === employeeID) {
                    const reliableMemberTypeId =
                        (searchInfo as { memberTypeId?: number; MemberTypeId?: number }).memberTypeId ??
                        (searchInfo as { memberTypeId?: number; MemberTypeId?: number }).MemberTypeId ??
                        this.employeeInfo.memberType;
                    this.employeeInfo = {
                        ...this.employeeInfo,
                        rankDisplay: searchInfo.rank ?? searchInfo.Rank,
                        corpsDisplay: searchInfo.corps ?? searchInfo.Corps,
                        tradeDisplay: searchInfo.trade ?? searchInfo.Trade,
                        motherOrganizationDisplay: searchInfo.motherOrganization ?? searchInfo.MotherOrganization,
                        memberTypeDisplay: searchInfo.memberType ?? searchInfo.MemberType,
                        memberType: reliableMemberTypeId as number | undefined,
                        appointmentId: (searchInfo as { appointmentId?: number; AppointmentId?: number }).appointmentId
                            ?? (searchInfo as { appointmentId?: number; AppointmentId?: number }).AppointmentId,
                        appointment: (searchInfo as { appointment?: string; Appointment?: string }).appointment
                            ?? (searchInfo as { appointment?: string; Appointment?: string }).Appointment
                    };
                }

                const memberTypeId = this.employeeInfo?.memberType ?? null;
                if (!this.isMemberTypeAllowed(memberTypeId)) {
                    const typeName = this.employeeInfo?.memberTypeDisplay ?? null;
                    this.employeeFound = false;
                    this.employeeInfo = null;
                    this.searchRabId = '';
                    this.searchServiceId = '';
                    this.isSearching = false;
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'No Permission',
                        detail: typeName
                            ? `You do not have permission to view ${typeName}.`
                            : 'You do not have permission to view this member type.',
                        life: 6000
                    });
                    this.onSearchReset.emit();
                    return;
                }

                this.enrichMotherRabUnitThenEmit(employeeID);
            },
            error: (err: any) => {
                // Fail-open if enrichment/view fails: emit with what we have rather than block.
                this.markFoundAndEmit();
            }
        });
    }

    /**
     * When the host enables Mother Unit / RAB Unit in the result chip, fetch those display
     * names from vw_EmployeePersonalServiceOverview (the same source the members/profile page
     * uses) before emitting. Otherwise emit immediately. Enrichment failures fail-open.
     */
    private enrichMotherRabUnitThenEmit(employeeID: number): void {
        if (!this.showMotherUnit && !this.showRabUnit) {
            this.markFoundAndEmit();
            return;
        }
        this.servingMembersService.getEmployeePersonalServiceOverview(employeeID).subscribe({
            next: (overview) => {
                const matches = !!overview && !!this.employeeInfo && this.employeeInfo.employeeID === employeeID;
                if (matches) {
                    this.employeeInfo = {
                        ...this.employeeInfo!,
                        motherUnitDisplay: overview.motherUnit ?? overview.motherUnitBN ?? undefined,
                        rabUnitDisplay: overview.rabUnit ?? overview.rabUnitBN ?? undefined
                    };
                }

                // RAB Unit on the overview view is often empty (e.g. ex-members carry their
                // last RAB unit in previous-service history). Mirror the members/profile page:
                // fall back to the most recent previous RAB service entry.
                if (this.showRabUnit && matches && !this.employeeInfo?.rabUnitDisplay) {
                    this.previousRabService.getViewByEmployeeId(employeeID).subscribe({
                        next: (list) => {
                            if (this.employeeInfo && this.employeeInfo.employeeID === employeeID) {
                                const fallback = this.latestRabUnitName(list);
                                if (fallback) this.employeeInfo = { ...this.employeeInfo, rabUnitDisplay: fallback };
                            }
                            this.markFoundAndEmit();
                        },
                        error: () => this.markFoundAndEmit()
                    });
                    return;
                }

                this.markFoundAndEmit();
            },
            error: () => this.markFoundAndEmit()
        });
    }

    /** Most recent previous RAB service unit name (sorted by serviceFrom DESC), like the profile page. */
    private latestRabUnitName(list: VwPreviousRABServiceInfoModel[] | null): string | undefined {
        if (!list?.length) return undefined;
        const sorted = [...list].sort((a, b) => (b.serviceFrom ?? '').localeCompare(a.serviceFrom ?? ''));
        return sorted[0]?.rabUnitName ?? sorted[0]?.rabUnitNameBN ?? undefined;
    }

    private markFoundAndEmit(): void {
        this.employeeFound = true;
        this.isSearching = false;
        this.exMemberChipFields = [];
        if (!this.employeeInfo) return;
        if (this.isExMember(this.employeeInfo)) {
            this.loadExMemberContext(this.employeeInfo);
            return;
        }
        this.onEmployeeFound.emit(this.employeeInfo);
    }

    // ===================== Ex-Member notice =====================

    private isExMember(employee: EmployeeBasicInfo): boolean {
        const status = (employee.postingStatus ?? '').trim().toLowerCase();
        return status === PostingStatus.ExMember.toLowerCase() || status === 'ex-member';
    }

    /**
     * Loads the ex-member context — last RAB unit, the unit they were posted/returned to and the
     * date they came off RAB strength. It always feeds the result chip; hosts that opted into the
     * notice get the dialog too, and the member is emitted only once they continue.
     */
    private loadExMemberContext(employee: EmployeeBasicInfo): void {
        const employeeId = employee.employeeID;

        // Each lookup fails soft: a missing section only blanks its own line.
        forkJoin({
            previousRabService: this.previousRabService.getViewByEmployeeId(employeeId).pipe(catchError(() => of([] as VwPreviousRABServiceInfoModel[]))),
            presentStatuses: this.presentStatusService.getAllByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            orgUnits: this.organizationService.getOrgUnitsByEmployeeId(employeeId).pipe(catchError(() => of([] as any[])))
        }).subscribe(({ previousRabService, presentStatuses, orgUnits }) => {
            if (this.employeeInfo?.employeeID !== employeeId) return; // a newer search won the race
            const shift = this.profileShiftRecord(presentStatuses);
            this.exMemberChipFields = this.buildExMemberChipFields(shift, orgUnits);

            if (!this.exMemberNotice) {
                this.onEmployeeFound.emit(employee);
                return;
            }
            this.pendingExMember = employee;
            this.exMemberNoticeName = employee.fullNameEN || '';
            this.exMemberNoticeRows = this.buildExMemberRows(previousRabService, shift, orgUnits);
            this.showExMemberNotice = true;
        });
    }

    /**
     * Ex-Member result-chip entries: the Ex-Member marker plus where they went and when they came
     * off RAB strength, e.g. "Posted Unit: RAB-2 (12/03/2025)".
     */
    private buildExMemberChipFields(shift: any | null, orgUnits: any[]): ChipField[] {
        const fields: ChipField[] = [{ label: 'Status', value: 'Ex-Member', danger: true }];
        const statusType = shift?.presentStatusType ?? null;
        if (!statusType) return fields;

        const withDate = (text: string, date: string | null | undefined) => {
            const formatted = this.shortDate(date);
            return formatted === 'N/A' ? text : `${text} (${formatted})`;
        };

        if (statusType === PresentStatusType.RegularPostingOut || statusType === PresentStatusType.RTUOnDisciplineIssue) {
            const unit = this.orgUnitName(shift.motherOrgTransferredUnitID ?? shift.transferredUnitID, orgUnits);
            fields.push({ label: 'Posted Unit', value: withDate(unit, shift.reduceFromRABStrength ?? shift.dateOfRelease ?? shift.dated) });
        } else {
            const label = PresentStatusTypeOptions.find((o) => o.value === statusType)?.label ?? statusType;
            fields.push({ label: 'Reduced On', value: withDate(label, shift.dated) });
        }
        return fields;
    }

    /**
     * Ex-Member notice rows. "Posted Unit" and "Reduce Date" come from the Present Status record
     * that performed the profile shift when that was a Regular Posting Out / RTU; for any other
     * shifting status (Deceased, Absent, Arrested) the status itself and its date are shown
     * instead, because those carry no transferred unit.
     */
    private buildExMemberRows(
        previousRabService: VwPreviousRABServiceInfoModel[],
        shift: any | null,
        orgUnits: any[]
    ): { label: string; value: string }[] {
        const rows: { label: string; value: string }[] = [{ label: 'Last RAB Unit', value: this.lastRabUnitName(previousRabService) }];
        const statusType = shift?.presentStatusType ?? null;

        if (statusType === PresentStatusType.RegularPostingOut || statusType === PresentStatusType.RTUOnDisciplineIssue) {
            rows.push({ label: 'Posted Unit', value: this.orgUnitName(shift.motherOrgTransferredUnitID ?? shift.transferredUnitID, orgUnits) });
            rows.push({ label: 'Reduce Date', value: this.shortDate(shift.reduceFromRABStrength ?? shift.dateOfRelease ?? shift.dated) });
        } else if (statusType) {
            rows.push({ label: 'Status', value: PresentStatusTypeOptions.find((o) => o.value === statusType)?.label ?? statusType });
            rows.push({ label: 'Date', value: this.shortDate(shift.dated) });
        }

        return rows;
    }

    /** The Present Status record that moved this employee to the Ex Member list. */
    private profileShiftRecord(presentStatuses: any[]): any | null {
        const shifted = (presentStatuses ?? [])
            .map((d) => ({
                presentStatusType: d.PresentStatusType ?? d.presentStatusType,
                dated: d.Dated ?? d.dated,
                profileShift: d.ProfileShift ?? d.profileShift ?? false,
                transferredUnitID: d.TransferredUnitID ?? d.transferredUnitID,
                motherOrgTransferredUnitID: d.MotherOrgTransferredUnitID ?? d.motherOrgTransferredUnitID,
                dateOfRelease: d.DateOfRelease ?? d.dateOfRelease,
                reduceFromRABStrength: d.ReduceFromRABStrength ?? d.reduceFromRABStrength
            }))
            .filter((r) => !!r.profileShift);
        if (!shifted.length) return null;
        // Newest first, so a re-entered member shows the shift that made them an ex-member now.
        shifted.sort((a, b) => String(b.dated ?? '').localeCompare(String(a.dated ?? '')));
        return shifted[0];
    }

    /** Most recent Previous RAB Service unit, matching the ex-member profile page. */
    private lastRabUnitName(list: VwPreviousRABServiceInfoModel[]): string {
        return this.latestRabUnitName(list) ?? 'N/A';
    }

    private orgUnitName(orgId: number | null | undefined, orgUnits: any[]): string {
        if (orgId == null) return 'N/A';
        const match = (orgUnits ?? []).find((o) => (o.orgId ?? o.OrgId) === orgId);
        return match?.orgNameEN ?? match?.OrgNameEN ?? String(orgId);
    }

    private shortDate(value: string | null | undefined): string {
        if (!value) return 'N/A';
        const d = new Date(value);
        return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB');
    }

    /** Continue — hand the ex-member to the host as a normal search result. */
    acceptExMemberNotice(): void {
        const employee = this.pendingExMember;
        this.closeExMemberNotice();
        if (employee) this.onEmployeeFound.emit(employee);
    }

    /** Open the member's full (ex-member) profile page instead. */
    viewExMemberProfileFromNotice(): void {
        this.closeExMemberNotice();
        this.openEmployeeProfile();
    }

    /**
     * Dismissed via the header X (or Esc / mask) without choosing an action — clear the search so
     * the ex-member is not left selected. Continue / View Profile already cleared the pending
     * member before hiding, so this no-ops for them.
     */
    onExMemberNoticeHide(): void {
        if (!this.pendingExMember) return;
        this.closeExMemberNotice();
        this.reset();
    }

    private closeExMemberNotice(): void {
        this.showExMemberNotice = false;
        this.pendingExMember = null;
    }

    ngOnChanges(changes: SimpleChanges): void {
        const idChange = changes['initialEmployeeId'];
        if (idChange && idChange.currentValue != null && idChange.currentValue > 0) {
            const id = Number(idChange.currentValue);
            if (id !== this.employeeInfo?.employeeID) this.loadEmployeeById(id);
        } else if (idChange && (idChange.currentValue == null || idChange.currentValue === 0)) {
            this.employeeFound = false;
            this.employeeInfo = null;
            this.searchRabId = '';
            this.searchServiceId = '';
        }
    }

    /** Load employee by ID and show in card (used when opening draft for update). */
    loadEmployeeById(employeeId: number): void {
        this.isSearching = true;
        this.empService.getEmployeeById(employeeId).subscribe({
            next: (employee: any) => {
                if (employee) {
                    const employeeID = employee.EmployeeID ?? employee.employeeID;
                    this.employeeInfo = {
                        employeeID,
                        fullNameEN: employee.FullNameEN || employee.fullNameEN || '',
                        fullNameBN: employee.FullNameBN || employee.fullNameBN,
                        rabid: employee.RABID || employee.Rabid || employee.rabid || '',
                        serviceId: employee.ServiceId || employee.serviceId || '',
                        motherOrganization: employee.LastMotherUnit ?? employee.MotherOrganization ?? employee.motherOrganization,
                        rank: employee.Rank ?? employee.rank,
                        unit: employee.Unit ?? employee.unit,
                        branch: employee.Branch ?? employee.branch,
                        trade: employee.Trade ?? employee.trade,
                        memberType: employee.MemberType ?? employee.memberType,
                        orgId: employee.orgId,
                        postingStatus: employee.PostingStatus ?? employee.postingStatus
                    };
                    this.searchRabId = this.employeeInfo.rabid || '';
                    this.searchServiceId = this.employeeInfo.serviceId || '';
                    this.finalizeAndEmit(employeeID);
                } else {
                    this.employeeFound = false;
                    this.employeeInfo = null;
                    this.isSearching = false;
                }
            },
            error: (err: any) => {
                this.isSearching = false;
                this.employeeFound = false;
                this.employeeInfo = null;
            }
        });
    }

    onRabIdInput(value: string): void {
        // Bangla digits → Western, then strip everything except digits
        const normalized = BanglaNumerals.toWestern(value).replace(/\D/g, '');
        if (normalized !== value) {
            this.searchRabId = normalized;
        }
        // Only clear the other field if this one is cleared
        if (!normalized) {
            this.searchServiceId = '';
            this.employeeFound = false;
            this.employeeInfo = null;
        }
    }

    onServiceIdInput(value: string): void {
        // Bangla digits → Western, then keep only digits and commas (commas support bulk lookup)
        const normalized = BanglaNumerals.toWestern(value).replace(/[^\d,]/g, '');
        if (normalized !== value) {
            this.searchServiceId = normalized;
        }
        // Only clear the other field if this one is cleared
        if (!normalized) {
            this.searchRabId = '';
            this.employeeFound = false;
            this.employeeInfo = null;
        }
    }

    onRabIdPaste(): void {
        this.searchServiceId = '';
        this.employeeFound = false;
        this.employeeInfo = null;
    }

    onServiceIdPaste(): void {
        this.searchRabId = '';
        this.employeeFound = false;
        this.employeeInfo = null;
    }

    /** Blocks any printable key that isn't a Western/Bangla digit (or comma, for Service ID bulk lookup). */
    onNumericKeypress(event: KeyboardEvent, allowComma: boolean): void {
        const ch = event.key;
        if (!ch || ch.length !== 1) return; // let control keys through (Backspace, Tab, arrows, …)
        const isDigit = /[\d০-৯]/.test(ch);
        const isComma = allowComma && ch === ',';
        if (!isDigit && !isComma) {
            event.preventDefault();
        }
    }

    search(): void {
        if (!this.searchRabId && !this.searchServiceId) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Warning',
                detail: 'Please enter RAB ID or Service ID'
            });
            return;
        }

        // Check for comma-separated Service IDs (bulk add)
        if (this.searchServiceId && this.searchServiceId.includes(',')) {
            this.searchBulkServiceIds();
            return;
        }

        // Clear any previous selection/picker state so the fresh search always starts clean.
        this.employeeFound = false;
        this.employeeInfo = null;
        this.showPickerDialog = false;
        this.pickerRows = [];
        this.onSearchReset.emit();

        this.isSearching = true;
        this.empService.searchListByRabIdOrServiceId(this.searchRabId || undefined, this.searchServiceId || undefined).subscribe({
            next: (employees: any[]) => {
                if (!employees || employees.length === 0) {
                    this.isSearching = false;
                    this.employeeFound = false;
                    this.employeeInfo = null;
                    this.onSearchReset.emit();
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Not Found',
                        detail: 'No employee found with the given ID'
                    });
                    return;
                }

                if (employees.length === 1) {
                    this.loadSelectedEmployee(employees[0]);
                    return;
                }

                this.buildPickerRows(employees);
            },
            error: (err) => {
                console.error('Search failed', err);
                this.isSearching = false;
                this.employeeFound = false;
                this.onSearchReset.emit();
                // 403 means the employee DOES exist but is outside the caller's
                // org-scope (or no longer presently serving) — show a clearer
                // message instead of the generic "Failed to search" so the user
                // understands the difference between "no such employee" and
                // "you don't have access to this one".
                if (err?.status === 403) {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Permission Denied',
                        detail: err?.error?.message
                            || 'You do not have permission to view this employee. They are outside your accessible scope or no longer presently serving.',
                        life: 6000
                    });
                    return;
                }
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to search employee'
                });
            }
        });
    }

    /** Handle comma-separated Service IDs — searches each and emits onEmployeeFound for every match */
    private searchBulkServiceIds(): void {
        const ids = this.searchServiceId.split(',').map(s => s.trim()).filter(Boolean);
        if (ids.length === 0) return;

        this.employeeFound = false;
        this.employeeInfo = null;
        this.isSearching = true;

        let completed = 0;
        let found = 0;
        const notFound: string[] = [];

        for (const sid of ids) {
            this.empService.searchByRabIdOrServiceId(undefined, sid).subscribe({
                next: (emp) => {
                    if (emp && (emp.EmployeeID ?? (emp as any).employeeID)) {
                        const employeeID = emp.EmployeeID ?? (emp as any).employeeID;
                        const info: EmployeeBasicInfo = {
                            employeeID,
                            fullNameEN: emp.FullNameEN || (emp as any).fullNameEN || '',
                            rabid: emp.RABID || (emp as any).rabid || '',
                            serviceId: emp.ServiceId || (emp as any).serviceId || '',
                            motherOrganization: (emp as any).LastMotherUnit ?? (emp as any).motherOrganization,
                            rank: (emp as any).Rank ?? (emp as any).rank,
                            trade: (emp as any).Trade ?? (emp as any).trade,
                            branch: (emp as any).Branch ?? (emp as any).branch,
                            memberType: (emp as any).MemberType ?? (emp as any).memberType,
                            postingStatus: (emp as any).PostingStatus ?? (emp as any).postingStatus
                        };
                        this.onEmployeeFound.emit(info);
                        found++;
                    } else {
                        notFound.push(sid);
                    }
                    completed++;
                    this.checkBulkComplete(completed, ids.length, found, notFound);
                },
                error: () => {
                    notFound.push(sid);
                    completed++;
                    this.checkBulkComplete(completed, ids.length, found, notFound);
                }
            });
        }
    }

    private checkBulkComplete(completed: number, total: number, found: number, notFound: string[]): void {
        if (completed < total) return;
        this.isSearching = false;
        if (found > 0) {
            this.messageService.add({ severity: 'success', summary: 'Bulk Add', detail: `${found} member(s) added.` });
        }
        if (notFound.length > 0) {
            this.messageService.add({ severity: 'warn', summary: 'Not Found', detail: `Not found: ${notFound.join(', ')}` });
        }
        this.searchServiceId = '';
        this.searchRabId = '';
    }

    private loadSelectedEmployee(employee: any): void {
        const employeeID = employee.EmployeeID ?? employee.employeeID;
        this.employeeInfo = {
            employeeID,
            fullNameEN: employee.FullNameEN || employee.fullNameEN || '',
            fullNameBN: employee.FullNameBN || employee.fullNameBN,
            rabid: employee.RABID || employee.Rabid || employee.rabid || '',
            serviceId: employee.ServiceId || employee.serviceId || '',
            motherOrganization: employee.LastMotherUnit ?? employee.MotherOrganization ?? employee.motherOrganization,
            rank: employee.Rank ?? employee.rank,
            unit: employee.Unit ?? employee.unit,
            branch: employee.Branch ?? employee.branch,
            trade: employee.Trade ?? employee.trade,
            memberType: employee.MemberType ?? employee.memberType,
            orgId: employee.orgId,
            postingStatus: employee.PostingStatus ?? employee.postingStatus
        };
        if (this.searchRabId && !this.searchServiceId) {
            this.searchServiceId = this.employeeInfo.serviceId || '';
        } else if (this.searchServiceId && !this.searchRabId) {
            this.searchRabId = this.employeeInfo.rabid || '';
        }
        this.finalizeAndEmit(employeeID);
    }

    private buildPickerRows(employees: any[]): void {
        const distinctOrgIds = Array.from(new Set(
            employees
                .map((e) => e.orgId ?? e.OrgId)
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
                const empId = e.EmployeeID ?? e.employeeID;
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
                this.isSearching = false;
            },
            error: (err: any) => {
                this.pickerRows = this.makePickerRows(employees, new Map(), new Map());
                this.showPickerDialog = true;
                this.isSearching = false;
            }
        });
    }

    private makePickerRows(
        employees: any[],
        prefixMap: Map<string, string>,
        rankMap: Map<number, string>
    ): typeof this.pickerRows {
        const rows = employees.map((e) => {
            const orgId = e.orgId ?? e.OrgId;
            const prefixId = Number(e.Prefix ?? e.prefix);
            const prefixLabel = orgId != null ? (prefixMap.get(`${orgId}:${prefixId}`) ?? '') : '';
            const serviceId = e.ServiceId ?? e.serviceId ?? '';
            const fullName = e.FullNameEN ?? e.fullNameEN ?? '';
            const empId = Number(e.EmployeeID ?? e.employeeID);
            const rankName = rankMap.get(empId) ?? '';
            const orgName = this.motherOrganizations.find((o) => o.orgId === orgId)?.orgNameEN ?? '';
            const status = e.PostingStatus ?? e.postingStatus ?? '';

            const parts: string[] = [];
            if (prefixLabel && serviceId) parts.push(`${prefixLabel}-${serviceId}`);
            else if (prefixLabel) parts.push(prefixLabel);
            else if (serviceId) parts.push(String(serviceId));
            if (rankName) parts.push(rankName);
            if (fullName) parts.push(fullName);
            const displayName = parts.join(' ');

            return {
                employee: e,
                displayName,
                orgName,
                postingStatus: this.statusListLabel[status] ?? status,
                sortKey: `${orgName.toLowerCase()}|${prefixLabel.toLowerCase()}|${String(serviceId).padStart(10, '0')}`
            };
        });
        rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        return rows;
    }

    selectPickerRow(row: { employee: any }): void {
        this.showPickerDialog = false;
        this.pickerRows = [];
        this.loadSelectedEmployee(row.employee);
    }

    closePickerDialog(): void {
        this.showPickerDialog = false;
        this.pickerRows = [];
        this.employeeFound = false;
        this.employeeInfo = null;
        this.onSearchReset.emit();
    }

    reset(): void {
        this.searchRabId = '';
        this.searchServiceId = '';
        this.employeeFound = false;
        this.employeeInfo = null;
        this.onSearchReset.emit();
    }

    /**
     * Label/value pairs rendered in the result chip, in display order. Corps/Trade and
     * Mother Unit / RAB Unit are included per the show* toggles so the same strip layout
     * works for every host without template duplication.
     */
    get chipFields(): ChipField[] {
        const e = this.employeeInfo;
        if (!e) return [];
        const motherOrg = e.motherOrganizationDisplay ?? (e.motherOrganization != null ? String(e.motherOrganization) : null);
        const fields: ChipField[] = [
            { label: 'Name', value: e.fullNameEN || 'N/A' },
            { label: 'Rank', value: e.rankDisplay || 'N/A' }
        ];
        if (this.showCorps) fields.push({ label: 'Corps', value: e.corpsDisplay || 'N/A' });
        if (this.showTrade) fields.push({ label: 'Trade', value: e.tradeDisplay || 'N/A' });
        fields.push({ label: 'Mother Org', value: motherOrg || 'N/A' });
        if (this.showMotherUnit) fields.push({ label: 'Mother Unit', value: e.motherUnitDisplay || 'N/A' });
        if (this.showRabUnit) fields.push({ label: 'RAB Unit', value: e.rabUnitDisplay || 'N/A' });
        fields.push(...this.exMemberChipFields);
        return fields;
    }

    // Public method to get the current employee info
    getEmployeeInfo(): EmployeeBasicInfo | null {
        return this.employeeInfo;
    }

    // Public method to check if employee is found
    isEmployeeFound(): boolean {
        return this.employeeFound;
    }

    openEmployeeProfile(): void {
        if (this.employeeInfo && this.employeeInfo.employeeID) {
            this.router.navigate(['/members/profile', this.employeeInfo.employeeID]);
        }
    }
}
