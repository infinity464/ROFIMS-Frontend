import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { EmpService } from '@/services/emp-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { EmployeeSearchInfoModel } from '@/models/EmpModel';

interface AdditionalRemarksItem {
    additionalRemarksId?: number;
    AdditionalRemarksId?: number;
    employeeID?: number;
    EmployeeID?: number;
    additionalRemarks?: string;
    AdditionalRemarks?: string;
    createdBy?: string;
    CreatedBy?: string;
    createdDate?: string;
    CreatedDate?: string;
    lastUpdatedBy?: string;
    LastUpdatedBy?: string;
    lastupdate?: string;
    Lastupdate?: string;
}

@Component({
    selector: 'app-emp-additional-remarks',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        InputTextModule,
        TextareaModule,
        ButtonModule,
        Fluid,
        TooltipModule,
        TableModule,
        DialogModule,
        ConfirmDialogModule,
        EmployeeSearchComponent
    ],
    providers: [ConfirmationService],
    templateUrl: './emp-additional-remarks.component.html',
    styleUrl: './emp-additional-remarks.component.scss'
})
export class EmpAdditionalRemarks implements OnInit {
    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    employeeSearchInfo: EmployeeSearchInfoModel | null = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;
    isSaving = false;
    isLoading = false;

    remarksList: AdditionalRemarksItem[] = [];
    displayDialog = false;
    isEditMode = false;
    selectedRemark: AdditionalRemarksItem | null = null;

    remarksForm!: FormGroup;

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private route: ActivatedRoute,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.buildForm();
        this.checkRouteParams();
    }

    buildForm(): void {
        this.remarksForm = this.fb.group({
            additionalRemarks: ['', Validators.required]
        });
    }

    checkRouteParams(): void {
        this.route.queryParams.subscribe(params => {
            if (params['id']) {
                this.mode = params['mode'] === 'edit' ? 'edit' : 'view';
                this.isReadonly = this.mode === 'view';
                this.loadEmployeeById(parseInt(params['id'], 10));
            }
        });
    }

    loadEmployeeById(employeeId: number): void {
        this.isLoading = true;
        forkJoin({
            employee: this.empService.getEmployeeById(employeeId).pipe(
                catchError(() => of(null))
            ),
            searchInfo: this.empService.getEmployeeSearchInfo(employeeId).pipe(
                catchError(() => of(null))
            ),
            remarks: this.empService.getAdditionalRemarksByEmployeeId(employeeId).pipe(
                catchError(() => of([]))
            )
        }).subscribe({
            next: (data) => {
                this.isLoading = false;
                if (data.employee) {
                    this.employeeFound = true;
                    this.selectedEmployeeId = data.employee.EmployeeID;
                    this.employeeBasicInfo = data.employee;
                    this.employeeSearchInfo = data.searchInfo;
                    this.remarksList = Array.isArray(data.remarks) ? data.remarks : [];
                }
            },
            error: () => {
                this.isLoading = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load employee data'
                });
            }
        });
    }

    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.isReadonly = false;
        this.loadEmployeeSearchInfo();
        this.loadRemarksList();
    }

    loadEmployeeSearchInfo(): void {
        if (!this.selectedEmployeeId) return;

        this.empService.getEmployeeSearchInfo(this.selectedEmployeeId).subscribe({
            next: (data) => {
                this.employeeSearchInfo = data;
            },
            error: (error) => {
                console.error('Error loading employee search info:', error);
            }
        });
    }

    onEmployeeSearchReset(): void {
        this.resetForm();
    }

    loadRemarksList(): void {
        if (!this.selectedEmployeeId) return;

        this.isLoading = true;
        this.empService.getAdditionalRemarksByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (data) => {
                this.isLoading = false;
                console.log('Remarks data received:', data); // Debug log
                this.remarksList = Array.isArray(data) ? data : [];
                console.log('Remarks list after processing:', this.remarksList); // Debug log
            },
            error: (error) => {
                this.isLoading = false;
                this.remarksList = [];
                console.error('Error loading remarks:', error); // Debug log
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: error?.error?.message || 'Failed to load remarks'
                });
            }
        });
    }

    openAddDialog(): void {
        this.isEditMode = false;
        this.selectedRemark = null;
        this.remarksForm.reset();
        this.displayDialog = true;
    }

    openEditDialog(remark: AdditionalRemarksItem): void {
        this.isEditMode = true;
        this.selectedRemark = remark;
        this.remarksForm.patchValue({
            additionalRemarks: remark.additionalRemarks || remark.AdditionalRemarks || ''
        });
        this.displayDialog = true;
    }

    closeDialog(): void {
        this.displayDialog = false;
        this.isEditMode = false;
        this.selectedRemark = null;
        this.remarksForm.reset();
    }

    saveRemark(): void {
        if (this.remarksForm.invalid) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Validation',
                detail: 'Please enter remarks'
            });
            return;
        }

        if (!this.selectedEmployeeId) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Warning',
                detail: 'Please select an employee first'
            });
            return;
        }

        this.isSaving = true;

        const formValue = this.remarksForm.value;
        const payload: any = {
            employeeID: this.selectedEmployeeId,
            additionalRemarks: formValue.additionalRemarks || '',
            createdBy: 'System', // TODO: Get from auth service
            lastUpdatedBy: 'System', // TODO: Get from auth service
            createdDate: new Date().toISOString(),
            lastupdate: new Date().toISOString()
        };

        if (this.isEditMode && this.selectedRemark?.additionalRemarksId) {
            payload.additionalRemarksId = this.selectedRemark.additionalRemarksId;
            payload.AdditionalRemarksId = this.selectedRemark.additionalRemarksId;
        }

        const saveObservable = this.isEditMode
            ? this.empService.saveUpdateAdditionalRemarks(payload)
            : this.empService.saveAdditionalRemarks(payload);

        saveObservable.subscribe({
            next: (response) => {
                this.isSaving = false;
                if (response.statusCode === 200 || response.statusCode === 201) {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: this.isEditMode ? 'Remarks updated successfully' : 'Remarks added successfully'
                    });
                    this.closeDialog();
                    this.loadRemarksList();
                } else {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: response.message || 'Failed to save remarks'
                    });
                }
            },
            error: (error) => {
                this.isSaving = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: error?.error?.message || 'Failed to save remarks'
                });
            }
        });
    }

    confirmDeleteRemark(remark: AdditionalRemarksItem): void {
        this.confirmationService.confirm({
            message: 'Delete this remark?',
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => this.deleteRemark(remark)
        });
    }

    deleteRemark(remark: AdditionalRemarksItem): void {
        const remarkId = remark.additionalRemarksId || remark.AdditionalRemarksId;
        if (!remarkId) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Invalid remark ID'
            });
            return;
        }

        this.empService.deleteAdditionalRemarks(remarkId).subscribe({
            next: (response) => {
                if (response.statusCode === 200) {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'Remarks deleted successfully'
                    });
                    this.loadRemarksList();
                } else {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: response.message || 'Failed to delete remarks'
                    });
                }
            },
            error: (error) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: error?.error?.message || 'Failed to delete remarks'
                });
            }
        });
    }

    goBack(): void {
        // Navigate to employee list page
        this.router.navigate(['/emp-list']);
    }

    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.employeeSearchInfo = null;
        this.mode = 'search';
        this.isReadonly = false;
        this.remarksList = [];
        this.remarksForm.reset();
    }
}
