import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';

import { EmpService } from '@/services/emp-service';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { SharedService } from '@/shared/services/shared-service';

export interface EmployeeBasicInfo {
    employeeID: number;
    fullNameEN: string;
    fullNameBN?: string;
    rabid: string;
    serviceId: string;
    motherOrganization?: number;
    rank?: number;
    unit?: number;
    branch?: number;
    trade?: number;
    memberType?: number;
    /** Display names from vw_EmployeeSearchInfo (Rank, Corps, Trade, MotherOrganization, MemberType) */
    rankDisplay?: string;
    corpsDisplay?: string;
    tradeDisplay?: string;
    motherOrganizationDisplay?: string;
    memberTypeDisplay?: string;
    orgId?: number;
}

@Component({
    selector: 'app-employee-search',
    standalone: true,
    imports: [CommonModule, FormsModule, InputTextModule, ButtonModule],
    template: `
        <div class="surface-50 border-round-2xl py-4 mb-4">
            <div class="flex flex-wrap align-items-end gap-3">
                <div style="min-width: 140px; max-width: 160px;">
                    <label class="font-semibold block mb-2 text-700">RAB ID</label>
                    <input pInputText class="w-full" placeholder="RAB ID" [(ngModel)]="searchRabId" (ngModelChange)="onRabIdInput($event)" (keyup.enter)="search()" />
                </div>
                <div style="min-width: 140px; max-width: 160px;">
                    <label class="font-semibold block mb-2 text-700">Service ID</label>
                    <input pInputText class="w-full" placeholder="Service ID" [(ngModel)]="searchServiceId" (ngModelChange)="onServiceIdInput($event)" (keyup.enter)="search()" />
                </div>
                <div>
                    <label class="font-semibold block mb-2 text-700">&nbsp;</label>
                    <p-button label="Search" icon="pi pi-search" [loading]="isSearching" (onClick)="search()"></p-button>
                </div>
                <div>
                    <label class="font-semibold block mb-2 text-700">&nbsp;</label>
                    <p-button label="Clear" icon="pi pi-times" severity="secondary" (onClick)="reset()"></p-button>
                </div>
                @if (employeeFound && employeeInfo) {
                    <div class="ml-3">
                        <label class="font-semibold block mb-2 text-700">&nbsp;</label>
                        <div class="flex align-items-center gap-3">
                            <div class="flex align-items-center gap-3 px-3 shadow-1" style="line-height: 2.25rem; border: 1px solid var(--primary-color); border-radius: 2rem; background: var(--primary-50, rgba(16,185,129,0.05));">
                                <span
                                    ><span class="font-semibold"> Name : </span> <span class="font-semibold">{{ employeeInfo.fullNameEN || 'N/A' }}</span></span
                                >
                                <span
                                    ><span class="font-semibold"> Rank : </span> <span class="font-semibold">{{ employeeInfo.rankDisplay || 'N/A' }}</span></span
                                >
                                <span
                                    ><span class="font-semibold"> Corps : </span> <span class="font-semibold">{{ employeeInfo.corpsDisplay || 'N/A' }}</span></span
                                >
                                <span
                                    ><span class="font-semibold"> Trade : </span> <span class="font-semibold">{{ employeeInfo.tradeDisplay || 'N/A' }}</span></span
                                >
                                <span
                                    ><span class="font-semibold"> Mother Org : </span>
                                    <span class="font-semibold">{{ employeeInfo.motherOrganizationDisplay ?? employeeInfo.motherOrganization ?? 'N/A' }}</span></span
                                >
                            </div>
                            <p-button label="View Profile" (onClick)="openEmployeeProfile()"></p-button>
                        </div>
                    </div>
                }
            </div>
        </div>
    `
})
export class EmployeeSearchComponent implements OnChanges {
    /** When set (e.g. in edit mode), load and display this employee so RAB info shows on Update. */
    @Input() initialEmployeeId: number | null = null;

    @Output() onEmployeeFound = new EventEmitter<EmployeeBasicInfo>();
    @Output() onSearchReset = new EventEmitter<void>();

    searchRabId: string = '';
    searchServiceId: string = '';
    isSearching: boolean = false;
    employeeFound: boolean = false;
    employeeInfo: EmployeeBasicInfo | null = null;

    constructor(
        private empService: EmpService,
        private messageService: MessageService,
        private router: Router,
        private memberTypeAccess: IdentityUserMemberTypeAccessService,
        private sharedService: SharedService
    ) {}

    /** Central permission check. Returns true when the user is allowed to view this memberType. */
    private isMemberTypeAllowed(memberTypeId: number | null | undefined): boolean {
        if (memberTypeId == null) return true;
        const userId = this.sharedService.getCurrentUserId?.() ?? null;
        if (!userId) return true;
        const allowed = this.memberTypeAccess.getCachedMemberTypeIds(userId);
        if (allowed === null) return true;
        return allowed.includes(memberTypeId as number);
    }

    /**
     * Enriches the loaded basic info with display names + reliable memberTypeId from
     * vw_EmployeeSearchInfo, then either emits onEmployeeFound (allowed) or shows a
     * permission-denied toast and emits onSearchReset (denied).
     *
     * The banner is kept hidden (`employeeFound = false`) until the permission check
     * passes, so denied users never see a flash of the employee's name/rank.
     */
    private finalizeAndEmit(employeeID: number): void {
        this.empService.getEmployeeSearchInfo(employeeID).subscribe({
            next: (searchInfo) => {
                if (searchInfo && this.employeeInfo && this.employeeInfo.employeeID === employeeID) {
                    const reliableMemberTypeId =
                        (searchInfo as { memberTypeId?: number; MemberTypeId?: number }).memberTypeId ??
                        (searchInfo as { memberTypeId?: number; MemberTypeId?: number }).MemberTypeId ??
                        this.employeeInfo.memberType;
                    this.employeeInfo = {
                        ...this.employeeInfo,
                        rankDisplay: searchInfo.rank ?? searchInfo.Rank,
                        corpsDisplay: searchInfo.corps ?? searchInfo.Corps,
                        tradeDisplay: searchInfo.trade ?? searchInfo.Trade,
                        motherOrganizationDisplay: searchInfo.motherOrganization ?? searchInfo.MotherOrganization,
                        memberTypeDisplay: searchInfo.memberType ?? searchInfo.MemberType,
                        memberType: reliableMemberTypeId as number | undefined
                    };
                }

                const memberTypeId = this.employeeInfo?.memberType ?? null;
                if (!this.isMemberTypeAllowed(memberTypeId)) {
                    const typeName = this.employeeInfo?.memberTypeDisplay ?? null;
                    this.employeeFound = false;
                    this.employeeInfo = null;
                    this.searchRabId = '';
                    this.searchServiceId = '';
                    this.isSearching = false;
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'No Permission',
                        detail: typeName
                            ? `You do not have permission to view ${typeName}.`
                            : 'You do not have permission to view this member type.',
                        life: 6000
                    });
                    this.onSearchReset.emit();
                    return;
                }

                this.employeeFound = true;
                this.isSearching = false;
                if (this.employeeInfo) {
                    this.onEmployeeFound.emit(this.employeeInfo);
                }
            },
            error: () => {
                // Fail-open if enrichment/view fails: emit with what we have rather than block.
                this.employeeFound = true;
                this.isSearching = false;
                if (this.employeeInfo) {
                    this.onEmployeeFound.emit(this.employeeInfo);
                }
            }
        });
    }

    ngOnChanges(changes: SimpleChanges): void {
        const idChange = changes['initialEmployeeId'];
        if (idChange && idChange.currentValue != null && idChange.currentValue > 0) {
            const id = Number(idChange.currentValue);
            if (id !== this.employeeInfo?.employeeID) this.loadEmployeeById(id);
        } else if (idChange && (idChange.currentValue == null || idChange.currentValue === 0)) {
            this.employeeFound = false;
            this.employeeInfo = null;
            this.searchRabId = '';
            this.searchServiceId = '';
        }
    }

    /** Load employee by ID and show in card (used when opening draft for update). */
    loadEmployeeById(employeeId: number): void {
        this.isSearching = true;
        this.empService.getEmployeeById(employeeId).subscribe({
            next: (employee: any) => {
                if (employee) {
                    const employeeID = employee.EmployeeID ?? employee.employeeID;
                    this.employeeInfo = {
                        employeeID,
                        fullNameEN: employee.FullNameEN || employee.fullNameEN || '',
                        fullNameBN: employee.FullNameBN || employee.fullNameBN,
                        rabid: employee.RABID || employee.Rabid || employee.rabid || '',
                        serviceId: employee.ServiceId || employee.serviceId || '',
                        motherOrganization: employee.LastMotherUnit ?? employee.MotherOrganization ?? employee.motherOrganization,
                        rank: employee.Rank ?? employee.rank,
                        unit: employee.Unit ?? employee.unit,
                        branch: employee.Branch ?? employee.branch,
                        trade: employee.Trade ?? employee.trade,
                        memberType: employee.MemberType ?? employee.memberType,
                        orgId: employee.orgId
                    };
                    this.searchRabId = this.employeeInfo.rabid || '';
                    this.searchServiceId = this.employeeInfo.serviceId || '';
                    this.finalizeAndEmit(employeeID);
                } else {
                    this.employeeFound = false;
                    this.employeeInfo = null;
                    this.isSearching = false;
                }
            },
            error: () => {
                this.isSearching = false;
                this.employeeFound = false;
                this.employeeInfo = null;
            }
        });
    }

    onRabIdInput(value: string): void {
        // Only clear the other field if this one is cleared
        if (!value || !value.trim()) {
            this.searchServiceId = '';
            this.employeeFound = false;
            this.employeeInfo = null;
        }
    }

    onServiceIdInput(value: string): void {
        // Only clear the other field if this one is cleared
        if (!value || !value.trim()) {
            this.searchRabId = '';
            this.employeeFound = false;
            this.employeeInfo = null;
        }
    }

    search(): void {
        if (!this.searchRabId && !this.searchServiceId) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Warning',
                detail: 'Please enter RAB ID or Service ID'
            });
            return;
        }

        this.isSearching = true;
        this.empService.searchByRabIdOrServiceId(this.searchRabId || undefined, this.searchServiceId || undefined).subscribe({
            next: (employee: any) => {
                if (employee) {
                    const employeeID = employee.EmployeeID ?? employee.employeeID;
                    this.employeeInfo = {
                        employeeID,
                        fullNameEN: employee.FullNameEN || employee.fullNameEN || '',
                        fullNameBN: employee.FullNameBN || employee.fullNameBN,
                        rabid: employee.RABID || employee.Rabid || employee.rabid || '',
                        serviceId: employee.ServiceId || employee.serviceId || '',
                        motherOrganization: employee.LastMotherUnit ?? employee.MotherOrganization ?? employee.motherOrganization,
                        rank: employee.Rank ?? employee.rank,
                        unit: employee.Unit ?? employee.unit,
                        branch: employee.Branch ?? employee.branch,
                        trade: employee.Trade ?? employee.trade,
                        memberType: employee.MemberType ?? employee.memberType,
                        orgId: employee.orgId
                    };
                    // Auto-fill the other field
                    if (this.searchRabId && !this.searchServiceId) {
                        this.searchServiceId = this.employeeInfo.serviceId || '';
                    } else if (this.searchServiceId && !this.searchRabId) {
                        this.searchRabId = this.employeeInfo.rabid || '';
                    }
                    this.finalizeAndEmit(employeeID);
                } else {
                    this.employeeFound = false;
                    this.employeeInfo = null;
                    this.onSearchReset.emit();
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Not Found',
                        detail: 'No employee found with the given ID'
                    });
                }
                this.isSearching = false;
            },
            error: (err) => {
                console.error('Search failed', err);
                this.isSearching = false;
                this.employeeFound = false;
                this.onSearchReset.emit();
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to search employee'
                });
            }
        });
    }

    reset(): void {
        this.searchRabId = '';
        this.searchServiceId = '';
        this.employeeFound = false;
        this.employeeInfo = null;
        this.onSearchReset.emit();
    }

    // Public method to get the current employee info
    getEmployeeInfo(): EmployeeBasicInfo | null {
        return this.employeeInfo;
    }

    // Public method to check if employee is found
    isEmployeeFound(): boolean {
        return this.employeeFound;
    }

    openEmployeeProfile(): void {
        if (this.employeeInfo && this.employeeInfo.employeeID) {
            this.router.navigate(['/members/profile', this.employeeInfo.employeeID]);
        }
    }
}
