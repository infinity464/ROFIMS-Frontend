import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Fluid } from 'primeng/fluid';
import { ButtonModule } from 'primeng/button';
import { BankBranchModel } from '../shared/models/bank-branch';
import { BankModel } from '../shared/models/bank';
import { ConfirmationService, MessageService } from 'primeng/api';
import { SharedService } from '@/shared/services/shared-service';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { InputText } from 'primeng/inputtext';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { TableModule } from 'primeng/table';
import { Select } from 'primeng/select';

@Component({
    selector: 'app-bank-branch',
    imports: [ReactiveFormsModule, TableModule, InputText, Fluid, ButtonModule, IconField, InputIcon, TableModule, Select],
    templateUrl: './bank-branch.html',
    styleUrl: './bank-branch.scss'
})
export class BankBranchComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    isSubmitting = false;
    bankBranchForm!: FormGroup;

    bankBranches: BankBranchModel[] = [];
    filteredBankBranches: BankBranchModel[] = [];
    banks: BankModel[] = [];
    bankOptions: { bankId: number | null; bankNameEN: string }[] = [];

    editingId: number | null = null;
    currentUser: string = '';

    first = 0;
    rows = 10;
    totalRecords = 0;
    searchValue = '';

    constructor(
        private fb: FormBuilder,
        private masterBasicSetupService: MasterBasicSetupService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private sharedService: SharedService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.currentUser = this.sharedService.getCurrentUser();
        this.initForm();
        this.setupFormFilterListeners();
        this.getAll();
        this.loadBanks();
    }

    private setupFormFilterListeners() {
        this.bankBranchForm.get('bankId')?.valueChanges.subscribe(() => {
            this.first = 0;
            this.buildTableData();
        });
    }

    private buildTableData() {
        let list = [...this.bankBranches];
        const bankId = this.bankBranchForm?.get('bankId')?.value;
        if (bankId != null) {
            list = list.filter((b) => b.bankId === bankId);
        }
        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) {
            list = list.filter((b) =>
                (b.branchNameEN && b.branchNameEN.toLowerCase().includes(q)) ||
                (b.branchNameBN && b.branchNameBN.toLowerCase().includes(q)) ||
                (b.location && b.location.toLowerCase().includes(q)) ||
                this.getBankName(b.bankId).toLowerCase().includes(q)
            );
        }
        this.filteredBankBranches = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    initForm() {
        this.bankBranchForm = this.fb.group({
            bankBranchId: [0],
            bankId: [null],
            branchNameEN: ['', Validators.required],
            branchNameBN: [''],
            location: [''],
            createdBy: [this.currentUser],
            createdDate: [new Date()],
            lastUpdatedBy: [this.currentUser],
            lastupdate: [new Date()]
        });
    }

    loadBanks() {
        this.masterBasicSetupService.getAllBank().subscribe({
            next: (res: BankModel[]) => {
                this.banks = res ?? [];
                this.bankOptions = this.banks;
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to fetch banks'
                });
            }
        });
    }

    getAll() {
        this.masterBasicSetupService.getAllBankBranch().subscribe({
            next: (res: BankBranchModel[]) => {
                this.bankBranches = Array.isArray(res) ? res : [];
                this.buildTableData();
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to fetch bank branches'
                });
            }
        });
    }

    onSearch(event: Event) {
        const target = event.target as HTMLInputElement;
        this.searchValue = (target?.value ?? '').toLowerCase().trim();
        this.first = 0;
        this.buildTableData();
    }

    getBankName(bankId: number): string {
        const bank = this.banks.find((x) => x.bankId === bankId);
        return bank ? bank.bankNameEN || '' : '';
    }

    onSubmit() {
        if (this.isSubmitting) return;

        if (this.bankBranchForm.invalid) {
            this.bankBranchForm.markAllAsTouched();
            return;
        }

        if (this.editingId) {
            this.update();
        } else {
            this.create();
        }
    }

    create() {
        this.isSubmitting = true;

        this.masterBasicSetupService.createBankBranch(this.bankBranchForm.value).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Bank branch created successfully'
                });
                this.onReset();
                this.getAll();
                this.isSubmitting = false;
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to create bank branch'
                });
                this.isSubmitting = false;
            }
        });
    }

    update() {
        this.isSubmitting = true;

        const updatePayload = {
            ...this.bankBranchForm.value,
            bankBranchId: this.editingId
        };

        this.masterBasicSetupService.updateBankBranch(updatePayload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Bank branch updated successfully'
                });
                this.onReset();
                this.getAll();
                this.isSubmitting = false;
            },
            error: (err: any) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to update bank branch'
                });
                this.isSubmitting = false;
            }
        });
    }

    onEdit(row: BankBranchModel) {
        this.editingId = row.bankBranchId;
        this.bankBranchForm.patchValue(row);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    onDelete(row: BankBranchModel, event: Event) {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Do you want to delete this record?',
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            acceptIcon: 'pi pi-check',
            rejectIcon: 'pi pi-times',
            rejectLabel: 'Cancel',
            acceptLabel: 'Delete',
            rejectButtonProps: {
                label: 'Cancel',
                severity: 'secondary',
                outlined: true
            },
            acceptButtonProps: {
                label: 'Delete',
                severity: 'danger'
            },
            accept: () => {
                this.masterBasicSetupService.deleteBankBranch(row.bankBranchId).subscribe({
                    next: () => {
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'Bank branch deleted successfully'
                        });
                        this.getAll();
                    },
                    error: (err: any) => {
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: err?.error?.message || 'Failed to delete bank branch'
                        });
                    }
                });
            }
        });
    }

    onReset() {
        this.editingId = null;
        this.searchValue = '';
        this.bankBranchForm.reset({
            bankBranchId: 0,
            bankId: null,
            createdBy: this.currentUser,
            createdDate: new Date(),
            lastUpdatedBy: this.currentUser,
            lastupdate: new Date()
        });
        this.buildTableData();
        this.isSubmitting = false;
    }
}
