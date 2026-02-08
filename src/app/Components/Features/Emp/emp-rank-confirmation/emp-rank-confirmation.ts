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
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { EmpService } from '@/services/emp-service';
import { RankConfirmationInfoService, RankConfirmationInfoModel } from '@/services/rank-confirmation-info.service';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { FileReferencesFormComponent, FileRowData } from '@components/Common/file-references-form/file-references-form';

export interface RankConfirmationListRow extends RankConfirmationInfoModel {
    filesReferences?: string | null;
}

@Component({
    selector: 'app-emp-rank-confirmation',
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
        DatePickerModule,
        DialogModule,
        ConfirmDialogModule,
        EmployeeSearchComponent,
        FileReferencesFormComponent
    ],
    providers: [ConfirmationService],
    templateUrl: './emp-rank-confirmation.html',
    styleUrl: './emp-rank-confirmation.scss'
})
export class EmpRankConfirmationComponent implements OnInit {
    @ViewChild('fileReferencesForm') fileReferencesForm!: any;

    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    selectedOrgId: number | null = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;

    rankList: RankConfirmationListRow[] = [];
    isLoading = false;

    displayDialog = false;
    isEditMode = false;
    isSaving = false;
    rankForm!: FormGroup;
    editingRankConfirmId: number | null = null;

    fileRows: FileRowData[] = [];
    rankOptions: { label: string; value: number }[] = [];

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private rankConfirmationService: RankConfirmationInfoService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private route: ActivatedRoute,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.buildForm();
        this.loadRankOptions();
        this.checkRouteParams();
    }

    buildForm(): void {
        this.rankForm = this.fb.group({
            rankConfirmId: [null],
            presentRank: [null],
            rankConfirmDate: [null],
            auth: [''],
            remarks: ['']
        });
    }

    private mapCommonCodeToOption(item: any): { label: string; value: number } {
        const label = item?.codeValueEN ?? item?.CodeValueEN ?? item?.displayCodeValueEN ?? item?.DisplayCodeValueEN ?? String(item?.codeId ?? item?.CodeId ?? '');
        const value = item?.codeId ?? item?.CodeId ?? 0;
        return { label, value };
    }

    loadRankOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('Rank').pipe(catchError(() => of([] as any[]))).subscribe({
            next: (list: any[]) => {
                this.rankOptions = (Array.isArray(list) ? list : []).map((item: any) => this.mapCommonCodeToOption(item));
            }
        });
    }

    loadRankOptionsByOrg(orgId: number | null): void {
        if (orgId == null) return;
        this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').pipe(catchError(() => of([] as any[]))).subscribe({
            next: (list: any[]) => {
                const arr = Array.isArray(list) ? list : [];
                if (arr.length > 0) this.rankOptions = arr.map((item: any) => this.mapCommonCodeToOption(item));
            }
        });
    }

    toDateOnly(d: Date | string | null): string | null {
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

    private toDateForPicker(d: Date | string | null): Date | null {
        if (d == null) return null;
        if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
        const parsed = new Date(d);
        return isNaN(parsed.getTime()) ? null : parsed;
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
                    this.selectedOrgId = e.orgId ?? e.OrgId ?? e.lastMotherUnit ?? e.LastMotherUnit ?? null;
                    this.loadRankOptionsByOrg(this.selectedOrgId);
                    this.loadRankList();
                }
            },
            error: err => console.error('Failed to load employee', err)
        });
    }

    loadRankList(): void {
        if (!this.selectedEmployeeId) return;
        this.isLoading = true;
        this.rankConfirmationService.getByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (list: any[]) => {
                const arr = Array.isArray(list) ? list : [];
                this.rankList = arr
                    .filter((item: any) => (item.employeeId ?? item.EmployeeId) === this.selectedEmployeeId)
                    .map((item: any) => ({
                        employeeId: item.employeeId ?? item.EmployeeId,
                        rankConfirmId: item.rankConfirmId ?? item.RankConfirmId,
                        presentRank: item.presentRank ?? item.PresentRank ?? null,
                        rankConfirmDate: item.rankConfirmDate ?? item.RankConfirmDate ?? null,
                        auth: item.auth ?? item.Auth ?? null,
                        remarks: item.remarks ?? item.Remarks ?? null,
                        filesReferences: item.filesReferences ?? item.FilesReferences ?? null
                    }));
                this.isLoading = false;
            },
            error: () => { this.rankList = []; this.isLoading = false; }
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
        if (isNaN(d.getTime())) return '—';
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${day}-${month}-${d.getFullYear()}`;
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

    openAddDialog(): void {
        if (this.selectedEmployeeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected.' });
            return;
        }
        this.isEditMode = false;
        this.editingRankConfirmId = null;
        this.fileRows = [];
        this.rankForm.reset({
            rankConfirmId: null,
            presentRank: null,
            rankConfirmDate: null,
            auth: '',
            remarks: ''
        });
        this.displayDialog = true;
    }

    openEditDialog(row: RankConfirmationListRow): void {
        this.isEditMode = true;
        this.editingRankConfirmId = row.rankConfirmId;
        this.fileRows = this.parseFileRowsFromReferences(row.filesReferences);
        const rankConfirmDate = row.rankConfirmDate ? (typeof row.rankConfirmDate === 'string' ? row.rankConfirmDate : new Date(row.rankConfirmDate).toISOString().substring(0, 10)) : null;
        this.rankForm.patchValue({
            rankConfirmId: row.rankConfirmId,
            presentRank: row.presentRank,
            rankConfirmDate: this.toDateForPicker(rankConfirmDate),
            auth: row.auth ?? '',
            remarks: row.remarks ?? ''
        });
        this.displayDialog = true;
    }

    saveRank(): void {
        if (!this.selectedEmployeeId) return;
        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const doSave = (filesReferencesJson: string | null) => {
            const v = this.rankForm.value;
            const now = new Date().toISOString();
            const newId = this.rankList.length > 0 ? Math.max(...this.rankList.map(r => r.rankConfirmId)) + 1 : 1;
            const payload: Partial<RankConfirmationInfoModel> = {
                employeeId: this.selectedEmployeeId!,
                rankConfirmId: this.isEditMode ? (this.editingRankConfirmId ?? 0) : newId,
                presentRank: v.presentRank ?? null,
                rankConfirmDate: this.toDateOnly(v.rankConfirmDate),
                auth: v.auth || null,
                remarks: v.remarks ?? '',
                createdBy: 'user',
                createdDate: now,
                lastUpdatedBy: 'user',
                lastupdate: now,
                filesReferences: filesReferencesJson ?? undefined
            };
            this.isSaving = true;
            const req = this.isEditMode ? this.rankConfirmationService.saveUpdate(payload) : this.rankConfirmationService.save(payload);
            req.pipe(
                map((res: any) => {
                    const code = res?.statusCode ?? res?.StatusCode ?? 200;
                    if (code !== 200) throw new Error(res?.description ?? res?.Description ?? 'Save failed');
                    return res;
                }),
                catchError(err => {
                    this.messageService.add({ severity: 'error', summary: this.isEditMode ? 'Update failed' : 'Save failed', detail: String(err?.error?.description ?? err?.error?.Description ?? err?.message) });
                    return of(null);
                })
            ).subscribe(res => {
                this.isSaving = false;
                if (res != null) {
                    this.messageService.add({ severity: 'success', summary: 'Saved', detail: this.isEditMode ? 'Rank confirmation updated.' : 'Rank confirmation added.' });
                    this.displayDialog = false;
                    this.loadRankList();
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

    confirmDelete(row: RankConfirmationListRow): void {
        this.confirmationService.confirm({
            message: 'Delete this rank confirmation record?',
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => this.deleteRank(row)
        });
    }

    deleteRank(row: RankConfirmationListRow): void {
        this.rankConfirmationService.delete(row.employeeId, row.rankConfirmId).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Rank confirmation deleted.' });
                this.loadRankList();
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
        this.loadRankOptionsByOrg(this.selectedOrgId);
        if (this.selectedOrgId != null) {
            this.loadRankList();
        } else {
            this.empService.getEmployeeById(employee.employeeID).subscribe({
                next: (full) => {
                    this.employeeBasicInfo = full;
                    this.selectedOrgId = (full as any).orgId ?? (full as any).OrgId ?? (full as any).lastMotherUnit ?? (full as any).LastMotherUnit ?? null;
                    this.loadRankOptionsByOrg(this.selectedOrgId);
                    this.loadRankList();
                },
                error: () => this.loadRankList()
            });
        }
    }

    onEmployeeSearchReset(): void { this.resetForm(); }
    enableEditMode(): void { this.mode = 'edit'; this.isReadonly = false; }
    cancelEdit(): void {
        if (!this.selectedEmployeeId) return;
        this.mode = 'view';
        this.isReadonly = true;
        this.loadRankList();
        this.messageService.add({ severity: 'info', summary: 'Cancelled', detail: 'Changes discarded.' });
    }
    goBack(): void { this.router.navigate(['/emp-list']); }

    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.selectedOrgId = null;
        this.rankList = [];
    }
}
