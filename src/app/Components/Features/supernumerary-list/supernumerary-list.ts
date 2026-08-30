import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { UserMenuService } from '@/services/user-menu.service';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { CheckboxModule } from 'primeng/checkbox';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { EmployeeListService, GetSupernumeraryListRequest } from '@/services/employee-list.service';
import { CommonCodeService } from '@/services/common-code-service';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { SharedService } from '@/shared/services/shared-service';
import { EmployeeList } from '@/models/employee-list.model';
import { TooltipModule } from 'primeng/tooltip';
import { MotherOrganizationModel } from '@/models/mother-org-model';
import { CommonCodeModel } from '@/models/common-code-model';
import { IsSendingNotesheetStatus } from '@/models/enums';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { DialogModule } from 'primeng/dialog';
import { Article47TakeoverBulkComponent } from '@/Components/Features/article-47-takeover-bulk/article-47-takeover-bulk';
import { SupernumeraryRollService, SupernumeraryRollDates } from '@/services/supernumerary-roll.service';
import { firstValueFrom } from 'rxjs';

/** Minimal employee shape handed to the Article 47 (Takeover) modal. */
interface Article47TakeoverEmployee {
    employeeID: number;
    rabid: string;
    serviceId: string;
    fullNameEN: string;
    rankDisplay?: string | null;
    corpsDisplay?: string | null;
    tradeDisplay?: string | null;
    motherUnitDisplay?: string | null;
}

@Component({
    selector: 'app-supernumerary-list',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, TableModule, ButtonModule, SelectModule, MultiSelectModule, InputTextModule, DatePickerModule, CheckboxModule, Toast, TooltipModule, FlexibleDateDirective, DialogModule, Article47TakeoverBulkComponent],
    providers: [MessageService],
    templateUrl: './supernumerary-list.html',
    styleUrls: ['../employee-reports/report-theme-common.scss', './supernumerary-list.scss'],
})
export class SupernumeraryList implements OnInit {
    list: EmployeeList[] = [];
    loading = false;
    first = 0;
    rows = 20;
    /** Client-side search: filters by Service ID or RAB ID (partial, case-insensitive). */
    searchText = '';

    /** Collapsible filter panel open by default. */
    filterOpen = true;

    orgOptions: MotherOrganizationModel[] = [];
    selectedOrgId: number | null = null;
    memberTypeOptions: { label: string; value: number }[] = [];
    selectedMemberTypeIds: number[] = [];

    /** CodeIds of Member Types the current user is allowed to use. `null` means "not yet loaded" (fail-open). */
    private allowedMemberTypeIds: number[] | null = null;
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    constructor(
        private employeeListService: EmployeeListService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private sharedService: SharedService,
        private memberTypeAccess: IdentityUserMemberTypeAccessService,
        private supernumeraryRoll: SupernumeraryRollService,
        private _router: Router,
        private _route: ActivatedRoute,
        private _userMenuService: UserMenuService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;
        this.loadCurrentUserMemberTypePermissions();
        this.loadOrgOptions();
        this.loadMemberTypeOptions();
    }

    private loadCurrentUserMemberTypePermissions(): void {
        const userId = this.sharedService.getCurrentUserId?.() ?? null;
        if (!userId) {
            this.allowedMemberTypeIds = null;
            return;
        }
        const cached = this.memberTypeAccess.getCachedMemberTypeIds(userId);
        if (cached !== null) {
            this.allowedMemberTypeIds = cached;
            return;
        }
        this.memberTypeAccess.cacheForUser(userId).subscribe({
            next: (ids) => {
                this.allowedMemberTypeIds = Array.isArray(ids) ? ids : [];
            },
            error: () => {
                this.allowedMemberTypeIds = null;
            }
        });
    }

    loadOrgOptions(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs) => {
                this.orgOptions = orgs;
                this.loadData();
            },
            error: (err) => {
                console.error('Failed to load organizations', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load organizations'
                });
            }
        });
    }

    /** Member Type from Employee Type Setup – load once on init (not dependent on org). */
    loadMemberTypeOptions(): void {
        const memberTypeIdFromRoute = +(this._route.snapshot.queryParamMap.get('memberTypeId') ?? 0);

        this.commonCodeService.getAllActiveCommonCodesType('EmployeeType').subscribe({
            next: (codes: CommonCodeModel[]) => {
                this.memberTypeOptions = codes.map((c) => ({
                    label: c.codeValueEN || String(c.codeId),
                    value: c.codeId
                }));
                if (memberTypeIdFromRoute > 0) {
                    this.selectedMemberTypeIds = [memberTypeIdFromRoute];
                    this.rebuildRankOptions();
                    if (this.orgOptions.length > 0) {
                        this.loadData();
                    }
                }
            },
            error: (err) => {
                console.error('Failed to load member types', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load member types'
                });
            }
        });
    }

    /**
     * Raw rank list for the currently-selected Mother Org (with `parentCodeId`
     * referencing the Member Type each rank belongs to). We cache the unfiltered
     * list so changing Member Type can re-derive the dropdown without re-hitting
     * the server.
     */
    private allOrgRanks: CommonCodeModel[] = [];

    /** Rank and Trade depend on Mother Org: when org selected, load options for that org. */
    onOrgChange(): void {
        this.rankOptions = [];
        this.allOrgRanks = [];
        this.selectedRankId = null;
        this.tradeOptions = [];
        this.selectedTradeId = null;
        const orgId = this.selectedOrgId;
        if (orgId != null) {
            this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
                next: (codes: CommonCodeModel[]) => {
                    // Cache the unfiltered rank list, then derive the visible
                    // options by also filtering on the current Member Type.
                    // MotherOrgRank rows already carry parentCodeId = MemberTypeId
                    // (see basic-setup/mother-org-rank), so the relationship is
                    // already present in the data — we just consume it here.
                    this.allOrgRanks = Array.isArray(codes) ? codes : [];
                    this.rebuildRankOptions();
                },
                error: (err) => {
                    console.error('Failed to load ranks', err);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.message || 'Failed to load ranks'
                    });
                }
            });
            this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Trade').subscribe({
                next: (codes: CommonCodeModel[]) => {
                    this.tradeOptions = codes.map((c) => ({
                        label: c.codeValueEN || String(c.codeId),
                        value: c.codeId
                    }));
                },
                error: (err) => {
                    console.error('Failed to load trades', err);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.message || 'Failed to load trades'
                    });
                }
            });
        }
        this.first = 0;
        this.loadData();
    }

    /** Member Type change: validate access, refilter ranks, then reload list. */
    onMemberTypeChange(): void {
        const unauthorizedId = this.allowedMemberTypeIds === null
            ? null
            : this.selectedMemberTypeIds.find((id) => !this.allowedMemberTypeIds!.includes(id));
        if (unauthorizedId != null) {
            const typeName = this.memberTypeOptions?.find((m) => m.value === unauthorizedId)?.label ?? 'this member type';
            this.messageService.add({
                severity: 'warn',
                summary: 'No Permission',
                detail: `You do not have permission to use ${typeName}.`,
                life: 6000
            });
            this.selectedMemberTypeIds = this.selectedMemberTypeIds.filter((id) => id !== unauthorizedId);
            return;
        }
        // Re-narrow the rank dropdown by the new Member Type (uses the cached
        // raw list from the last org load — no extra HTTP call).
        this.rebuildRankOptions();
        this.first = 0;
        this.loadData();
    }

    /**
     * Derive the visible rank dropdown options from {@link allOrgRanks} by
     * filtering on the current Member Type when one is selected. Drops the
     * currently-selected rank if it isn't in the new option set.
     */
    private rebuildRankOptions(): void {
        const memberTypeIds = this.selectedMemberTypeIds;
        const filtered = memberTypeIds.length === 0
            ? this.allOrgRanks
            : this.allOrgRanks.filter((c) => c.parentCodeId != null && memberTypeIds.includes(c.parentCodeId));

        this.rankOptions = filtered.map((c) => ({
            label: c.codeValueEN || String(c.codeId),
            value: c.codeId
        }));

        // If the currently-selected rank no longer appears (because the user
        // narrowed by Member Type and the previous rank doesn't belong to it),
        // clear it so the dropdown doesn't show a stale label.
        if (this.selectedRankId != null && !this.rankOptions.some((o) => o.value === this.selectedRankId)) {
            this.selectedRankId = null;
        }
    }

    rankOptions: { label: string; value: number }[] = [];
    selectedRankId: number | null = null;

    tradeOptions: { label: string; value: number }[] = [];
    selectedTradeId: number | null = null;
    joiningDateFrom: Date | null = null;
    joiningDateTo: Date | null = null;
    joiningDateInRABFrom: Date | null = null;
    joiningDateInRABTo: Date | null = null;
    createdDateFrom: Date | null = null;
    createdDateTo: Date | null = null;

    /** Posting-status filter – mirrors the action-button buckets. */
    postingStatusOptions: { label: string; value: 'in-process' | 'not-sent' }[] = [
        { label: 'Posting In Process', value: 'in-process' },
        { label: 'Not Send In Posting List', value: 'not-sent' }
    ];
    selectedPostingStatus: 'in-process' | 'not-sent' | null = null;

    /** Row IDs currently checked in the multi-select column. */
    selectedIds = new Set<number>();
    isSendingSelection = false;

    onFilterChange(): void {
        this.first = 0;
        this.loadData();
    }

    onPage(event: { first: number; rows?: number }): void {
        this.first = event.first;
        if (event.rows != null) this.rows = event.rows;
    }

    /** List filtered by searchText (Service ID / RAB ID) and Posting Status bucket. Used for table value. */
    get filteredList(): EmployeeList[] {
        const q = this.searchText?.trim()?.toLowerCase() ?? '';
        const status = this.selectedPostingStatus;
        return this.list.filter((row) => {
            if (q !== '') {
                const rabId = this.rabIdOf(row).toLowerCase();
                const idMatch = (row.serviceId && row.serviceId.toLowerCase().includes(q)) || (rabId !== '' && rabId.includes(q)) || (row.fullNameEN && row.fullNameEN.toLowerCase().includes(q)) || (row.fullNameBN && row.fullNameBN.toLowerCase().includes(q));
                if (!idMatch) return false;
            }
            if (status === 'in-process' && !this.isPostingInProcess(row)) return false;
            if (status === 'not-sent' && this.isPostingInProcess(row)) return false;
            return true;
        });
    }

    /** A row counts as "in process" when the action button shows an in-process label (Draft or DraftPosting). */
    isPostingInProcess(row: EmployeeList): boolean {
        const s = row.isSendingNotesheetStatus;
        return s === IsSendingNotesheetStatus.Draft || s === IsSendingNotesheetStatus.DraftPosting;
    }

    onSearchChange(): void {
        this.first = 0;
    }

    toggleFilter(): void {
        this.filterOpen = !this.filterOpen;
    }

    /** Number of filter criteria currently set (for badge). */
    get activeFilterCount(): number {
        let n = 0;
        if (this.selectedOrgId != null) n++;
        if (this.selectedMemberTypeIds.length > 0) n++;
        if (this.selectedRankId != null) n++;
        if (this.selectedTradeId != null) n++;
        if (this.joiningDateFrom != null) n++;
        if (this.joiningDateTo != null) n++;
        if (this.joiningDateInRABFrom != null) n++;
        if (this.joiningDateInRABTo != null) n++;
        if (this.createdDateFrom != null) n++;
        if (this.createdDateTo != null) n++;
        if (this.selectedPostingStatus != null) n++;
        return n;
    }

    clearFilters(): void {
        this.selectedOrgId = null;
        this.selectedMemberTypeIds = [];
        this.rankOptions = [];
        this.selectedRankId = null;
        this.tradeOptions = [];
        this.selectedTradeId = null;
        this.joiningDateFrom = null;
        this.joiningDateTo = null;
        this.joiningDateInRABFrom = null;
        this.joiningDateInRABTo = null;
        this.createdDateFrom = null;
        this.createdDateTo = null;
        this.selectedPostingStatus = null;
        this.first = 0;
        this.loadData();
    }

    loadData(): void {
        this.loading = true;
        const request: GetSupernumeraryListRequest = {
            orgIds: this.selectedOrgId != null ? [this.selectedOrgId] : undefined,
            memberTypeIds: this.selectedMemberTypeIds.length > 0 ? this.selectedMemberTypeIds : undefined,
            rankId: this.selectedRankId ?? undefined,
            tradeId: this.selectedTradeId ?? undefined,
            joiningDateFrom: this.toDateString(this.joiningDateFrom),
            joiningDateTo: this.toDateString(this.joiningDateTo),
            joiningDateInRABFrom: this.toDateString(this.joiningDateInRABFrom),
            joiningDateInRABTo: this.toDateString(this.joiningDateInRABTo),
            createdDateFrom: this.toDateString(this.createdDateFrom),
            createdDateTo: this.toDateString(this.createdDateTo)
        };
        this.employeeListService.getSupernumeraryList(request).subscribe({
            next: (res) => {
                this.list = res ?? [];
                this.loading = false;
            },
            error: (err) => {
                console.error('Failed to load supernumerary list', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load supernumerary list'
                });
                this.loading = false;
            }
        });
    }

    /** Reads the RAB ID regardless of API casing (RABID / rabID / rabid). */
    rabIdOf(row: EmployeeList): string {
        return (row.RABID ?? row.rabID ?? row.rabid ?? '').toString().trim();
    }

    /** A row may be selected for bulk send when it is NOT already in the posting pipeline. */
    isSelectable(row: EmployeeList): boolean {
        return !this.isPostingInProcess(row);
    }

    isRowSelected(row: EmployeeList): boolean {
        return this.selectedIds.has(row.employeeID);
    }

    /**
     * Adds/removes a row from the selection.
     * If the user tries to check a row without an allocated RAB ID, show a warning toast
     * and leave it unchecked (auto-uncheck).
     */
    onRowSelectionChange(row: EmployeeList, checked: boolean): void {
        if (!checked) {
            this.selectedIds.delete(row.employeeID);
            return;
        }
        if (!this.rabIdOf(row)) {
            this.messageService.add({
                severity: 'warn',
                summary: 'RAB ID Not Allcoated for the Member',
                detail: 'Please Allocate RAB ID'
            });
            this.selectedIds.delete(row.employeeID);
            return;
        }
        this.selectedIds.add(row.employeeID);
    }

    /** Rows on the current page only (respects p-table pagination state). */
    private getCurrentPageRows(): EmployeeList[] {
        const list = this.filteredList ?? [];
        const start = this.first ?? 0;
        const end = start + (this.rows || list.length);
        return list.slice(start, end);
    }

    /** Rows on the current page that the header "select all" can target (selectable + has RAB ID). */
    private getEligibleRows(): EmployeeList[] {
        return this.getCurrentPageRows().filter(r => this.isSelectable(r) && !!this.rabIdOf(r));
    }

    /** Header checkbox state: true when every eligible row in the visible list is selected (and there is at least one eligible row). */
    get isAllSelectableSelected(): boolean {
        const eligible = this.getEligibleRows();
        if (eligible.length === 0) return false;
        return eligible.every(r => this.selectedIds.has(r.employeeID));
    }

    /** Tri-state hint: true when some but not all eligible rows are selected (used to render an indeterminate checkbox). */
    get isSelectableIndeterminate(): boolean {
        const eligible = this.getEligibleRows();
        if (eligible.length === 0) return false;
        const picked = eligible.filter(r => this.selectedIds.has(r.employeeID)).length;
        return picked > 0 && picked < eligible.length;
    }

    /** Toggle every eligible row in the visible list. Already-posted (disabled) rows are skipped. */
    toggleSelectAllVisible(checked: boolean): void {
        const eligible = this.getEligibleRows();
        if (checked) {
            for (const r of eligible) this.selectedIds.add(r.employeeID);
        } else {
            for (const r of eligible) this.selectedIds.delete(r.employeeID);
        }
    }

    get selectedCount(): number {
        return this.selectedIds.size;
    }

    clearSelection(): void {
        this.selectedIds.clear();
    }

    // ── Export (Word / Excel / Print) ────────────────────────────
    exportDropdownOpen = false;
    exporting = false;

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    @HostListener('document:click')
    closeExportDropdown(): void {
        this.exportDropdownOpen = false;
    }

    /**
     * All three formats render the Bangla "নতুন আগত সদস্যদের র‍্যাব আইডি
     * বরাদ্দকরণ" roll, grouped by root mother organisation.
     *
     * The rows are fetched rather than built from `filteredList`: that list is
     * English-only and carries no districts or previous workplace. The employee
     * ids are posted so the roll matches exactly what is filtered on screen.
     */
    async exportAs(type: 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;

        const employeeIds = this.filteredList
            .map((r) => r.employeeID)
            .filter((id): id is number => id != null && id > 0);

        if (employeeIds.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Nothing to export', detail: 'No members in the current list.' });
            return;
        }

        // The তারিখঃ line mirrors the Data Entry Date filter; unset renders no date.
        const dates: SupernumeraryRollDates = {
            entryDateFrom: this.toDateString(this.createdDateFrom) ?? null,
            entryDateTo: this.toDateString(this.createdDateTo) ?? null,
        };

        this.exporting = true;
        try {
            const roll = await firstValueFrom(this.employeeListService.getSupernumeraryNominalRoll(employeeIds));

            if (type === 'print') {
                if (!this.supernumeraryRoll.print(roll, dates)) {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Popup blocked',
                        detail: 'Allow popups for this site to open the print view.',
                    });
                }
            } else if (type === 'word') {
                await this.supernumeraryRoll.exportWord(roll, dates);
            } else {
                this.supernumeraryRoll.exportExcel(roll, dates);
            }
        } catch (err) {
            console.error(`${type} export failed`, err);
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to build the export.' });
        } finally {
            this.exporting = false;
        }
    }


    /** Article 47 (Takeover) modal state. */
    showArticle47Modal = false;
    article47Employees: Article47TakeoverEmployee[] = [];

    /**
     * Open the bulk Article 47 (Takeover) form as a modal with the selected
     * members. One Article 47 (Takeover) record is created per member there,
     * using the same common details entered in the dialog.
     */
    goToArticle47Takeover(): void {
        if (!this.canInsert) {
            this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You do not have permission to perform this action.' });
            return;
        }
        const ids = Array.from(this.selectedIds);
        if (ids.length === 0) return;

        this.article47Employees = ids
            .map((id) => this.list.find((r) => r.employeeID === id))
            .filter((r): r is EmployeeList => !!r)
            .map((r) => ({
                employeeID: r.employeeID,
                rabid: this.rabIdOf(r),
                serviceId: r.serviceId ?? '',
                fullNameEN: r.fullNameEN ?? '',
                rankDisplay: r.rankName,
                corpsDisplay: r.corpsName,
                tradeDisplay: r.tradeName,
                motherUnitDisplay: r.motherUnitName
            }));

        this.showArticle47Modal = true;
    }

    /** Dialog cancelled — just close. */
    onArticle47Closed(): void {
        this.showArticle47Modal = false;
    }

    /** Generation succeeded — close, clear selection and reload the list. */
    onArticle47Saved(): void {
        this.showArticle47Modal = false;
        this.clearSelection();
        this.loadData();
    }

    /**
     * Generation was rejected — most often no Movement number is configured for the
     * members' RAB unit. Shown on this page's toast (the modal's own toast renders
     * inside the dialog) and the dialog stays open so the selection isn't lost.
     */
    onArticle47Failed(detail: string): void {
        this.messageService.add({
            severity: 'error',
            summary: 'Article 47 (Takeover) not generated',
            detail: detail || 'Failed to generate Article 47 (Takeover).',
            life: 10000
        });
    }

    /** Bulk send: fire SetIsSendingNotesheetStatus=Draft for every selected ID in parallel. */
    sendSelectedToPosting(): void {
        if (!this.canUpdate) {
            this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You do not have permission to perform this action.' });
            return;
        }
        const ids = Array.from(this.selectedIds);
        if (ids.length === 0 || this.isSendingSelection) return;

        this.isSendingSelection = true;
        const calls = ids.map(id => {
            const row = this.list.find(r => r.employeeID === id);
            return this.employeeListService.setIsSendingNotesheetStatus(id, IsSendingNotesheetStatus.Draft, row?.sendingRemark ?? undefined).pipe(
                map(res => ({ id, ok: (res?.statusCode ?? 200) === 200, description: res?.description })),
                catchError(err => of({ id, ok: false, description: err?.error?.message || 'Request failed' }))
            );
        });
        forkJoin(calls).subscribe(results => {
            const okCount = results.filter(r => r.ok).length;
            const failCount = results.length - okCount;
            if (okCount > 0) {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Sent to Posting',
                    detail: `${okCount} member(s) moved to Posting in Process${failCount ? `, ${failCount} failed` : ''}.`
                });
            }
            if (failCount > 0 && okCount === 0) {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Failed',
                    detail: `Could not update ${failCount} member(s).`
                });
            }
            this.isSendingSelection = false;
            this.clearSelection();
            this.loadData();
        });
    }

    onSendNewPostingList(row: EmployeeList): void {
        if (!this.canUpdate) {
            this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You do not have permission to perform this action.' });
            return;
        }
        if (this.isPostingInProcess(row)) return;
        if (!this.rabIdOf(row)) {
            this.messageService.add({
                severity: 'warn',
                summary: 'RAB ID Not Allcoated for the Member',
                detail: 'Please Allocate RAB ID'
            });
            return;
        }
        this.employeeListService.setIsSendingNotesheetStatus(row.employeeID, IsSendingNotesheetStatus.Draft, row.sendingRemark ?? undefined).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Status updated to Posting in Process' });
                this.loadData();
            },
            error: (err) => {
                console.error('Failed to set IsSendingNotesheetStatus', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to update status'
                });
            }
        });
    }

    /** Button label: draft → "Posting in Process", draftPosting → "Note-Sheet in Process", else → "Send New Posting list" */
    getSendPostingListLabel(row: EmployeeList): string {
        const s = row.isSendingNotesheetStatus;
        if (s === IsSendingNotesheetStatus.Draft) return 'Posting in Process';
        if (s === IsSendingNotesheetStatus.DraftPosting) return 'Note-Sheet in Process';
        return 'Send New Posting list';
    }

    /** Button is disabled whenever the row is already in the posting pipeline (Draft or DraftPosting). */
    isSendPostingListDisabled(row: EmployeeList): boolean {
        return this.isPostingInProcess(row);
    }

    /**
     * CSS class picked from the row's posting status (not from the rendered text):
     *   Draft / DraftPosting (posting in process) → ash
     *   anything else → blue
     */
    getSendPostingListClass(row: EmployeeList): string {
        return this.isPostingInProcess(row) ? 'report-btn-ash' : 'report-btn-blue';
    }

    toDateString(d: Date | null): string | undefined {
        if (d == null) return undefined;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    formatDate(value: string | null): string {
        if (value == null || value === '') return '-';
        try {
            const d = new Date(value);
            return isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return value;
        }
    }
}