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
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';

@Component({
    selector: 'app-emp-discipline-info',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, InputTextModule, ButtonModule, Fluid, TooltipModule, EmployeeSearchComponent],
    templateUrl: './emp-discipline-info.html',
    styleUrl: './emp-discipline-info.scss'
})
export class EmpDisciplineInfoComponent implements OnInit {
    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;

    constructor(private empService: EmpService, private messageService: MessageService, private route: ActivatedRoute, private router: Router) {}

    ngOnInit(): void { this.checkRouteParams(); }

    checkRouteParams(): void {
        this.route.queryParams.subscribe(params => {
            if (params['id']) { this.mode = params['mode'] === 'edit' ? 'edit' : 'view'; this.isReadonly = this.mode === 'view'; this.loadEmployeeById(parseInt(params['id'], 10)); }
        });
    }

    loadEmployeeById(employeeId: number): void {
        this.empService.getEmployeeById(employeeId).subscribe({ next: (e: any) => { if (e) { this.employeeFound = true; this.selectedEmployeeId = e.employeeID || e.EmployeeID; this.employeeBasicInfo = e; } } });
    }

    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.isReadonly = true;
    }

    onEmployeeSearchReset(): void {
        this.resetForm();
    }

    enableEditMode(): void { this.mode = 'edit'; this.isReadonly = false; }
    enableSearchEditMode(): void { this.isReadonly = false; }
    goBack(): void { this.router.navigate(['/emp-list']); }
    resetForm(): void { this.employeeFound = false; this.selectedEmployeeId = null; this.employeeBasicInfo = null; }
    saveData(): void { this.messageService.add({ severity: 'info', summary: 'Info', detail: 'Save functionality to be implemented' }); }
}
