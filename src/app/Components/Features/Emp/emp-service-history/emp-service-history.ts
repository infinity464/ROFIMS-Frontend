import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    FormArray,
    FormBuilder,
    FormGroup,
    FormsModule,
    ReactiveFormsModule,
    Validators
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { MessageService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { FileUploadModule } from 'primeng/fileupload';

import { EmpService } from '@/services/emp-service';
import { MOServHistoryService } from '@/services/mo-serv-history.service';
import { CommonCodeService } from '@/services/common-code-service';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';

/** Minimal shape for org unit dropdown (from Organization Unit setup). */
interface OrgUnitOption {
    orgId: number;
    orgNameEN: string;
    locationEN?: string;
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
        EmployeeSearchComponent
    ],
    templateUrl: './emp-service-history.html',
    styleUrl: './emp-service-history.scss'
})
export class EmpServiceHistory implements OnInit {
    employeeFound: boolean = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    /** Org id from selected employee (used to load/filter MO service history). */
    selectedOrgId: number | null = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly: boolean = false;

    serviceForm!: FormGroup;
    appointmentOptions: { label: string; value: number }[] = [];
    /** Year dropdown: first day of year as value e.g. { label: '2022', value: '2022-01-01' } */
    yearOptions: { label: string; value: string }[] = [];
    /** Organization units (children of selected mother org); loaded when user searches and selectedOrgId is set. */
    orgUnitOptions: OrgUnitOption[] = [];

    /** Existing ServHisID from API (used to detect deletes). */
    private existingServHisIds: number[] = [];
    isSaving: boolean = false;

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private moServHistoryService: MOServHistoryService,
        private commonCodeService: CommonCodeService,
        private organizationService: OrganizationService,
        private messageService: MessageService,
        private route: ActivatedRoute,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.buildForm();
        this.buildYearOptions();
        this.loadDropdowns();
        this.checkRouteParams();
    }

    /** Build year dropdown options (first day of year stored as value for API). Max year = current year, then down. */
    private buildYearOptions(): void {
        const currentYear = new Date().getFullYear();
        const startYear = 1980;
        this.yearOptions = [];
        for (let y = currentYear; y >= startYear; y--) {
            this.yearOptions.push({ label: String(y), value: `${y}-01-01` });
        }
    }

    buildForm(): void {
        this.serviceForm = this.fb.group({
            rows: this.fb.array([])
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

    get rows(): FormArray {
        return this.serviceForm.get('rows') as FormArray;
    }

    /** Convert to YYYY-MM-DD for API; year-only becomes first day of year (YYYY-01-01). */
    private toDateOnly(d: Date | string | number | null): string | null {
        if (d == null) return null;
        if (typeof d === 'number' && !isNaN(d) && d >= 1900 && d <= 2100) return `${d}-01-01`;
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

    createRow(
        ser: number,
        servHisID: number | null,
        employeeID: number | null,
        orgId: number | null,
        orgUnitId: number | null,
        locationName: string | null,
        serviceFrom: string | Date | null,
        serviceTo: string | Date | null,
        auth: string | null,
        appointment: number | null,
        remarks: string | null,
        documentPath?: string | null,
        documentFileName?: string | null,
        createdDate?: string | null,
        lastupdate?: string | null
    ): FormGroup {
        return this.fb.group({
            ser: [ser],
            servHisID: [servHisID],
            employeeID: [employeeID],
            orgId: [orgId],
            orgUnitId: [orgUnitId, Validators.required],
            locationName: [locationName ?? ''],
            serviceFrom: [serviceFrom],
            serviceTo: [serviceTo],
            auth: [auth ?? ''],
            appointment: [appointment],
            remarks: [remarks ?? ''],
            documentFile: [null as File | null],
            documentPath: [documentPath ?? null],
            documentFileName: [documentFileName ?? (documentPath ? documentPath.split(/[/\\]/).pop() ?? '' : '')],
            createdDate: [createdDate ?? null],
            lastupdate: [lastupdate ?? null]
        });
    }

    /** Load organization units for the selected mother org (selectedOrgId). Call when employee is found. */
    loadOrgUnitsForMotherOrg(): void {
        if (this.selectedOrgId == null) {
            this.orgUnitOptions = [];
            return;
        }
        this.organizationService.getAllActiveOrgUnitByOrgId(this.selectedOrgId).subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                // Normalize for API returning PascalCase (OrgId, OrgNameEN, LocationEN)
                this.orgUnitOptions = arr.map((u: any) => ({
                    orgId: u.orgId ?? u.OrgId,
                    orgNameEN: u.orgNameEN ?? u.OrgNameEN ?? '',
                    locationEN: u.locationEN ?? u.LocationEN ?? ''
                }));
            },
            error: () => {
                this.orgUnitOptions = [];
            }
        });
    }

    /** When user selects an organization unit, fill location from that unit's LocationEN. */
    onOrgUnitChange(rowIndex: number): void {
        const row = this.rows.at(rowIndex);
        const orgUnitId = row.get('orgUnitId')?.value as number | null;
        if (orgUnitId == null) return;
        const unit = this.orgUnitOptions.find(u => u.orgId === orgUnitId);
        if (!unit) return;
        const loc = unit.locationEN ?? '';
        row.patchValue({ locationName: loc }, { emitEvent: false });
    }

    onPostingOrderSelect(event: { files: File[] }, rowIndex: number): void {
        const file = event.files?.[0] ?? null;
        this.rows.at(rowIndex).patchValue({ documentFile: file });
    }

    getPostingOrderLabel(row: FormGroup): string {
        const file = row.get('documentFile')?.value as File | null;
        const path = row.get('documentPath')?.value as string | null;
        if (file?.name) return file.name;
        if (path) return path.split(/[/\\]/).pop() ?? path;
        return '—';
    }

    truncatePostingOrderName(row: FormGroup, maxLen: number = 20): string {
        const full = this.getPostingOrderLabel(row);
        if (full === '—') return full;
        return full.length <= maxLen ? full : full.slice(0, maxLen) + '...';
    }

    clearPostingOrder(rowIndex: number): void {
        this.rows.at(rowIndex).patchValue({ documentFile: null, documentFileName: '' });
    }

    viewPostingOrder(row: FormGroup): void {
        const file = row.get('documentFile')?.value as File | null;
        const path = row.get('documentPath')?.value as string | null;
        if (file) {
            const url = URL.createObjectURL(file);
            window.open(url, '_blank');
        } else if (path) {
            window.open(path, '_blank');
        }
    }

    hasPostingOrderFile(row: FormGroup): boolean {
        const file = row.get('documentFile')?.value as File | null;
        const path = row.get('documentPath')?.value as string | null;
        return !!(file?.name || path);
    }

    addRow(): void {
        if (this.selectedEmployeeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected.' });
            return;
        }
        const ser = this.rows.length + 1;
        this.rows.push(
            this.createRow(ser, null, this.selectedEmployeeId, this.selectedOrgId, null, '', null, null, '', null, '', null, '', null, null)
        );
    }

    removeRow(index: number): void {
        this.rows.removeAt(index);
        this.rows.controls.forEach((ctrl, i) => ctrl.get('ser')?.setValue(i + 1));
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
                    this.loadHistoryForEmployee(employeeId);
                }
            },
            error: err => console.error('Failed to load employee', err)
        });
    }

    loadHistoryForEmployee(employeeId: number): void {
        this.rows.clear();
        this.existingServHisIds = [];
        this.moServHistoryService.getByEmployeeId(employeeId).subscribe({
            next: (list: any[]) => {
                const arr = Array.isArray(list) ? list : [];
                let ser = 1;
                for (const item of arr) {
                    const id = item.servHisID ?? item.ServHisID;
                    const itemEmpId = item.employeeID ?? (item as any).EmployeeID;
                    if (itemEmpId !== employeeId) continue;
                    this.existingServHisIds.push(id);
                    const itemOrgId = item.orgId ?? (item as any).OrgId ?? null;
                    const from = item.serviceFrom ?? (item as any).ServiceFrom;
                    const to = item.serviceTo ?? (item as any).ServiceTo;
                    const fromStr = from != null ? (typeof from === 'string' ? from : new Date(from).toISOString().substring(0, 10)) : null;
                    const toStr = to != null ? (typeof to === 'string' ? to : new Date(to).toISOString().substring(0, 10)) : null;
                    const docPath = (item as any).documentPath ?? (item as any).DocumentPath ?? null;
                    const docName = docPath ? (docPath.split(/[/\\]/).pop() ?? '') : '';
                    const orgUnitId = (item as any).orgUnitId ?? (item as any).OrgUnitId ?? null;
                    const locationName = (item as any).locationName ?? (item as any).LocationName ?? null;
                    this.rows.push(
                        this.createRow(
                            ser++,
                            id,
                            itemEmpId,
                            itemOrgId,
                            orgUnitId,
                            locationName ?? '',
                            fromStr,
                            toStr,
                            item.auth ?? (item as any).Auth ?? null,
                            item.appointment ?? (item as any).Appointment ?? null,
                            item.remarks ?? (item as any).Remarks ?? null,
                            docPath,
                            docName,
                            item.createdDate ?? (item as any).CreatedDate ?? null,
                            item.lastupdate ?? (item as any).Lastupdate ?? null
                        )
                    );
                }
            },
            error: () => {
                this.rows.clear();
                this.existingServHisIds = [];
            }
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
            this.loadHistoryForEmployee(employee.employeeID);
        } else {
            this.empService.getEmployeeById(employee.employeeID).subscribe({
                next: (full) => {
                    this.employeeBasicInfo = full;
                    this.selectedOrgId = (full as any).orgId ?? (full as any).OrgId ?? (full as any).lastMotherUnit ?? (full as any).LastMotherUnit ?? (full as any).motherOrganization ?? (full as any).MotherOrganization ?? null;
                    this.loadOrgUnitsForMotherOrg();
                    this.loadHistoryForEmployee(employee.employeeID);
                },
                error: () => this.loadHistoryForEmployee(employee.employeeID)
            });
        }
    }

    onEmployeeSearchReset(): void {
        this.resetForm();
    }

    enableEditMode(): void {
        this.mode = 'edit';
        this.isReadonly = false;
    }

    enableSearchEditMode(): void {
        this.isReadonly = false;
    }

    cancelEdit(): void {
        const empId = this.selectedEmployeeId;
        if (empId == null) return;
        this.mode = 'view';
        this.isReadonly = true;
        this.loadHistoryForEmployee(empId);
        this.messageService.add({ severity: 'info', summary: 'Cancelled', detail: 'Changes discarded.' });
    }

    goBack(): void {
        this.router.navigate(['/emp-list']);
    }

    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.selectedOrgId = null;
        this.orgUnitOptions = [];
        this.rows.clear();
        this.existingServHisIds = [];
    }

    getOptionLabel(options: { label: string; value: number }[], value: number | null): string {
        if (value == null) return '—';
        const opt = options.find(o => o.value === value);
        return opt ? opt.label : String(value);
    }

    /** Get organization unit display name by orgId (from orgUnitOptions). */
    getOrgUnitLabel(orgUnitId: number | null): string {
        if (orgUnitId == null) return '—';
        const u = this.orgUnitOptions.find(o => o.orgId === orgUnitId);
        return u ? u.orgNameEN : String(orgUnitId);
    }

    /** Show only year in view mode (API stores first day of year e.g. 2026-01-01). */
    formatYearOnly(value: Date | string | null): string {
        if (value == null) return '—';
        if (typeof value === 'number' && !isNaN(value)) return String(value);
        const d = typeof value === 'string' ? new Date(value) : value;
        return isNaN(d.getTime()) ? '—' : String(d.getFullYear());
    }

    saveData(): void {
        if (this.selectedEmployeeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected.' });
            return;
        }
        const controls = this.rows.controls;
        const rowsMissingOrgUnit: number[] = [];
        controls.forEach((c, idx) => {
            const val = c.get('orgUnitId')?.value;
            if (val == null || val === '') {
                rowsMissingOrgUnit.push(idx + 1);
                c.get('orgUnitId')?.markAsTouched();
            }
        });
        if (rowsMissingOrgUnit.length > 0) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Validation',
                detail: rowsMissingOrgUnit.length === 1
                    ? 'Please select Organization Unit for row ' + rowsMissingOrgUnit[0] + '.'
                    : 'Please select Organization Unit for row(s) ' + rowsMissingOrgUnit.join(', ') + '.'
            });
            return;
        }
        const currentIds = new Set(
            controls.map(c => c.get('servHisID')?.value).filter((id): id is number => id != null && id > 0)
        );
        const toDelete = this.existingServHisIds.filter(id => !currentIds.has(id));

        const now = new Date().toISOString();
        const deleteCalls = toDelete.map(id =>
            this.moServHistoryService.delete(id).pipe(catchError(() => of(null)))
        );

        let nextNewId = 0;
        const saveCalls: ReturnType<MOServHistoryService['save'] | MOServHistoryService['saveUpdate']>[] = [];
        for (const c of controls) {
            const servHisID = c.get('servHisID')?.value as number | null;
            const id = servHisID != null && servHisID > 0 ? servHisID : nextNewId++;
            const createdDate = c.get('createdDate')?.value as string | null;
            const lastupdateVal = c.get('lastupdate')?.value as string | null;
            const isNew = servHisID == null || servHisID <= 0;
            const payload = {
                servHisID: isNew ? 0 : servHisID,
                employeeID: this.selectedEmployeeId,
                orgId: c.get('orgId')?.value ?? this.selectedOrgId ?? null,
                orgUnitId: c.get('orgUnitId')?.value ?? null,
                locationName: c.get('locationName')?.value || null,
                serviceFrom: this.toDateOnly(c.get('serviceFrom')?.value),
                serviceTo: this.toDateOnly(c.get('serviceTo')?.value),
                auth: c.get('auth')?.value || null,
                appointment: c.get('appointment')?.value ?? null,
                remarks: c.get('remarks')?.value ?? '',
                createdBy: 'user',
                createdDate: createdDate ?? now,
                lastUpdatedBy: 'user',
                lastupdate: lastupdateVal ?? now
            };
            const call = isNew
                ? this.moServHistoryService.save(payload).pipe(
                    map((res: any) => {
                        const code = res?.statusCode ?? res?.StatusCode ?? 200;
                        if (code !== 200) throw new Error(res?.description ?? res?.Description ?? 'Save failed');
                        return res;
                    }),
                    catchError((err) => {
                        const msg = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Save failed';
                        this.messageService.add({ severity: 'error', summary: 'Save failed', detail: String(msg) });
                        return of(null);
                    })
                )
                : this.moServHistoryService.saveUpdate(payload).pipe(
                    map((res: any) => {
                        const code = res?.statusCode ?? res?.StatusCode ?? 200;
                        if (code !== 200) throw new Error(res?.description ?? res?.Description ?? 'Save failed');
                        return res;
                    }),
                    catchError((err) => {
                        const msg = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Save failed';
                        this.messageService.add({ severity: 'error', summary: 'Save failed', detail: String(msg) });
                        return of(null);
                    })
                );
            saveCalls.push(call);
        }

        const allCalls = [...deleteCalls, ...saveCalls];
        if (allCalls.length === 0) {
            this.messageService.add({ severity: 'info', summary: 'Info', detail: 'No changes to save.' });
            return;
        }

        this.isSaving = true;
        forkJoin(allCalls).subscribe({
            next: (results) => {
                this.isSaving = false;
                const failed = results?.some((r: any) => r == null) ?? false;
                if (failed) return;
                this.existingServHisIds = this.rows.controls
                    .map(c => c.get('servHisID')?.value as number | null)
                    .filter((id): id is number => id != null && id > 0);
                this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Service history saved successfully.' });
                this.loadHistoryForEmployee(this.selectedEmployeeId!);
            },
            error: (err) => {
                this.isSaving = false;
                const msg = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Failed to save.';
                this.messageService.add({ severity: 'error', summary: 'Error', detail: String(msg) });
            }
        });
    }
}
