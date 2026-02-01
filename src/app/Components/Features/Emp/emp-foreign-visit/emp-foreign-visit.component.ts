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
    selector: 'app-emp-foreign-visit',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, InputTextModule, ButtonModule, Fluid, TooltipModule],
    templateUrl: './emp-foreign-visit.component.html',
    styleUrl: './emp-foreign-visit.component.scss'
})
export class EmpForeignVisit implements OnInit {
    searchRabId = ''; searchServiceId = ''; isSearching = false; employeeFound = false;
    selectedEmployeeId: number | null = null; employeeBasicInfo: any = null;
    mode: 'search' | 'view' | 'edit' = 'search'; isReadonly = false;

    constructor(private empService: EmpService, private messageService: MessageService, private route: ActivatedRoute, private router: Router) {}
    ngOnInit(): void { this.checkRouteParams(); }
    checkRouteParams(): void { this.route.queryParams.subscribe(params => { if (params['id']) { this.mode = params['mode'] === 'edit' ? 'edit' : 'view'; this.isReadonly = this.mode === 'view'; this.loadEmployeeById(parseInt(params['id'], 10)); } }); }
    loadEmployeeById(employeeId: number): void { this.empService.getEmployeeById(employeeId).subscribe({ next: (e: any) => { if (e) { this.employeeFound = true; this.selectedEmployeeId = e.employeeID || e.EmployeeID; this.employeeBasicInfo = e; } } }); }
    searchEmployee(): void { if (!this.searchRabId && !this.searchServiceId) { this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please enter RAB ID or Service ID' }); return; } this.isSearching = true; this.employeeFound = false; this.empService.searchByRabIdOrServiceId(this.searchRabId || undefined, this.searchServiceId || undefined).subscribe({ next: (e: any) => { this.isSearching = false; if (e) { this.employeeFound = true; this.selectedEmployeeId = e.employeeID || e.EmployeeID; this.employeeBasicInfo = e; this.isReadonly = true; this.messageService.add({ severity: 'success', summary: 'Found', detail: `Found: ${e.fullNameEN || e.FullNameEN}` }); } else { this.messageService.add({ severity: 'warn', summary: 'Not Found', detail: 'No employee found' }); } }, error: () => { this.isSearching = false; this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Search failed' }); } }); }
    enableEditMode(): void { this.mode = 'edit'; this.isReadonly = false; }
    enableSearchEditMode(): void { this.isReadonly = false; }
    goBack(): void { this.router.navigate(['/emp-list']); }
    resetForm(): void { this.employeeFound = false; this.selectedEmployeeId = null; this.employeeBasicInfo = null; this.searchRabId = ''; this.searchServiceId = ''; }
    saveData(): void { this.messageService.add({ severity: 'info', summary: 'Info', detail: 'Save functionality to be implemented' }); }
}
