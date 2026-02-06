import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { DatePickerModule } from 'primeng/datepicker';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { EmployeeListService, GetSupernumeraryListRequest } from '@/services/employee-list.service';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeeList } from '@/models/employee-list.model';
import { MotherOrganizationModel } from '@/models/mother-org-model';
import { CommonCodeModel } from '@/models/common-code-model';

@Component({
    selector: 'app-supernumerary-list',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, SelectModule, InputTextModule, IconField, InputIcon, DatePickerModule, Toast],
    providers: [MessageService],
    templateUrl: './supernumerary-list.html',
    styleUrl: './supernumerary-list.scss'
})
export class SupernumeraryList implements OnInit {
    list: EmployeeList[] = [];
    loading = false;
    first = 0;
    rows = 20;
    /** Client-side search: filters by Service ID or RAB ID (partial, case-insensitive). */
    searchText = '';

    orgOptions: MotherOrganizationModel[] = [];
    selectedOrgId: number | null = null;
    memberTypeOptions: { label: string; value: number }[] = [];
    selectedMemberTypeId: number | null = null;

    constructor(
        private employeeListService: EmployeeListService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.loadOrgOptions();
        this.loadMemberTypeOptions();
        this.loadData();
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

    /** Rank and Trade depend on Mother Org: when org selected, load options for that org. */
    onOrgChange(): void {
        this.rankOptions = [];
        this.selectedRankId = null;
        this.tradeOptions = [];
        this.selectedTradeId = null;
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
            this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Trade').subscribe({
                next: (codes: CommonCodeModel[]) => {
                    this.tradeOptions = codes.map((c) => ({
                        label: c.codeValueEN || String(c.codeId),
                        value: c.codeId
                    }));
                },
                error: (err) => {
                    console.error('Failed to load trades', err);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to load trades'
                    });
                }
            });
        }
        this.first = 0;
        this.loadData();
    }

    /** Member Type change: reload list only. */
    onMemberTypeChange(): void {
        this.first = 0;
        this.loadData();
    }

    rankOptions: { label: string; value: number }[] = [];
    selectedRankId: number | null = null;

    tradeOptions: { label: string; value: number }[] = [];
    selectedTradeId: number | null = null;
    joiningDateFrom: Date | null = null;
    joiningDateTo: Date | null = null;
    joiningDateInRABFrom: Date | null = null;
    joiningDateInRABTo: Date | null = null;

    onFilterChange(): void {
        this.first = 0;
        this.loadData();
    }

    onPage(event: { first: number }): void {
        this.first = event.first;
    }

    /** List filtered by searchText (Service ID / RAB ID). Used for table value. */
    get filteredList(): EmployeeList[] {
        const q = this.searchText?.trim()?.toLowerCase() ?? '';
        if (q === '') return this.list;
        return this.list.filter(
            (row) =>
                (row.serviceId && row.serviceId.toLowerCase().includes(q)) ||
                (row.rabID && row.rabID.toLowerCase().includes(q))
        );
    }

    onSearchChange(): void {
        this.first = 0;
    }

    loadData(): void {
        this.loading = true;
        const request: GetSupernumeraryListRequest = {
            orgIds: this.selectedOrgId != null ? [this.selectedOrgId] : undefined,
            memberTypeId: this.selectedMemberTypeId ?? undefined,
            rankId: this.selectedRankId ?? undefined,
            tradeId: this.selectedTradeId ?? undefined,
            joiningDateFrom: this.toDateString(this.joiningDateFrom),
            joiningDateTo: this.toDateString(this.joiningDateTo),
            joiningDateInRABFrom: this.toDateString(this.joiningDateInRABFrom),
            joiningDateInRABTo: this.toDateString(this.joiningDateInRABTo)
        };
        this.employeeListService.getSupernumeraryList(request).subscribe({
            next: (res) => {
                this.list = res ?? [];
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

    onSendNewPostingList(row: EmployeeList): void {
        // TODO: wire to Send New Posting list API / navigation
        this.messageService.add({
            severity: 'info',
            summary: 'Send New Posting list',
            detail: `Employee: ${row.serviceId ?? row.employeeID}`
        });
    }

    toDateString(d: Date | null): string | undefined {
        if (d == null) return undefined;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
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
