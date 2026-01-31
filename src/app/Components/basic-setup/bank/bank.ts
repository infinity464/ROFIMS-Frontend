import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Fluid } from "primeng/fluid";
import { ButtonModule } from "primeng/button";
import { BankModel } from '../shared/models/bank';
import { ConfirmationService, MessageService } from 'primeng/api';
import { SharedService } from '@/shared/services/shared-service';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { InputText } from 'primeng/inputtext';
import { IconField } from "primeng/iconfield";
import { InputIcon } from "primeng/inputicon";
import { TableModule } from "primeng/table";

@Component({
    selector: 'app-bank',
    imports: [ReactiveFormsModule, TableModule, InputText, Fluid, ButtonModule, IconField, InputIcon, TableModule],
    templateUrl: './bank.html',
    styleUrl: './bank.scss'
})
export class Bank implements OnInit {
     isSubmitting = false;
     bankForm! : FormGroup

    banks: BankModel[] = [];
    filteredBanks: BankModel[] = [];

    editingId: number | null = null;
    currentUser: string = '';

    // Pagination
    first = 0;
    rows = 10;
    totalRecords = 0;

    // Search
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
        this.currentUser = this.sharedService.getCurrentUser();
        this.initForm();
    }

    initForm() {
        this.bankForm = this.fb.group({
            bankId: [0],

            bankNameEN: ['', Validators.required],
            bankNameBN: ['', Validators.required],

            branchName: [''],
            routingNumber: [''],
            swiftCode: [''],

            createdBy: [this.currentUser],
            createdDate: [new Date()],
            lastUpdatedBy: [this.currentUser],
            lastUpdate: [new Date()]
        });
    }

    getAll() {
        this.masterBasicSetupService.getAllBank().subscribe({
            next: (res: BankModel[]) => {
                this.banks = res;
                this.filteredBanks = [...res];
                this.totalRecords = res.length;
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

    onSearch(event: Event) {
        const target = event.target as HTMLInputElement;
        this.searchValue = target.value.toLowerCase().trim();

        if (this.searchValue) {
            this.filteredBanks = this.banks.filter(b =>
                b.bankNameEN.toLowerCase().includes(this.searchValue) ||
                b.bankNameBN.toLowerCase().includes(this.searchValue) ||
                b.branchName.toLowerCase().includes(this.searchValue)
            );
        } else {
            this.filteredBanks = [...this.banks];
        }

        this.totalRecords = this.filteredBanks.length;
        this.first = 0;
    }

    onSubmit() {
        if (this.isSubmitting) return;

        if (this.bankForm.invalid) {
            this.bankForm.markAllAsTouched();
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

        this.masterBasicSetupService.createBank(this.bankForm.value).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Bank created successfully'
                });
                this.onReset();
                this.getAll();
                this.isSubmitting = false;
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create bank'
                });
                this.isSubmitting = false;
            }
        });
    }

    update() {
        this.isSubmitting = true;

        const updatePayload = {
            ...this.bankForm.value,
            bankId: this.editingId
        };

        this.masterBasicSetupService.updateBank(updatePayload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Bank updated successfully'
                });
                this.onReset();
                this.getAll();
                this.isSubmitting = false;
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to update bank'
                });
                this.isSubmitting = false;
            }
        });
    }

    onEdit(bank: BankModel) {
        this.editingId = bank.bankId;
        this.bankForm.patchValue(bank);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    onDelete(bank: BankModel, event: Event) {
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
                this.masterBasicSetupService.deleteBank(bank.bankId).subscribe({
                    next: () => {
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'Bank deleted successfully'
                        });
                        this.getAll();
                    },
                    error: () => {
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: 'Failed to delete bank'
                        });
                    }
                });
            }
        });
    }

    onReset() {
        this.editingId = null;
        this.bankForm.reset({
            bankId: 0,
            createdBy: this.currentUser,
            createdDate: new Date(),
            lastUpdatedBy: this.currentUser,
            lastUpdate: new Date()
        });
        this.isSubmitting = false;
    }

}
