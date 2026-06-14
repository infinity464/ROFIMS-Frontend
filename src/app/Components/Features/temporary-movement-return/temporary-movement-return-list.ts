import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';

import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { TemporaryMovementReturnService } from '@/services/temporary-movement-return.service';
import { TemporaryMovementReturnModel } from '@/models/temporary-movement-return.model';

@Component({
    selector: 'app-temporary-movement-return-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        InputTextModule,
        SelectModule,
        DatePickerModule,
        TableModule,
        TooltipModule,
        ConfirmDialog,
        FlexibleDateDirective
    ],
    providers: [ConfirmationService],
    templateUrl: './temporary-movement-return-list.html',
    styleUrl: './temporary-movement-return.scss'
})
export class TemporaryMovementReturnListComponent implements OnInit {
    private service = inject(TemporaryMovementReturnService);
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);

    @Output() editRecord = new EventEmitter<TemporaryMovementReturnModel>();
    @Output() changed = new EventEmitter<void>();

    loading = false;
    private allRecords: TemporaryMovementReturnModel[] = [];
    records: TemporaryMovementReturnModel[] = [];

    // Filters
    filterLetterNo = '';
    filterMotherOrgId: number | null = null;
    filterMotherUnitId: number | null = null;
    filterReturnFrom: Date | null = null;
    filterReturnTo: Date | null = null;

    motherOrgOptions: { label: string; value: number }[] = [];
    motherUnitOptions: { label: string; value: number }[] = [];

    ngOnInit(): void {
        this.load();
    }

    load(): void {
        this.loading = true;
        this.service.getAll().subscribe({
            next: (rows) => {
                this.allRecords = rows || [];
                this.buildFilterOptions();
                this.applyFilters();
                this.loading = false;
            },
            error: () => { this.loading = false; }
        });
    }

    private buildFilterOptions(): void {
        const orgMap = new Map<number, string>();
        const unitMap = new Map<number, string>();
        for (const r of this.allRecords) {
            if (r.motherOrgId != null && !orgMap.has(r.motherOrgId)) {
                orgMap.set(r.motherOrgId, r.motherOrgName || `Org #${r.motherOrgId}`);
            }
            if (r.destinedMotherUnitId != null && !unitMap.has(r.destinedMotherUnitId)) {
                unitMap.set(r.destinedMotherUnitId, r.destinedMotherUnitName || `Unit #${r.destinedMotherUnitId}`);
            }
        }
        this.motherOrgOptions = [...orgMap.entries()]
            .map(([value, label]) => ({ label, value }))
            .sort((a, b) => a.label.localeCompare(b.label));
        this.motherUnitOptions = [...unitMap.entries()]
            .map(([value, label]) => ({ label, value }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }

    applyFilters(): void {
        const ln = this.filterLetterNo.trim().toLowerCase();
        const from = this.filterReturnFrom ? this.startOfDay(this.filterReturnFrom) : null;
        const to = this.filterReturnTo ? this.endOfDay(this.filterReturnTo) : null;

        this.records = this.allRecords.filter((r) => {
            if (ln && !(r.letterNo || '').toLowerCase().includes(ln)) return false;
            if (this.filterMotherOrgId != null && r.motherOrgId !== this.filterMotherOrgId) return false;
            if (this.filterMotherUnitId != null && r.destinedMotherUnitId !== this.filterMotherUnitId) return false;
            if (from || to) {
                if (!r.returnDate) return false;
                const d = new Date(r.returnDate).getTime();
                if (from && d < from.getTime()) return false;
                if (to && d > to.getTime()) return false;
            }
            return true;
        });
    }

    clearFilters(): void {
        this.filterLetterNo = '';
        this.filterMotherOrgId = null;
        this.filterMotherUnitId = null;
        this.filterReturnFrom = null;
        this.filterReturnTo = null;
        this.applyFilters();
    }

    confirmDelete(row: TemporaryMovementReturnModel): void {
        this.confirmationService.confirm({
            message: `Delete the return record for ${row.fullNameEN || 'this person'}?`,
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                this.service.delete(row.id).subscribe({
                    next: () => {
                        this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Return record deleted.' });
                        this.changed.emit();
                        this.load();
                    },
                    error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Delete failed.' })
                });
            }
        });
    }

    private startOfDay(d: Date): Date {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        return x;
    }

    private endOfDay(d: Date): Date {
        const x = new Date(d);
        x.setHours(23, 59, 59, 999);
        return x;
    }
}
