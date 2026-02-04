import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';

import { EmpService } from '@/services/emp-service';

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
}

@Component({
    selector: 'app-employee-search',
    standalone: true,
    imports: [CommonModule, FormsModule, InputTextModule, ButtonModule],
    template: `
        <div class="surface-50 border-round-2xl p-4 mb-4">
            <div class="flex flex-wrap gap-3 mb-4">
                <div style="min-width: 200px; max-width: 250px;">
                    <label class="font-semibold block mb-2 text-700">RAB ID</label>
                    <input pInputText class="w-full" placeholder="Enter RAB ID" [(ngModel)]="searchRabId" (keyup.enter)="search()" />
                </div>
                <div style="min-width: 200px; max-width: 250px;">
                    <label class="font-semibold block mb-2 text-700">Service ID</label>
                    <input pInputText class="w-full" placeholder="Enter Service ID" [(ngModel)]="searchServiceId" (keyup.enter)="search()" />
                </div>
                <div>
                    <label class="font-semibold block mb-2 text-700">&nbsp;</label>
                    <p-button label="Search" icon="pi pi-search" [loading]="isSearching" (onClick)="search()"></p-button>
                </div>
            </div>

            @if (employeeFound && employeeInfo) {
                <div class="border border-gray-300 rounded-lg p-4 mb-4 mt-8">
                    <div class="grid grid-cols-4 gap-5">
                        <div class="border-r border-gray-300 pr-4">
                            <div class="text-sm mb-2">NAME</div>
                            <div class="text-xl font-bold">{{ employeeInfo.fullNameEN || 'N/A' }}</div>
                        </div>
                        <div class="border-r border-gray-300 pr-4">
                            <div class="text-sm mb-2">RAB ID</div>
                            <div class="text-xl font-bold">{{ employeeInfo.rabid || 'N/A' }}</div>
                        </div>
                        <div class="border-r border-gray-300 pr-4">
                            <div class="text-sm mb-2">SERVICE ID</div>
                            <div class="text-xl font-bold">{{ employeeInfo.serviceId || 'N/A' }}</div>
                        </div>
                        <div class="pl-4">
                            <div class="text-sm mb-2">RANK</div>
                            <div class="text-xl font-bold">{{ employeeInfo.rankDisplay ?? employeeInfo.rank ?? 'N/A' }}</div>
                        </div>
                    </div>
                    <div class="grid grid-cols-4 gap-5 mt-5">
                        <div class="border-r border-gray-300 pr-4">
                            <div class="text-sm mb-2">CORPS</div>
                            <div class="text-xl font-bold">{{ employeeInfo.corpsDisplay ?? employeeInfo.branch ?? 'N/A' }}</div>
                        </div>
                        <div class="border-r border-gray-300 pr-4">
                            <div class="text-sm mb-2">TRADE</div>
                            <div class="text-xl font-bold">{{ employeeInfo.tradeDisplay ?? employeeInfo.trade ?? 'N/A' }}</div>
                        </div>
                        <div class="border-r border-gray-300 pr-4">
                            <div class="text-sm mb-2">MOTHER ORG</div>
                            <div class="text-xl font-bold">{{ employeeInfo.motherOrganizationDisplay ?? employeeInfo.motherOrganization ?? 'N/A' }}</div>
                        </div>
                        <div class="pl-4">
                            <div class="text-sm mb-2">MEMBER TYPE</div>
                            <div class="text-xl font-bold">{{ employeeInfo.memberTypeDisplay ?? employeeInfo.memberType ?? 'N/A' }}</div>
                        </div>
                    </div>
                </div>
            }
        </div>
    `
})
export class EmployeeSearchComponent {
    @Output() onEmployeeFound = new EventEmitter<EmployeeBasicInfo>();
    @Output() onSearchReset = new EventEmitter<void>();

    searchRabId: string = '';
    searchServiceId: string = '';
    isSearching: boolean = false;
    employeeFound: boolean = false;
    employeeInfo: EmployeeBasicInfo | null = null;

    constructor(
        private empService: EmpService,
        private messageService: MessageService
    ) {}

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
                        memberType: employee.MemberType ?? employee.memberType
                    };
                    this.employeeFound = true;
                    this.isSearching = false;
                    this.onEmployeeFound.emit(this.employeeInfo);
                    // Fetch display names from vw_EmployeeSearchInfo and merge into employeeInfo
                    this.empService.getEmployeeSearchInfo(employeeID).subscribe({
                        next: (searchInfo) => {
                            if (searchInfo && this.employeeInfo && this.employeeInfo.employeeID === employeeID) {
                                this.employeeInfo = {
                                    ...this.employeeInfo,
                                    rankDisplay: searchInfo.rank ?? searchInfo.Rank,
                                    corpsDisplay: searchInfo.corps ?? searchInfo.Corps,
                                    tradeDisplay: searchInfo.trade ?? searchInfo.Trade,
                                    motherOrganizationDisplay: searchInfo.motherOrganization ?? searchInfo.MotherOrganization,
                                    memberTypeDisplay: searchInfo.memberType ?? searchInfo.MemberType
                                };
                            }
                        }
                    });
                } else {
                    this.employeeFound = false;
                    this.employeeInfo = null;
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
}
