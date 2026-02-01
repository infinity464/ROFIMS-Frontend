import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { MessageService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';

import { EmpService } from '@/services/emp-service';

@Component({
    selector: 'app-emp-promotion-info',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        InputTextModule,
        ButtonModule,
        Fluid,
        TooltipModule
    ],
    templateUrl: './emp-promotion-info.html',
    styleUrl: './emp-promotion-info.scss'
})
export class EmpPromotionInfo implements OnInit {
    searchRabId: string = '';
    searchServiceId: string = '';
    isSearching: boolean = false;
    employeeFound: boolean = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly: boolean = false;

    constructor(
        private empService: EmpService,
        private messageService: MessageService,
        private route: ActivatedRoute,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.checkRouteParams();
    }

    checkRouteParams(): void {
        this.route.queryParams.subscribe(params => {
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
                }
            },
            error: (err) => {
                console.error('Failed to load employee', err);
            }
        });
    }

    searchEmployee(): void {
        if (!this.searchRabId && !this.searchServiceId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please enter RAB ID or Service ID' });
            return;
        }
        this.isSearching = true;
        this.employeeFound = false;

        this.empService.searchByRabIdOrServiceId(this.searchRabId || undefined, this.searchServiceId || undefined).subscribe({
            next: (employee: any) => {
                this.isSearching = false;
                if (employee) {
                    this.employeeFound = true;
                    this.selectedEmployeeId = employee.employeeID || employee.EmployeeID;
                    this.employeeBasicInfo = employee;
                    this.isReadonly = true;
                    this.messageService.add({ severity: 'success', summary: 'Employee Found', detail: `Found: ${employee.fullNameEN || employee.FullNameEN}` });
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Not Found', detail: 'No employee found' });
                }
            },
            error: () => {
                this.isSearching = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Search failed' });
            }
        });
    }

    enableEditMode(): void {
        this.mode = 'edit';
        this.isReadonly = false;
    }

    enableSearchEditMode(): void {
        this.isReadonly = false;
    }

    goBack(): void {
        this.router.navigate(['/emp-list']);
    }

    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.searchRabId = '';
        this.searchServiceId = '';
    }

    saveData(): void {
        this.messageService.add({ severity: 'info', summary: 'Info', detail: 'Save functionality to be implemented' });
    }
}
