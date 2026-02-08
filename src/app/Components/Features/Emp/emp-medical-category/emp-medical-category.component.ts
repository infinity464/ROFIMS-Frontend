import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
import { MedicalInfoService, MedicalInfoModel } from '@/services/medical-info.service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { CodeType } from '@/models/enums';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { FileReferencesFormComponent, FileRowData } from '@components/Common/file-references-form/file-references-form';

@Component({
    selector: 'app-emp-medical-category',
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
    templateUrl: './emp-medical-category.component.html',
    styleUrl: './emp-medical-category.component.scss'
})
export class EmpMedicalCategory implements OnInit {
    @ViewChild('fileReferencesForm') fileReferencesForm!: any;

    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;

    medicalList: MedicalInfoModel[] = [];
    isLoading = false;

    displayDialog = false;
    isEditMode = false;
    isSaving = false;
    medicalForm!: FormGroup;
    editingMedicalInfoId: number | null = null;

    fileRows: FileRowData[] = [];
    medicalCategoryOptions: { label: string; value: number }[] = [];

    constructor(
        private empService: EmpService,
        private medicalInfoService: MedicalInfoService,
        private masterBasicSetupService: MasterBasicSetupService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private route: ActivatedRoute,
        private router: Router,
        private fb: FormBuilder
    ) {
        this.initForm();
    }

    ngOnInit(): void {
        this.loadMedicalCategoryOptions();
        this.checkRouteParams();
    }

    loadMedicalCategoryOptions(): void {
        this.masterBasicSetupService.getAllByType(CodeType.MedicalCategoryType).subscribe({
            next: (list) => {
                this.medicalCategoryOptions = (list || [])
                    .filter((c) => c.status !== false)
                    .map((c) => ({ label: c.codeValueEN || String(c.codeId), value: c.codeId }));
            },
            error: () => {
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Warning',
                    detail: 'Could not load Medical Category Type list; add options in Basic Setup → Medical Category Type.'
                });
            }
        });
    }

    initForm(): void {
        this.medicalForm = this.fb.group({
            medicalInfoId: [0],
            employeeId: [0],
            medicalCategoryId: [null, Validators.required],
            fromDate: [null, Validators.required],
            toDate: [null, Validators.required],
            reason: [''],
            auth: [''],
            remarks: ['']
        });
    }

    checkRouteParams(): void {
        this.route.queryParams.subscribe((params) => {
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
                    this.loadMedicalList();
                }
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load employee' })
        });
    }

    loadMedicalList(): void {
        if (!this.selectedEmployeeId) return;
        this.isLoading = true;
        this.medicalInfoService.getByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (data: any) => {
                const list = Array.isArray(data) ? data : [];
                this.medicalList = list.map((item: any) => this.mapApiToModel(item));
                this.isLoading = false;
            },
            error: () => {
                this.isLoading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load medical records' });
            }
        });
    }

    private mapApiToModel(item: any): MedicalInfoModel {
        return {
            medicalInfoId: item.medicalInfoId ?? item.MedicalInfoId,
            employeeId: item.employeeId ?? item.EmployeeId,
            medicalCategoryId: item.medicalCategoryId ?? item.MedicalCategoryId,
            fromDate: item.fromDate ?? item.FromDate ?? '',
            toDate: item.toDate ?? item.ToDate ?? '',
            reason: item.reason ?? item.Reason ?? null,
            auth: item.auth ?? item.Auth ?? null,
            remarks: item.remarks ?? item.Remarks ?? null,
            fileName: item.fileName ?? item.FileName ?? null,
            filesReferences: item.filesReferences ?? item.FilesReferences ?? null
        };
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

    getMedicalCategoryLabel(medicalCategoryId: number): string {
        const opt = this.medicalCategoryOptions.find((o) => o.value === medicalCategoryId);
        return opt ? opt.label : 'N/A';
    }

    formatDate(val: string | null | undefined): string {
        if (!val) return 'N/A';
        try {
            const d = new Date(val);
            return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString();
        } catch {
            return String(val);
        }
    }

    openAddDialog(): void {
        this.isEditMode = false;
        this.editingMedicalInfoId = null;
        this.fileRows = [];
        this.medicalForm.reset({
            medicalInfoId: 0,
            employeeId: this.selectedEmployeeId ?? 0,
            medicalCategoryId: null,
            fromDate: null,
            toDate: null,
            reason: '',
            auth: '',
            remarks: ''
        });
        this.displayDialog = true;
    }

    openEditDialog(row: MedicalInfoModel): void {
        this.isEditMode = true;
        this.editingMedicalInfoId = row.medicalInfoId;
        this.fileRows = this.parseFileRowsFromReferences(row.filesReferences);
        const fromDate = row.fromDate ? new Date(row.fromDate) : null;
        const toDate = row.toDate ? new Date(row.toDate) : null;
        this.medicalForm.patchValue({
            medicalInfoId: row.medicalInfoId,
            employeeId: row.employeeId,
            medicalCategoryId: row.medicalCategoryId,
            fromDate,
            toDate,
            reason: row.reason ?? '',
            auth: row.auth ?? '',
            remarks: row.remarks ?? ''
        });
        this.displayDialog = true;
    }

    saveMedical(): void {
        if (this.medicalForm.invalid) {
            this.medicalForm.markAllAsTouched();
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please fill required fields (Category, From Date, To Date)' });
            return;
        }
        if (this.selectedEmployeeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected' });
            return;
        }
        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const doSave = (filesReferencesJson: string | null) => {
            const formValue = this.medicalForm.value;
            const fromDate = formValue.fromDate instanceof Date ? formValue.fromDate.toISOString() : formValue.fromDate;
            const toDate = formValue.toDate instanceof Date ? formValue.toDate.toISOString() : formValue.toDate;
            const payload: Partial<MedicalInfoModel> = {
                medicalInfoId: this.isEditMode ? (this.editingMedicalInfoId ?? 0) : 0,
                employeeId: this.selectedEmployeeId!,
                medicalCategoryId: formValue.medicalCategoryId,
                fromDate: fromDate ?? new Date().toISOString(),
                toDate: toDate ?? new Date().toISOString(),
                reason: formValue.reason || null,
                auth: formValue.auth || null,
                remarks: formValue.remarks || null,
                fileName: null,
                filesReferences: filesReferencesJson ?? undefined,
                createdBy: 'user',
                lastUpdatedBy: 'user'
            };

            this.isSaving = true;
            const req = this.isEditMode
                ? this.medicalInfoService.update(payload)
                : this.medicalInfoService.save(payload);

            req.subscribe({
                next: () => {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: this.isEditMode ? 'Medical record updated.' : 'Medical record added.'
                    });
                    this.displayDialog = false;
                    this.loadMedicalList();
                    this.isSaving = false;
                },
                error: () => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save medical record' });
                    this.isSaving = false;
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

    confirmDelete(row: MedicalInfoModel): void {
        this.confirmationService.confirm({
            message: `Delete this medical record (${this.getMedicalCategoryLabel(row.medicalCategoryId)})?`,
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => this.deleteMedical(row)
        });
    }

    deleteMedical(row: MedicalInfoModel): void {
        this.medicalInfoService.delete(row.medicalInfoId, row.employeeId).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Medical record deleted.' });
                this.loadMedicalList();
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete' })
        });
    }

    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.isReadonly = true;
        this.loadMedicalList();
    }

    onEmployeeSearchReset(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.medicalList = [];
    }

    enableEditMode(): void {
        this.mode = 'edit';
        this.isReadonly = false;
    }

    goBack(): void {
        this.router.navigate(['/emp-list']);
    }
}
