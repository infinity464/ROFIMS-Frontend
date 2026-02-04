import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
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
import { CheckboxModule } from 'primeng/checkbox';

import { EmpService } from '@/services/emp-service';
import { PreviousRABServiceService } from '@/services/previous-rab-service.service';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';

/** List row for display in table (includes document display fields) */
export interface PreviousRABServiceListRow {
    previousRABServiceID: number;
    rabUnitCodeId: number | null;
    serviceFrom: string | null;
    serviceTo: string | null;
    isCurrentlyActive: boolean;
    appointment: number | null;
    postingAuth: string | null;
    remarks: string | null;
    documentPath?: string | null;
    documentFileName?: string | null;
    documentFile?: File | null;
}

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
        DialogModule,
        ConfirmDialogModule,
        CheckboxModule,
        EmployeeSearchComponent
    ],
    providers: [ConfirmationService],
    templateUrl: './emp-previous-rab-service.html',
    styleUrl: './emp-previous-rab-service.scss'
})
export class EmpPreviousRabService implements OnInit {
    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;

    serviceList: PreviousRABServiceListRow[] = [];
    isLoading = false;

    displayDialog = false;
    isEditMode = false;
    isSaving = false;
    serviceForm!: FormGroup;
    editingServiceId: number | null = null;

    rabUnitOptions: { label: string; value: number }[] = [];
    appointmentOptions: { label: string; value: number }[] = [];
    yearOptions: { label: string; value: string }[] = [];

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private previousRABService: PreviousRABServiceService,
        private commonCodeService: CommonCodeService,
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
        const startYear = 1980;
        this.yearOptions = [];
        for (let y = currentYear; y >= startYear; y--) {
            this.yearOptions.push({ label: String(y), value: `${y}-01-01` });
        }
    }

    buildForm(): void {
        this.serviceForm = this.fb.group({
            previousRABServiceID: [null],
            rabUnitCodeId: [null, Validators.required],
            serviceFrom: [null],
            serviceTo: [null],
            isCurrentlyActive: [false],
            appointment: [null],
            postingAuth: [''],
            remarks: [''],
            documentFileName: [''],
            documentFile: [null as File | null],
            documentPath: [null as string | null]
        });
        this.serviceForm.get('isCurrentlyActive')?.valueChanges.subscribe(active => {
            const toControl = this.serviceForm.get('serviceTo');
            if (toControl) {
                if (active) toControl.disable(); else toControl.enable();
            }
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
                    this.loadServiceList();
                }
            },
            error: err => console.error('Failed to load employee', err)
        });
    }

    loadServiceList(): void {
        if (!this.selectedEmployeeId) return;
        this.isLoading = true;
        this.previousRABService.getByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (list: any[]) => {
                const arr = Array.isArray(list) ? list : [];
                this.serviceList = arr
                    .filter((item: any) => (item.employeeID ?? item.EmployeeID) === this.selectedEmployeeId)
                    .map((item: any) => {
                        const docPath = item.documentPath ?? item.DocumentPath ?? null;
                        const docName = docPath ? (docPath.split(/[/\\]/).pop() ?? '') : '';
                        const isActive = item.isCurrentlyActive ?? item.IsCurrentlyActive;
                        return {
                            previousRABServiceID: item.previousRABServiceID ?? item.PreviousRABServiceID,
                            rabUnitCodeId: item.rabUnitCodeId ?? item.RABUnitCodeId ?? null,
                            serviceFrom: item.serviceFrom ?? item.ServiceFrom ?? null,
                            serviceTo: item.serviceTo ?? item.ServiceTo ?? null,
                            isCurrentlyActive: isActive === true || isActive === 1,
                            appointment: item.appointment ?? item.Appointment ?? null,
                            postingAuth: item.postingAuth ?? item.PostingAuth ?? null,
                            remarks: item.remarks ?? item.Remarks ?? null,
                            documentPath: docPath,
                            documentFileName: docName,
                            documentFile: null as File | null
                        };
                    });
                this.isLoading = false;
            },
            error: () => {
                this.serviceList = [];
                this.isLoading = false;
            }
        });
    }

    getOptionLabel(options: { label: string; value: number }[], value: number | null): string {
        if (value == null) return '—';
        const opt = options.find(o => o.value === value);
        return opt ? opt.label : String(value);
    }

    formatYearOnly(value: Date | string | null): string {
        if (value == null) return '—';
        if (typeof value === 'number' && !isNaN(value)) return String(value);
        const d = typeof value === 'string' ? new Date(value) : value;
        return isNaN(d.getTime()) ? '—' : String(d.getFullYear());
    }

    getPostingOrderLabel(row: PreviousRABServiceListRow): string {
        if (row.documentFile?.name) return row.documentFile.name;
        if (row.documentPath) return row.documentPath.split(/[/\\]/).pop() ?? row.documentPath;
        return row.documentFileName ?? '—';
    }

    truncatePostingOrderName(row: PreviousRABServiceListRow, maxLen: number = 20): string {
        const full = this.getPostingOrderLabel(row);
        if (full === '—') return full;
        return full.length <= maxLen ? full : full.slice(0, maxLen) + '...';
    }

    viewPostingOrder(row: PreviousRABServiceListRow): void {
        if (row.documentFile) {
            const url = URL.createObjectURL(row.documentFile);
            window.open(url, '_blank');
        } else if (row.documentPath) {
            window.open(row.documentPath, '_blank');
        }
    }

    openAddDialog(): void {
        this.isEditMode = false;
        this.editingServiceId = null;
        this.serviceForm.reset({
            previousRABServiceID: null,
            rabUnitCodeId: null,
            serviceFrom: null,
            serviceTo: null,
            isCurrentlyActive: false,
            appointment: null,
            postingAuth: '',
            remarks: '',
            documentFileName: '',
            documentFile: null,
            documentPath: null
        });
        this.serviceForm.get('serviceTo')?.enable();
        this.displayDialog = true;
    }

    openEditDialog(row: PreviousRABServiceListRow): void {
        this.isEditMode = true;
        this.editingServiceId = row.previousRABServiceID;
        const serviceFrom = row.serviceFrom ? (typeof row.serviceFrom === 'string' ? row.serviceFrom : new Date(row.serviceFrom).toISOString().substring(0, 10)) : null;
        const serviceTo = row.serviceTo ? (typeof row.serviceTo === 'string' ? row.serviceTo : new Date(row.serviceTo).toISOString().substring(0, 10)) : null;
        this.serviceForm.patchValue({
            previousRABServiceID: row.previousRABServiceID,
            rabUnitCodeId: row.rabUnitCodeId,
            serviceFrom,
            serviceTo,
            isCurrentlyActive: row.isCurrentlyActive ?? false,
            appointment: row.appointment,
            postingAuth: row.postingAuth ?? '',
            remarks: row.remarks ?? '',
            documentFileName: row.documentFileName ?? '',
            documentFile: null,
            documentPath: row.documentPath ?? null
        });
        const toControl = this.serviceForm.get('serviceTo');
        if (row.isCurrentlyActive && toControl) toControl.disable();
        else toControl?.enable();
        this.displayDialog = true;
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
        if (file) {
            const url = URL.createObjectURL(file);
            window.open(url, '_blank');
        } else if (path) {
            window.open(path, '_blank');
        }
    }

    clearPostingOrderInForm(): void {
        this.serviceForm.patchValue({ documentFile: null, documentPath: null, documentFileName: '' });
    }

    onPostingOrderSelectInForm(event: { files: File[] }): void {
        const file = event.files?.[0] ?? null;
        this.serviceForm.patchValue({ documentFile: file });
    }

    onDialogHide(): void {
        this.serviceForm.patchValue({ documentFile: null });
    }

    saveService(): void {
        if (!this.selectedEmployeeId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected.' });
            return;
        }
        if (this.serviceForm.get('rabUnitCodeId')?.invalid) {
            this.serviceForm.get('rabUnitCodeId')?.markAsTouched();
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select RAB Wing/Battalion Name.' });
            return;
        }
        const v = this.serviceForm.getRawValue();
        const now = new Date().toISOString();
        const newId = this.serviceList.length > 0
            ? Math.max(...this.serviceList.map(r => r.previousRABServiceID)) + 1
            : 1;
        const payload = {
            employeeID: this.selectedEmployeeId,
            previousRABServiceID: this.isEditMode ? (this.editingServiceId ?? 0) : newId,
            rabUnitCodeId: v.rabUnitCodeId ?? null,
            serviceFrom: this.toDateOnly(v.serviceFrom),
            serviceTo: this.toDateOnly(v.serviceTo),
            isCurrentlyActive: v.isCurrentlyActive === true,
            appointment: v.appointment ?? null,
            postingAuth: v.postingAuth || null,
            remarks: v.remarks || null,
            createdBy: 'user',
            createdDate: now,
            lastUpdatedBy: 'user',
            lastupdate: now
        };

        this.isSaving = true;
        const req = this.previousRABService.saveUpdate(payload).pipe(
            map((res: any) => {
                const code = res?.statusCode ?? res?.StatusCode ?? 200;
                if (code !== 200) throw new Error(res?.description ?? res?.Description ?? 'Save failed');
                return res;
            }),
            catchError(err => {
                const msg = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Save failed';
                this.messageService.add({ severity: 'error', summary: 'Save failed', detail: String(msg) });
                return of(null);
            })
        );

        req.subscribe(res => {
            this.isSaving = false;
            if (res != null) {
                this.messageService.add({ severity: 'success', summary: 'Saved', detail: this.isEditMode ? 'Previous RAB service updated.' : 'Previous RAB service added.' });
                this.displayDialog = false;
                this.loadServiceList();
            }
        });
    }

    confirmDelete(row: PreviousRABServiceListRow): void {
        this.confirmationService.confirm({
            message: 'Delete this previous RAB service record?',
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => this.deleteService(row)
        });
    }

    deleteService(row: PreviousRABServiceListRow): void {
        if (!this.selectedEmployeeId) return;
        this.previousRABService.delete(this.selectedEmployeeId, row.previousRABServiceID).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Previous RAB service deleted.' });
                this.loadServiceList();
            },
            error: err => {
                const msg = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Delete failed';
                this.messageService.add({ severity: 'error', summary: 'Error', detail: String(msg) });
            }
        });
    }

    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.isReadonly = false;
        this.loadServiceList();
    }

    onEmployeeSearchReset(): void {
        this.resetForm();
    }

    enableEditMode(): void {
        this.mode = 'edit';
        this.isReadonly = false;
    }

    cancelEdit(): void {
        if (!this.selectedEmployeeId) return;
        this.mode = 'view';
        this.isReadonly = true;
        this.loadServiceList();
        this.messageService.add({ severity: 'info', summary: 'Cancelled', detail: 'Changes discarded.' });
    }

    goBack(): void {
        this.router.navigate(['/emp-list']);
    }

    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.serviceList = [];
    }
}
