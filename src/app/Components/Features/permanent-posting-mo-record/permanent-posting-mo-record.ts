import { Component, OnInit, ViewChild , inject } from '@angular/core';

enum JoineeFilter { All = 'all', Added = 'added', NotAdded = 'notAdded' }
import { UserMenuService } from '@/services/user-menu.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { DividerModule } from 'primeng/divider';
import { TooltipModule } from 'primeng/tooltip';
import { Toast } from 'primeng/toast';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { forkJoin, of } from 'rxjs';
import { switchMap, catchError, map } from 'rxjs/operators';
import { EmpService } from '@/services/emp-service';
import { SharedService } from '@/shared/services/shared-service';
import { EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { PermanentPostingMORecordService, PermanentPostingMORecordModel } from '@/services/permanent-posting-mo-record.service';
import { PermanentPostingJoineeDetailService, PermanentPostingJoineeDetailModel } from '@/services/permanent-posting-joinee-detail.service';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';
import { CommonCodeService } from '@/services/common-code-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { DialogModule } from 'primeng/dialog';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { PreviousRABServiceService, VwPreviousRABServiceInfoModel } from '@/services/previous-rab-service.service';
import { MotherOrganizationModel } from '@/models/mother-org-model';
import { PostingStatus } from '@/models/enums';

@Component({
    selector: 'app-permanent-posting-mo-record',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, DatePickerModule, SelectModule, TableModule, DividerModule, TooltipModule, Toast, ConfirmDialog, FileReferencesFormComponent, FlexibleDateDirective, DialogModule],
    providers: [MessageService, ConfirmationService],
    templateUrl: './permanent-posting-mo-record.html',
    styleUrl: './permanent-posting-mo-record.scss'
})
export class PermanentPostingMORecordComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    private _location = inject(Location);
    canInsert = true;
    canUpdate = true;
    canDelete = true;
    isQueryParamEdit = false;


    @ViewChild('poFileForm') poFileForm!: FileReferencesFormComponent;
    @ViewChild('joFileForm') joFileForm!: FileReferencesFormComponent;

    editId: number | null = null;
    editDetailId: number | null = null;
    saving = false;

    // Posted Out employee
    postedOutEmployee: EmployeeBasicInfo | null = null;
    editPostedOutEmployeeId: number | null = null;
    isOfficer = false;
    postedOutRabUnitName = '';

    // Posted Out inline search
    poSearchRabId = '';
    poSearchServiceId = '';
    poSearching = false;
    showPoPickerDialog = false;
    poPickerRows: Array<{ employee: any; displayName: string; orgName: string; postingStatus: string; sortKey: string }> = [];
    private poMotherOrganizations: MotherOrganizationModel[] = [];
    private readonly poStatusLabels: Record<string, string> = {
        [PostingStatus.Supernumerary]: 'Supernumerary',
        [PostingStatus.Servings]: 'Serving',
        [PostingStatus.ExMember]: 'Ex-Member',
        [PostingStatus.PendingForJoining]: 'Pending for Joining',
        [PostingStatus.Pending]: 'Pending'
    };

    // Joinee inline search
    joineeSearchServiceId = '';
    joineeSearching = false;
    showJoineePickerDialog = false;
    joineePickerRows: Array<{ employee: any; displayName: string; orgName: string; postingStatus: string; sortKey: string }> = [];

    // Posting unit dropdown (loaded from posted-out employee's mother org)
    postingUnitId: number | null = null;
    postingUnitOptions: { label: string; value: number }[] = [];

    // Add Posting Unit dialog
    showAddUnitDialog = false;
    newUnitNameEN = '';
    newUnitNameBN = '';
    isSavingUnit = false;

    // Posted Out fields
    postingOrderNo = '';
    postingOrderDate: Date | null = null;
    possibleReleaseDate: Date | null = null;
    isReliever: boolean | null = null;
    relieverNotGivenReason = '';
    joineeCollapsed = true;

    // Officer-only
    noteSheetClearance: boolean | null = null;
    nsClearanceDate: Date | null = null;
    clearanceGiven: boolean | null = null;
    clearanceGivenDate: Date | null = null;

    // Posting Order files
    postingOrderFileRows: FileRowData[] = [];

    // Reliever / New Joinee employee
    relieverEmployee: EmployeeBasicInfo | null = null;
    editRelieverEmployeeId: number | null = null;

    // New Joinee detail
    joineeEmployeeId: number | null = null;
    joineePrefixId: number | null = null;
    joineeMotherOrgId: number | null = null;
    joineeMotherOrgUnitId: number | null = null;
    joineeMemberType: number | null = null;
    joineeRank: number | null = null;
    joineeCorps: number | null = null;
    joineeTrade: number | null = null;
    joineeServiceId = '';
    joineePreviousRabId = '';
    joineeNameBangla = '';
    joineeJoiningOrderNo = '';
    joineeJoiningOrderDate: Date | null = null;
    joineePossibleJoiningDate: Date | null = null;

    // Joining Order files
    joineeFileRows: FileRowData[] = [];

    // Dropdown options
    yesNoOptions = [{ label: 'Yes', value: true }, { label: 'No', value: false }];
    motherOrgOptions: { label: string; value: number }[] = [];
    motherOrgUnitOptions: { label: string; value: number }[] = [];
    memberTypeOptions: { label: string; value: number }[] = [];
    private allRanksForOrg: any[] = [];
    rankOptions: { label: string; value: number }[] = [];
    corpsOptions: { label: string; value: number }[] = [];
    tradeOptions: { label: string; value: number }[] = [];
    prefixOptions: { label: string; value: number }[] = [];

    records: PermanentPostingMORecordModel[] = [];
    loadingList = false;
    showPostedOutList = false;

    joineeRecords: PermanentPostingJoineeDetailModel[] = [];
    loadingJoineeList = false;
    showJoineeList = false;
    readonly JoineeFilter = JoineeFilter;
    joineeFilter = JoineeFilter.All;
    joineeFilterOptions = [
        { label: 'All Records',       value: JoineeFilter.All },
        { label: 'Entry Completed',   value: JoineeFilter.Added },
        { label: 'Entry Pending',     value: JoineeFilter.NotAdded },
    ];

    get isEditing(): boolean { return !!(this.editId || this.editDetailId); }

    get filteredJoineeRecords(): PermanentPostingJoineeDetailModel[] {
        if (this.joineeFilter === JoineeFilter.Added)    return this.joineeRecords.filter(r => r.isAddedInNewJoineeDataEntry);
        if (this.joineeFilter === JoineeFilter.NotAdded) return this.joineeRecords.filter(r => !r.isAddedInNewJoineeDataEntry);
        return this.joineeRecords;
    }

    constructor(
        private recordSvc: PermanentPostingMORecordService,
        private detailSvc: PermanentPostingJoineeDetailService,
        private empService: EmpService,
        private sharedService: SharedService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private orgService: OrganizationService,
        private commonCodeService: CommonCodeService,
        private memberTypeAccess: IdentityUserMemberTypeAccessService,
        private prevRabService: PreviousRABServiceService,
        private route: ActivatedRoute
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadStaticOptions();

        // Check query params for edit from list pages
        const params = this.route.snapshot.queryParams;
        const editRecordId = params['id'] ? Number(params['id']) : null;
        const editJoineeId = params['joineeId'] ? Number(params['joineeId']) : null;

        if (editRecordId) {
            // From posted-out-person-list: load main record by id then call onEdit
            this.isQueryParamEdit = true;
            this.loadList();
            this.loadJoineeList();
            this.recordSvc.getById(editRecordId).subscribe({
                next: (record) => {
                    if (record) this.onEdit(record);
                }
            });
        } else if (editJoineeId) {
            // From new-joining-person-list: load lists then find joinee by id
            this.isQueryParamEdit = true;
            this.loadList();
            this.detailSvc.getAll().subscribe({
                next: (all) => {
                    this.joineeRecords = all;
                    this.loadingJoineeList = false;
                    const detail = all.find(r => r.id === editJoineeId);
                    if (detail) this.onEditJoinee(detail);
                },
                error: () => { this.loadingJoineeList = false; }
            });
        } else {
            this.loadList();
            this.loadJoineeList();
        }
    }

    private loadStaticOptions(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs) => { this.motherOrgOptions = orgs.map(o => ({ label: o.orgNameEN, value: o.orgId })); this.poMotherOrganizations = orgs; },
            error: (err: any) => {}
        });
        this.commonCodeService.getAllActiveCommonCodesType('EmployeeType').subscribe({
            next: (codes) => { this.memberTypeOptions = codes.map(c => ({ label: c.codeValueEN, value: c.codeId })); },
            error: (err: any) => {}
        });
    }

    onMotherOrgChange(orgId: number | null): void {
        this.joineeMotherOrgUnitId = null;
        this.joineeRank = null;
        this.joineeCorps = null;
        this.joineeTrade = null;
        this.joineePrefixId = null;
        this.motherOrgUnitOptions = [];
        this.allRanksForOrg = [];
        this.rankOptions = [];
        this.corpsOptions = [];
        this.tradeOptions = [];
        this.prefixOptions = [];
        if (!orgId) return;
        this.loadOrgDropdowns(orgId);
    }

    private loadOrgDropdowns(orgId: number, onLoaded?: () => void): void {
        forkJoin({
            units:    this.commonCodeService.getAllActiveMotherOrgUnits(orgId).pipe(catchError(() => of([]))),
            ranks:    this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').pipe(catchError(() => of([]))),
            corps:    this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Corps').pipe(catchError(() => of([]))),
            prefixes: this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Prefix').pipe(catchError(() => of([])))
        }).subscribe({
            next: ({ units, ranks, corps, prefixes }) => {
                this.motherOrgUnitOptions = (units as any[]).map(u => ({ label: u.orgNameEN, value: u.orgId }));
                this.allRanksForOrg = ranks as any[];
                this.applyRankMemberTypeFilter();
                this.corpsOptions   = (corps as any[]).map(c => ({ label: c.codeValueEN, value: c.codeId }));
                this.prefixOptions  = (prefixes as any[]).map(c => ({ label: c.codeValueEN, value: c.codeId }));
                if (onLoaded) onLoaded();
            }
        });
    }

    onCorpsChange(ropId: number | null, skipClearTrade = false): void {
        if (!skipClearTrade) { this.joineeTrade = null; }
        this.tradeOptions = [];
        if (!ropId) return;
        this.commonCodeService.getAllActiveCommonCodesByParentId(ropId).subscribe({
            next: (codes) => { this.tradeOptions = codes.map(c => ({ label: c.codeValueEN, value: c.codeId })); },
            error: (err: any) => {}
        });
    }

    onMemberTypeChange(memberTypeId: number | null): void {
        this.joineeRank = null;
        this.applyRankMemberTypeFilter();
    }

    private applyRankMemberTypeFilter(): void {
        const mt = this.joineeMemberType;
        const filtered = mt == null
            ? this.allRanksForOrg
            : this.allRanksForOrg.filter((r: any) => (r?.parentCodeId ?? r?.ParentCodeId ?? null) === mt);
        this.rankOptions = filtered.map((item: any) => ({ label: item.codeValueEN ?? item.CodeValueEN, value: item.codeId ?? item.CodeId }));
    }

    // ── Employee search events ──────────────────────────────────────
    onPostedOutFound(employee: EmployeeBasicInfo): void {
        this.postedOutEmployee = employee;
        const memberTypeName = (employee.memberTypeDisplay ?? '').toString().toLowerCase();
        this.isOfficer = memberTypeName.includes('officer')
            || ((employee as any).officerType != null && (employee as any).officerType > 0);
        if (!this.isOfficer) {
            this.noteSheetClearance = null;
            this.nsClearanceDate = null;
            this.clearanceGiven = null;
            this.clearanceGivenDate = null;
        }

        this.loadPostedOutRabUnit(employee.employeeID);

        const motherOrgId = employee.orgId ?? null;
        if (!motherOrgId) { this.postingUnitOptions = []; return; }
        this.commonCodeService.getAllActiveMotherOrgUnits(motherOrgId).subscribe({
            next: (units: any[]) => {
                this.postingUnitOptions = units.map(u => ({ label: u.orgNameEN, value: u.orgId }));
            },
            error: (err: any) => { this.postingUnitOptions = []; }
        });
    }

    onPostedOutReset(): void {
        this.postedOutEmployee = null;
        this.isOfficer = false;
        this.postedOutRabUnitName = '';
        this.postingUnitOptions = [];
        this.postingUnitId = null;
    }

    /** Current RAB Unit = the active PreviousRABServiceInfo row (latest first), shown readonly. */
    private loadPostedOutRabUnit(employeeID: number): void {
        this.postedOutRabUnitName = '';
        this.prevRabService.getViewByEmployeeId(employeeID).subscribe({
            next: (rows: VwPreviousRABServiceInfoModel[]) => {
                if (this.postedOutEmployee?.employeeID !== employeeID) return;
                const active = (rows ?? [])
                    .filter(r => (r.isCurrentlyActive ?? (r as any).IsCurrentlyActive) === true)
                    .sort((a, b) => (b.previousRABServiceID ?? 0) - (a.previousRABServiceID ?? 0))[0];
                this.postedOutRabUnitName = active?.rabUnitName ?? (active as any)?.RabUnitName ?? '';
            }
        });
    }

    // ── Add Posting Unit Dialog ──────────────────────────────────
    openAddPostingUnitDialog(): void {
        if (!this.postedOutEmployee?.orgId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please search a posted-out employee first' });
            return;
        }
        this.newUnitNameEN = '';
        this.newUnitNameBN = '';
        this.showAddUnitDialog = true;
    }

    getPostedOutMotherOrgName(): string {
        // Try display name first (from getEmployeeSearchInfo)
        const display = (this.postedOutEmployee as any)?.motherOrganizationDisplay;
        if (display) return display;
        // Fallback: lookup from mother orgs list
        const orgId = this.postedOutEmployee?.motherOrganization;
        if (!orgId) return '';
        const org = this.poMotherOrganizations.find(o => o.orgId === orgId);
        return org?.orgNameEN ?? '';
    }

    saveNewPostingUnit(): void {
        if (!this.newUnitNameEN?.trim()) return;
        const parentOrgId = this.postedOutEmployee?.orgId;
        if (!parentOrgId) return;

        this.isSavingUnit = true;
        const currentUser = this.sharedService.getCurrentUser();
        const currentDateTime = this.sharedService.getCurrentDateTime();

        const payload = {
            orgId: 0,
            orgNameEN: this.newUnitNameEN.trim(),
            orgNameBN: this.newUnitNameBN?.trim() || '',
            locationEN: '',
            locationBN: '',
            districtId: null,
            parentOrg: parentOrgId,
            status: true,
            createdBy: currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime
        };

        this.orgService.post(payload as any).subscribe({
            next: (res: any) => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Posting Unit created successfully' });
                this.showAddUnitDialog = false;
                this.isSavingUnit = false;

                const newOrgId = res?.orgId ?? res?.OrgId;
                // Reload units for this employee's mother org only
                this.commonCodeService.getAllActiveMotherOrgUnits(parentOrgId).subscribe({
                    next: (units: any[]) => {
                        this.postingUnitOptions = units.map(u => ({ label: u.orgNameEN, value: u.orgId }));
                        if (newOrgId) this.postingUnitId = newOrgId;
                    }
                });
            },
            error: (err) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to create Posting Unit' });
                this.isSavingUnit = false;
            }
        });
    }

    // ── Posted Out Employee Inline Search ──────────────────────────
    private isMemberTypeAllowed(memberTypeId: number | null | undefined): boolean {
        if (memberTypeId == null) return true;
        const userId = this.sharedService.getCurrentUserId?.() ?? null;
        if (!userId) return true;
        const allowed = this.memberTypeAccess.getCachedMemberTypeIds(userId);
        if (allowed === null) return true;
        return allowed.includes(memberTypeId as number);
    }

    searchPostedOut(): void {
        if (!this.poSearchRabId && !this.poSearchServiceId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please enter RAB ID or Service ID' });
            return;
        }
        this.postedOutEmployee = null;
        this.showPoPickerDialog = false;
        this.poPickerRows = [];
        this.onPostedOutReset();
        this.poSearching = true;

        this.empService.searchListByRabIdOrServiceId(this.poSearchRabId || undefined, this.poSearchServiceId || undefined, true).subscribe({
            next: (employees: any[]) => {
                if (!employees || employees.length === 0) {
                    this.poSearching = false;
                    this.messageService.add({ severity: 'warn', summary: 'Not Found', detail: 'No employee found with the given ID' });
                    return;
                }
                if (employees.length === 1) {
                    this.loadSelectedPostedOut(employees[0]);
                    return;
                }
                this.buildPoPickerRows(employees);
            },
            error: (err) => {
                this.poSearching = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to search employee' });
            }
        });
    }

    private loadSelectedPostedOut(employee: any): void {
        const employeeID = employee.EmployeeID ?? employee.employeeID;
        const info: EmployeeBasicInfo = {
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
            orgId: employee.orgId
        };
        if (this.poSearchRabId && !this.poSearchServiceId) this.poSearchServiceId = info.serviceId || '';
        else if (this.poSearchServiceId && !this.poSearchRabId) this.poSearchRabId = info.rabid || '';
        this.postedOutEmployee = info;
        this.finalizePostedOut(employeeID);
    }

    private finalizePostedOut(employeeID: number): void {
        this.empService.getEmployeeSearchInfo(employeeID).subscribe({
            next: (searchInfo) => {
                if (searchInfo && this.postedOutEmployee && this.postedOutEmployee.employeeID === employeeID) {
                    const reliableMemberTypeId = (searchInfo as any).memberTypeId ?? (searchInfo as any).MemberTypeId ?? this.postedOutEmployee.memberType;
                    const motherOrgId = (searchInfo as any).lastMotherUnitId ?? (searchInfo as any).LastMotherUnitId ?? this.postedOutEmployee.motherOrganization;
                    this.postedOutEmployee = {
                        ...this.postedOutEmployee,
                        rankDisplay: searchInfo.rank ?? searchInfo.Rank,
                        corpsDisplay: searchInfo.corps ?? searchInfo.Corps,
                        tradeDisplay: searchInfo.trade ?? searchInfo.Trade,
                        motherOrganizationDisplay: searchInfo.motherOrganization ?? searchInfo.MotherOrganization,
                        memberTypeDisplay: searchInfo.memberType ?? searchInfo.MemberType,
                        memberType: reliableMemberTypeId as number | undefined,
                        motherOrganization: motherOrgId as number | undefined
                    };
                }
                const memberTypeId = this.postedOutEmployee?.memberType ?? null;
                if (!this.isMemberTypeAllowed(memberTypeId)) {
                    const typeName = this.postedOutEmployee?.memberTypeDisplay ?? null;
                    this.postedOutEmployee = null;
                    this.poSearchRabId = '';
                    this.poSearchServiceId = '';
                    this.poSearching = false;
                    this.messageService.add({ severity: 'warn', summary: 'No Permission', detail: typeName ? `You do not have permission to view ${typeName}.` : 'You do not have permission to view this member type.', life: 6000 });
                    return;
                }
                this.poSearching = false;
                if (this.postedOutEmployee) this.onPostedOutFound(this.postedOutEmployee);
            },
            error: () => {
                this.poSearching = false;
                if (this.postedOutEmployee) this.onPostedOutFound(this.postedOutEmployee);
            }
        });
    }

    private buildPoPickerRows(employees: any[]): void {
        const distinctOrgIds = Array.from(new Set(
            employees.map(e => e.orgId ?? e.OrgId).filter(id => id != null && !Number.isNaN(Number(id))).map(id => Number(id))
        ));
        const prefix$ = distinctOrgIds.length > 0
            ? forkJoin(distinctOrgIds.map(orgId => this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Prefix').pipe(map(list => ({ orgId, list })))))
            : of([] as { orgId: number; list: any[] }[]);
        const rankInfo$ = forkJoin(
            employees.map(e => {
                const empId = e.EmployeeID ?? e.employeeID;
                return empId != null ? this.empService.getEmployeeSearchInfo(Number(empId)).pipe(map(info => ({ empId: Number(empId), rankName: (info as any)?.rank ?? (info as any)?.Rank ?? '' }))) : of({ empId: 0, rankName: '' });
            })
        );
        forkJoin({ prefixes: prefix$, ranks: rankInfo$ }).subscribe({
            next: ({ prefixes, ranks }) => {
                const prefixMap = new Map<string, string>();
                for (const { orgId, list } of prefixes) { for (const p of list as any[]) { prefixMap.set(`${orgId}:${p?.codeId}`, p?.codeValueEN ?? ''); } }
                const rankMap = new Map<number, string>();
                for (const { empId, rankName } of ranks) { rankMap.set(empId, rankName); }
                this.poPickerRows = this.makePoPickerRows(employees, prefixMap, rankMap);
                this.showPoPickerDialog = true;
                this.poSearching = false;
            },
            error: () => {
                this.poPickerRows = this.makePoPickerRows(employees, new Map(), new Map());
                this.showPoPickerDialog = true;
                this.poSearching = false;
            }
        });
    }

    private makePoPickerRows(employees: any[], prefixMap: Map<string, string>, rankMap: Map<number, string>): typeof this.poPickerRows {
        const rows = employees.map(e => {
            const orgId = e.orgId ?? e.OrgId;
            const prefixId = Number(e.Prefix ?? e.prefix);
            const prefixLabel = orgId != null ? (prefixMap.get(`${orgId}:${prefixId}`) ?? '') : '';
            const serviceId = e.ServiceId ?? e.serviceId ?? '';
            const fullName = e.FullNameEN ?? e.fullNameEN ?? '';
            const empId = Number(e.EmployeeID ?? e.employeeID);
            const rankName = rankMap.get(empId) ?? '';
            const orgName = this.poMotherOrganizations.find(o => o.orgId === orgId)?.orgNameEN ?? '';
            const status = e.PostingStatus ?? e.postingStatus ?? '';
            const parts: string[] = [];
            if (prefixLabel && serviceId) parts.push(`${prefixLabel}-${serviceId}`);
            else if (prefixLabel) parts.push(prefixLabel);
            else if (serviceId) parts.push(String(serviceId));
            if (rankName) parts.push(rankName);
            if (fullName) parts.push(fullName);
            return { employee: e, displayName: parts.join(' '), orgName, postingStatus: this.poStatusLabels[status] ?? status, sortKey: `${orgName.toLowerCase()}|${prefixLabel.toLowerCase()}|${String(serviceId).padStart(10, '0')}` };
        });
        rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        return rows;
    }

    selectPoPickerRow(row: { employee: any }): void {
        this.showPoPickerDialog = false;
        this.poPickerRows = [];
        this.loadSelectedPostedOut(row.employee);
    }

    closePoPickerDialog(): void {
        this.showPoPickerDialog = false;
        this.poPickerRows = [];
        this.postedOutEmployee = null;
        this.poSearching = false;
    }

    loadPostedOutEmployeeById(employeeId: number): void {
        this.poSearching = true;
        this.empService.getEmployeeById(employeeId).subscribe({
            next: (employee: any) => {
                if (employee) {
                    const employeeID = employee.EmployeeID ?? employee.employeeID;
                    this.postedOutEmployee = {
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
                        orgId: employee.OrgId ?? employee.orgId
                    };
                    this.poSearchRabId = this.postedOutEmployee.rabid || '';
                    this.poSearchServiceId = this.postedOutEmployee.serviceId || '';
                    this.finalizePostedOut(employeeID);
                } else {
                    this.poSearching = false;
                }
            },
            error: () => { this.poSearching = false; }
        });
    }

    // ── Joinee Inline Search (Service ID only) ─────────────────────
    searchJoinee(): void {
        if (!this.joineeSearchServiceId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please enter Service ID' });
            return;
        }
        this.onRelieverReset();
        this.showJoineePickerDialog = false;
        this.joineePickerRows = [];
        this.joineeSearching = true;

        this.empService.searchListByRabIdOrServiceId(undefined, this.joineeSearchServiceId).subscribe({
            next: (employees: any[]) => {
                if (!employees || employees.length === 0) {
                    this.joineeSearching = false;
                    this.messageService.add({ severity: 'warn', summary: 'Not Found', detail: 'No employee found with the given Service ID' });
                    return;
                }
                if (employees.length === 1) {
                    this.loadSelectedJoinee(employees[0]);
                    return;
                }
                this.buildJoineePickerRows(employees);
            },
            error: (err) => {
                this.joineeSearching = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to search employee' });
            }
        });
    }

    private loadSelectedJoinee(employee: any): void {
        const employeeID = employee.EmployeeID ?? employee.employeeID;
        const info: EmployeeBasicInfo = {
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
            orgId: employee.orgId
        };
        this.joineeSearchServiceId = info.serviceId || '';
        this.joineeSearching = false;
        this.onRelieverFound(info);
    }

    private loadJoineeEmployeeById(employeeId: number): void {
        this.empService.getEmployeeById(employeeId).subscribe({
            next: (employee: any) => {
                if (employee) {
                    const employeeID = employee.EmployeeID ?? employee.employeeID;
                    const info: EmployeeBasicInfo = {
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
                        orgId: employee.OrgId ?? employee.orgId
                    };
                    this.joineeSearchServiceId = info.serviceId || '';
                    this.onRelieverFound(info);
                }
            }
        });
    }

    private buildJoineePickerRows(employees: any[]): void {
        const distinctOrgIds = Array.from(new Set(
            employees.map(e => e.orgId ?? e.OrgId).filter(id => id != null && !Number.isNaN(Number(id))).map(id => Number(id))
        ));
        const prefix$ = distinctOrgIds.length > 0
            ? forkJoin(distinctOrgIds.map(orgId => this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Prefix').pipe(map(list => ({ orgId, list })))))
            : of([] as { orgId: number; list: any[] }[]);
        const rankInfo$ = forkJoin(
            employees.map(e => {
                const empId = e.EmployeeID ?? e.employeeID;
                return empId != null ? this.empService.getEmployeeSearchInfo(Number(empId)).pipe(map(info => ({ empId: Number(empId), rankName: (info as any)?.rank ?? (info as any)?.Rank ?? '' }))) : of({ empId: 0, rankName: '' });
            })
        );
        forkJoin({ prefixes: prefix$, ranks: rankInfo$ }).subscribe({
            next: ({ prefixes, ranks }) => {
                const prefixMap = new Map<string, string>();
                for (const { orgId, list } of prefixes) { for (const p of list as any[]) { prefixMap.set(`${orgId}:${p?.codeId}`, p?.codeValueEN ?? ''); } }
                const rankMap = new Map<number, string>();
                for (const { empId, rankName } of ranks) { rankMap.set(empId, rankName); }
                this.joineePickerRows = this.makePoPickerRows(employees, prefixMap, rankMap);
                this.showJoineePickerDialog = true;
                this.joineeSearching = false;
            },
            error: () => {
                this.joineePickerRows = this.makePoPickerRows(employees, new Map(), new Map());
                this.showJoineePickerDialog = true;
                this.joineeSearching = false;
            }
        });
    }

    selectJoineePickerRow(row: { employee: any }): void {
        this.showJoineePickerDialog = false;
        this.joineePickerRows = [];
        this.loadSelectedJoinee(row.employee);
    }

    closeJoineePickerDialog(): void {
        this.showJoineePickerDialog = false;
        this.joineePickerRows = [];
        this.joineeSearching = false;
    }

    onRelieverFound(employee: EmployeeBasicInfo): void {
        this.relieverEmployee = employee;
        this.joineeEmployeeId = employee.employeeID;
        this.joineeServiceId = employee.serviceId ?? '';
        this.joineeNameBangla = employee.fullNameBN ?? '';
        this.joineeMemberType = employee.memberType ?? null;

        const orgId = employee.orgId ?? null;
        this.joineeMotherOrgId = orgId;

        if (orgId) {
            forkJoin({
                units:      this.commonCodeService.getAllActiveMotherOrgUnits(orgId).pipe(catchError(() => of([]))),
                ranks:      this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').pipe(catchError(() => of([]))),
                corps:      this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Corps').pipe(catchError(() => of([]))),
                prefixes:   this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Prefix').pipe(catchError(() => of([]))),
                searchInfo: this.empService.getEmployeeSearchInfo(employee.employeeID).pipe(catchError(() => of(null)))
            }).subscribe({
                next: ({ units, ranks, corps, prefixes, searchInfo }) => {
                    this.motherOrgUnitOptions = (units as any[]).map(u => ({ label: u.orgNameEN, value: u.orgId }));
                    this.allRanksForOrg = ranks as any[];
                    this.applyRankMemberTypeFilter();
                    this.corpsOptions         = (corps as any[]).map(c => ({ label: c.codeValueEN, value: c.codeId }));
                    this.prefixOptions        = (prefixes as any[]).map(c => ({ label: c.codeValueEN, value: c.codeId }));

                    // lastMotherUnitId from vw_EmployeeSearchInfo is the reliable unit org ID
                    const si = searchInfo as any;
                    const unitId = si?.lastMotherUnitId ?? si?.LastMotherUnitId ?? employee.motherOrganization ?? null;
                    this.joineeMotherOrgUnitId = unitId;
                    this.joineeRank  = employee.rank ?? null;
                    this.joineeCorps = employee.branch ?? null;
                    this.joineeTrade = employee.trade ?? null;
                    if (employee.branch) { this.onCorpsChange(employee.branch, true); }
                }
            });
        } else {
            this.joineeMotherOrgUnitId = null;
            this.joineeRank  = null;
            this.joineeCorps = null;
            this.joineeTrade = null;
        }
    }

    onRelieverReset(): void {
        this.relieverEmployee = null;
        this.joineeEmployeeId = null;
        this.joineeServiceId = '';
        this.joineePreviousRabId = '';
        this.joineeNameBangla = '';
        this.joineeMotherOrgId = null;
        this.joineeMotherOrgUnitId = null;
        this.joineeMemberType = null;
        this.joineeRank = null;
        this.joineeCorps = null;
        this.joineeTrade = null;
        this.joineePrefixId = null;
        this.motherOrgUnitOptions = [];
        this.allRanksForOrg = [];
        this.rankOptions = [];
        this.corpsOptions = [];
        this.tradeOptions = [];
        this.prefixOptions = [];
    }

    clearPostedOutSection(): void {
        this.poSearchRabId = '';
        this.poSearchServiceId = '';
        this.onPostedOutReset();
        this.editPostedOutEmployeeId = null;
    }

    clearJoineeSection(): void {
        this.joineeSearchServiceId = '';
        this.joineeSearching = false;
        this.onRelieverReset();
        this.editRelieverEmployeeId = null;
        this.joineeJoiningOrderNo = '';
        this.joineeJoiningOrderDate = null;
        this.joineePossibleJoiningDate = null;
        this.joineeFileRows = [];
    }

    // ── File row change (two-way binding with file-references-form) ─
    onPOFileRowsChange(rows: FileRowData[]): void { this.postingOrderFileRows = rows; }
    onJOFileRowsChange(rows: FileRowData[]): void { this.joineeFileRows = rows; }

    // ── Download ────────────────────────────────────────────────────
    onDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to download file.' })
        });
    }

    // ── Save ────────────────────────────────────────────────────────
    onSave(): void {
        // ── Validation ───────────────────────────────────────────
        const hasPostedOut = !!(this.postedOutEmployee || this.editId);
        const hasJoineeData = !!(this.joineeMotherOrgId || this.joineeServiceId?.trim() || this.joineeNameBangla?.trim());

        // Duplicate check: prevent same employee being posted out twice
        if (hasPostedOut && this.postedOutEmployee?.employeeID) {
            const empId = this.postedOutEmployee.employeeID;
            const existing = this.records.find(r => r.postedOutEmployeeId === empId && r.id !== this.editId);
            if (existing) {
                this.messageService.add({ severity: 'warn', summary: 'Duplicate', detail: 'This employee already has a Posted Out entry.' });
                return;
            }
        }

        // Posted Out validation: if posted-out employee is provided, require key fields
        if (hasPostedOut) {
            if (!this.postingUnitId) {
                this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Posting Unit.' });
                return;
            }
            if (this.isOfficer) {
                if (this.noteSheetClearance == null) {
                    this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Note-Sheet Clearance.' });
                    return;
                }
                if (this.clearanceGiven == null) {
                    this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Clearance Given.' });
                    return;
                }
            }
            if (this.isReliever == null) {
                this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Is Reliever Assigned.' });
                return;
            }
        }

        // If isReliever = Yes, New Posting Person fields are required
        if (hasPostedOut && this.isReliever === true) {
            const missing: string[] = [];
            if (!this.joineeMotherOrgId) missing.push('Mother Org');
            if (!this.joineeMotherOrgUnitId) missing.push('Mother Org Unit');
            if (!this.joineePrefixId) missing.push('Prefix');
            if (!this.joineeServiceId?.trim()) missing.push('Service ID');
            if (!this.joineeNameBangla?.trim()) missing.push('Name (Bangla)');
            if (missing.length > 0) {
                this.joineeCollapsed = false;
                this.messageService.add({ severity: 'warn', summary: 'Validation', detail: `New Posting Person required: ${missing.join(', ')}.` });
                return;
            }
        }

        // Standalone joinee save (no posted-out): validate joinee required fields
        if (!hasPostedOut && hasJoineeData) {
            const missing: string[] = [];
            if (!this.joineeMotherOrgId) missing.push('Mother Org');
            if (!this.joineeMotherOrgUnitId) missing.push('Mother Org Unit');
            if (!this.joineePrefixId) missing.push('Prefix');
            if (!this.joineeServiceId?.trim()) missing.push('Service ID');
            if (!this.joineeNameBangla?.trim()) missing.push('Name (Bangla)');
            if (missing.length > 0) {
                this.messageService.add({ severity: 'warn', summary: 'Validation', detail: `New Posting Person required: ${missing.join(', ')}.` });
                return;
            }
        }

        // Nothing to save at all
        if (!hasPostedOut && !hasJoineeData) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please fill Posted Out or New Posting Person data before saving.' });
            return;
        }

        this.saving = true;

        const poNewFiles = this.poFileForm?.getFilesToUpload() ?? [];
        const joNewFiles = this.joFileForm?.getFilesToUpload() ?? [];
        const poExisting = this.poFileForm?.getExistingFileReferences() ?? [];
        const joExisting = this.joFileForm?.getExistingFileReferences() ?? [];

        const uploads$ = [
            ...poNewFiles.map(r => this.empService.uploadEmployeeFile(r.file!)),
            ...joNewFiles.map(r => this.empService.uploadEmployeeFile(r.file!))
        ];

        const proceed = (poUploaded: { fileId: number; fileName: string }[], joUploaded: { fileId: number; fileName: string }[]) => {
            const poRefs = [
                ...poExisting.map(r => ({ fileId: r.FileId, fileName: r.fileName })),
                ...poUploaded
            ];
            const joRefs = [
                ...joExisting.map(r => ({ fileId: r.FileId, fileName: r.fileName })),
                ...joUploaded
            ];
            this.doSave(poRefs, joRefs);
        };

        if (uploads$.length > 0) {
            forkJoin(uploads$).subscribe({
                next: (results) => {
                    proceed(
                        results.slice(0, poNewFiles.length),
                        results.slice(poNewFiles.length)
                    );
                },
                error: (err: any) => { this.saving = false; this.messageService.add({ severity: 'error', summary: 'Upload', detail: 'File upload failed.' }); }
            });
        } else {
            proceed([], []);
        }
    }

    private doSave(poRefs: { fileId: number; fileName: string }[], joRefs: { fileId: number; fileName: string }[]): void {
        const user = this.sharedService.getCurrentUser() ?? 'system';

        const buildDetail = (recordId: number | null): Partial<PermanentPostingJoineeDetailModel> => ({
            id: this.editDetailId ?? 0,
            permanentPostingMORecordId: recordId,
            isAddedInNewJoineeDataEntry: false,
            employeeId: this.joineeEmployeeId,
            prefixId: this.joineePrefixId,
            motherOrgId: this.joineeMotherOrgId,
            motherOrgUnitId: this.joineeMotherOrgUnitId,
            memberType: this.joineeMemberType,
            rank: this.joineeRank,
            corps: this.joineeCorps,
            trade: this.joineeTrade,
            serviceId: this.joineeServiceId || null,
            previousRabId: this.joineePreviousRabId || null,
            nameBangla: this.joineeNameBangla || null,
            joiningOrderNo: this.joineeJoiningOrderNo || null,
            joiningOrderDate: this.formatDate(this.joineeJoiningOrderDate),
            possibleJoiningDate: this.formatDate(this.joineePossibleJoiningDate),
            joiningOrderFilesReferences: joRefs.length ? JSON.stringify(joRefs) : null,
            createdBy: user,
            lastUpdatedBy: user
        });

        const onResult = (res: any) => {
            this.saving = false;
            const ok = res?.statusCode === 200;
            this.messageService.add({ severity: ok ? 'success' : 'warn', summary: 'Save', detail: ok ? 'Saved successfully.' : (res?.description ?? 'Save failed.') });
            if (ok) {
                if (this.isQueryParamEdit) {
                    // Stay in edit mode — reload the saved data
                    this.loadList();
                    this.loadJoineeList();
                    const recordId = res.data?.id ?? res.id ?? this.editId;
                    if (recordId) {
                        this.recordSvc.getById(recordId).subscribe({
                            next: (record) => { if (record) this.onEdit(record); }
                        });
                    } else if (this.editDetailId) {
                        this.detailSvc.getAll().subscribe({
                            next: (all) => {
                                const detail = all.find(r => r.id === this.editDetailId);
                                if (detail) this.onEditJoinee(detail);
                            }
                        });
                    }
                } else {
                    this.resetForm(); this.loadList(); this.loadJoineeList();
                }
            }
        };
        const onError = (err: any) => { this.saving = false; this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? 'Save failed.' }); };

        // No posted-out employee and no existing main record → save detail only (no PermanentPostingMORecord row)
        if (!this.postedOutEmployee && !this.editId) {
            this.detailSvc.saveUpdate(buildDetail(null)).subscribe({ next: onResult, error: onError });
            return;
        }

        // Normal flow: save/update main record, then save detail linked to it
        const mainPayload: Partial<PermanentPostingMORecordModel> = {
            id: this.editId ?? 0,
            postedOutEmployeeId: this.postedOutEmployee?.employeeID ?? null,
            postingUnitId: this.postingUnitId,
            postingOrderNo: this.postingOrderNo || null,
            postingOrderDate: this.formatDate(this.postingOrderDate),
            possibleReleaseDate: this.formatDate(this.possibleReleaseDate),
            isReliever: this.isReliever,
            relieverNotGivenReason: this.isReliever === false ? (this.relieverNotGivenReason || null) : null,
            relieverEmployeeId: this.isReliever === true ? (this.relieverEmployee?.employeeID ?? null) : null,
            noteSheetClearance: this.noteSheetClearance,
            nsClearanceDate: this.formatDate(this.nsClearanceDate),
            clearanceGiven: this.clearanceGiven,
            clearanceGivenDate: this.formatDate(this.clearanceGivenDate),
            postingOrderFilesReferences: poRefs.length ? JSON.stringify(poRefs) : null,
            status: 'Draft',
            createdBy: user,
            lastUpdatedBy: user
        };

        const hasJoineeData = !!(this.joineeMotherOrgId || this.joineeServiceId?.trim() || this.joineeNameBangla?.trim());

        this.recordSvc.saveUpdate(mainPayload).pipe(
            switchMap((res) => {
                if (res?.statusCode !== 200) return of({ mainRes: res });
                const recordId = res.data?.id ?? res.id ?? this.editId ?? null;
                // Only save joinee detail if isReliever=Yes or there's actual joinee data
                if (this.isReliever === true || hasJoineeData || this.editDetailId) {
                    return this.detailSvc.saveUpdate(buildDetail(recordId)).pipe(switchMap(() => of({ mainRes: res })));
                }
                return of({ mainRes: res });
            })
        ).subscribe({ next: ({ mainRes }) => onResult(mainRes), error: onError });
    }

    // ── Edit ────────────────────────────────────────────────────────
    onEdit(row: PermanentPostingMORecordModel): void {
        this.editId = row.id;
        this.editPostedOutEmployeeId = row.postedOutEmployeeId;

        // Store postingUnitId before loading employee (which triggers async GetAllOrgUnit)
        const savedPostingUnitId = row.postingUnitId ?? null;
        this.postingUnitId = savedPostingUnitId;

        if (row.postedOutEmployeeId) {
            this.loadPostedOutEmployeeById(row.postedOutEmployeeId);
        }

        this.editRelieverEmployeeId = row.relieverEmployeeId ?? null;
        this.postingOrderNo = row.postingOrderNo ?? '';
        this.postingOrderDate = row.postingOrderDate ? new Date(row.postingOrderDate) : null;
        this.possibleReleaseDate = row.possibleReleaseDate ? new Date(row.possibleReleaseDate) : null;
        this.isReliever = row.isReliever;
        this.joineeCollapsed = row.isReliever !== true;
        this.relieverNotGivenReason = row.relieverNotGivenReason ?? '';
        this.noteSheetClearance = row.noteSheetClearance ?? null;
        this.nsClearanceDate = row.nsClearanceDate ? new Date(row.nsClearanceDate) : null;
        this.clearanceGiven = row.clearanceGiven ?? null;
        this.clearanceGivenDate = row.clearanceGivenDate ? new Date(row.clearanceGivenDate) : null;

        this.postingOrderFileRows = row.postingOrderFilesReferences
            ? (JSON.parse(row.postingOrderFilesReferences) as { fileId: number; fileName: string }[])
                .map(r => ({ displayName: r.fileName, file: null, fileId: r.fileId }))
            : [];

        // Load reliever employee if isReliever === true and relieverEmployeeId exists
        if (row.isReliever === true && row.relieverEmployeeId) {
            this.loadJoineeEmployeeById(row.relieverEmployeeId);
        }

        this.detailSvc.getByRecordId(row.id).subscribe({
            next: (d) => {
                if (!d) return;
                this.editDetailId = d.id;
                this.joineeEmployeeId = d.employeeId ?? null;
                this.joineeMotherOrgId = d.motherOrgId ?? null;
                this.joineeMemberType = d.memberType ?? null;
                this.joineeServiceId = d.serviceId ?? '';
                this.joineeSearchServiceId = d.serviceId ?? '';
                this.joineePreviousRabId = d.previousRabId ?? '';
                this.joineeNameBangla = d.nameBangla ?? '';
                this.joineeJoiningOrderNo = d.joiningOrderNo ?? '';
                this.joineeJoiningOrderDate = d.joiningOrderDate ? new Date(d.joiningOrderDate) : null;
                this.joineePossibleJoiningDate = d.possibleJoiningDate ? new Date(d.possibleJoiningDate) : null;
                this.joineeFileRows = d.joiningOrderFilesReferences
                    ? (JSON.parse(d.joiningOrderFilesReferences) as { fileId: number; fileName: string }[])
                        .map(r => ({ displayName: r.fileName, file: null, fileId: r.fileId }))
                    : [];

                if (d.motherOrgId) {
                    this.loadOrgDropdowns(d.motherOrgId, () => {
                        this.joineePrefixId       = d.prefixId ?? null;
                        this.joineeMotherOrgUnitId = d.motherOrgUnitId ?? null;
                        this.joineeRank   = d.rank ?? null;
                        this.joineeCorps  = d.corps ?? null;
                        this.joineeTrade  = d.trade ?? null;
                        if (d.corps) { this.onCorpsChange(d.corps, true); }
                    });
                }

                // Restore postingUnitId in case async loading cleared it
                this.postingUnitId = savedPostingUnitId;
            }
        });
    }

    onDelete(row: PermanentPostingMORecordModel): void {
        this.confirmationService.confirm({
            message: `Are you sure you want to delete Posted Out Record #${row.id}? If a linked New Joining Person record exists, it will also be removed. This action cannot be undone.`,
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Yes, Delete',
            rejectLabel: 'Cancel',
            acceptButtonStyleClass: 'p-button-danger',
            accept: () => {
                this.recordSvc.delete(row.id).subscribe({
                    next: (res: any) => {
                        if (res?.statusCode === 403) {
                            this.messageService.add({ severity: 'warn', summary: 'Cannot Delete', detail: res.description ?? 'Ex-Member records cannot be removed.' });
                            return;
                        }
                        if (res?.statusCode !== 200) {
                            this.messageService.add({ severity: 'error', summary: 'Error', detail: res?.description ?? 'Delete failed.' });
                            return;
                        }
                        this.messageService.add({ severity: 'success', summary: 'Deleted', detail: res.description ?? 'Record deleted.' });
                        this.loadList();
                        this.loadJoineeList();
                    },
                    error: (err: any) => {
                        const body = err?.error;
                        if (body?.statusCode === 403) {
                            this.messageService.add({ severity: 'warn', summary: 'Cannot Delete', detail: body.description ?? 'Ex-Member records cannot be removed.' });
                        } else {
                            this.messageService.add({ severity: 'error', summary: 'Error', detail: body?.description ?? 'Delete failed.' });
                        }
                    }
                });
            }
        });
    }

    onCancel(): void { this.resetForm(); }

    goBack(): void { this._location.back(); }

    loadList(): void {
        this.loadingList = true;
        this.recordSvc.getAll().subscribe({ next: (d) => { this.records = d; this.loadingList = false; }, error: (err: any) => { this.loadingList = false; } });
    }

    loadJoineeList(): void {
        this.loadingJoineeList = true;
        this.detailSvc.getAll().subscribe({ next: (d) => { this.joineeRecords = d; this.loadingJoineeList = false; }, error: (err: any) => { this.loadingJoineeList = false; } });
    }

    onEditJoinee(row: PermanentPostingJoineeDetailModel): void {
        this.joineeCollapsed = false;
        this.editId = null;
        this.editDetailId = row.id;
        this.editPostedOutEmployeeId = null;
        this.editRelieverEmployeeId = row.employeeId ?? null;
        this.joineeEmployeeId = row.employeeId ?? null;
        this.joineeMotherOrgId = row.motherOrgId ?? null;
        this.joineeMemberType = row.memberType ?? null;
        this.joineeServiceId = row.serviceId ?? '';
        this.joineeSearchServiceId = row.serviceId ?? '';
        this.joineeNameBangla = row.nameBangla ?? '';
        this.joineeJoiningOrderNo = row.joiningOrderNo ?? '';
        this.joineeJoiningOrderDate = row.joiningOrderDate ? new Date(row.joiningOrderDate) : null;
        this.joineePossibleJoiningDate = row.possibleJoiningDate ? new Date(row.possibleJoiningDate) : null;
        this.joineeFileRows = row.joiningOrderFilesReferences
            ? (JSON.parse(row.joiningOrderFilesReferences) as { fileId: number; fileName: string }[])
                .map(r => ({ displayName: r.fileName, file: null, fileId: r.fileId }))
            : [];
        if (row.motherOrgId) {
            this.loadOrgDropdowns(row.motherOrgId, () => {
                this.joineePrefixId       = row.prefixId ?? null;
                this.joineeMotherOrgUnitId = row.motherOrgUnitId ?? null;
                this.joineeRank  = row.rank ?? null;
                this.joineeCorps = row.corps ?? null;
                this.joineeTrade = row.trade ?? null;
                if (row.corps) { this.onCorpsChange(row.corps, true); }
            });
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    onDeleteJoinee(row: PermanentPostingJoineeDetailModel): void {
        this.confirmationService.confirm({
            message: `Are you sure you want to delete New Joinee Record #${row.id}${row.serviceId ? ' (Service ID: ' + row.serviceId + ')' : ''}? This action cannot be undone.`,
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Yes, Delete',
            rejectLabel: 'Cancel',
            acceptButtonStyleClass: 'p-button-danger',
            accept: () => {
                this.detailSvc.delete(row.id).subscribe({
                    next: (res: any) => {
                        if (res?.statusCode !== 200) {
                            this.messageService.add({ severity: 'error', summary: 'Error', detail: res?.description ?? 'Delete failed.' });
                            return;
                        }
                        this.messageService.add({ severity: 'success', summary: 'Deleted', detail: res.description ?? 'Joinee record deleted.' });
                        this.loadJoineeList();
                    },
                    error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? 'Delete failed.' })
                });
            }
        });
    }

    exportPostedOutExcel(): void {
        const rows = this.records.map((r, i) => ({
            '#': i + 1,
            'Record No': r.id,
            'Posted Out Emp. ID': r.postedOutEmployeeId ?? '-',
            'Posting Order No': r.postingOrderNo ?? '-',
            'PO Date': this.formatDisplay(r.postingOrderDate),
            'Possible Release': this.formatDisplay(r.possibleReleaseDate),
            'Reliever': r.isReliever === true ? 'Yes' : r.isReliever === false ? 'No' : '-',
            'Reliever Emp. ID': r.relieverEmployeeId ?? '-',
            'NS Clearance': r.noteSheetClearance === true ? 'Yes' : r.noteSheetClearance === false ? 'No' : '-',
            'Clearance Given': r.clearanceGiven === true ? 'Yes' : r.clearanceGiven === false ? 'No' : '-',
            'Status': r.status ?? '-'
        }));
        this.exportExcel(rows, 'Posted_Out_Records');
    }

    exportJoineeExcel(): void {
        const rows = this.joineeRecords.map((r, i) => ({
            '#': i + 1,
            'Parent Record ID': r.permanentPostingMORecordId ?? 'Standalone',
            'Service ID': r.serviceId ?? '-',
            'Name (Bangla)': r.nameBangla ?? '-',
            'Joining Order No': r.joiningOrderNo ?? '-',
            'Joining Date': this.formatDisplay(r.joiningOrderDate),
            'Possible Joining Date': this.formatDisplay(r.possibleJoiningDate)
        }));
        this.exportExcel(rows, 'New_Joinee_Records');
    }

    private exportExcel(rows: object[], filename: string): void {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Data');
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        saveAs(new Blob([buf], { type: 'application/octet-stream' }), `${filename}.xlsx`);
    }

    formatDate(d: Date | null): string | null {
        if (!d) return null;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    formatDisplay(v: string | null | undefined): string {
        if (!v) return '-';
        const d = new Date(v); return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    resetForm(): void {
        this.editId = null; this.editDetailId = null;
        this.editPostedOutEmployeeId = null; this.editRelieverEmployeeId = null;
        this.postedOutEmployee = null; this.isOfficer = false; this.postedOutRabUnitName = '';
        this.poSearchRabId = ''; this.poSearchServiceId = ''; this.poSearching = false;
        this.joineeSearchServiceId = ''; this.joineeSearching = false;
        this.postingUnitId = null; this.postingUnitOptions = [];
        this.postingOrderNo = ''; this.postingOrderDate = null; this.possibleReleaseDate = null;
        this.isReliever = null; this.relieverNotGivenReason = '';
        this.noteSheetClearance = null; this.nsClearanceDate = null; this.clearanceGiven = null; this.clearanceGivenDate = null;
        this.postingOrderFileRows = [];
        this.relieverEmployee = null;
        this.joineeEmployeeId = null;
        this.joineePrefixId = null; this.joineeMotherOrgId = null; this.joineeMotherOrgUnitId = null;
        this.joineeMemberType = null; this.joineeRank = null; this.joineeCorps = null; this.joineeTrade = null;
        this.joineeServiceId = ''; this.joineePreviousRabId = ''; this.joineeNameBangla = '';
        this.joineeJoiningOrderNo = ''; this.joineeJoiningOrderDate = null; this.joineePossibleJoiningDate = null;
        this.joineeFileRows = [];
        this.motherOrgUnitOptions = []; this.allRanksForOrg = []; this.rankOptions = []; this.corpsOptions = []; this.tradeOptions = []; this.prefixOptions = [];
    }
}
