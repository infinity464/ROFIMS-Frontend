import { Component, OnInit } from '@angular/core';
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
import { switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { EmpService } from '@/services/emp-service';
import { SharedService } from '@/shared/services/shared-service';
import { PermanentPostingMORecordService, PermanentPostingMORecordModel } from '@/services/permanent-posting-mo-record.service';
import { PermanentPostingJoineeDetailService, PermanentPostingJoineeDetailModel } from '@/services/permanent-posting-joinee-detail.service';

interface FileRef { fileId: number; fileName: string; }

@Component({
    selector: 'app-permanent-posting-mo-record',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, DatePickerModule, SelectModule, TableModule, DividerModule, TooltipModule, Toast],
    providers: [MessageService],
    templateUrl: './permanent-posting-mo-record.html'
})
export class PermanentPostingMORecordComponent implements OnInit {

    editId: number | null = null;
    editDetailId: number | null = null;
    saving = false;

    // Posted Out search
    searchServiceId = '';
    searchRabId = '';
    searching = false;
    postedOutEmployee: any = null;
    isOfficer = false;

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

    postingOrderFiles: FileRef[] = [];
    uploadingPO = false;

    // Reliever search
    relieverSearchId = '';
    relieverSearching = false;
    relieverEmployee: any = null;
    relieverNotFound = false;

    // New Joinee (detail table)
    joineeEmployeeId: number | null = null;
    joineeServiceId = '';
    joineePreviousRabId = '';
    joineeNameBangla = '';
    joineeJoiningOrderNo = '';
    joineeJoiningOrderDate: Date | null = null;
    joineePossibleJoiningDate: Date | null = null;
    joineeFiles: FileRef[] = [];
    uploadingJO = false;

    yesNoOptions = [{ label: 'Yes', value: true }, { label: 'No', value: false }];

    records: PermanentPostingMORecordModel[] = [];
    loadingList = false;

    constructor(
        private recordSvc: PermanentPostingMORecordService,
        private detailSvc: PermanentPostingJoineeDetailService,
        private empService: EmpService,
        private sharedService: SharedService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void { this.loadList(); }

    onSearchPostedOut(): void {
        if (!this.searchServiceId.trim() && !this.searchRabId.trim()) {
            this.messageService.add({ severity: 'warn', summary: 'Search', detail: 'Enter Service ID or RAB ID.' });
            return;
        }
        this.searching = true;
        this.empService.searchByRabIdOrServiceId(this.searchRabId || undefined, this.searchServiceId || undefined).subscribe({
            next: (emp) => {
                this.searching = false;
                if (!emp) { this.messageService.add({ severity: 'warn', summary: 'Not Found', detail: 'No employee found.' }); return; }
                this.postedOutEmployee = emp;
                this.isOfficer = emp.officerType != null && emp.officerType > 0;
            },
            error: () => { this.searching = false; this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Search failed.' }); }
        });
    }

    onSearchReliever(): void {
        if (!this.relieverSearchId.trim()) { this.messageService.add({ severity: 'warn', summary: 'Search', detail: 'Enter Service ID or RAB ID.' }); return; }
        this.relieverSearching = true; this.relieverEmployee = null; this.relieverNotFound = false;
        this.empService.searchByRabIdOrServiceId(this.relieverSearchId, this.relieverSearchId).subscribe({
            next: (emp) => {
                this.relieverSearching = false;
                if (!emp) { this.relieverNotFound = true; return; }
                this.relieverEmployee = emp;
                this.joineeEmployeeId = emp.EmployeeID;
                this.joineeServiceId = emp.ServiceId ?? '';
                this.joineePreviousRabId = emp.RABID ?? '';
                this.joineeNameBangla = emp.FullNameBN ?? '';
            },
            error: () => { this.relieverSearching = false; this.relieverNotFound = true; }
        });
    }

    onAddJoineeManually(): void { this.relieverNotFound = false; this.joineeEmployeeId = null; this.joineeServiceId = ''; this.joineePreviousRabId = ''; this.joineeNameBangla = ''; }

    onPostingOrderFileChange(e: Event): void {
        const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
        this.uploadingPO = true;
        this.empService.uploadEmployeeFile(file).subscribe({
            next: (r) => { this.postingOrderFiles.push({ fileId: r.fileId, fileName: r.fileName }); this.uploadingPO = false; },
            error: () => { this.uploadingPO = false; this.messageService.add({ severity: 'error', summary: 'Upload', detail: 'File upload failed.' }); }
        });
    }

    onJoineeFileChange(e: Event): void {
        const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
        this.uploadingJO = true;
        this.empService.uploadEmployeeFile(file).subscribe({
            next: (r) => { this.joineeFiles.push({ fileId: r.fileId, fileName: r.fileName }); this.uploadingJO = false; },
            error: () => { this.uploadingJO = false; this.messageService.add({ severity: 'error', summary: 'Upload', detail: 'File upload failed.' }); }
        });
    }

    removeFile(arr: FileRef[], i: number): void { arr.splice(i, 1); }

    onSave(): void {
        if (!this.postedOutEmployee) { this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Search and select the posted-out employee.' }); return; }
        if (!this.postingOrderDate) { this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Posting Order Date is required.' }); return; }
        if (this.isReliever === null) { this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Select whether a reliever is assigned.' }); return; }

        const user = this.sharedService.getCurrentUser() ?? 'system';

        const mainPayload: Partial<PermanentPostingMORecordModel> = {
            id: this.editId ?? 0,
            postedOutEmployeeId: this.postedOutEmployee.EmployeeID,
            postingOrderNo: this.postingOrderNo || null,
            postingOrderDate: this.formatDate(this.postingOrderDate)!,
            possibleReleaseDate: this.formatDate(this.possibleReleaseDate),
            isReliever: this.isReliever,
            relieverNotGivenReason: !this.isReliever ? (this.relieverNotGivenReason || null) : null,
            relieverEmployeeId: this.isReliever ? (this.relieverEmployee?.EmployeeID ?? null) : null,
            noteSheetClearance: this.isOfficer ? this.noteSheetClearance : null,
            nsClearanceDate: this.isOfficer ? this.formatDate(this.nsClearanceDate) : null,
            clearanceGiven: this.isOfficer ? this.clearanceGiven : null,
            clearanceGivenDate: this.isOfficer ? this.formatDate(this.clearanceGivenDate) : null,
            postingOrderFilesReferences: this.postingOrderFiles.length ? JSON.stringify(this.postingOrderFiles) : null,
            status: 'Draft',
            createdBy: user,
            lastUpdatedBy: user
        };

        this.saving = true;

        // Step 1: save main → Step 2: save joinee detail with returned Id
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
                    joiningOrderFilesReferences: this.joineeFiles.length ? JSON.stringify(this.joineeFiles) : null,
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

    onEdit(row: PermanentPostingMORecordModel): void {
        this.editId = row.id;
        this.postingOrderNo = row.postingOrderNo ?? '';
        this.postingOrderDate = row.postingOrderDate ? new Date(row.postingOrderDate) : null;
        this.possibleReleaseDate = row.possibleReleaseDate ? new Date(row.possibleReleaseDate) : null;
        this.isReliever = row.isReliever;
        this.relieverNotGivenReason = row.relieverNotGivenReason ?? '';
        this.noteSheetClearance = row.noteSheetClearance ?? null;
        this.nsClearanceDate = row.nsClearanceDate ? new Date(row.nsClearanceDate) : null;
        this.clearanceGiven = row.clearanceGiven ?? null;
        this.clearanceGivenDate = row.clearanceGivenDate ? new Date(row.clearanceGivenDate) : null;
        this.postingOrderFiles = row.postingOrderFilesReferences ? JSON.parse(row.postingOrderFilesReferences) : [];
        this.empService.getEmployeeById(row.postedOutEmployeeId).subscribe({ next: (emp) => { this.postedOutEmployee = emp; this.isOfficer = emp?.officerType != null && emp.officerType > 0; } });
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
                this.joineeFiles = d.joiningOrderFilesReferences ? JSON.parse(d.joiningOrderFilesReferences) : [];
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
        this.searchServiceId = ''; this.searchRabId = ''; this.postedOutEmployee = null; this.isOfficer = false;
        this.postingOrderNo = ''; this.postingOrderDate = null; this.possibleReleaseDate = null;
        this.isReliever = null; this.relieverNotGivenReason = '';
        this.noteSheetClearance = null; this.nsClearanceDate = null; this.clearanceGiven = null; this.clearanceGivenDate = null;
        this.postingOrderFiles = [];
        this.relieverSearchId = ''; this.relieverEmployee = null; this.relieverNotFound = false;
        this.joineeEmployeeId = null; this.joineeServiceId = ''; this.joineePreviousRabId = ''; this.joineeNameBangla = '';
        this.joineeJoiningOrderNo = ''; this.joineeJoiningOrderDate = null; this.joineePossibleJoiningDate = null; this.joineeFiles = [];
    }
}
