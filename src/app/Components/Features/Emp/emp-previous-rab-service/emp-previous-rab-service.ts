import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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
import { FileReferencesFormComponent, FileRowData } from '@components/Common/file-references-form/file-references-form';

/** List row for display in table */
export interface PreviousRABServiceListRow {
    previousRABServiceID: number;
    rabUnitCodeId: number | null;
    serviceFrom: string | null;
    serviceTo: string | null;
    isCurrentlyActive: boolean;
    appointment: number | null;
    postingAuth: string | null;
    remarks: string | null;
    filesReferences?: string | null;
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
        DialogModule,
        ConfirmDialogModule,
        CheckboxModule,
        EmployeeSearchComponent,
        FileReferencesFormComponent
    ],
    providers: [ConfirmationService],
    templateUrl: './emp-previous-rab-service.html',
    styleUrl: './emp-previous-rab-service.scss'
})
export class EmpPreviousRabService implements OnInit {
    @ViewChild('fileReferencesForm') fileReferencesForm!: any; // FileReferencesFormComponent
    fileRows: FileRowData[] = [];

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
        private route: ActivatedRoute
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
            remarks: ['']
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
            if (isNaN(parsed.getTime())) return null;
            return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
        }
        if (d instanceof Date) {
            if (isNaN(d.getTime())) return null;
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
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
                            filesReferences: item.filesReferences ?? item.FilesReferences ?? null
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

    openAddDialog(): void {
        this.isEditMode = false;
        this.editingServiceId = null;
        this.fileRows = [];
        this.serviceForm.reset({
            previousRABServiceID: null,
            rabUnitCodeId: null,
            serviceFrom: null,
            serviceTo: null,
            isCurrentlyActive: false,
            appointment: null,
            postingAuth: '',
            remarks: ''
        });
        this.serviceForm.get('serviceTo')?.enable();
        this.displayDialog = true;
    }

    openEditDialog(row: PreviousRABServiceListRow): void {
        this.isEditMode = true;
        this.editingServiceId = row.previousRABServiceID;
        const serviceFrom = this.toDateOnly(row.serviceFrom ?? null);
        const serviceTo = this.toDateOnly(row.serviceTo ?? null);
        this.serviceForm.patchValue({
            previousRABServiceID: row.previousRABServiceID,
            rabUnitCodeId: row.rabUnitCodeId,
            serviceFrom,
            serviceTo,
            isCurrentlyActive: row.isCurrentlyActive ?? false,
            appointment: row.appointment,
            postingAuth: row.postingAuth ?? '',
            remarks: row.remarks ?? ''
        });
        // Load file references (FilesReferences JSON: [{ FileId, fileName }])
        const refsJson = row.filesReferences;
        if (refsJson && typeof refsJson === 'string') {
            try {
                const refs = JSON.parse(refsJson) as { FileId?: number; fileName?: string }[];
                this.fileRows = Array.isArray(refs) ? refs.map((r) => ({ displayName: r.fileName ?? '', file: null, fileId: r.FileId })) : [];
            } catch {
                this.fileRows = [];
            }
        } else {
            this.fileRows = [];
        }
        const toControl = this.serviceForm.get('serviceTo');
        if (row.isCurrentlyActive && toControl) toControl.disable();
        else toControl?.enable();
        this.displayDialog = true;
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
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download file' });
            }
        });
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
        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() ?? [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() ?? [];

        const employeeId = this.selectedEmployeeId;
        const doSave = (filesReferencesJson: string | null) => {
            const payload = {
                employeeID: employeeId as number,
                previousRABServiceID: this.isEditMode ? (this.editingServiceId ?? 0) : newId,
                rabUnitCodeId: v.rabUnitCodeId ?? null,
                serviceFrom: this.toDateOnly(v.serviceFrom),
                serviceTo: this.toDateOnly(v.serviceTo),
                isCurrentlyActive: v.isCurrentlyActive === true,
                appointment: v.appointment ?? null,
                postingAuth: v.postingAuth || null,
                remarks: v.remarks || null,
                filesReferences: filesReferencesJson,
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
        };

        if (filesToUpload.length > 0) {
            const uploads = filesToUpload.map((r: FileRowData) =>
                this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name)
            );
            this.isSaving = true;
            forkJoin(uploads).subscribe({
                next: (results: unknown) => {
                    const resultsArray = Array.isArray(results) ? results : [];
                    const newRefs = (resultsArray as { fileId: number; fileName: string }[]).map((r) => ({ FileId: r.fileId, fileName: r.fileName }));
                    const allRefs: { FileId: number; fileName: string }[] = [...existingRefs.map((r: { FileId: number; fileName: string }) => ({ FileId: r.FileId, fileName: r.fileName })), ...newRefs];
                    const filesReferencesJson = allRefs.length > 0 ? JSON.stringify(allRefs) : null;
                    doSave(filesReferencesJson);
                },
                error: (err) => {
                    this.isSaving = false;
                    console.error('Error uploading files', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to upload one or more files' });
                }
            });
            return;
        }

        const filesReferencesJson = existingRefs.length > 0 ? JSON.stringify(existingRefs) : null;
        doSave(filesReferencesJson);
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

    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.serviceList = [];
    }
}
