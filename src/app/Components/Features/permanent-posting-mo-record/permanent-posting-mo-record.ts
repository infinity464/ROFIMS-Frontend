import { Component, OnInit, ViewChild , inject } from '@angular/core';

enum JoineeFilter { All = 'all', Added = 'added', NotAdded = 'notAdded' }
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
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
import { switchMap, catchError } from 'rxjs/operators';
import { EmpService } from '@/services/emp-service';
import { SharedService } from '@/shared/services/shared-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { PermanentPostingMORecordService, PermanentPostingMORecordModel } from '@/services/permanent-posting-mo-record.service';
import { PermanentPostingJoineeDetailService, PermanentPostingJoineeDetailModel } from '@/services/permanent-posting-joinee-detail.service';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';
import { CommonCodeService } from '@/services/common-code-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

@Component({
    selector: 'app-permanent-posting-mo-record',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, DatePickerModule, SelectModule, TableModule, DividerModule, TooltipModule, Toast, ConfirmDialog, EmployeeSearchComponent, FileReferencesFormComponent, FlexibleDateDirective],
    providers: [MessageService, ConfirmationService],
    templateUrl: './permanent-posting-mo-record.html'
})
export class PermanentPostingMORecordComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;


    @ViewChild('poFileForm') poFileForm!: FileReferencesFormComponent;
    @ViewChild('joFileForm') joFileForm!: FileReferencesFormComponent;

    editId: number | null = null;
    editDetailId: number | null = null;
    saving = false;

    // Posted Out employee
    postedOutEmployee: EmployeeBasicInfo | null = null;
    editPostedOutEmployeeId: number | null = null;
    isOfficer = false;

    // Posting unit dropdown (loaded from posted-out employee's mother org)
    postingUnitId: number | null = null;
    postingUnitOptions: { label: string; value: number }[] = [];

    // Posted Out fields
    postingOrderNo = '';
    postingOrderDate: Date | null = null;
    possibleReleaseDate: Date | null = null;
    isReliever: boolean | null = null;
    relieverNotGivenReason = '';

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
        private commonCodeService: CommonCodeService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadList();
        this.loadJoineeList();
        this.loadStaticOptions();
    }

    private loadStaticOptions(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs) => { this.motherOrgOptions = orgs.map(o => ({ label: o.orgNameEN, value: o.orgId })); },
            error: () => {}
        });
        this.commonCodeService.getAllActiveCommonCodesType('EmployeeType').subscribe({
            next: (codes) => { this.memberTypeOptions = codes.map(c => ({ label: c.codeValueEN, value: c.codeId })); },
            error: () => {}
        });
    }

    onMotherOrgChange(orgId: number | null): void {
        this.joineeMotherOrgUnitId = null;
        this.joineeRank = null;
        this.joineeCorps = null;
        this.joineeTrade = null;
        this.joineePrefixId = null;
        this.motherOrgUnitOptions = [];
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
                this.rankOptions    = (ranks as any[]).map(c => ({ label: c.codeValueEN, value: c.codeId }));
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
            error: () => {}
        });
    }

    // ── Employee search events ──────────────────────────────────────
    onPostedOutFound(employee: EmployeeBasicInfo): void {
        this.postedOutEmployee = employee;
        this.isOfficer = (employee as any).officerType != null && (employee as any).officerType > 0;

        this.orgService.getOrgUnitsByEmployeeId(employee.employeeID).subscribe({
            next: (units) => {
                this.postingUnitOptions = units.map(u => ({ label: u.orgNameEN, value: u.orgId }));
            },
            error: () => { this.postingUnitOptions = []; }
        });
    }

    onPostedOutReset(): void {
        this.postedOutEmployee = null;
        this.isOfficer = false;
        this.postingUnitOptions = [];
        this.postingUnitId = null;
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
                    this.rankOptions          = (ranks as any[]).map(c => ({ label: c.codeValueEN, value: c.codeId }));
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
        this.rankOptions = [];
        this.corpsOptions = [];
        this.tradeOptions = [];
        this.prefixOptions = [];
    }

    clearPostedOutSection(): void {
        this.onPostedOutReset();
        this.editPostedOutEmployeeId = null;
    }

    clearJoineeSection(): void {
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
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download file.' })
        });
    }

    // ── Save ────────────────────────────────────────────────────────
    onSave(): void {
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
                error: () => { this.saving = false; this.messageService.add({ severity: 'error', summary: 'Upload', detail: 'File upload failed.' }); }
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
            isAddedInNewJoineeDataEntry: recordId === null,
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
            if (ok) { this.resetForm(); this.loadList(); this.loadJoineeList(); }
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

        this.recordSvc.saveUpdate(mainPayload).pipe(
            switchMap((res) => {
                if (res?.statusCode !== 200) return of({ mainRes: res });
                const recordId = res.data?.id ?? res.id ?? this.editId ?? null;
                return this.detailSvc.saveUpdate(buildDetail(recordId)).pipe(switchMap(() => of({ mainRes: res })));
            })
        ).subscribe({ next: ({ mainRes }) => onResult(mainRes), error: onError });
    }

    // ── Edit ────────────────────────────────────────────────────────
    onEdit(row: PermanentPostingMORecordModel): void {
        this.editId = row.id;
        this.editPostedOutEmployeeId = row.postedOutEmployeeId;
        this.editRelieverEmployeeId = row.relieverEmployeeId ?? null;
        this.postingUnitId = row.postingUnitId ?? null;
        this.postingOrderNo = row.postingOrderNo ?? '';
        this.postingOrderDate = row.postingOrderDate ? new Date(row.postingOrderDate) : null;
        this.possibleReleaseDate = row.possibleReleaseDate ? new Date(row.possibleReleaseDate) : null;
        this.isReliever = row.isReliever;
        this.relieverNotGivenReason = row.relieverNotGivenReason ?? '';
        this.noteSheetClearance = row.noteSheetClearance ?? null;
        this.nsClearanceDate = row.nsClearanceDate ? new Date(row.nsClearanceDate) : null;
        this.clearanceGiven = row.clearanceGiven ?? null;
        this.clearanceGivenDate = row.clearanceGivenDate ? new Date(row.clearanceGivenDate) : null;

        this.postingOrderFileRows = row.postingOrderFilesReferences
            ? (JSON.parse(row.postingOrderFilesReferences) as { fileId: number; fileName: string }[])
                .map(r => ({ displayName: r.fileName, file: null, fileId: r.fileId }))
            : [];

        this.detailSvc.getByRecordId(row.id).subscribe({
            next: (d) => {
                if (!d) return;
                this.editDetailId = d.id;
                this.joineeEmployeeId = d.employeeId ?? null;
                this.joineeMotherOrgId = d.motherOrgId ?? null;
                this.joineeMemberType = d.memberType ?? null;
                this.joineeServiceId = d.serviceId ?? '';
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
            }
        });
    }

    onDelete(row: PermanentPostingMORecordModel): void {
        this.confirmationService.confirm({
            message: `Are you sure you want to delete Posted Out Record #${row.id}? This action cannot be undone.`,
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Yes, Delete',
            rejectLabel: 'Cancel',
            acceptButtonStyleClass: 'p-button-danger',
            accept: () => {
                this.recordSvc.delete(row.id).subscribe({
                    next: () => { this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Record deleted.' }); this.loadList(); },
                    error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Delete failed.' })
                });
            }
        });
    }

    onCancel(): void { this.resetForm(); }

    loadList(): void {
        this.loadingList = true;
        this.recordSvc.getAll().subscribe({ next: (d) => { this.records = d; this.loadingList = false; }, error: () => { this.loadingList = false; } });
    }

    loadJoineeList(): void {
        this.loadingJoineeList = true;
        this.detailSvc.getAll().subscribe({ next: (d) => { this.joineeRecords = d; this.loadingJoineeList = false; }, error: () => { this.loadingJoineeList = false; } });
    }

    onEditJoinee(row: PermanentPostingJoineeDetailModel): void {
        this.editId = null;
        this.editDetailId = row.id;
        this.editPostedOutEmployeeId = null;
        this.editRelieverEmployeeId = row.employeeId ?? null;
        this.joineeEmployeeId = row.employeeId ?? null;
        this.joineeMotherOrgId = row.motherOrgId ?? null;
        this.joineeMemberType = row.memberType ?? null;
        this.joineeServiceId = row.serviceId ?? '';
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
                    next: () => { this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Joinee record deleted.' }); this.loadJoineeList(); },
                    error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Delete failed.' })
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
        this.postedOutEmployee = null; this.isOfficer = false;
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
        this.motherOrgUnitOptions = []; this.rankOptions = []; this.corpsOptions = []; this.tradeOptions = []; this.prefixOptions = [];
    }
}
