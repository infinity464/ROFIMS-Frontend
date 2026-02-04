import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { FileUploadModule } from 'primeng/fileupload';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { EmpService } from '@/services/emp-service';
import { MOServHistoryService } from '@/services/mo-serv-history.service';
import { CommonCodeService } from '@/services/common-code-service';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';

interface OrgUnitOption {
    orgId: number;
    orgNameEN: string;
    locationEN?: string;
}

export interface ServiceHistoryListRow {
    servHisID: number;
    orgUnitId: number | null;
    locationName: string | null;
    serviceFrom: string | null;
    serviceTo: string | null;
    appointment: number | null;
    auth: string | null;
    remarks: string | null;
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
        FileUploadModule,
        DialogModule,
        ConfirmDialogModule,
        EmployeeSearchComponent
    ],
    providers: [ConfirmationService],
    templateUrl: './emp-service-history.html',
    styleUrl: './emp-service-history.scss'
})
export class EmpServiceHistory implements OnInit {
    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    selectedOrgId: number | null = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;

    serviceList: ServiceHistoryListRow[] = [];
    isLoading = false;

    displayDialog = false;
    isEditMode = false;
    isSaving = false;
    serviceForm!: FormGroup;
    editingServHisId: number | null = null;

    appointmentOptions: { label: string; value: number }[] = [];
    yearOptions: { label: string; value: string }[] = [];
    orgUnitOptions: OrgUnitOption[] = [];

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private moServHistoryService: MOServHistoryService,
        private commonCodeService: CommonCodeService,
        private organizationService: OrganizationService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private route: ActivatedRoute,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.buildForm();
        this.buildYearOptions();
        this.loadDropdowns();
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
            serviceFrom: [null],
            serviceTo: [null],
            appointment: [null],
            auth: [''],
            remarks: [''],
            documentFileName: [''],
            documentFile: [null as File | null],
            documentPath: [null as string | null]
        });
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
                    locationEN: u.locationEN ?? u.LocationEN ?? ''
                }));
            },
            error: () => { this.orgUnitOptions = []; }
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
            return isNaN(parsed.getTime()) ? null : parsed.toISOString().substring(0, 10);
        }
        if (d instanceof Date) return isNaN(d.getTime()) ? null : d.toISOString().substring(0, 10);
        return null;
    }

    onOrgUnitChangeInForm(): void {
        const orgUnitId = this.serviceForm.get('orgUnitId')?.value as number | null;
        if (orgUnitId == null) return;
        const unit = this.orgUnitOptions.find(u => u.orgId === orgUnitId);
        if (unit?.locationEN) this.serviceForm.patchValue({ locationName: unit.locationEN }, { emitEvent: false });
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
                        const docPath = (item as any).documentPath ?? (item as any).DocumentPath ?? null;
                        const docName = docPath ? (docPath.split(/[/\\]/).pop() ?? '') : '';
                        return {
                            servHisID: item.servHisID ?? item.ServHisID,
                            orgUnitId: (item as any).orgUnitId ?? (item as any).OrgUnitId ?? null,
                            locationName: (item as any).locationName ?? (item as any).LocationName ?? null,
                            serviceFrom: item.serviceFrom ?? (item as any).ServiceFrom ?? null,
                            serviceTo: item.serviceTo ?? (item as any).ServiceTo ?? null,
                            appointment: item.appointment ?? (item as any).Appointment ?? null,
                            auth: item.auth ?? (item as any).Auth ?? null,
                            remarks: item.remarks ?? (item as any).Remarks ?? null,
                            documentPath: docPath,
                            documentFileName: docName,
                            documentFile: null as File | null
                        };
                    });
                this.isLoading = false;
            },
            error: () => { this.serviceList = []; this.isLoading = false; }
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

    hasPostingOrderFileInForm(): boolean {
        const file = this.serviceForm.get('documentFile')?.value as File | null;
        const path = this.serviceForm.get('documentPath')?.value as string | null;
        return !!(file?.name || path);
    }

    getPostingOrderLabelInForm(): string {
        const file = this.serviceForm.get('documentFile')?.value as File | null;
        const path = this.serviceForm.get('documentPath')?.value as string | null;
        if (file?.name) return file.name;
        if (path) return path.split(/[/\\]/).pop() ?? path;
        return '—';
    }

    viewPostingOrderInForm(): void {
        const file = this.serviceForm.get('documentFile')?.value as File | null;
        const path = this.serviceForm.get('documentPath')?.value as string | null;
        if (file) window.open(URL.createObjectURL(file), '_blank');
        else if (path) window.open(path, '_blank');
    }

    clearPostingOrderInForm(): void {
        this.serviceForm.patchValue({ documentFile: null, documentPath: null, documentFileName: '' });
    }

    onPostingOrderSelectInForm(event: { files: File[] }): void {
        this.serviceForm.patchValue({ documentFile: event.files?.[0] ?? null });
    }

    onDialogHide(): void {
        this.serviceForm.patchValue({ documentFile: null });
    }

    openAddDialog(): void {
        if (this.selectedEmployeeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected.' });
            return;
        }
        this.isEditMode = false;
        this.editingServHisId = null;
        this.serviceForm.reset({
            servHisID: null,
            orgUnitId: null,
            locationName: '',
            serviceFrom: null,
            serviceTo: null,
            appointment: null,
            auth: '',
            remarks: '',
            documentFileName: '',
            documentFile: null,
            documentPath: null
        });
        this.displayDialog = true;
    }

    openEditDialog(row: ServiceHistoryListRow): void {
        this.isEditMode = true;
        this.editingServHisId = row.servHisID;
        const serviceFrom = row.serviceFrom ? (typeof row.serviceFrom === 'string' ? row.serviceFrom : new Date(row.serviceFrom).toISOString().substring(0, 10)) : null;
        const serviceTo = row.serviceTo ? (typeof row.serviceTo === 'string' ? row.serviceTo : new Date(row.serviceTo).toISOString().substring(0, 10)) : null;
        this.serviceForm.patchValue({
            servHisID: row.servHisID,
            orgUnitId: row.orgUnitId,
            locationName: row.locationName ?? '',
            serviceFrom,
            serviceTo,
            appointment: row.appointment,
            auth: row.auth ?? '',
            remarks: row.remarks ?? '',
            documentFileName: row.documentFileName ?? '',
            documentFile: null,
            documentPath: row.documentPath ?? null
        });
        this.displayDialog = true;
    }

    saveService(): void {
        if (!this.selectedEmployeeId) return;
        if (this.serviceForm.get('orgUnitId')?.invalid) {
            this.serviceForm.get('orgUnitId')?.markAsTouched();
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Organization Unit.' });
            return;
        }
        const v = this.serviceForm.value;
        const now = new Date().toISOString();
        const payload = {
            servHisID: this.isEditMode ? (this.editingServHisId ?? 0) : 0,
            employeeID: this.selectedEmployeeId,
            orgId: this.selectedOrgId ?? null,
            orgUnitId: v.orgUnitId ?? null,
            locationName: v.locationName || null,
            serviceFrom: this.toDateOnly(v.serviceFrom),
            serviceTo: this.toDateOnly(v.serviceTo),
            auth: v.auth || null,
            appointment: v.appointment ?? null,
            remarks: v.remarks ?? '',
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
                this.displayDialog = false;
                this.loadServiceList();
            }
        });
    }

    confirmDelete(row: ServiceHistoryListRow): void {
        this.confirmationService.confirm({
            message: 'Delete this service history record?',
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
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
                error: () => this.loadServiceList()
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
    goBack(): void { this.router.navigate(['/emp-list']); }

    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.selectedOrgId = null;
        this.orgUnitOptions = [];
        this.serviceList = [];
    }
}
