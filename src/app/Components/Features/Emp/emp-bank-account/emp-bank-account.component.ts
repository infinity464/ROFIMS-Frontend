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

import { EmpService } from '@/services/emp-service';
import { BankAccInfoService, BankAccInfoModel } from '@/services/bank-acc-info-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { BankModel } from '@/Components/basic-setup/shared/models/bank';
import { BankBranchModel } from '@/Components/basic-setup/shared/models/bank-branch';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { FileReferencesFormComponent, FileRowData } from '@components/Common/file-references-form/file-references-form';

@Component({
    selector: 'app-emp-bank-account',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, InputTextModule, ButtonModule, Fluid, TooltipModule, TableModule, SelectModule, DialogModule, ConfirmDialogModule, EmployeeSearchComponent, FileReferencesFormComponent],
    providers: [ConfirmationService],
    templateUrl: './emp-bank-account.component.html',
    styleUrl: './emp-bank-account.component.scss'
})
export class EmpBankAccount implements OnInit {
    @ViewChild('fileReferencesForm') fileReferencesForm!: any;

    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;

    bankAccList: BankAccInfoModel[] = [];
    isLoading = false;

    displayDialog = false;
    isEditMode = false;
    isSaving = false;
    bankAccForm!: FormGroup;
    editingBankInfoId: number | null = null;

    fileRows: FileRowData[] = [];
    banks: BankModel[] = [];
    bankBranches: BankBranchModel[] = [];
    branchOptions: BankBranchModel[] = [];

    constructor(
        private empService: EmpService,
        private bankAccInfoService: BankAccInfoService,
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
        this.loadBanksAndBranches();
        this.checkRouteParams();
    }

    initForm(): void {
        this.bankAccForm = this.fb.group({
            employeeId: [0],
            bankInfoId: [0],
            bankId: [null, Validators.required],
            branchId: [null, Validators.required],
            accountNumber: ['', Validators.required],
            accountNameEN: ['', Validators.required]
        });
    }

    loadBanksAndBranches(): void {
        this.masterBasicSetupService.getAllBank().subscribe({
            next: (data) => {
                this.banks = Array.isArray(data) ? data : [];
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load banks' })
        });
        this.masterBasicSetupService.getAllBankBranch().subscribe({
            next: (data) => {
                this.bankBranches = Array.isArray(data) ? data : [];
                this.updateBranchOptions();
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load bank branches' })
        });
    }

    onBankChange(): void {
        this.updateBranchOptions();
        this.bankAccForm.patchValue({ branchId: null });
    }

    updateBranchOptions(): void {
        const bankId = this.bankAccForm?.get('bankId')?.value;
        this.branchOptions = bankId ? this.bankBranches.filter((b) => b.bankId === bankId) : [];
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
                    this.loadBankAccList();
                }
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load employee' })
        });
    }

    loadBankAccList(): void {
        if (!this.selectedEmployeeId) return;
        this.isLoading = true;
        this.bankAccInfoService.getByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (data: any) => {
                const list = Array.isArray(data) ? data : [];
                this.bankAccList = list.map((item: any) => ({
                    employeeId: item.employeeId ?? item.EmployeeId,
                    bankInfoId: item.bankInfoId ?? item.BankInfoId,
                    bankId: item.bankId ?? item.BankId,
                    branchId: item.branchId ?? item.BranchId,
                    accountNumber: item.accountNumber ?? item.AccountNumber ?? '',
                    accountNameEN: item.accountNameEN ?? item.AccountNameEN ?? '',
                    accountNameBN: item.accountNameBN ?? item.AccountNameBN ?? '',
                    remarks: item.remarks ?? item.Remarks ?? null,
                    filesReferences: item.filesReferences ?? item.FilesReferences ?? null
                }));
                this.isLoading = false;
            },
            error: () => {
                this.isLoading = false;
            }
        });
    }

    getBankName(bankId: number): string {
        const b = this.banks.find((x) => x.bankId === bankId);
        return b ? b.bankNameEN || '' : 'N/A';
    }

    getBranchName(branchId: number): string {
        const b = this.bankBranches.find((x) => x.bankBranchId === branchId);
        return b ? b.branchNameEN || b.branchNameBN || '' : 'N/A';
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
        this.isEditMode = false;
        this.editingBankInfoId = null;
        this.fileRows = [];
        this.bankAccForm.reset({
            employeeId: this.selectedEmployeeId ?? 0,
            bankInfoId: 0,
            bankId: null,
            branchId: null,
            accountNumber: '',
            accountNameEN: ''
        });
        this.updateBranchOptions();
        this.displayDialog = true;
    }

    openEditDialog(row: BankAccInfoModel): void {
        this.isEditMode = true;
        this.editingBankInfoId = row.bankInfoId;
        this.fileRows = this.parseFileRowsFromReferences(row.filesReferences);
        this.bankAccForm.patchValue({
            employeeId: row.employeeId,
            bankInfoId: row.bankInfoId,
            bankId: row.bankId,
            branchId: row.branchId,
            accountNumber: row.accountNumber,
            accountNameEN: row.accountNameEN
        });
        this.updateBranchOptions();
        this.displayDialog = true;
    }

    saveBankAcc(): void {
        if (this.bankAccForm.invalid) {
            this.bankAccForm.markAllAsTouched();
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please fill required fields' });
            return;
        }
        if (this.selectedEmployeeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected' });
            return;
        }
        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const doSave = (filesReferencesJson: string | null) => {
            const formValue = this.bankAccForm.value;
            const payload: Partial<BankAccInfoModel> = {
                employeeId: this.selectedEmployeeId!,
                bankInfoId: this.isEditMode ? (this.editingBankInfoId ?? 0) : 0,
                bankId: formValue.bankId,
                branchId: formValue.branchId,
                accountNumber: formValue.accountNumber,
                accountNameEN: formValue.accountNameEN,
                accountNameBN: '',
                filesReferences: filesReferencesJson ?? undefined,
                createdBy: 'system',
                lastUpdatedBy: 'system'
            };

            this.isSaving = true;
            const req = this.isEditMode ? this.bankAccInfoService.update(payload) : this.bankAccInfoService.save(payload);

            req.subscribe({
                next: () => {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: this.isEditMode ? 'Bank account updated.' : 'Bank account added.' });
                    this.displayDialog = false;
                    this.loadBankAccList();
                    this.isSaving = false;
                },
                error: () => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save bank account' });
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

    confirmDelete(row: BankAccInfoModel): void {
        this.confirmationService.confirm({
            message: `Delete account ${row.accountNumber}?`,
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => this.deleteBankAcc(row)
        });
    }

    deleteBankAcc(row: BankAccInfoModel): void {
        this.bankAccInfoService.delete(row.employeeId, row.bankInfoId).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Bank account deleted.' });
                this.loadBankAccList();
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete' })
        });
    }

    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.isReadonly = true;
        this.loadBankAccList();
    }

    onEmployeeSearchReset(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.bankAccList = [];
    }

    enableEditMode(): void {
        this.mode = 'edit';
        this.isReadonly = false;
    }
    goBack(): void {
        this.router.navigate(['/emp-list']);
    }
}
