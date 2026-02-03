import { Component, OnInit } from '@angular/core';
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
    isSubmitting = false;
    bankBranchForm!: FormGroup;

    bankBranches: BankBranchModel[] = [];
    filteredBankBranches: BankBranchModel[] = [];
    banks: BankModel[] = [];

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
        this.getAll();
        this.loadBanks();
        this.currentUser = this.sharedService.getCurrentUser();
        this.initForm();
    }

    initForm() {
        this.bankBranchForm = this.fb.group({
            bankBranchId: [0],
            bankId: [null, Validators.required],
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
                this.banks = res;
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to fetch banks'
                });
            }
        });
    }

    getAll() {
        this.masterBasicSetupService.getAllBankBranch().subscribe({
            next: (res: BankBranchModel[]) => {
                const list = Array.isArray(res) ? res : [];
                this.bankBranches = list;
                this.filteredBankBranches = [...list];
                this.totalRecords = list.length;
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to fetch bank branches'
                });
            }
        });
    }

    onSearch(event: Event) {
        const target = event.target as HTMLInputElement;
        this.searchValue = target.value.toLowerCase().trim();

        if (this.searchValue) {
            this.filteredBankBranches = this.bankBranches.filter(
                (b) =>
                    (b.branchNameEN && b.branchNameEN.toLowerCase().includes(this.searchValue)) ||
                    (b.branchNameBN && b.branchNameBN.toLowerCase().includes(this.searchValue)) ||
                    (b.location && b.location.toLowerCase().includes(this.searchValue)) ||
                    this.getBankName(b.bankId).toLowerCase().includes(this.searchValue)
            );
        } else {
            this.filteredBankBranches = [...this.bankBranches];
        }

        this.totalRecords = this.filteredBankBranches.length;
        this.first = 0;
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
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create bank branch'
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
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to update bank branch'
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
                    error: () => {
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: 'Failed to delete bank branch'
                        });
                    }
                });
            }
        });
    }

    onReset() {
        this.editingId = null;
        this.bankBranchForm.reset({
            bankBranchId: 0,
            bankId: null,
            createdBy: this.currentUser,
            createdDate: new Date(),
            lastUpdatedBy: this.currentUser,
            lastupdate: new Date()
        });
        this.isSubmitting = false;
    }
}
