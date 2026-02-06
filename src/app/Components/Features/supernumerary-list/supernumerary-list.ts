import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { EmployeeListService } from '@/services/employee-list.service';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeeList } from '@/models/employee-list.model';
import { MotherOrganizationModel } from '@/models/mother-org-model';
import { CommonCodeModel } from '@/models/common-code-model';

@Component({
    selector: 'app-supernumerary-list',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, MultiSelectModule, SelectModule, Toast],
    providers: [MessageService],
    templateUrl: './supernumerary-list.html',
    styleUrl: './supernumerary-list.scss'
})
export class SupernumeraryList implements OnInit {
    list: EmployeeList[] = [];
    loading = false;
    totalRecords = 0;
    first = 0;
    rows = 20;

    orgOptions: MotherOrganizationModel[] = [];
    selectedOrgIds: number[] = [];
    memberTypeOptions: { label: string; value: number }[] = [];
    selectedMemberTypeId: number | null = null;
    /** True after user has clicked Load List with valid filters; required for lazy load. */
    filtersApplied = false;

    constructor(
        private employeeListService: EmployeeListService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService
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

    loadMemberTypeOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('OfficerType').subscribe({
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

    onLazyLoad(event: TableLazyLoadEvent): void {
        if (!this.filtersApplied) return;
        const pageNo = event.first != null && event.rows != null ? Math.floor(event.first / event.rows) + 1 : 1;
        const rowPerPage = event.rows ?? this.rows;
        this.loadPage(pageNo, rowPerPage);
        this.first = event.first ?? 0;
        this.rows = rowPerPage;
    }

    loadList(): void {
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
        this.filtersApplied = true;
        this.first = 0;
        this.loadPage(1, this.rows);
        this.messageService.add({
            severity: 'success',
            summary: 'Loaded',
            detail: 'List loaded. Use pagination to browse.'
        });
    }

    loadPage(pageNo: number, rowPerPage: number): void {
        if (!this.selectedOrgIds?.length || this.selectedMemberTypeId == null) return;
        this.loading = true;
        this.employeeListService
            .getSupernumeraryListPaginated({
                orgIds: this.selectedOrgIds,
                memberTypeId: this.selectedMemberTypeId,
                pagination: { page_no: pageNo, row_per_page: rowPerPage }
            })
            .subscribe({
                next: (res) => {
                    this.list = res.datalist ?? [];
                    this.totalRecords = res.pages?.rows ?? 0;
                    this.loading = false;
                },
                error: (err) => {
                    console.error('Failed to load supernumerary list', err);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.message || 'Failed to load supernumerary list'
                    });
                    this.loading = false;
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
