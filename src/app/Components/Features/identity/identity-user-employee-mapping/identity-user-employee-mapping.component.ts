import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Fluid } from 'primeng/fluid';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import {
  IdentityUserMappingService,
  IdentityUserMappingDto,
  EmployeeDropdownDto
} from '@/services/identity-user-mapping.service';

@Component({
  selector: 'app-identity-user-employee-mapping',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    SelectModule,
    Fluid,
    Toast,
    TooltipModule
  ],
  providers: [MessageService],
  templateUrl: './identity-user-employee-mapping.component.html',
  styleUrl: './identity-user-employee-mapping.component.scss'
})
export class IdentityUserEmployeeMappingComponent implements OnInit {
  private mappingService = inject(IdentityUserMappingService);
  private messageService = inject(MessageService);

  mappings: IdentityUserMappingDto[] = [];
  employees: EmployeeDropdownDto[] = [];
  selectedEmployeeIdByUser: Record<string, number> = {};
  savingUserId: string | null = null;
  loading = false;

  ngOnInit(): void {
    this.loadMappings();
    this.loadEmployees();
  }

  loadMappings(): void {
    this.loading = true;
    this.mappingService.getMappings().subscribe({
      next: (list) => {
        this.mappings = Array.isArray(list) ? this.normList(list) : [];
        this.loading = false;
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load mappings' });
        this.loading = false;
      }
    });
  }

  private normList(list: unknown[]): IdentityUserMappingDto[] {
    return list.map((x: any) => ({
      userId: x.userId ?? x.UserId,
      email: x.email ?? x.Email ?? '',
      userName: x.userName ?? x.UserName ?? '',
      employeeId: x.employeeId ?? x.EmployeeId ?? null,
      employeeName: x.employeeName ?? x.EmployeeName ?? null,
      rabID: x.rabID ?? x.RABID ?? null,
      serviceId: x.serviceId ?? x.ServiceId ?? null
    }));
  }

  loadEmployees(): void {
    this.mappingService.getEmployeesForDropdown().subscribe({
      next: (list) => {
        this.employees = Array.isArray(list) ? this.normEmployees(list) : [];
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load employees' });
      }
    });
  }

  private normEmployees(list: unknown[]): EmployeeDropdownDto[] {
    return list.map((x: any) => {
      const fullNameEN = x.fullNameEN ?? x.FullNameEN ?? '';
      const rabID = x.rabID ?? x.RABID ?? null;
      return {
        employeeID: x.employeeID ?? x.EmployeeID,
        fullNameEN,
        rabID,
        serviceId: x.serviceId ?? x.ServiceId ?? null,
        displayLabel: fullNameEN + (rabID ? ` (${rabID})` : '')
      };
    });
  }

  mappedEmployeeDisplay(m: IdentityUserMappingDto): string {
    if (m.employeeName) return `${m.employeeName}${m.rabID ? ' (' + m.rabID + ')' : ''}`;
    return '-';
  }

  onMap(row: IdentityUserMappingDto): void {
    const employeeId = this.selectedEmployeeIdByUser[row.userId] ?? row.employeeId;
    if (!employeeId) {
      this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Select an employee' });
      return;
    }
    this.savingUserId = row.userId;
    this.mappingService.setMapping({ userId: row.userId, employeeId }).subscribe({
      next: (res) => {
        this.savingUserId = null;
        if (res.statusCode === 200) {
          this.messageService.add({ severity: 'success', summary: 'Success', detail: res.description ?? 'Mapping saved' });
          this.loadMappings();
        } else {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? 'Save failed' });
        }
      },
      error: () => {
        this.savingUserId = null;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Save failed' });
      }
    });
  }

  onClear(row: IdentityUserMappingDto): void {
    this.savingUserId = row.userId;
    this.mappingService.clearMapping(row.userId).subscribe({
      next: (res) => {
        this.savingUserId = null;
        if (res.statusCode === 200) {
          this.messageService.add({ severity: 'success', summary: 'Success', detail: res.description ?? 'Mapping cleared' });
          delete this.selectedEmployeeIdByUser[row.userId];
          this.loadMappings();
        } else {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? 'Clear failed' });
        }
      },
      error: () => {
        this.savingUserId = null;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Clear failed' });
      }
    });
  }
}
