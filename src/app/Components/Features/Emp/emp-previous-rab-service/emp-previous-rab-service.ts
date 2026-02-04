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
import { PreviousRABServiceService } from '@/services/previous-rab-service.service';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';

@Component({
    selector: 'app-emp-previous-rab-service',
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
    templateUrl: './emp-previous-rab-service.html',
    styleUrl: './emp-previous-rab-service.scss'
})
export class EmpPreviousRabService implements OnInit {
    employeeFound: boolean = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly: boolean = false;

    serviceForm!: FormGroup;
    rabUnitOptions: { label: string; value: number }[] = [];
    appointmentOptions: { label: string; value: number }[] = [];
    /** Year dropdown: first day of year as value e.g. { label: '2022', value: '2022-01-01' } */
    yearOptions: { label: string; value: string }[] = [];

    /** Existing PreviousRABServiceID from API (used to detect deletes). */
    private existingServiceIds: number[] = [];
    isSaving: boolean = false;

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private previousRABService: PreviousRABServiceService,
        private commonCodeService: CommonCodeService,
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
        forkJoin({
            rabUnit: this.commonCodeService.getAllActiveCommonCodesType('RabUnit').pipe(catchError(() => of([] as any[]))),
            appointment: this.commonCodeService.getAllActiveCommonCodesType('AppointmentCategory').pipe(catchError(() => of([] as any[])))
        }).subscribe({
            next: ({ rabUnit, appointment }: { rabUnit: any[]; appointment: any[] }) => {
                const rabList = Array.isArray(rabUnit) ? rabUnit : [];
                this.rabUnitOptions = rabList.map((item: any) => this.mapCommonCodeToOption(item));
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
        previousRABServiceID: number | null,
        rabUnitCodeId: number | null,
        serviceFrom: string | Date | null,
        serviceTo: string | Date | null,
        appointment: number | null,
        postingAuth: string | null,
        remarks: string | null,
        documentPath?: string | null,
        documentFileName?: string | null,
        createdDate?: string | null,
        lastupdate?: string | null
    ): FormGroup {
        return this.fb.group({
            ser: [ser],
            previousRABServiceID: [previousRABServiceID],
            rabUnitCodeId: [rabUnitCodeId, Validators.required],
            serviceFrom: [serviceFrom],
            serviceTo: [serviceTo],
            appointment: [appointment],
            postingAuth: [postingAuth ?? ''],
            remarks: [remarks ?? ''],
            /** Display/editable file name (shown in File Name column). */
            documentFileName: [documentFileName ?? (documentPath ? documentPath.split(/[/\\]/).pop() ?? '' : '')],
            documentFile: [null as File | null],
            documentPath: [documentPath ?? null],
            createdDate: [createdDate ?? null],
            lastupdate: [lastupdate ?? null]
        });
    }

    /** Handle file select for Upload Posting Order; store in row for future API integration. */
    onPostingOrderSelect(event: { files: File[] }, rowIndex: number): void {
        const file = event.files?.[0] ?? null;
        this.rows.at(rowIndex).patchValue({ documentFile: file });
    }

    /** Display name for Upload Posting Order (file name or saved path). */
    getPostingOrderLabel(row: FormGroup): string {
        const file = row.get('documentFile')?.value as File | null;
        const path = row.get('documentPath')?.value as string | null;
        if (file?.name) return file.name;
        if (path) return path.split(/[/\\]/).pop() ?? path;
        return '—';
    }

    /** Truncate file name for display (e.g. "5b96402f50a0819..."). */
    truncatePostingOrderName(row: FormGroup, maxLen: number = 20): string {
        const full = this.getPostingOrderLabel(row);
        if (full === '—') return full;
        return full.length <= maxLen ? full : full.slice(0, maxLen) + '...';
    }

    /** Clear selected posting order file in row. */
    clearPostingOrder(rowIndex: number): void {
        this.rows.at(rowIndex).patchValue({ documentFile: null, documentFileName: '' });
    }

    /** Open posting order file in new tab (for File object only). */
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
        const ser = this.rows.length + 1;
        this.rows.push(
            this.createRow(ser, null, null, null, null, null, '', '', null, '', null, null)
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
                    this.loadServicesForEmployee(this.selectedEmployeeId!);
                }
            },
            error: err => console.error('Failed to load employee', err)
        });
    }

    loadServicesForEmployee(employeeId: number): void {
        this.rows.clear();
        this.existingServiceIds = [];
        this.previousRABService.getByEmployeeId(employeeId).subscribe({
            next: (list: any[]) => {
                const arr = Array.isArray(list) ? list : [];
                let ser = 1;
                for (const item of arr) {
                    const id = item.previousRABServiceID ?? item.PreviousRABServiceID;
                    const empId = item.employeeID ?? item.EmployeeID;
                    if (empId !== employeeId) continue;
                    this.existingServiceIds.push(id);
                    const from = item.serviceFrom ?? item.ServiceFrom;
                    const to = item.serviceTo ?? item.ServiceTo;
                    const fromStr = from != null ? (typeof from === 'string' ? from : new Date(from).toISOString().substring(0, 10)) : null;
                    const toStr = to != null ? (typeof to === 'string' ? to : new Date(to).toISOString().substring(0, 10)) : null;
                    const docPath = item.documentPath ?? item.DocumentPath ?? null;
                    const docName = docPath ? (docPath.split(/[/\\]/).pop() ?? '') : '';
                    this.rows.push(
                        this.createRow(
                            ser++,
                            id,
                            item.rabUnitCodeId ?? item.RABUnitCodeId ?? null,
                            fromStr,
                            toStr,
                            item.appointment ?? item.Appointment ?? null,
                            item.postingAuth ?? item.PostingAuth ?? null,
                            item.remarks ?? item.Remarks ?? null,
                            docPath,
                            docName,
                            item.createdDate ?? item.CreatedDate ?? null,
                            item.lastupdate ?? item.Lastupdate ?? null
                        )
                    );
                }
            },
            error: () => {
                this.rows.clear();
                this.existingServiceIds = [];
            }
        });
    }

    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.isReadonly = false;
        this.loadServicesForEmployee(employee.employeeID);
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
        if (!this.selectedEmployeeId) return;
        this.mode = 'view';
        this.isReadonly = true;
        this.loadServicesForEmployee(this.selectedEmployeeId);
        this.messageService.add({ severity: 'info', summary: 'Cancelled', detail: 'Changes discarded.' });
    }

    goBack(): void {
        this.router.navigate(['/emp-list']);
    }

    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.rows.clear();
        this.existingServiceIds = [];
    }

    getOptionLabel(options: { label: string; value: number }[], value: number | null): string {
        if (value == null) return '—';
        const opt = options.find(o => o.value === value);
        return opt ? opt.label : String(value);
    }

    /** Show only year in view mode (API stores first day of year e.g. 2026-01-01). */
    formatYearOnly(value: Date | string | null): string {
        if (value == null) return '—';
        if (typeof value === 'number' && !isNaN(value)) return String(value);
        const d = typeof value === 'string' ? new Date(value) : value;
        return isNaN(d.getTime()) ? '—' : String(d.getFullYear());
    }

    saveData(): void {
        if (!this.selectedEmployeeId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected.' });
            return;
        }
        const controls = this.rows.controls;
        const rowsMissingRabUnit: number[] = [];
        controls.forEach((c, idx) => {
            const val = c.get('rabUnitCodeId')?.value;
            if (val == null || val === '') {
                rowsMissingRabUnit.push(idx + 1);
                c.get('rabUnitCodeId')?.markAsTouched();
            }
        });
        if (rowsMissingRabUnit.length > 0) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Validation',
                detail: rowsMissingRabUnit.length === 1
                    ? `Please select RAB Wing/Battalion Name for row ${rowsMissingRabUnit[0]}.`
                    : `Please select RAB Wing/Battalion Name for row(s) ${rowsMissingRabUnit.join(', ')}.`
            });
            return;
        }
        const currentIds = new Set(
            controls.map(c => c.get('previousRABServiceID')?.value).filter((id): id is number => id != null)
        );
        const toDelete = this.existingServiceIds.filter(id => !currentIds.has(id));

        const now = new Date().toISOString();
        const deleteCalls = toDelete.map(id =>
            this.previousRABService.delete(this.selectedEmployeeId!, id).pipe(catchError(() => of(null)))
        );

        let nextNewId = this.existingServiceIds.length > 0 ? Math.max(...this.existingServiceIds) + 1 : 1;
        const saveCalls: ReturnType<PreviousRABServiceService['saveUpdate']>[] = [];
        for (const c of controls) {
            const prevId = c.get('previousRABServiceID')?.value as number | null;
            const id = prevId != null ? prevId : nextNewId++;
            const createdDate = c.get('createdDate')?.value as string | null;
            const lastupdateVal = c.get('lastupdate')?.value as string | null;
            saveCalls.push(
                this.previousRABService.saveUpdate({
                    employeeID: this.selectedEmployeeId!,
                    previousRABServiceID: id,
                    rabUnitCodeId: c.get('rabUnitCodeId')?.value ?? null,
                    serviceFrom: this.toDateOnly(c.get('serviceFrom')?.value),
                    serviceTo: this.toDateOnly(c.get('serviceTo')?.value),
                    appointment: c.get('appointment')?.value ?? null,
                    postingAuth: c.get('postingAuth')?.value || null,
                    remarks: c.get('remarks')?.value || null,
                    createdBy: 'user',
                    createdDate: createdDate ?? now,
                    lastUpdatedBy: 'user',
                    lastupdate: lastupdateVal ?? now
                }).pipe(
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
            );
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
                this.existingServiceIds = this.rows.controls
                    .map(c => c.get('previousRABServiceID')?.value as number | null)
                    .filter((id): id is number => id != null);
                this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Previous RAB service saved successfully.' });
                this.loadServicesForEmployee(this.selectedEmployeeId!);
            },
            error: (err) => {
                this.isSaving = false;
                const msg = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Failed to save.';
                this.messageService.add({ severity: 'error', summary: 'Error', detail: String(msg) });
            }
        });
    }
}
