import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { Toast } from 'primeng/toast';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';

@Component({
    selector: 'app-presently-serving-members',
    standalone: true,
    imports: [CommonModule, TableModule, ButtonModule, Toast],
    providers: [MessageService],
    templateUrl: './presently-serving-members.html',
    styleUrl: './presently-serving-members.scss'
})
export class PresentlyServingMembers implements OnInit {
    list: EmployeeServiceOverview[] = [];
    loading = false;

    constructor(
        private servingMembersService: ServingMembersService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.loadList();
    }

    loadList(): void {
        this.loading = true;
        this.servingMembersService.getPresentlyServingMembers().subscribe({
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
                console.error('Failed to load presently serving members', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load list'
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

    onAction(row: EmployeeServiceOverview): void {
        // Placeholder for future action buttons
    }
}
