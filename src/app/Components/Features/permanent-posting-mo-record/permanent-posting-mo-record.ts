import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { DividerModule } from 'primeng/divider';
import { TooltipModule } from 'primeng/tooltip';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { EmpService } from '@/services/emp-service';
import { SharedService } from '@/shared/services/shared-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { PermanentPostingMORecordService, PermanentPostingMORecordModel } from '@/services/permanent-posting-mo-record.service';
import { PermanentPostingJoineeDetailService, PermanentPostingJoineeDetailModel } from '@/services/permanent-posting-joinee-detail.service';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

@Component({
    selector: 'app-permanent-posting-mo-record',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, DatePickerModule, SelectModule, TableModule, DividerModule, TooltipModule, Toast, EmployeeSearchComponent, FileReferencesFormComponent, FlexibleDateDirective],
    providers: [MessageService],
    templateUrl: './permanent-posting-mo-record.html'
})
export class PermanentPostingMORecordComponent implements OnInit {

    @ViewChild('poFileForm') poFileForm!: FileReferencesFormComponent;
    @ViewChild('joFileForm') joFileForm!: FileReferencesFormComponent;

    editId: number | null = null;
    editDetailId: number | null = null;
    saving = false;

    // Posted Out employee
    postedOutEmployee: EmployeeBasicInfo | null = null;
    editPostedOutEmployeeId: number | null = null;
    isOfficer = false;

    // Posting unit dropdown (loaded from posted-out employee's mother org)
    postingUnitId: number | null = null;
    postingUnitOptions: { label: string; value: number }[] = [];

    // Posted Out fields
    postingOrderNo = '';
    postingOrderDate: Date | null = null;
    possibleReleaseDate: Date | null = null;
    isReliever: boolean | null = null;
    relieverNotGivenReason = '';

    // Officer-only
    noteSheetClearance: boolean | null = null;
    nsClearanceDate: Date | null = null;
    clearanceGiven: boolean | null = null;
    clearanceGivenDate: Date | null = null;

    // Posting Order files
    postingOrderFileRows: FileRowData[] = [];

    // Reliever / New Joinee employee
    relieverEmployee: EmployeeBasicInfo | null = null;
    editRelieverEmployeeId: number | null = null;

    // New Joinee detail
    joineeEmployeeId: number | null = null;
    joineeServiceId = '';
    joineePreviousRabId = '';
    joineeNameBangla = '';
    joineeJoiningOrderNo = '';
    joineeJoiningOrderDate: Date | null = null;
    joineePossibleJoiningDate: Date | null = null;

    // Joining Order files
    joineeFileRows: FileRowData[] = [];

    yesNoOptions = [{ label: 'Yes', value: true }, { label: 'No', value: false }];

    records: PermanentPostingMORecordModel[] = [];
    loadingList = false;

    constructor(
        private recordSvc: PermanentPostingMORecordService,
        private detailSvc: PermanentPostingJoineeDetailService,
        private empService: EmpService,
        private sharedService: SharedService,
        private messageService: MessageService,
        private orgService: OrganizationService
    ) {}

    ngOnInit(): void { this.loadList(); }

    // ── Employee search events ──────────────────────────────────────
    onPostedOutFound(employee: EmployeeBasicInfo): void {
        this.postedOutEmployee = employee;
        this.isOfficer = (employee as any).officerType != null && (employee as any).officerType > 0;

        this.orgService.getOrgUnitsByEmployeeId(employee.employeeID).subscribe({
            next: (units) => {
                this.postingUnitOptions = units.map(u => ({ label: u.orgNameEN, value: u.orgId }));
            },
            error: () => { this.postingUnitOptions = []; }
        });
    }

    onPostedOutReset(): void {
        this.postedOutEmployee = null;
        this.isOfficer = false;
        this.postingUnitOptions = [];
        this.postingUnitId = null;
    }

    onRelieverFound(employee: EmployeeBasicInfo): void {
        this.relieverEmployee = employee;
        this.joineeEmployeeId = employee.employeeID;
        this.joineeServiceId = employee.serviceId ?? '';
        this.joineePreviousRabId = employee.rabid ?? '';
        this.joineeNameBangla = employee.fullNameBN ?? '';
    }

    onRelieverReset(): void {
        this.relieverEmployee = null;
        this.joineeEmployeeId = null;
        this.joineeServiceId = '';
        this.joineePreviousRabId = '';
        this.joineeNameBangla = '';
    }

    // ── File row change (two-way binding with file-references-form) ─
    onPOFileRowsChange(rows: FileRowData[]): void { this.postingOrderFileRows = rows; }
    onJOFileRowsChange(rows: FileRowData[]): void { this.joineeFileRows = rows; }

    // ── Download ────────────────────────────────────────────────────
    onDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download file.' })
        });
    }

    // ── Save ────────────────────────────────────────────────────────
    onSave(): void {
        if (!this.postedOutEmployee) { this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Search and select the posted-out employee.' }); return; }
        if (this.isReliever === null) { this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Select whether a reliever is assigned.' }); return; }

        this.saving = true;

        const poNewFiles = this.poFileForm?.getFilesToUpload() ?? [];
        const joNewFiles = this.joFileForm?.getFilesToUpload() ?? [];
        const poExisting = this.poFileForm?.getExistingFileReferences() ?? [];
        const joExisting = this.joFileForm?.getExistingFileReferences() ?? [];

        const uploads$ = [
            ...poNewFiles.map(r => this.empService.uploadEmployeeFile(r.file!)),
            ...joNewFiles.map(r => this.empService.uploadEmployeeFile(r.file!))
        ];

        const proceed = (poUploaded: { fileId: number; fileName: string }[], joUploaded: { fileId: number; fileName: string }[]) => {
            const poRefs = [
                ...poExisting.map(r => ({ fileId: r.FileId, fileName: r.fileName })),
                ...poUploaded
            ];
            const joRefs = [
                ...joExisting.map(r => ({ fileId: r.FileId, fileName: r.fileName })),
                ...joUploaded
            ];
            this.doSave(poRefs, joRefs);
        };

        if (uploads$.length > 0) {
            forkJoin(uploads$).subscribe({
                next: (results) => {
                    proceed(
                        results.slice(0, poNewFiles.length),
                        results.slice(poNewFiles.length)
                    );
                },
                error: () => { this.saving = false; this.messageService.add({ severity: 'error', summary: 'Upload', detail: 'File upload failed.' }); }
            });
        } else {
            proceed([], []);
        }
    }

    private doSave(poRefs: { fileId: number; fileName: string }[], joRefs: { fileId: number; fileName: string }[]): void {
        const user = this.sharedService.getCurrentUser() ?? 'system';

        const mainPayload: Partial<PermanentPostingMORecordModel> = {
            id: this.editId ?? 0,
            postedOutEmployeeId: this.postedOutEmployee!.employeeID,
            postingUnitId: this.postingUnitId,
            postingOrderNo: this.postingOrderNo || null,
            postingOrderDate: this.formatDate(this.postingOrderDate)!,
            possibleReleaseDate: this.formatDate(this.possibleReleaseDate),
            isReliever: this.isReliever!,
            relieverNotGivenReason: !this.isReliever ? (this.relieverNotGivenReason || null) : null,
            relieverEmployeeId: this.isReliever ? (this.relieverEmployee?.employeeID ?? null) : null,
            noteSheetClearance: this.isOfficer ? this.noteSheetClearance : null,
            nsClearanceDate: this.isOfficer ? this.formatDate(this.nsClearanceDate) : null,
            clearanceGiven: this.isOfficer ? this.clearanceGiven : null,
            clearanceGivenDate: this.isOfficer ? this.formatDate(this.clearanceGivenDate) : null,
            postingOrderFilesReferences: poRefs.length ? JSON.stringify(poRefs) : null,
            status: 'Draft',
            createdBy: user,
            lastUpdatedBy: user
        };

        this.recordSvc.saveUpdate(mainPayload).pipe(
            switchMap((res) => {
                if (res?.statusCode !== 200) return of({ mainRes: res, detailRes: null });
                const recordId = res.data?.id ?? res.id ?? this.editId ?? 0;
                const detailPayload: Partial<PermanentPostingJoineeDetailModel> = {
                    id: this.editDetailId ?? 0,
                    permanentPostingMORecordId: recordId,
                    employeeId: this.joineeEmployeeId,
                    serviceId: this.joineeServiceId || null,
                    previousRabId: this.joineePreviousRabId || null,
                    nameBangla: this.joineeNameBangla || null,
                    joiningOrderNo: this.joineeJoiningOrderNo || null,
                    joiningOrderDate: this.formatDate(this.joineeJoiningOrderDate),
                    possibleJoiningDate: this.formatDate(this.joineePossibleJoiningDate),
                    joiningOrderFilesReferences: joRefs.length ? JSON.stringify(joRefs) : null,
                    createdBy: user,
                    lastUpdatedBy: user
                };
                return this.detailSvc.saveUpdate(detailPayload).pipe(switchMap((dr) => of({ mainRes: res, detailRes: dr })));
            })
        ).subscribe({
            next: ({ mainRes }) => {
                this.saving = false;
                const ok = mainRes?.statusCode === 200;
                this.messageService.add({ severity: ok ? 'success' : 'warn', summary: 'Save', detail: ok ? 'Saved successfully.' : (mainRes?.description ?? 'Save failed.') });
                if (ok) { this.resetForm(); this.loadList(); }
            },
            error: (err) => { this.saving = false; this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? 'Save failed.' }); }
        });
    }

    // ── Edit ────────────────────────────────────────────────────────
    onEdit(row: PermanentPostingMORecordModel): void {
        this.editId = row.id;
        this.editPostedOutEmployeeId = row.postedOutEmployeeId;
        this.editRelieverEmployeeId = row.relieverEmployeeId ?? null;
        this.postingUnitId = row.postingUnitId ?? null;
        this.postingOrderNo = row.postingOrderNo ?? '';
        this.postingOrderDate = row.postingOrderDate ? new Date(row.postingOrderDate) : null;
        this.possibleReleaseDate = row.possibleReleaseDate ? new Date(row.possibleReleaseDate) : null;
        this.isReliever = row.isReliever;
        this.relieverNotGivenReason = row.relieverNotGivenReason ?? '';
        this.noteSheetClearance = row.noteSheetClearance ?? null;
        this.nsClearanceDate = row.nsClearanceDate ? new Date(row.nsClearanceDate) : null;
        this.clearanceGiven = row.clearanceGiven ?? null;
        this.clearanceGivenDate = row.clearanceGivenDate ? new Date(row.clearanceGivenDate) : null;

        // Convert stored JSON refs → FileRowData[]
        this.postingOrderFileRows = row.postingOrderFilesReferences
            ? (JSON.parse(row.postingOrderFilesReferences) as { fileId: number; fileName: string }[])
                .map(r => ({ displayName: r.fileName, file: null, fileId: r.fileId }))
            : [];

        this.detailSvc.getByRecordId(row.id).subscribe({
            next: (d) => {
                if (!d) return;
                this.editDetailId = d.id;
                this.joineeEmployeeId = d.employeeId ?? null;
                this.joineeServiceId = d.serviceId ?? '';
                this.joineePreviousRabId = d.previousRabId ?? '';
                this.joineeNameBangla = d.nameBangla ?? '';
                this.joineeJoiningOrderNo = d.joiningOrderNo ?? '';
                this.joineeJoiningOrderDate = d.joiningOrderDate ? new Date(d.joiningOrderDate) : null;
                this.joineePossibleJoiningDate = d.possibleJoiningDate ? new Date(d.possibleJoiningDate) : null;
                this.joineeFileRows = d.joiningOrderFilesReferences
                    ? (JSON.parse(d.joiningOrderFilesReferences) as { fileId: number; fileName: string }[])
                        .map(r => ({ displayName: r.fileName, file: null, fileId: r.fileId }))
                    : [];
            }
        });
    }

    onDelete(row: PermanentPostingMORecordModel): void {
        if (!confirm(`Delete record #${row.id}?`)) return;
        this.recordSvc.delete(row.id).subscribe({
            next: () => { this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Record deleted.' }); this.loadList(); },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Delete failed.' })
        });
    }

    onCancel(): void { this.resetForm(); }

    loadList(): void {
        this.loadingList = true;
        this.recordSvc.getAll().subscribe({ next: (d) => { this.records = d; this.loadingList = false; }, error: () => { this.loadingList = false; } });
    }

    formatDate(d: Date | null): string | null {
        if (!d) return null;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    formatDisplay(v: string | null | undefined): string {
        if (!v) return '-';
        const d = new Date(v); return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    resetForm(): void {
        this.editId = null; this.editDetailId = null;
        this.editPostedOutEmployeeId = null; this.editRelieverEmployeeId = null;
        this.postedOutEmployee = null; this.isOfficer = false;
        this.postingUnitId = null; this.postingUnitOptions = [];
        this.postingOrderNo = ''; this.postingOrderDate = null; this.possibleReleaseDate = null;
        this.isReliever = null; this.relieverNotGivenReason = '';
        this.noteSheetClearance = null; this.nsClearanceDate = null; this.clearanceGiven = null; this.clearanceGivenDate = null;
        this.postingOrderFileRows = [];
        this.relieverEmployee = null;
        this.joineeEmployeeId = null; this.joineeServiceId = ''; this.joineePreviousRabId = ''; this.joineeNameBangla = '';
        this.joineeJoiningOrderNo = ''; this.joineeJoiningOrderDate = null; this.joineePossibleJoiningDate = null;
        this.joineeFileRows = [];
    }
}
