import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { InputText } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { PostingService } from '@/services/posting.service';
import { SharedService } from '@/shared/services/shared-service';
import { PostingReceiveViewDto } from '@/models/posting.model';

interface PostingOrderGroup {
    postingOrderMasterId: number;
    postingOrderNo: string;
    postingOrderDate: string | null;
    draftPostingMasterId: number;
    draftPostingNo: string;
    draftPostingDate: string;
    noteSheetId: number | null;
    noteSheetNo: string | null;
    approvalDate: string | null;
    totalMembers: number;
    pendingCount: number;
    receivedCount: number;
}

@Component({
    selector: 'app-posting-order-receive',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        DatePickerModule,
        SelectModule,
        TabsModule,
        TagModule,
        InputText,
        TooltipModule,
        Toast
    ],
    providers: [MessageService],
    templateUrl: './posting-order-receive.html',
    styleUrl: './posting-order-receive.scss'
})
export class PostingOrderReceiveComponent implements OnInit {
    // Approved orders (grouped)
    approvedOrders: PostingOrderGroup[] = [];
    selectedOrderId: number | null = null;
    loadingOrders = false;

    // Pending members for selected order
    allPendingMembers: PostingReceiveViewDto[] = [];
    pendingMembers: PostingReceiveViewDto[] = [];
    selectedMembers: PostingReceiveViewDto[] = [];
    loadingPending = false;
    transferUnitFilterOptions: { label: string; value: string | null }[] = [{ label: 'All Units', value: null }];
    transferUnitFilter: string | null = null;

    // Receive form
    joiningDate: Date | null = null;
    remarks = '';
    saving = false;

    // History
    historyRecords: PostingReceiveViewDto[] = [];
    loadingHistory = false;
    historyFilterOptions: { label: string; value: number | null }[] = [{ label: 'All Orders', value: null }];
    historyFilterId: number | null = null;

    activeTabIndex = 0;
    currentUser = '';

    constructor(
        private postingService: PostingService,
        private messageService: MessageService,
        private sharedService: SharedService
    ) {}

    ngOnInit(): void {
        this.currentUser = this.sharedService.getCurrentUser();
        this.loadApprovedOrders();
    }

    loadApprovedOrders(): void {
        this.loadingOrders = true;
        this.postingService.getApprovedPostingOrders().subscribe({
            next: (data) => {
                // Group by PostingOrderMasterId (one row per generated posting order)
                const map = new Map<number, PostingOrderGroup>();
                for (const row of data) {
                    if (row.postingOrderMasterId == null) continue;
                    if (!map.has(row.postingOrderMasterId)) {
                        map.set(row.postingOrderMasterId, {
                            postingOrderMasterId: row.postingOrderMasterId,
                            postingOrderNo: row.postingOrderNo ?? '',
                            postingOrderDate: row.postingOrderDate,
                            draftPostingMasterId: row.draftPostingMasterId,
                            draftPostingNo: row.draftPostingNo,
                            draftPostingDate: row.draftPostingDate,
                            noteSheetId: row.noteSheetId,
                            noteSheetNo: row.noteSheetNo,
                            approvalDate: row.approvalDate,
                            totalMembers: 0,
                            pendingCount: 0,
                            receivedCount: 0
                        });
                    }
                    const group = map.get(row.postingOrderMasterId)!;
                    group.totalMembers++;
                    if (row.receiveStatus === 'Pending') group.pendingCount++;
                    else if (row.receiveStatus === 'Received') group.receivedCount++;
                }
                this.approvedOrders = Array.from(map.values());
                this.historyFilterOptions = [
                    { label: 'All Orders', value: null },
                    ...this.approvedOrders.map(o => ({ label: o.postingOrderNo || o.draftPostingNo, value: o.postingOrderMasterId }))
                ];
                this.loadingOrders = false;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load approved posting orders' });
                this.loadingOrders = false;
            }
        });
    }

    viewMembers(order: PostingOrderGroup): void {
        this.selectedOrderId = order.postingOrderMasterId;
        this.selectedMembers = [];
        this.transferUnitFilter = null;
        this.loadingPending = true;
        this.postingService.getPendingPostingReceive(undefined, order.postingOrderMasterId).subscribe({
            next: (data) => {
                this.allPendingMembers = data;
                this.pendingMembers = data;
                const units = [...new Set(data.map(d => d.transferRabUnitName).filter(Boolean))];
                this.transferUnitFilterOptions = [
                    { label: 'All Units', value: null },
                    ...units.map(u => ({ label: u!, value: u! }))
                ];
                this.loadingPending = false;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load pending members' });
                this.loadingPending = false;
            }
        });
    }

    receiveSelected(): void {
        if (!this.selectedMembers.length) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select at least one member' });
            return;
        }
        if (!this.joiningDate) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select a joining date' });
            return;
        }

        this.saving = true;
        const joiningDateStr = this.formatDate(this.joiningDate);
        const items = this.selectedMembers.map(m => ({
            postingReceiveId: m.postingReceiveId,
            joiningDate: joiningDateStr,
            remarks: this.remarks || null
        }));

        this.postingService.receivePostingMembers(items, this.currentUser).subscribe({
            next: (res) => {
                if (res.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: res.description });
                    this.joiningDate = null;
                    this.remarks = '';
                    this.selectedMembers = [];
                    this.loadApprovedOrders();
                    if (this.selectedOrderId) {
                        this.viewMembers({ postingOrderMasterId: this.selectedOrderId } as PostingOrderGroup);
                    }
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description });
                }
                this.saving = false;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to receive members' });
                this.saving = false;
            }
        });
    }

    loadHistory(): void {
        this.loadingHistory = true;
        this.postingService.getPostingReceiveHistory(undefined, this.historyFilterId ?? undefined).subscribe({
            next: (data) => {
                this.historyRecords = data;
                this.loadingHistory = false;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load receive history' });
                this.loadingHistory = false;
            }
        });
    }

    onTabChange(index: string | number | undefined): void {
        this.activeTabIndex = Number(index ?? 0);
        if (index === 1) {
            this.loadHistory();
        }
    }

    onTransferUnitFilterChange(): void {
        this.selectedMembers = [];
        if (this.transferUnitFilter) {
            this.pendingMembers = this.allPendingMembers.filter(m => m.transferRabUnitName === this.transferUnitFilter);
        } else {
            this.pendingMembers = this.allPendingMembers;
        }
    }

    openNotesheet(order: PostingOrderGroup): void {
        if (order.noteSheetId) {
            window.open(`/notesheet-preview/posting?id=${order.noteSheetId}`, '_blank');
        }
    }

    openProfile(member: PostingReceiveViewDto): void {
        if (member.employeeId) {
            window.open(`/members/profile/${member.employeeId}`, '_blank');
        }
    }

    onHistoryFilterChange(): void {
        this.loadHistory();
    }

    formatDate(date: Date | null): string {
        if (!date) return '';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    formatDisplayDate(dateStr: string | null): string {
        if (!dateStr) return '—';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return dateStr;
        }
    }
}
