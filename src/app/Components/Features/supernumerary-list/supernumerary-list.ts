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
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, SelectModule, Toast],
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
    selectedOrgId: number | null = null;
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
        this.filtersApplied = true;
        this.loadPage(1, this.rows);
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

    /** Member Type from Employee Type Setup – load once on init (not dependent on org). */
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

    /** Only Rank depends on Mother Org: when org selected, load Rank options for that org. */
    onOrgChange(): void {
        this.rankOptions = [];
        this.selectedRankId = null;
        const orgId = this.selectedOrgId;
        if (orgId != null) {
            this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
                next: (codes: CommonCodeModel[]) => {
                    this.rankOptions = codes.map((c) => ({
                        label: c.codeValueEN || String(c.codeId),
                        value: c.codeId
                    }));
                },
                error: (err) => {
                    console.error('Failed to load ranks', err);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to load ranks'
                    });
                }
            });
        }
        this.first = 0;
        this.loadPage(1, this.rows);
    }

    /** Member Type change: reload list only. */
    onMemberTypeChange(): void {
        this.first = 0;
        this.loadPage(1, this.rows);
    }

    rankOptions: { label: string; value: number }[] = [];
    selectedRankId: number | null = null;

    onFilterChange(): void {
        this.first = 0;
        this.loadPage(1, this.rows);
    }

    onLazyLoad(event: TableLazyLoadEvent): void {
        if (!this.filtersApplied) return;
        const pageNo = event.first != null && event.rows != null ? Math.floor(event.first / event.rows) + 1 : 1;
        const rowPerPage = event.rows ?? this.rows;
        this.loadPage(pageNo, rowPerPage);
        this.first = event.first ?? 0;
        this.rows = rowPerPage;
    }

    loadPage(pageNo: number, rowPerPage: number): void {
        this.loading = true;
        this.employeeListService
            .getSupernumeraryListPaginated({
                orgIds: this.selectedOrgId != null ? [this.selectedOrgId] : undefined,
                memberTypeId: this.selectedMemberTypeId ?? undefined,
                rankId: this.selectedRankId ?? undefined,
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
