import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { PostingService } from '@/services/posting.service';
import { PendingJoiningItem } from '@/models/posting.model';

/**
 * Pending List for Joining (ROFIMS Requirements p.43–44).
 * Join form: RAB ID, Service ID, Posting From/To, Joining Date, CC/MO/Article 47 No, file upload.
 */
@Component({
    selector: 'app-pending-joining-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        RouterModule,
        CardModule,
        ButtonModule,
        TableModule,
        TabsModule,
        DialogModule,
        InputTextModule,
        DatePickerModule,
        Toast
    ],
    providers: [MessageService],
    templateUrl: './pending-joining-list.html',
    styleUrl: './pending-joining-list.scss'
})
export class PendingJoiningListComponent implements OnInit {
    activeTab = 0;
    pendingNew: PendingJoiningItem[] = [];
    pendingInter: PendingJoiningItem[] = [];
    showJoinDialog = false;
    joinItem: PendingJoiningItem | null = null;
    joinDate: Date | null = null;
    ccMoArticle47No = '';

    constructor(
        private postingService: PostingService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.postingService.getPendingJoiningList().subscribe(() => this.refreshList());
        this.refreshList();
    }

    refreshList(): void {
        this.pendingNew = this.postingService.getPendingJoiningListSnapshot('New');
        this.pendingInter = this.postingService.getPendingJoiningListSnapshot('Inter');
    }

    openJoinDialog(item: PendingJoiningItem): void {
        this.joinItem = item;
        this.joinDate = null;
        this.ccMoArticle47No = '';
        this.showJoinDialog = true;
    }

    submitJoin(): void {
        if (!this.joinItem) return;
        if (!this.joinDate) {
            this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Select Joining Date.' });
            return;
        }
        const dateStr = this.joinDate.toISOString().slice(0, 10);
        this.postingService.recordJoin(this.joinItem.id, dateStr, this.ccMoArticle47No || null, null);
        this.messageService.add({ severity: 'success', summary: 'Recorded', detail: 'Join recorded successfully.' });
        this.showJoinDialog = false;
        this.joinItem = null;
        this.refreshList();
    }
}
