import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, forkJoin, Subject, catchError, of } from 'rxjs';
import { map } from 'rxjs/operators';

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
import { ToastModule } from 'primeng/toast';

import { EmpService } from '@/services/emp-service';
import { PermPostingMotherOrgService, PermPostingMotherOrgModel } from '@/services/perm-posting-mother-org.service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { FileReferencesFormComponent, FileRowData } from '@components/Common/file-references-form/file-references-form';

interface DropdownOption {
    label: string;
    value: any;
}

@Component({
    selector: 'app-emp-perm-posting-mother-org',
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
        ToastModule,
        EmployeeSearchComponent,
        FileReferencesFormComponent
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './emp-perm-posting-mother-org.component.html',
    styleUrl: './emp-perm-posting-mother-org.component.scss'
})
export class EmpPermPostingMotherOrg implements OnInit, OnDestroy {
    @ViewChild('postingOrderFileRef') postingOrderFileRef!: FileReferencesFormComponent;
    @ViewChild('noteSheetFileRef') noteSheetFileRef!: FileReferencesFormComponent;
    @ViewChild('clearanceLatterFileRef') clearanceLatterFileRef!: FileReferencesFormComponent;

    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;

    recordList: PermPostingMotherOrgModel[] = [];
    isLoading = false;
    displayDialog = false;
    isEditMode = false;
    isSaving = false;
    postingForm!: FormGroup;

    editingPermPostingId: number | null = null;

    // File rows for 3 separate file upload sections
    postingOrderFileRows: FileRowData[] = [];
    noteSheetFileRows: FileRowData[] = [];
    clearanceLatterFileRows: FileRowData[] = [];

    // Reliever dropdown
    employeeOptions: DropdownOption[] = [];
    relieverName: string = '';

    yesNoOptions: DropdownOption[] = [
        { label: 'Yes', value: true },
        { label: 'No', value: false }
    ];

    joinStatusOptions: DropdownOption[] = [
        { label: 'Joined', value: true },
        { label: 'Not Joined', value: false }
    ];

    private destroy$ = new Subject<void>();

    constructor(
        private empService: EmpService,
        private permPostingService: PermPostingMotherOrgService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private route: ActivatedRoute,
        private router: Router,
        private fb: FormBuilder
    ) {
        this.initForm();
    }

    ngOnInit(): void {
        this.checkRouteParams();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    initForm(): void {
        this.postingForm = this.fb.group({
            poReceivedDate: [null],
            hasReliever: [false],
            relieverID: [null],
            isRelieverJoinStatus: [null],
            relieverJoinDate: [null],
            nsClearanceCompleted: [false],
            nsClearanceCompDate: [null],
            clearanceGiven: [false],
            clearanceGivenDate: [null]
        });
    }

    checkRouteParams(): void {
        this.route.queryParams.subscribe((params) => {
            if (params['id']) {
                this.mode = params['mode'] === 'edit' ? 'edit' : 'view';
                this.isReadonly = this.mode === 'view';
                this.loadEmployeeById(parseInt(params['id'], 10));
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
                    this.loadRecordList();
                }
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load employee information'
                });
            }
        });
    }

    loadRecordList(): void {
        if (!this.selectedEmployeeId) return;
        this.isLoading = true;
        this.permPostingService.getByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (data) => {
                this.recordList = (data || []).map((x: any) => ({
                    permPostingId: x.permPostingId ?? x.PermPostingId,
                    employeeId: x.employeeId ?? x.EmployeeId,
                    poReceivedDate: x.poReceivedDate ?? x.POReceivedDate ?? null,
                    hasReliever: x.hasReliever ?? x.HasReliever ?? false,
                    relieverID: x.relieverID ?? x.RelieverID ?? null,
                    relieverJoinDate: x.relieverJoinDate ?? x.RelieverJoinDate ?? null,
                    isRelieverJoinStatus: x.isRelieverJoinStatus ?? x.IsRelieverJoinStatus ?? null,
                    nsClearanceCompDate: x.nsClearanceCompDate ?? x.NSClearanceCompDate ?? null,
                    clearanceGivenDate: x.clearanceGivenDate ?? x.ClearanceGivenDate ?? null,
                    postingOrderFilesReferences: x.postingOrderFilesReferences ?? x.PostingOrderFilesReferences ?? null,
                    noteSheetFilesReferences: x.noteSheetFilesReferences ?? x.NoteSheetFilesReferences ?? null,
                    clearanceLatterFilesReferences: x.clearanceLatterFilesReferences ?? x.ClearanceLatterFilesReferences ?? null,
                    createdBy: x.createdBy ?? x.CreatedBy,
                    createdDate: x.createdDate ?? x.CreatedDate,
                    lastUpdatedBy: x.lastUpdatedBy ?? x.LastUpdatedBy,
                    lastupdate: x.lastupdate ?? x.Lastupdate
                }));
                this.isLoading = false;
            },
            error: () => {
                this.isLoading = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load posting records'
                });
            }
        });
    }

    formatDate(d: string | Date | null): string {
        if (!d) return 'N/A';
        try {
            const date = new Date(d as string);
            return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString();
        } catch {
            return 'N/A';
        }
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

    // --- File event handlers for 3 file sections ---
    onPostingOrderFileRowsChange(event: FileRowData[]): void {
        if (event && Array.isArray(event)) this.postingOrderFileRows = event;
    }
    onNoteSheetFileRowsChange(event: FileRowData[]): void {
        if (event && Array.isArray(event)) this.noteSheetFileRows = event;
    }
    onClearanceLatterFileRowsChange(event: FileRowData[]): void {
        if (event && Array.isArray(event)) this.clearanceLatterFileRows = event;
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

    // --- Reliever dropdown ---
    loadEmployeeOptions(): void {
        if (this.employeeOptions.length > 0) return;
        this.empService.getAll().pipe(
            catchError(() => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load employee list' });
                return of([]);
            })
        ).subscribe({
            next: (data: any[]) => {
                this.employeeOptions = (data || []).map((e: any) => {
                    const id = e.employeeID ?? e.EmployeeID;
                    const name = e.FullNameEN || e.fullNameEN || '';
                    const svcId = e.ServiceId || e.serviceId || '';
                    const rabId = e.RABID || e.Rabid || e.rabid || '';
                    const label = `${name}${svcId ? ' - ' + svcId : ''}${rabId ? ' (' + rabId + ')' : ''}`;
                    return { label, value: id };
                });
            }
        });
    }

    onRelieverSelected(event: any): void {
        const selectedId = event?.value;
        if (!selectedId) {
            this.relieverName = '';
            return;
        }
        const option = this.employeeOptions.find((o) => o.value === selectedId);
        if (option) {
            const namePart = option.label.split(' - ')[0]?.trim();
            this.relieverName = namePart || '';
        }
    }

    // --- Dialog open/close ---
    openAddDialog(): void {
        this.loadEmployeeOptions();
        this.isEditMode = false;
        this.isReadonly = false;
        this.editingPermPostingId = null;
        this.relieverName = '';
        this.postingOrderFileRows = [];
        this.noteSheetFileRows = [];
        this.clearanceLatterFileRows = [];
        this.postingForm.reset({
            poReceivedDate: null,
            hasReliever: false,
            relieverID: null,
            isRelieverJoinStatus: null,
            relieverJoinDate: null,
            nsClearanceCompleted: false,
            nsClearanceCompDate: null,
            clearanceGiven: false,
            clearanceGivenDate: null
        });
        this.displayDialog = true;
    }

    openEditDialog(row: PermPostingMotherOrgModel): void {
        this.loadEmployeeOptions();
        this.isEditMode = true;
        this.isReadonly = false;
        this.editingPermPostingId = row.permPostingId;

        this.postingOrderFileRows = this.parseFileRowsFromReferences(row.postingOrderFilesReferences);
        this.noteSheetFileRows = this.parseFileRowsFromReferences(row.noteSheetFilesReferences);
        this.clearanceLatterFileRows = this.parseFileRowsFromReferences(row.clearanceLatterFilesReferences);

        const poDate = row.poReceivedDate ? new Date(row.poReceivedDate) : null;
        const relieverJoinDate = row.relieverJoinDate ? new Date(row.relieverJoinDate) : null;
        const nsDate = row.nsClearanceCompDate ? new Date(row.nsClearanceCompDate) : null;
        const clearDate = row.clearanceGivenDate ? new Date(row.clearanceGivenDate) : null;

        this.postingForm.patchValue({
            poReceivedDate: poDate,
            hasReliever: row.hasReliever ?? false,
            relieverID: row.relieverID,
            isRelieverJoinStatus: row.isRelieverJoinStatus ?? null,
            relieverJoinDate: relieverJoinDate,
            nsClearanceCompleted: nsDate != null,
            nsClearanceCompDate: nsDate,
            clearanceGiven: clearDate != null,
            clearanceGivenDate: clearDate
        });

        // Set reliever name from dropdown options or fetch if not loaded yet
        if (row.relieverID) {
            const opt = this.employeeOptions.find((o) => o.value === row.relieverID);
            if (opt) {
                this.relieverName = opt.label.split(' - ')[0]?.trim() || '';
            } else {
                this.empService.getEmployeeById(row.relieverID).subscribe({
                    next: (e: any) => { this.relieverName = e ? (e.FullNameEN || e.fullNameEN || 'N/A') : ''; },
                    error: () => { this.relieverName = ''; }
                });
            }
        } else {
            this.relieverName = '';
        }

        this.displayDialog = true;
    }

    // --- Upload helper: uploads files for a single file-ref component, returns JSON string ---
    private uploadFilesForRef(
        fileRefComponent: FileReferencesFormComponent | undefined
    ): Observable<string | null> {
        if (!fileRefComponent) return of(null);

        const existingRefs = fileRefComponent.getExistingFileReferences() || [];
        const filesToUpload = fileRefComponent.getFilesToUpload() || [];

        if (filesToUpload.length === 0) {
            return of(existingRefs.length > 0 ? JSON.stringify(existingRefs) : null);
        }

        const uploads = filesToUpload.map((r: FileRowData) =>
            this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name)
        );

        return forkJoin(uploads).pipe(
            catchError((): Observable<{ fileId: number; fileName: string }[]> => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to upload file(s)' });
                return of([]);
            }),
            map((results): string | null => {
                const resultsArray = Array.isArray(results) ? results : [];
                const newRefs = (resultsArray as { fileId: number; fileName: string }[]).map((r) => ({
                    FileId: r.fileId,
                    fileName: r.fileName
                }));
                const allRefs = [
                    ...existingRefs.map((r: { FileId: number; fileName: string }) => ({ FileId: r.FileId, fileName: r.fileName })),
                    ...newRefs
                ];
                return allRefs.length > 0 ? JSON.stringify(allRefs) : null;
            })
        );
    }

    // --- Save ---
    saveRecord(): void {
        if (!this.selectedEmployeeId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected' });
            return;
        }

        this.isSaving = true;

        // Upload all 3 file sections in parallel
        forkJoin({
            postingOrder: this.uploadFilesForRef(this.postingOrderFileRef),
            noteSheet: this.uploadFilesForRef(this.noteSheetFileRef),
            clearanceLatter: this.uploadFilesForRef(this.clearanceLatterFileRef)
        }).subscribe({
            next: (fileResults) => {
                const v = this.postingForm.value;
                const toDateStr = (d: Date | null): string | null => {
                    if (!d) return null;
                    const x = new Date(d);
                    return isNaN(x.getTime()) ? null : x.toISOString().split('T')[0];
                };

                const payload: Partial<PermPostingMotherOrgModel> = {
                    permPostingId: this.isEditMode ? (this.editingPermPostingId ?? 0) : this.getNextPermPostingId(),
                    employeeId: this.selectedEmployeeId!,
                    poReceivedDate: toDateStr(v.poReceivedDate),
                    hasReliever: v.hasReliever ?? false,
                    relieverID: v.hasReliever ? (v.relieverID ?? null) : null,
                    isRelieverJoinStatus: v.hasReliever ? (v.isRelieverJoinStatus ?? null) : null,
                    relieverJoinDate: (v.hasReliever && v.isRelieverJoinStatus === true) ? toDateStr(v.relieverJoinDate) : null,
                    nsClearanceCompDate: v.nsClearanceCompleted ? toDateStr(v.nsClearanceCompDate) : toDateStr(null),
                    clearanceGivenDate: v.clearanceGiven ? toDateStr(v.clearanceGivenDate) : toDateStr(null),
                    postingOrderFilesReferences: fileResults.postingOrder,
                    noteSheetFilesReferences: fileResults.noteSheet,
                    clearanceLatterFilesReferences: fileResults.clearanceLatter,
                    createdBy: 'system',
                    lastUpdatedBy: 'system'
                };

                const req = this.isEditMode
                    ? this.permPostingService.update(payload)
                    : this.permPostingService.save(payload);

                req.subscribe({
                    next: () => {
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: this.isEditMode ? 'Record updated successfully.' : 'Record added successfully.'
                        });
                        this.displayDialog = false;
                        this.loadRecordList();
                        this.isSaving = false;
                    },
                    error: () => {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save record' });
                        this.isSaving = false;
                    }
                });
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to upload files' });
                this.isSaving = false;
            }
        });
    }

    private getNextPermPostingId(): number {
        if (this.recordList.length === 0) return 1;
        return Math.max(...this.recordList.map((r) => r.permPostingId)) + 1;
    }

    // --- Delete ---
    confirmDelete(row: PermPostingMotherOrgModel): void {
        this.confirmationService.confirm({
            message: 'Delete this posting record?',
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => this.deleteRecord(row)
        });
    }

    deleteRecord(row: PermPostingMotherOrgModel): void {
        this.permPostingService.delete(row.permPostingId, row.employeeId).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Record deleted.' });
                this.loadRecordList();
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete record' })
        });
    }

    // --- Employee search events ---
    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.recordList = [];
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.isReadonly = true;
        this.loadRecordList();
    }

    onEmployeeSearchReset(): void {
        this.resetForm();
    }

    enableEditMode(): void {
        this.mode = 'edit';
        this.isReadonly = false;
    }

    goBack(): void {
        this.router.navigate(['/emp-list']);
    }

    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.recordList = [];
    }
}
