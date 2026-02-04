import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

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
import { LeaveInfoService, LeaveInfoModel } from '@/services/leave-info-service';
import { CommonCodeService } from '@/services/common-code-service';
import { CommonCodeModel } from '@/models/common-code-model';
import { CodeType } from '@/models/enums';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';

@Component({
    selector: 'app-emp-leave-info',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, InputTextModule, ButtonModule, Fluid, TooltipModule, TableModule, SelectModule, DialogModule, ConfirmDialogModule, DatePickerModule, TextareaModule, EmployeeSearchComponent],
    providers: [ConfirmationService],
    templateUrl: './emp-leave-info.component.html',
    styleUrl: './emp-leave-info.component.scss'
})
export class EmpLeaveInfo implements OnInit {
    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;

    leaveList: LeaveInfoModel[] = [];
    isLoading = false;

    displayDialog = false;
    isEditMode = false;
    isSaving = false;
    leaveForm!: FormGroup;
    editingLeaveId: number | null = null;

    leaveTypes: CommonCodeModel[] = [];

    constructor(
        private empService: EmpService,
        private leaveInfoService: LeaveInfoService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private route: ActivatedRoute,
        private router: Router,
        private fb: FormBuilder
    ) {
        this.initForm();
    }

    ngOnInit(): void {
        this.loadLeaveTypes();
        this.checkRouteParams();
    }

    initForm(): void {
        this.leaveForm = this.fb.group({
            employeeId: [0],
            leaveId: [0],
            leaveTypeId: [null, Validators.required],
            fromDate: [null, Validators.required],
            toDate: [null, Validators.required],
            remarks: ['']
        });
    }

    loadLeaveTypes(): void {
        this.commonCodeService.getAllActiveCommonCodesType(CodeType.LeaveType).subscribe({
            next: (data) => {
                this.leaveTypes = Array.isArray(data) ? data : [];
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load leave types' })
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
                    this.loadLeaveList();
                }
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load employee' })
        });
    }

    loadLeaveList(): void {
        if (!this.selectedEmployeeId) return;
        this.isLoading = true;
        this.leaveInfoService.getByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (data: any) => {
                const list = Array.isArray(data) ? data : [];
                this.leaveList = list.map((item: any) => ({
                    employeeId: item.employeeId ?? item.EmployeeId,
                    leaveId: item.leaveId ?? item.LeaveId,
                    leaveTypeId: item.leaveTypeId ?? item.LeaveTypeId,
                    fromDate: item.fromDate ?? item.FromDate ?? '',
                    toDate: item.toDate ?? item.ToDate ?? '',
                    auth: item.auth ?? item.Auth ?? null,
                    remarks: item.remarks ?? item.Remarks ?? null
                }));
                this.isLoading = false;
            },
            error: () => {
                this.isLoading = false;
            }
        });
    }

    getLeaveTypeName(leaveTypeId: number): string {
        const lt = this.leaveTypes.find((x) => x.codeId === leaveTypeId);
        return lt ? lt.codeValueEN || lt.codeValueBN || '' : 'N/A';
    }

    formatDate(val: string | Date | null): string {
        if (!val) return 'N/A';
        const d = typeof val === 'string' ? new Date(val) : val;
        return d.toLocaleDateString();
    }

    openAddDialog(): void {
        this.isEditMode = false;
        this.editingLeaveId = null;
        this.leaveForm.reset({
            employeeId: this.selectedEmployeeId ?? 0,
            leaveId: 0,
            leaveTypeId: null,
            fromDate: null,
            toDate: null,
            remarks: ''
        });
        this.displayDialog = true;
    }

    openEditDialog(row: LeaveInfoModel): void {
        this.isEditMode = true;
        this.editingLeaveId = row.leaveId;
        this.leaveForm.patchValue({
            employeeId: row.employeeId,
            leaveId: row.leaveId,
            leaveTypeId: row.leaveTypeId,
            fromDate: row.fromDate ? new Date(row.fromDate) : null,
            toDate: row.toDate ? new Date(row.toDate) : null,
            remarks: row.remarks || ''
        });
        this.displayDialog = true;
    }

    saveLeave(): void {
        if (this.leaveForm.invalid) {
            this.leaveForm.markAllAsTouched();
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please fill required fields' });
            return;
        }
        if (this.selectedEmployeeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected' });
            return;
        }
        const formValue = this.leaveForm.value;
        const fromDate = formValue.fromDate instanceof Date ? formValue.fromDate : new Date(formValue.fromDate);
        const toDate = formValue.toDate instanceof Date ? formValue.toDate : new Date(formValue.toDate);
        if (toDate < fromDate) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'To date cannot be before From date' });
            return;
        }

        const payload: Partial<LeaveInfoModel> = {
            employeeId: this.selectedEmployeeId,
            leaveId: this.isEditMode ? (this.editingLeaveId ?? 0) : 0,
            leaveTypeId: formValue.leaveTypeId,
            fromDate: fromDate.toISOString(),
            toDate: toDate.toISOString(),
            remarks: formValue.remarks || null,
            auth: null,
            createdBy: 'system',
            lastUpdatedBy: 'system'
        };

        this.isSaving = true;
        const req = this.isEditMode ? this.leaveInfoService.update(payload) : this.leaveInfoService.save(payload);

        req.subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: this.isEditMode ? 'Leave record updated.' : 'Leave record added.' });
                this.displayDialog = false;
                this.loadLeaveList();
                this.isSaving = false;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save leave record' });
                this.isSaving = false;
            }
        });
    }

    confirmDelete(row: LeaveInfoModel): void {
        this.confirmationService.confirm({
            message: `Delete leave record (${this.getLeaveTypeName(row.leaveTypeId)} - ${this.formatDate(row.fromDate)} to ${this.formatDate(row.toDate)})?`,
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => this.deleteLeave(row)
        });
    }

    deleteLeave(row: LeaveInfoModel): void {
        this.leaveInfoService.delete(row.employeeId, row.leaveId).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Leave record deleted.' });
                this.loadLeaveList();
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete' })
        });
    }

    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.isReadonly = true;
        this.loadLeaveList();
    }

    onEmployeeSearchReset(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.leaveList = [];
    }

    enableEditMode(): void {
        this.mode = 'edit';
        this.isReadonly = false;
    }

    goBack(): void {
        this.router.navigate(['/emp-list']);
    }
}
