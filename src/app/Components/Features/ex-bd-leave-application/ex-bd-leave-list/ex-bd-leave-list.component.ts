import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import {
    ExBdLeaveApplicationService,
    ExBdLeaveApplicationListViewModel
} from '@/services/ex-bd-leave-application.service';
import { NoteSheetGenerationStatus, NoteSheetGenerationStatusOptions } from '@/models/enums';

@Component({
    selector: 'app-ex-bd-leave-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        DatePickerModule,
        SelectModule,
        FlexibleDateDirective,
        TagModule,
        ToastModule,
        ConfirmDialogModule,
        TooltipModule
    ],
    templateUrl: './ex-bd-leave-list.component.html',
    styleUrl: './ex-bd-leave-list.component.scss',
    providers: [MessageService, ConfirmationService]
})
export class ExBdLeaveListComponent implements OnInit {
    private router = inject(Router);
    private exBdLeaveService = inject(ExBdLeaveApplicationService);
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);

    applications: ExBdLeaveApplicationListViewModel[] = [];
    loading = true;
    filterFromDate: Date | null = null;
    filterToDate: Date | null = null;
    noteSheetStatusFilter: string = NoteSheetGenerationStatus.NotGenerated;
    noteSheetStatusOptions = NoteSheetGenerationStatusOptions;

    ngOnInit(): void {
        this.loadApplications();
    }

    loadApplications(): void {
        this.loading = true;
        const from = this.filterFromDate ? this.toDateString(this.filterFromDate) : undefined;
        const to = this.filterToDate ? this.toDateString(this.filterToDate) : undefined;
        const nsStatus = this.noteSheetStatusFilter || undefined;
        this.exBdLeaveService.getListView(from, to, nsStatus).subscribe({
            next: (data) => {
                // Client-side filter to ensure consistency with notesheet status
                if (this.noteSheetStatusFilter === NoteSheetGenerationStatus.NotGenerated) {
                    this.applications = data.filter(a => !a.noteSheetId);
                } else if (this.noteSheetStatusFilter === NoteSheetGenerationStatus.Generated) {
                    this.applications = data.filter(a => !!a.noteSheetId);
                } else {
                    this.applications = data;
                }
                this.loading = false;
            },
            error: () => {
                this.loading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load applications.' });
            }
        });
    }

    onDateFilterChange(): void {
        this.loadApplications();
    }

    private toDateString(d: Date): string {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    formatDate(dateStr: string | null): string {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    }

    goToApply(): void {
        this.router.navigate(['/ex-bd-leave/apply']);
    }

    editApplication(app: ExBdLeaveApplicationListViewModel): void {
        this.router.navigate(['/ex-bd-leave/apply', app.exBdLeaveApplicationId]);
    }

    deleteApplication(app: ExBdLeaveApplicationListViewModel): void {
        this.confirmationService.confirm({
            message: 'Are you sure you want to delete this application?',
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                this.exBdLeaveService.delete(app.exBdLeaveApplicationId).subscribe({
                    next: (res: any) => {
                        if (res.statusCode === 200) {
                            this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Application deleted.' });
                            this.loadApplications();
                        } else {
                            this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description || 'Delete failed.' });
                        }
                    },
                    error: () => {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'An error occurred.' });
                    }
                });
            }
        });
    }
}
