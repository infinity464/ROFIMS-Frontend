import { Component, EventEmitter, Input, OnInit, Output, ViewChild , inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { forkJoin } from 'rxjs';

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
import { SelectButtonModule } from 'primeng/selectbutton';

import { EmpService } from '@/services/emp-service';
import { buildUploadOwnerTag } from '@/shared/utils/upload-file-name.util';
import { MOServHistoryService } from '@/services/mo-serv-history.service';
import { CommonCodeService } from '@/services/common-code-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { FileReferencesFormComponent, FileRowData } from '@components/Common/file-references-form/file-references-form';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { PartialDatePipe } from '@/shared/pipes/partial-date.pipe';
import { DatePrecision, toDateOnlyWithPrecision } from '@/shared/utils/partial-date.util';

/** UI-level precision for the shared From/To selector. Maps to DB's 'D'|'M'|'Y' at the save boundary. */
type ServicePrecision = 'full' | 'month-year' | 'year';

const UI_TO_DB_PRECISION: Record<ServicePrecision, DatePrecision> = { 'full': 'D', 'month-year': 'M', 'year': 'Y' };
const DB_TO_UI_PRECISION: Record<DatePrecision, ServicePrecision> = { 'D': 'full', 'M': 'month-year', 'Y': 'year' };

interface OrgUnitOption {
    orgId: number;
    orgNameEN: string;
    locationEN?: string;
    districtId?: number | null;
}

export interface ServiceHistoryListRow {
    servHisID: number;
    orgUnitId: number | null;
    locationName: string | null;
    districtId: number | null;
    serviceFrom: string | null;
    serviceTo: string | null;
    /** Shared precision for From/To (DB codes). Read from serviceFromPrecision, falling back to serviceToPrecision. */
    servicePrecision: DatePrecision | null;
    appointment: string | null;
    auth: string | null;
    remarks: string | null;
    filesReferences?: string | null;
    documentPath?: string | null;
    documentFileName?: string | null;
    documentFile?: File | null;
}

@Component({
    selector: 'app-emp-service-history',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        InputTextModule,
        ButtonModule,
        Fluid,
        TooltipModule,
        TableModule,
        SelectModule,
        DialogModule,
        ConfirmDialogModule,
        DatePickerModule,
        SelectButtonModule,
        EmployeeSearchComponent,
        FileReferencesFormComponent,
        FlexibleDateDirective,
        PartialDatePipe
    ],
    providers: [ConfirmationService],
    templateUrl: './emp-service-history.html',
    styleUrl: './emp-service-history.scss'
})
export class EmpServiceHistory implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    @ViewChild('fileReferencesForm') fileReferencesForm!: any;

    /** When true (e.g. inside tab view), the "Service History in Mother Organization Entry" title and header actions are hidden. */
    @Input() hideTitle = false;

    @Input() embedMode = false;
    @Input() externalEmployeeId: number | null = null;
    @Output() saved = new EventEmitter<void>();
    @Output() cancelled = new EventEmitter<void>();

    fileRows: FileRowData[] = [];

    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    selectedOrgId: number | null = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;

    serviceList: ServiceHistoryListRow[] = [];
    isLoading = false;

    displayDialog = false;
    showInlineForm = false;
    isEditMode = false;
    isSaving = false;
    serviceForm!: FormGroup;
    editingServHisId: number | null = null;

    precisionOptions: { label: string; value: ServicePrecision }[] = [
        { label: 'Full date', value: 'full' },
        { label: 'Month & year', value: 'month-year' },
        { label: 'Year only', value: 'year' }
    ];

    appointmentOptions: { label: string; value: number }[] = [];
    yearOptions: { label: string; value: string }[] = [];
    orgUnitOptions: OrgUnitOption[] = [];
    districtOptions: { label: string; value: number }[] = [];

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private moServHistoryService: MOServHistoryService,
        private commonCodeService: CommonCodeService,
        private masterBasicSetupService: MasterBasicSetupService,
        private organizationService: OrganizationService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private route: ActivatedRoute,
        private router: Router
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.buildForm();
        this.buildYearOptions();
        this.loadDropdowns();
        this.loadDistricts();
        if (this.embedMode && this.externalEmployeeId != null) {
            this.mode = 'edit';
            this.isReadonly = false;
            this.selectedEmployeeId = this.externalEmployeeId;
            this.employeeFound = true;
            this.loadEmployeeById(this.externalEmployeeId);
            return;
        }
        this.checkRouteParams();
    }

    private buildYearOptions(): void {
        const currentYear = new Date().getFullYear();
        for (let y = currentYear; y >= 1980; y--) {
            this.yearOptions.push({ label: String(y), value: `${y}-01-01` });
        }
    }

    buildForm(): void {
        this.serviceForm = this.fb.group({
            servHisID: [null],
            orgUnitId: [null, Validators.required],
            locationName: [''],
            districtId: [null],
            serviceFrom: [null, Validators.required],
            serviceTo: [null],
            precision: ['full' as ServicePrecision],
            appointment: [null],
            auth: [''],
            remarks: ['']
        });
    }

    /** True when To < From at the current precision (so the inline error should render). */
    get toRangeInvalid(): boolean {
        const from = this.serviceForm?.get('serviceFrom')?.value;
        const to = this.serviceForm?.get('serviceTo')?.value;
        if (!from || !to) return false;
        const precision = (this.serviceForm?.get('precision')?.value ?? 'full') as ServicePrecision;
        const fromKey = this.precisionCompareKey(from, precision);
        const toKey = this.precisionCompareKey(to, precision);
        if (fromKey == null || toKey == null) return false;
        return toKey < fromKey;
    }

    private precisionCompareKey(value: Date | string, precision: ServicePrecision): number | null {
        const d = value instanceof Date ? value : new Date(value);
        if (isNaN(d.getTime())) return null;
        const y = d.getFullYear();
        const m = precision === 'year' ? 0 : d.getMonth();
        const day = precision === 'full' ? d.getDate() : 1;
        return y * 10000 + m * 100 + day;
    }

    private mapCommonCodeToOption(item: any): { label: string; value: number } {
        const label = item?.codeValueEN ?? item?.CodeValueEN ?? item?.displayCodeValueEN ?? item?.DisplayCodeValueEN ?? String(item?.codeId ?? item?.CodeId ?? '');
        const value = item?.codeId ?? item?.CodeId ?? 0;
        return { label, value };
    }

    loadDropdowns(): void {
        this.commonCodeService.getAllActiveCommonCodesType('AppointmentCategory').pipe(catchError(() => of([] as any[]))).subscribe({
            next: (appointment: any[]) => {
                const appList = Array.isArray(appointment) ? appointment : [];
                this.appointmentOptions = appList.map((item: any) => this.mapCommonCodeToOption(item));
            }
        });
    }

    /** District options from CommonCode 'District' type; shows English (Bangla). */
    loadDistricts(): void {
        this.masterBasicSetupService.getAllByType('District').pipe(catchError(() => of([] as any[]))).subscribe({
            next: (districts: any[]) => {
                const list = Array.isArray(districts) ? districts : [];
                this.districtOptions = list.map((d: any) => ({
                    label: d.codeValueBN ? `${d.codeValueEN} (${d.codeValueBN})` : d.codeValueEN,
                    value: d.codeId
                }));
            }
        });
    }

    loadOrgUnitsForMotherOrg(): void {
        if (this.selectedOrgId == null) {
            this.orgUnitOptions = [];
            return;
        }
        this.organizationService.getAllActiveOrgUnitByOrgId(this.selectedOrgId).subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                this.orgUnitOptions = arr.map((u: any) => ({
                    orgId: u.orgId ?? u.OrgId,
                    orgNameEN: u.orgNameEN ?? u.OrgNameEN ?? '',
                    locationEN: u.locationEN ?? u.LocationEN ?? '',
                    districtId: u.districtId ?? u.DistrictId ?? null
                }));
            },
            error: (err: any) => { this.orgUnitOptions = []; }
        });
    }

    private toDateOnly(d: Date | string | number | null): string | null {
        if (d == null) return null;
        if (typeof d === 'string') {
            const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) return d.substring(0, 10);
            const yearOnly = d.match(/^(\d{4})$/);
            if (yearOnly) return `${yearOnly[1]}-01-01`;
            const parsed = new Date(d);
            if (isNaN(parsed.getTime())) return null;
            return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
        }
        if (d instanceof Date) {
            if (isNaN(d.getTime())) return null;
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        return null;
    }

    onOrgUnitChangeInForm(): void {
        const orgUnitId = this.serviceForm.get('orgUnitId')?.value as number | null;
        if (orgUnitId == null) return;
        const unit = this.orgUnitOptions.find(u => u.orgId === orgUnitId);
        if (unit?.locationEN) this.serviceForm.patchValue({ locationName: unit.locationEN }, { emitEvent: false });
        // Auto-fill District from the selected unit's mapped district (same as serving-member-entry).
        if (unit?.districtId != null) this.serviceForm.patchValue({ districtId: unit.districtId }, { emitEvent: false });
    }

    getDistrictLabel(districtId: number | null): string {
        if (districtId == null) return '—';
        const opt = this.districtOptions.find(o => o.value === districtId);
        return opt ? opt.label : String(districtId);
    }

    checkRouteParams(): void {
        this.route.queryParams.subscribe(params => {
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
                    this.selectedOrgId = employee.orgId ?? employee.OrgId ?? employee.lastMotherUnit ?? employee.LastMotherUnit ?? null;
                    this.loadOrgUnitsForMotherOrg();
                    this.loadServiceList();
                }
            },
            error: err => console.error('Failed to load employee', err)
        });
    }

    loadServiceList(): void {
        if (!this.selectedEmployeeId) return;
        this.isLoading = true;
        this.moServHistoryService.getByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (list: any[]) => {
                const arr = Array.isArray(list) ? list : [];
                this.serviceList = arr
                    .filter((item: any) => (item.employeeID ?? item.EmployeeID) === this.selectedEmployeeId)
                    .map((item: any) => {
                        const filesRefs = (item as any).filesReferences ?? (item as any).FilesReferences ?? null;
                        let docName = '';
                        if (filesRefs && typeof filesRefs === 'string') {
                            try {
                                const refs = JSON.parse(filesRefs) as { fileName?: string }[];
                                if (Array.isArray(refs) && refs.length > 0) {
                                    docName = refs.length === 1 ? (refs[0].fileName ?? '') : `${refs.length} files`;
                                }
                            } catch { /* ignore */ }
                        }
                        return {
                            servHisID: item.servHisID ?? item.ServHisID,
                            orgUnitId: (item as any).orgUnitId ?? (item as any).OrgUnitId ?? null,
                            locationName: (item as any).locationName ?? (item as any).LocationName ?? null,
                            districtId: (item as any).districtId ?? (item as any).DistrictId ?? null,
                            serviceFrom: item.serviceFrom ?? (item as any).ServiceFrom ?? null,
                            serviceTo: item.serviceTo ?? (item as any).ServiceTo ?? null,
                            servicePrecision: (((item as any).serviceFromPrecision ?? (item as any).ServiceFromPrecision ?? (item as any).serviceToPrecision ?? (item as any).ServiceToPrecision) ?? null) as DatePrecision | null,
                            appointment: item.appointment ?? (item as any).Appointment ?? null,
                            auth: item.auth ?? (item as any).Auth ?? null,
                            remarks: item.remarks ?? (item as any).Remarks ?? null,
                            filesReferences: filesRefs,
                            documentPath: null,
                            documentFileName: docName || null,
                            documentFile: null as File | null
                        };
                    });
                this.isLoading = false;
            },
            error: (err: any) => { this.serviceList = []; this.isLoading = false; }
        });
    }

    getOrgUnitLabel(orgUnitId: number | null): string {
        if (orgUnitId == null) return '—';
        const u = this.orgUnitOptions.find(o => o.orgId === orgUnitId);
        return u ? u.orgNameEN : String(orgUnitId);
    }

    getOptionLabel(options: { label: string; value: number }[], value: number | null): string {
        if (value == null) return '—';
        const opt = options.find(o => o.value === value);
        return opt ? opt.label : String(value);
    }

    formatYearOnly(value: Date | string | null): string {
        if (value == null) return '—';
        const d = typeof value === 'string' ? new Date(value) : value;
        return isNaN(d.getTime()) ? '—' : String(d.getFullYear());
    }

    getPostingOrderLabel(row: ServiceHistoryListRow): string {
        if (row.documentFile?.name) return row.documentFile.name;
        if (row.documentPath) return row.documentPath.split(/[/\\]/).pop() ?? row.documentPath;
        return row.documentFileName ?? '—';
    }

    truncatePostingOrderName(row: ServiceHistoryListRow, maxLen: number = 20): string {
        const full = this.getPostingOrderLabel(row);
        if (full === '—') return full;
        return full.length <= maxLen ? full : full.slice(0, maxLen) + '...';
    }

    viewPostingOrder(row: ServiceHistoryListRow): void {
        if (row.documentFile) window.open(URL.createObjectURL(row.documentFile), '_blank');
        else if (row.documentPath) window.open(row.documentPath, '_blank');
    }

    downloadFirstFileFromRow(row: ServiceHistoryListRow): void {
        const refsJson = row.filesReferences;
        if (!refsJson || typeof refsJson !== 'string') return;
        try {
            const refs = JSON.parse(refsJson) as { FileId?: number; fileName?: string }[];
            if (Array.isArray(refs) && refs.length > 0 && refs[0].FileId) {
                this.onDownloadFile({ fileId: refs[0].FileId, fileName: refs[0].fileName || 'download' });
            }
        } catch { /* ignore */ }
    }

    onDialogHide(): void {
        this.fileRows = [];
    }

    openAddDialog(): void {
        if (this.selectedEmployeeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected.' });
            return;
        }
        this.isEditMode = false;
        this.editingServHisId = null;
        this.fileRows = [];
        this.serviceForm.reset({
            servHisID: null,
            orgUnitId: null,
            locationName: '',
            districtId: null,
            serviceFrom: null,
            serviceTo: null,
            precision: 'full',
            appointment: null,
            auth: '',
            remarks: ''
        });
        this.showInlineForm = true;
    }

    openEditDialog(row: ServiceHistoryListRow): void {
        this.isEditMode = true;
        this.editingServHisId = row.servHisID;
        const serviceFrom = row.serviceFrom ? new Date(row.serviceFrom) : null;
        const serviceTo = row.serviceTo ? new Date(row.serviceTo) : null;
        this.serviceForm.patchValue({
            servHisID: row.servHisID,
            orgUnitId: row.orgUnitId,
            locationName: row.locationName ?? '',
            districtId: row.districtId ?? null,
            serviceFrom,
            serviceTo,
            precision: DB_TO_UI_PRECISION[row.servicePrecision ?? 'D'],
            appointment: row.appointment,
            auth: row.auth ?? '',
            remarks: row.remarks ?? ''
        });
        // Load file references from FilesReferences JSON
        const refsJson = row.filesReferences;
        if (refsJson && typeof refsJson === 'string') {
            try {
                const refs = JSON.parse(refsJson) as { FileId?: number; fileName?: string }[];
                if (Array.isArray(refs)) {
                    this.fileRows = refs.map((r) => ({ displayName: r.fileName ?? '', file: null, fileId: r.FileId }));
                } else {
                    this.fileRows = [];
                }
            } catch {
                this.fileRows = [];
            }
        } else {
            this.fileRows = [];
        }
        this.showInlineForm = true;
    }

    onFileRowsChange(event: FileRowData[]): void {
        if (event && Array.isArray(event)) {
            this.fileRows = event;
        }
    }

    onDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: (err) => {
                console.error('Download failed', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to download file' });
            }
        });
    }

    saveService(): void {
        const employeeId = this.selectedEmployeeId;
        if (!employeeId) return;
        if (this.serviceForm.get('orgUnitId')?.invalid) {
            this.serviceForm.get('orgUnitId')?.markAsTouched();
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Organization Unit.' });
            return;
        }
        if (this.serviceForm.get('serviceFrom')?.invalid) {
            this.serviceForm.get('serviceFrom')?.markAsTouched();
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please enter the From date.' });
            return;
        }
        if (this.toRangeInvalid) {
            this.serviceForm.get('serviceTo')?.markAsTouched();
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'To date must be on or after From date.' });
            return;
        }
        const v = this.serviceForm.value;
        const now = new Date().toISOString();

        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const uiPrecision = (v.precision ?? 'full') as ServicePrecision;
        const dbPrecision = UI_TO_DB_PRECISION[uiPrecision];
        const serviceFrom = v.serviceFrom ? toDateOnlyWithPrecision(v.serviceFrom, dbPrecision) : null;
        const serviceTo = v.serviceTo ? toDateOnlyWithPrecision(v.serviceTo, dbPrecision) : null;

        const doSave = (filesReferencesJson: string | null) => {
            const payload = {
                servHisID: this.isEditMode ? (this.editingServHisId ?? 0) : 0,
                employeeID: employeeId,
                orgId: this.selectedOrgId ?? null,
                orgUnitId: v.orgUnitId ?? null,
                locationName: v.locationName || null,
                districtId: v.districtId ?? null,
                serviceFrom,
                serviceTo,
                // Store the selected precision on BOTH columns regardless of whether the date is set.
                // If a user later fills in the To date, the precision already matches the row's intent.
                serviceFromPrecision: dbPrecision,
                serviceToPrecision: dbPrecision,
                auth: v.auth || null,
                appointment: v.appointment ?? null,
                remarks: v.remarks ?? '',
                filesReferences: filesReferencesJson,
                createdBy: 'user',
                createdDate: now,
                lastUpdatedBy: 'user',
                lastupdate: now
            };
            this.isSaving = true;
            const req = this.isEditMode
                ? this.moServHistoryService.saveUpdate(payload)
                : this.moServHistoryService.save(payload);
            req.pipe(
                map((res: any) => {
                    const code = res?.statusCode ?? res?.StatusCode ?? 200;
                    if (code !== 200) throw new Error(res?.description ?? res?.Description ?? 'Save failed');
                    return res;
                }),
                catchError(err => {
                    this.messageService.add({ severity: 'error', summary: 'Save failed', detail: String(err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Save failed') });
                    return of(null);
                })
            ).subscribe(res => {
                this.isSaving = false;
                if (res != null) {
                    this.messageService.add({ severity: 'success', summary: 'Saved', detail: this.isEditMode ? 'Service history updated.' : 'Service history added.' });
                    this.showInlineForm = false;
                    this.loadServiceList();
                }
            });
        };

        if (filesToUpload.length > 0) {
            const uploads = filesToUpload.map((r: FileRowData) =>
                this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name, buildUploadOwnerTag(this.employeeBasicInfo?.rabid, this.selectedEmployeeId))
            );
            forkJoin(uploads).subscribe({
                next: (results: unknown) => {
                    const resultsArray = Array.isArray(results) ? results : [];
                    const newRefs = (resultsArray as { fileId: number; fileName: string }[]).map((r) => ({ FileId: r.fileId, fileName: r.fileName }));
                    const allRefs: { FileId: number; fileName: string }[] = [...existingRefs.map((r: { FileId: number; fileName: string }) => ({ FileId: r.FileId, fileName: r.fileName })), ...newRefs];
                    const filesReferencesJson = allRefs.length > 0 ? JSON.stringify(allRefs) : null;
                    doSave(filesReferencesJson);
                },
                error: (err) => {
                    console.error('Error uploading files', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to upload one or more files' });
                }
            });
            return;
        }

        const filesReferencesJson = existingRefs.length > 0 ? JSON.stringify(existingRefs) : null;
        doSave(filesReferencesJson);
    }

    confirmDelete(row: ServiceHistoryListRow): void {
        this.confirmationService.confirm({
            message: 'Delete this service history record?',
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Delete', severity: 'danger' },
            accept: () => this.deleteService(row)
        });
    }

    deleteService(row: ServiceHistoryListRow): void {
        this.moServHistoryService.delete(row.servHisID).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Service history deleted.' });
                this.loadServiceList();
            },
            error: err => this.messageService.add({ severity: 'error', summary: 'Error', detail: String(err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Delete failed') })
        });
    }

    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.selectedOrgId = employee.motherOrganization ?? (employee as any).orgId ?? (employee as any).OrgId ?? null;
        this.isReadonly = false;
        this.loadOrgUnitsForMotherOrg();
        if (this.selectedOrgId != null) {
            this.loadServiceList();
        } else {
            this.empService.getEmployeeById(employee.employeeID).subscribe({
                next: (full) => {
                    this.employeeBasicInfo = full;
                    this.selectedOrgId = (full as any).orgId ?? (full as any).OrgId ?? (full as any).lastMotherUnit ?? (full as any).LastMotherUnit ?? null;
                    this.loadOrgUnitsForMotherOrg();
                    this.loadServiceList();
                },
                error: (err: any) => this.loadServiceList()
            });
        }
    }

    onEmployeeSearchReset(): void { this.resetForm(); }
    enableEditMode(): void { this.mode = 'edit'; this.isReadonly = false; }
    cancelEdit(): void {
        if (!this.selectedEmployeeId) return;
        this.mode = 'view';
        this.isReadonly = true;
        this.loadServiceList();
        this.messageService.add({ severity: 'info', summary: 'Cancelled', detail: 'Changes discarded.' });
    }
    goBack(): void {
        if (this.embedMode) {
            this.cancelled.emit();
            return;
        }
        this.router.navigate(['/emp-list']);
    }

    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.selectedOrgId = null;
        this.orgUnitOptions = [];
        this.serviceList = [];
    }
}
