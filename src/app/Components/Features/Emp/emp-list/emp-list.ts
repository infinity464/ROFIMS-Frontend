import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { Tag } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Toast } from 'primeng/toast';
import { EmpService } from '@/services/emp-service';

@Component({
    selector: 'app-emp-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        InputTextModule,
        IconField,
        InputIcon,
        Tag,
        TooltipModule,
        ConfirmDialog,
        Toast
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './emp-list.html',
    styleUrl: './emp-list.scss'
})
export class EmpList implements OnInit {
    employees: any[] = [];
    loading: boolean = true;
    searchValue: string = '';

    constructor(
        private empService: EmpService,
        private router: Router,
        private confirmationService: ConfirmationService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.loadEmployees();
    }

    loadEmployees(): void {
        this.loading = true;
        this.empService.getAll().subscribe({
            next: (data) => {
                this.employees = data;
                this.loading = false;
            },
            error: (err) => {
                console.error('Failed to load employees', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load employees'
                });
                this.loading = false;
            }
        });
    }

    onGlobalFilter(table: any, event: Event): void {
        table.filterGlobal((event.target as HTMLInputElement).value, 'contains');
    }

    clearFilter(table: any): void {
        this.searchValue = '';
        table.clear();
    }

    viewEmployee(employee: any): void {
        this.router.navigate(['/emp-basic-info'], { queryParams: { id: employee.employeeID } });
    }

    editEmployee(employee: any): void {
        this.router.navigate(['/emp-basic-info'], { queryParams: { id: employee.employeeID, mode: 'edit' } });
    }

    viewPersonalInfo(employee: any): void {
        this.router.navigate(['/emp-personal-info'], { queryParams: { id: employee.employeeID, mode: 'view' } });
    }

    confirmDelete(employee: any): void {
        this.confirmationService.confirm({
            message: `Are you sure you want to delete ${employee.fullNameEN}?`,
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            acceptButtonStyleClass: 'p-button-danger',
            accept: () => {
                this.deleteEmployee(employee);
            }
        });
    }

    deleteEmployee(employee: any): void {
        this.empService.deleteEmployee(employee.employeeID).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Employee deleted successfully'
                });
                this.loadEmployees();
            },
            error: (err) => {
                console.error('Failed to delete employee', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to delete employee'
                });
            }
        });
    }

    addNewEmployee(): void {
        this.router.navigate(['/emp-basic-info']);
    }

    getStatusSeverity(status: boolean): 'success' | 'danger' {
        return status ? 'success' : 'danger';
    }

    getStatusLabel(status: boolean): string {
        return status ? 'Active' : 'Inactive';
    }
}
