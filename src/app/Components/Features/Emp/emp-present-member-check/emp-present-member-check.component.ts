import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { Fluid } from 'primeng/fluid';

import { EmpService } from '@/services/emp-service';
import { CommonCodeService } from '@/services/common-code-service';
import { MotherOrganizationModel } from '@/models/mother-org-model';
import { EmpModel } from '@/models/EmpModel';
import { PreviousRABServiceService, VwPreviousRABServiceInfoModel } from '@/services/previous-rab-service.service';
import { TableModule } from 'primeng/table';

@Component({
    selector: 'app-emp-present-member-check',
    standalone: true,
    imports: [CommonModule, FormsModule, InputNumberModule, InputTextModule, ButtonModule, SelectModule, DialogModule, Fluid, TableModule],
    templateUrl: './emp-present-member-check.component.html',
    styleUrl: './emp-present-member-check.component.scss'
})
export class EmpPresentMemberCheckComponent implements OnInit {
    motherOrgId: number | null = null;
    serviceId: number | null = null;
    nid: string = '';

    motherOrganizations: MotherOrganizationModel[] = [];
    isSearching = false;
    showAlreadyExistDialog = false;
    foundEmployee: EmpModel | null = null;

    exMemberEmployee: EmpModel | null = null;
    exMemberViewList: VwPreviousRABServiceInfoModel[] = [];
    isLoadingExMemberData = false;

    constructor(
        private empService: EmpService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private previousRABService: PreviousRABServiceService
    ) {}

    ngOnInit(): void {
        this.loadMotherOrgs();
    }

    loadMotherOrgs(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (res: MotherOrganizationModel[]) => {
                this.motherOrganizations = res;
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load Mother Organizations'
                });
            }
        });
    }

    search(): void {
        const nidStr = (this.nid ?? '').trim();
        const serviceIdStr = this.serviceId != null ? String(this.serviceId).trim() : '';

        if (!nidStr && !serviceIdStr) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Required',
                detail: 'Please enter NID or Service ID (at least one)'
            });
            return;
        }

        this.isSearching = true;
        this.showAlreadyExistDialog = false;
        this.foundEmployee = null;
        this.exMemberEmployee = null;
        this.exMemberViewList = [];

        const motherOrgId = this.motherOrgId != null && this.motherOrgId > 0 ? this.motherOrgId : undefined;
        this.empService.searchByRabIdOrServiceId(undefined, serviceIdStr, true, motherOrgId, nidStr || undefined).subscribe({
            next: (employee: EmpModel | null) => {
                if (employee) {
                    this.isSearching = false;
                    this.foundEmployee = employee;
                    this.showAlreadyExistDialog = true;
                    return;
                }
                this.checkExMemberAndLoadView(serviceIdStr, nidStr, motherOrgId);
            },
            error: (err) => {
                this.isSearching = false;
                console.error('Search failed', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message ?? 'Failed to search employee.'
                });
            }
        });
    }

    private checkExMemberAndLoadView(serviceIdStr: string, nidStr: string, motherOrgId: number | undefined): void {
        this.empService.searchByRabIdOrServiceId(undefined, serviceIdStr, false, motherOrgId, nidStr || undefined).subscribe({
            next: (employee: EmpModel | null) => {
                this.isSearching = false;
                if (!employee) {
                    this.messageService.add({
                        severity: 'info',
                        summary: 'Not Found',
                        detail: 'No employee found with the given NID/Service ID.'
                    });
                    return;
                }
                const postingStatus = (employee as any).PostingStatus ?? (employee as any).postingStatus ?? '';
                if (postingStatus === 'ExMember') {
                    this.exMemberEmployee = employee;
                    const empId = (employee as any).EmployeeID ?? (employee as any).employeeID;
                    this.loadExMemberViewData(empId);
                } else {
                    this.messageService.add({
                        severity: 'info',
                        summary: postingStatus,
                        detail: 'Employee found but posting status is not ExMember. (Status: ' + postingStatus + ')'
                    });
                }
            },
            error: (err) => {
                this.isSearching = false;
                console.error('Search failed', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message ?? 'Failed to search employee.'
                });
            }
        });
    }

    private loadExMemberViewData(employeeId: number): void {
        const id = employeeId ?? (this.exMemberEmployee as any)?.employeeID ?? (this.exMemberEmployee as any)?.EmployeeID;
        if (id == null || id === undefined || Number.isNaN(Number(id))) {
            this.isLoadingExMemberData = false;
            this.messageService.add({ severity: 'warn', summary: 'Error', detail: 'Employee ID is missing.' });
            return;
        }
        this.isLoadingExMemberData = true;
        this.previousRABService.getViewByEmployeeId(Number(id)).subscribe({
            next: (list) => {
                this.isLoadingExMemberData = false;
                this.exMemberViewList = list;
            },
            error: (err) => {
                this.isLoadingExMemberData = false;
                console.error('Failed to load previous RAB service view', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load previous service data.'
                });
            }
        });
    }

    closeAlreadyExistDialog(): void {
        this.showAlreadyExistDialog = false;
        this.foundEmployee = null;
    }

    clearExMemberSection(): void {
        this.exMemberEmployee = null;
        this.exMemberViewList = [];
    }
}
