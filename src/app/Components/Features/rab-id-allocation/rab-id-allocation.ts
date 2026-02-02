import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { SupernumeraryListService } from '@/services/supernumerary-list.service';
import { CommonCodeService } from '@/services/common-code-service';
import { SupernumeraryList, GetSupernumeraryListRequest } from '@/models/supernumerary-list.model';
import { MotherOrganizationModel } from '@/models/mother-org-model';
import { CommonCodeModel } from '@/models/common-code-model';

@Component({
    selector: 'app-rab-id-allocation',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, MultiSelectModule, SelectModule, Toast],
    providers: [MessageService],
    templateUrl: './rab-id-allocation.html',
    styleUrl: './rab-id-allocation.scss'
})
export class RabIdAllocation implements OnInit {
    list: SupernumeraryList[] = [];
    loading = false;

    orgOptions: MotherOrganizationModel[] = [];
    selectedOrgIds: number[] = [];
    memberTypeOptions: { label: string; value: number }[] = [];
    selectedMemberTypeId: number | null = null;

    constructor(
        private supernumeraryListService: SupernumeraryListService,
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

        const request: GetSupernumeraryListRequest = {
            orgIds: this.selectedOrgIds,
            memberTypeId: this.selectedMemberTypeId
        };

        this.loading = true;
        this.supernumeraryListService.getSupernumeraryList(request).subscribe({
            next: (data) => {
                this.list = data ?? [];
                this.loading = false;
                this.messageService.add({
                    severity: 'success',
                    summary: 'Loaded',
                    detail: `${this.list.length} record(s) loaded.`
                });
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
