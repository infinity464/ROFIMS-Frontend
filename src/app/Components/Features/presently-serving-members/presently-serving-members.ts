import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageService } from 'primeng/api';
import { Toast } from 'primeng/toast';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';

export interface FilterModel {
    rabId: string;
    serviceId: string;
    nidId: string;
    nameBangla: string;
    nameEnglish: string;
    presentRabUnit: number | null;
    rank: number | null;
    corpsTrade: number | null;
    durationFrom: Date | null;
    durationTo: Date | null;
    wonHomeDistrict: number | null;
    wifeHomeDistrict: number | null;
    appointment: number | null;
}

@Component({
    selector: 'app-presently-serving-members',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        RouterModule,
        TableModule,
        ButtonModule,
        InputTextModule,
        SelectModule,
        DatePickerModule,
        Toast
    ],
    providers: [MessageService],
    templateUrl: './presently-serving-members.html',
    styleUrl: './presently-serving-members.scss'
})
export class PresentlyServingMembers implements OnInit {
    list: EmployeeServiceOverview[] = [];
    loading = false;
    totalRecords = 0;
    first = 0;
    rows = 10;

    filter: FilterModel = {
        rabId: '',
        serviceId: '',
        nidId: '',
        nameBangla: '',
        nameEnglish: '',
        presentRabUnit: null,
        rank: null,
        corpsTrade: null,
        durationFrom: null,
        durationTo: null,
        wonHomeDistrict: null,
        wifeHomeDistrict: null,
        appointment: null
    };

    rabUnitOptions: { label: string; value: number }[] = [];
    rankOptions: { label: string; value: number }[] = [];
    corpsTradeOptions: { label: string; value: number }[] = [];
    districtOptions: { label: string; value: number }[] = [];
    appointmentOptions: { label: string; value: number }[] = [];

    constructor(
        private servingMembersService: ServingMembersService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.onLazyLoad({ first: 0, rows: this.rows });
    }

    onLazyLoad(event: TableLazyLoadEvent): void {
        const pageNo = event.first != null && event.rows != null ? Math.floor(event.first / event.rows) + 1 : 1;
        const rowPerPage = event.rows ?? this.rows;
        this.loadList(pageNo, rowPerPage);
        this.first = event.first ?? 0;
        this.rows = rowPerPage;
    }

    loadList(pageNo = 1, rowPerPage?: number): void {
        const rows = rowPerPage ?? this.rows;
        this.loading = true;
        this.servingMembersService.getPresentlyServingMembersPaginated(pageNo, rows).subscribe({
            next: (res) => {
                this.list = res.datalist ?? [];
                this.totalRecords = res.pages?.rows ?? 0;
                this.loading = false;
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

    refresh(): void {
        this.first = 0;
        this.loadList(1, this.rows);
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
