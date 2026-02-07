import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { EmployeeListService } from '@/services/employee-list.service';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeeList, GetEmployeeListRequest } from '@/models/employee-list.model';
import { MotherOrganizationModel } from '@/models/mother-org-model';
import { CommonCodeModel } from '@/models/common-code-model';

@Component({
    selector: 'app-rab-id-allocation',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, MultiSelectModule, SelectModule, Toast, ConfirmDialog],
    providers: [ConfirmationService, MessageService],
    templateUrl: './rab-id-allocation.html',
    styleUrl: './rab-id-allocation.scss'
})
export class RabIdAllocation implements OnInit {
    list: EmployeeList[] = [];
    loading = false;
    generatingId = false;

    orgOptions: MotherOrganizationModel[] = [];
    selectedOrgIds: number[] = [];
    memberTypeOptions: { label: string; value: number }[] = [];
    selectedMemberTypeId: number | null = null;

    constructor(
        private employeeListService: EmployeeListService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService
    ) {}

    ngOnInit(): void {
        this.loadOrgOptions();
        this.loadMemberTypeOptions();
    }

    loadOrgOptions(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs) => {
                this.orgOptions = orgs;
            },
            error: (err) => {
                console.error('Failed to load organizations', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load organizations'
                });
            }
        });
    }

    /** Member Type from Employee Type Setup (same as Supernumerary List). */
    loadMemberTypeOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('EmployeeType').subscribe({
            next: (codes: CommonCodeModel[]) => {
                this.memberTypeOptions = codes.map((c) => ({
                    label: c.codeValueEN || String(c.codeId),
                    value: c.codeId
                }));
            },
            error: (err) => {
                console.error('Failed to load member types', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load member types'
                });
            }
        });
    }

    loadList(skipLoadMessage = false): void {
        if (!this.selectedOrgIds?.length) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Validation',
                detail: 'Please select at least one organization.'
            });
            return;
        }
        if (this.selectedMemberTypeId == null) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Validation',
                detail: 'Please select member type.'
            });
            return;
        }

        const request: GetEmployeeListRequest = {
            orgIds: this.selectedOrgIds,
            memberTypeId: this.selectedMemberTypeId
        };

        this.loading = true;
        this.employeeListService.getEmployeeList(request).subscribe({
            next: (data) => {
                this.list = data ?? [];
                this.loading = false;
                if (!skipLoadMessage) {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Loaded',
                        detail: `${this.list.length} record(s) loaded.`
                    });
                }
            },
            error: (err) => {
                console.error('Failed to load employee list', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load employee list'
                });
                this.loading = false;
            }
        });
    }

    generateId(): void {
        if (!this.list?.length) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Validation',
                detail: 'Load the list first, then click Generate Id.'
            });
            return;
        }
        // List is already ordered by JoiningDate then SortOrder (from API); preserve order for allocation priority.
        const employeeIds = this.list.map((row) => row.employeeID).filter((id) => id != null);
        if (employeeIds.length === 0) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Validation',
                detail: 'No employee IDs to generate.'
            });
            return;
        }
        const count = employeeIds.length;
        this.confirmationService.confirm({
            message: `Generate RAB ID for all ${count} employee(s) in the list?`,
            header: 'Confirm Generate RAB ID',
            icon: 'pi pi-id-card',
            accept: () => this.doGenerateId(employeeIds)
        });
    }

    private showGenerationCompleteMessage(count: number, succeeded?: { employeeId: number; rabID: string }[]): void {
        let detail: string;
        if (count <= 0) {
            detail = 'List refreshed.';
        } else if (count === 1 && succeeded?.length) {
            detail = `RAB ID ${succeeded[0].rabID} allocated. List refreshed.`;
        } else if (count <= 5 && succeeded?.length) {
            const idList = succeeded.map((r) => `Employee ${r.employeeId}: ${r.rabID}`).join('; ');
            detail = `${count} RAB ID(s) allocated: ${idList}. List refreshed.`;
        } else {
            detail = `${count} RAB ID(s) allocated. List refreshed.`;
        }
        this.messageService.add({
            severity: 'success',
            summary: 'ID Generation completed',
            detail,
            life: 8000
        });
    }

    private doGenerateId(employeeIds: number[]): void {
        this.generatingId = true;
        this.employeeListService.allocateRabId({ employeeIds }).subscribe({
            next: (results) => {
                this.generatingId = false;
                this.loadList(true);
                if (!results || !Array.isArray(results)) {
                    this.showGenerationCompleteMessage(0);
                    return;
                }
                const normalized = results.map((r: any) => ({
                    employeeId: r.employeeId ?? r.EmployeeId ?? 0,
                    rabID: r.rabID ?? r.RABID ?? null,
                    errorMessage: r.errorMessage ?? r.ErrorMessage ?? null
                }));
                const succeeded = normalized.filter((r) => r.rabID != null && String(r.rabID).trim() !== '');
                const failed = normalized.filter((r) => r.errorMessage != null && String(r.errorMessage).trim() !== '');
                if (failed.length > 0) {
                    failed.forEach((r) => {
                        this.messageService.add({
                            severity: 'warn',
                            summary: `Employee ${r.employeeId}`,
                            detail: r.errorMessage ?? 'Failed'
                        });
                    });
                }
                setTimeout(() => this.showGenerationCompleteMessage(succeeded.length, succeeded), 100);
            },
            error: (err) => {
                this.generatingId = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message ?? 'Failed to generate RAB IDs'
                });
            }
        });
    }

    formatDate(value: string | null): string {
        if (value == null || value === '') return '-';
        try {
            const d = new Date(value);
            return isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return value;
        }
    }
}
