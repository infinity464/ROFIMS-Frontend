import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
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
import { TextareaModule } from 'primeng/textarea';

import { EmpService } from '@/services/emp-service';
import { DisciplineInfoService, DisciplineInfoModel } from '@/services/discipline-info.service';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { FileReferencesFormComponent, FileRowData } from '@components/Common/file-references-form/file-references-form';

export interface DisciplineListRow extends DisciplineInfoModel {
    employeeId: number;
    disciplineId: number;
}

@Component({
    selector: 'app-emp-discipline-info',
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
        TextareaModule,
        EmployeeSearchComponent,
        FileReferencesFormComponent
    ],
    providers: [ConfirmationService],
    templateUrl: './emp-discipline-info.html',
    styleUrl: './emp-discipline-info.scss'
})
export class EmpDisciplineInfoComponent implements OnInit {
    @ViewChild('fileReferencesForm') fileReferencesForm!: any;

    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;

    disciplineList: DisciplineListRow[] = [];
    isLoading = false;

    displayDialog = false;
    isEditMode = false;
    isSaving = false;
    disciplineForm!: FormGroup;
    editingDisciplineId: number | null = null;

    fileRows: FileRowData[] = [];
    offenceTypeOptions: { label: string; value: number }[] = [];
    briefStatementOptions: { label: string; value: number }[] = [];
    punishmentTypeOptions: { label: string; value: number }[] = [];

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private disciplineInfoService: DisciplineInfoService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private route: ActivatedRoute,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.buildForm();
        this.loadDropdowns();
        this.checkRouteParams();
    }

    buildForm(): void {
        this.disciplineForm = this.fb.group({
            disciplineId: [null],
            offenseDate: [null],
            offenseType: [null],
            briefStatementOfOffenceId: [null],
            offenseDetails: [''],
            punishmentTypeRAB: [null],
            punishmentDate: [null],
            punishmentTypeMotherOrg: [null],
            punishmentDateMotherOrg: [null],
            action: [''],
            auth: [''],
            remarks: ['']
        });
    }

    private mapCommonCodeToOption(item: any): { label: string; value: number } {
        const label = item?.codeValueEN ?? item?.CodeValueEN ?? item?.displayCodeValueEN ?? String(item?.codeId ?? item?.CodeId ?? '');
        const value = item?.codeId ?? item?.CodeId ?? 0;
        return { label, value };
    }

    loadDropdowns(): void {
        this.commonCodeService.getAllActiveCommonCodesType('OffenceType').pipe(catchError(() => of([] as any[]))).subscribe({
            next: (list: any[]) => {
                this.offenceTypeOptions = (Array.isArray(list) ? list : []).map((item: any) => this.mapCommonCodeToOption(item));
            }
        });
        this.commonCodeService.getAllActiveCommonCodesType('BriefStatementOfOffence').pipe(catchError(() => of([] as any[]))).subscribe({
            next: (list: any[]) => {
                this.briefStatementOptions = (Array.isArray(list) ? list : []).map((item: any) => this.mapCommonCodeToOption(item));
            }
        });
        this.commonCodeService.getAllActiveCommonCodesType('PunishmentType').pipe(catchError(() => of([] as any[]))).subscribe({
            next: (list: any[]) => {
                this.punishmentTypeOptions = (Array.isArray(list) ? list : []).map((item: any) => this.mapCommonCodeToOption(item));
            }
        });
    }

    private toDateString(d: Date | string | null): string | null {
        if (d == null) return null;
        if (typeof d === 'string') {
            const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) return d.substring(0, 10);
            const parsed = new Date(d);
            return isNaN(parsed.getTime()) ? null : parsed.toISOString().substring(0, 10);
        }
        if (d instanceof Date) return isNaN(d.getTime()) ? null : d.toISOString().substring(0, 10);
        return null;
    }

    checkRouteParams(): void {
        this.route.queryParams.subscribe(params => {
            const id = params['id'];
            const modeParam = params['mode'];
            if (id) {
                this.mode = modeParam === 'edit' ? 'edit' : 'view';
                this.isReadonly = this.mode === 'view';
                this.loadEmployeeById(parseInt(id, 10));
            }
        });
    }

    loadEmployeeById(employeeId: number): void {
        this.empService.getEmployeeById(employeeId).subscribe({
            next: (e: any) => {
                if (e) {
                    this.employeeFound = true;
                    this.selectedEmployeeId = e.employeeID || e.EmployeeID;
                    this.employeeBasicInfo = e;
                    this.loadDisciplineList();
                }
            },
            error: err => console.error('Failed to load employee', err)
        });
    }

    loadDisciplineList(): void {
        if (!this.selectedEmployeeId) return;
        this.isLoading = true;
        this.disciplineInfoService.getByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (list: any[]) => {
                const arr = Array.isArray(list) ? list : [];
                this.disciplineList = arr.map((item: any) => ({
                    employeeId: item.employeeId ?? item.EmployeeId,
                    disciplineId: item.disciplineId ?? item.DisciplineId,
                    offenseDate: item.offenseDate ?? item.OffenseDate ?? null,
                    offenseType: item.offenseType ?? item.OffenseType ?? null,
                    briefStatementOfOffenceId: item.briefStatementOfOffenceId ?? item.BriefStatementOfOffenceId ?? null,
                    offenseDetails: item.offenseDetails ?? item.OffenseDetails ?? null,
                    punishmentTypeRAB: item.punishmentTypeRAB ?? item.PunishmentTypeRAB ?? null,
                    punishmentDate: item.punishmentDate ?? item.PunishmentDate ?? null,
                    punishmentTypeMotherOrg: item.punishmentTypeMotherOrg ?? item.PunishmentTypeMotherOrg ?? null,
                    punishmentDateMotherOrg: item.punishmentDateMotherOrg ?? item.PunishmentDateMotherOrg ?? null,
                    action: item.action ?? item.Action ?? null,
                    auth: item.auth ?? item.Auth ?? null,
                    remarks: item.remarks ?? item.Remarks ?? null,
                    fileName: item.fileName ?? item.FileName ?? null,
                    filesReferences: item.filesReferences ?? item.FilesReferences ?? null
                }));
                this.isLoading = false;
            },
            error: () => { this.disciplineList = []; this.isLoading = false; }
        });
    }

    parseFileRowsFromReferences(refsJson: string | null | undefined): FileRowData[] {
        if (!refsJson || typeof refsJson !== 'string') return [];
        try {
            const refs = JSON.parse(refsJson) as { FileId?: number; fileName?: string }[];
            if (!Array.isArray(refs)) return [];
            return refs.map((r) => ({ displayName: r.fileName ?? '', file: null, fileId: r.FileId }));
        } catch {
            return [];
        }
    }

    onFileRowsChange(event: FileRowData[]): void {
        if (event && Array.isArray(event)) this.fileRows = event;
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

    getOptionLabel(options: { label: string; value: number }[], value: number | null): string {
        if (value == null) return '—';
        const opt = options.find(o => o.value === value);
        return opt ? opt.label : String(value);
    }

    formatDate(value: Date | string | null): string {
        if (value == null) return '—';
        const d = typeof value === 'string' ? new Date(value) : value;
        return isNaN(d.getTime()) ? '—' : d.toISOString().substring(0, 10);
    }

    onDialogHide(): void {}

    openAddDialog(): void {
        if (this.selectedEmployeeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected.' });
            return;
        }
        this.isEditMode = false;
        this.editingDisciplineId = null;
        this.fileRows = [];
        this.disciplineForm.reset({
            disciplineId: null,
            offenseDate: null,
            offenseType: null,
            briefStatementOfOffenceId: null,
            offenseDetails: '',
            punishmentTypeRAB: null,
            punishmentDate: null,
            punishmentTypeMotherOrg: null,
            punishmentDateMotherOrg: null,
            action: '',
            auth: '',
            remarks: ''
        });
        this.displayDialog = true;
    }

    openEditDialog(row: DisciplineListRow): void {
        this.isEditMode = true;
        this.editingDisciplineId = row.disciplineId;
        const offenseDate = row.offenseDate ? (typeof row.offenseDate === 'string' ? row.offenseDate : new Date(row.offenseDate).toISOString().substring(0, 10)) : null;
        const punishmentDate = row.punishmentDate ? (typeof row.punishmentDate === 'string' ? row.punishmentDate : new Date(row.punishmentDate).toISOString().substring(0, 10)) : null;
        const punishmentDateMO = row.punishmentDateMotherOrg ? (typeof row.punishmentDateMotherOrg === 'string' ? row.punishmentDateMotherOrg : new Date(row.punishmentDateMotherOrg).toISOString().substring(0, 10)) : null;
        this.fileRows = this.parseFileRowsFromReferences(row.filesReferences);
        this.disciplineForm.patchValue({
            disciplineId: row.disciplineId,
            offenseDate,
            offenseType: row.offenseType,
            briefStatementOfOffenceId: row.briefStatementOfOffenceId,
            offenseDetails: row.offenseDetails ?? '',
            punishmentTypeRAB: row.punishmentTypeRAB,
            punishmentDate,
            punishmentTypeMotherOrg: row.punishmentTypeMotherOrg,
            punishmentDateMotherOrg: punishmentDateMO,
            action: row.action ?? '',
            auth: row.auth ?? '',
            remarks: row.remarks ?? ''
        });
        this.displayDialog = true;
    }

    saveDiscipline(): void {
        if (!this.selectedEmployeeId) return;
        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const doSave = (filesReferencesJson: string | null) => {
            const v = this.disciplineForm.value;
            const now = new Date().toISOString();
            const payload: DisciplineInfoModel = {
                employeeId: this.selectedEmployeeId!,
                disciplineId: this.isEditMode ? (this.editingDisciplineId ?? 0) : 0,
                offenseDate: this.toDateString(v.offenseDate),
                offenseType: v.offenseType ?? null,
                briefStatementOfOffenceId: v.briefStatementOfOffenceId ?? null,
                offenseDetails: v.offenseDetails || null,
                punishmentTypeRAB: v.punishmentTypeRAB ?? null,
                punishmentDate: this.toDateString(v.punishmentDate),
                punishmentTypeMotherOrg: v.punishmentTypeMotherOrg ?? null,
                punishmentDateMotherOrg: this.toDateString(v.punishmentDateMotherOrg),
                action: v.action || null,
                auth: v.auth || null,
                remarks: v.remarks || null,
                fileName: null,
                filesReferences: filesReferencesJson ?? undefined,
                createdBy: 'user',
                createdDate: now,
                lastUpdatedBy: 'user',
                lastupdate: now
            };
            this.isSaving = true;
            const req = this.isEditMode
                ? this.disciplineInfoService.update(payload)
                : this.disciplineInfoService.save(payload);
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
                    this.messageService.add({ severity: 'success', summary: 'Saved', detail: this.isEditMode ? 'Discipline record updated.' : 'Discipline record added.' });
                    this.displayDialog = false;
                    this.loadDisciplineList();
                }
            });
        };

        if (filesToUpload.length > 0) {
            const uploads = filesToUpload.map((r: FileRowData) =>
                this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name)
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
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to upload one or more files' });
                }
            });
            return;
        }
        const filesReferencesJson = existingRefs.length > 0 ? JSON.stringify(existingRefs) : null;
        doSave(filesReferencesJson);
    }

    confirmDelete(row: DisciplineListRow): void {
        this.confirmationService.confirm({
            message: 'Delete this discipline record?',
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => this.deleteDiscipline(row)
        });
    }

    deleteDiscipline(row: DisciplineListRow): void {
        this.disciplineInfoService.delete(row.employeeId, row.disciplineId).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Discipline record deleted.' });
                this.loadDisciplineList();
            },
            error: err => this.messageService.add({ severity: 'error', summary: 'Error', detail: String(err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Delete failed') })
        });
    }

    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.isReadonly = false;
        this.loadDisciplineList();
    }

    onEmployeeSearchReset(): void { this.resetForm(); }
    enableEditMode(): void { this.mode = 'edit'; this.isReadonly = false; }
    cancelEdit(): void {
        if (!this.selectedEmployeeId) return;
        this.mode = 'view';
        this.isReadonly = true;
        this.loadDisciplineList();
        this.messageService.add({ severity: 'info', summary: 'Cancelled', detail: 'Changes discarded.' });
    }
    goBack(): void { this.router.navigate(['/emp-list']); }

    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.disciplineList = [];
    }
}
