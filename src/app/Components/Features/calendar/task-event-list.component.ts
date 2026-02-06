import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { CheckboxModule } from 'primeng/checkbox';
import { TextareaModule } from 'primeng/textarea';
import { Fluid } from 'primeng/fluid';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CalendarService, CalendarEventApi, CalendarEventPayload } from '@/services/calendar.service';

export interface TaskEventItem {
    id: string;
    title: string;
    start: Date;
    end?: Date;
    allDay?: boolean;
    description?: string;
    reminder?: string;
    type: 'task' | 'event';
    color?: string;
}

const TYPE_OPTIONS = [{ label: 'Task', value: 'task' }, { label: 'Event', value: 'event' }];
const COLOR_OPTIONS = [
    { label: 'Blue', value: '#3b82f6' },
    { label: 'Green', value: '#10b981' },
    { label: 'Purple', value: '#8b5cf6' },
    { label: 'Amber', value: '#f59e0b' },
    { label: 'Red', value: '#ef4444' },
    { label: 'Teal', value: '#14b8a6' }
];

@Component({
    selector: 'app-task-event-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        ButtonModule,
        DialogModule,
        TagModule,
        InputTextModule,
        TableModule,
        SelectModule,
        DatePickerModule,
        CheckboxModule,
        TextareaModule,
        Fluid,
        TooltipModule,
        ConfirmDialogModule
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './task-event-list.component.html',
    styleUrl: './task-event-list.component.scss'
})
export class TaskEventListComponent implements OnInit {
    currentDate = new Date();
    monthYearLabel = '';
    events: TaskEventItem[] = [];
    loading = false;
    displayEntryDialog = false;
    isEditEntryMode = false;
    isSavingEntry = false;
    entryForm!: FormGroup;
    typeOptions = TYPE_OPTIONS;
    colorOptions = COLOR_OPTIONS;

    constructor(
        private calendarService: CalendarService,
        private fb: FormBuilder,
        private messageService: MessageService,
        private confirmationService: ConfirmationService
    ) {}

    ngOnInit(): void {
        this.buildEntryForm();
        this.updateMonthLabel();
        this.loadEvents();
    }

    buildEntryForm(): void {
        this.entryForm = this.fb.group({
            calendarEventId: [null],
            title: ['', Validators.required],
            eventType: ['event', Validators.required],
            startDate: [null, Validators.required],
            endDate: [null],
            allDay: [false],
            description: [''],
            reminder: [''],
            color: ['#3b82f6']
        });
    }

    openAddDialog(): void {
        this.isEditEntryMode = false;
        this.entryForm.reset({
            calendarEventId: null,
            title: '',
            eventType: 'event',
            startDate: new Date(),
            endDate: null,
            allDay: false,
            description: '',
            reminder: '',
            color: '#3b82f6'
        });
        this.displayEntryDialog = true;
    }

    openEditDialogFromList(ev: TaskEventItem): void {
        this.isEditEntryMode = true;
        this.entryForm.reset({
            calendarEventId: parseInt(ev.id, 10),
            title: ev.title,
            eventType: ev.type,
            startDate: new Date(ev.start),
            endDate: ev.end ? new Date(ev.end) : null,
            allDay: ev.allDay ?? false,
            description: ev.description ?? '',
            reminder: ev.reminder ?? '',
            color: ev.color ?? '#3b82f6'
        });
        this.displayEntryDialog = true;
    }

    onEntryDialogHide(): void {
        this.entryForm.markAsPristine();
    }

    saveTaskOrEvent(): void {
        if (this.entryForm.invalid) {
            this.entryForm.markAllAsTouched();
            return;
        }
        const v = this.entryForm.value;
        const startDate = v.startDate as Date;
        const endDate = v.endDate as Date | null;
        const allDay = v.allDay === true;
        let startIso: string;
        let endIso: string | null = null;
        if (allDay) {
            startIso = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0).toISOString();
            if (endDate) endIso = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59).toISOString();
        } else {
            startIso = new Date(startDate).toISOString();
            if (endDate) endIso = new Date(endDate).toISOString();
        }
        const payload: CalendarEventPayload = {
            title: v.title,
            startDate: startIso,
            endDate: endIso ?? undefined,
            allDay,
            description: v.description || undefined,
            reminder: v.reminder || undefined,
            eventType: v.eventType ?? 'event',
            color: v.color ?? undefined,
            createdBy: 'user',
            lastUpdatedBy: 'user'
        };
        if (this.isEditEntryMode && v.calendarEventId) payload.calendarEventId = v.calendarEventId;
        this.isSavingEntry = true;
        const req = this.isEditEntryMode ? this.calendarService.saveUpdate(payload) : this.calendarService.save(payload);
        req.subscribe({
            next: (res: any) => {
                const code = res?.statusCode ?? res?.StatusCode ?? 200;
                if (code !== 200) {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res?.description ?? res?.Description ?? 'Save failed' });
                    return;
                }
                this.messageService.add({ severity: 'success', summary: 'Saved', detail: this.isEditEntryMode ? 'Task/Event updated.' : 'Task/Event added.' });
                this.displayEntryDialog = false;
                this.loadEvents();
            },
            error: (err) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Save failed' }),
            complete: () => (this.isSavingEntry = false)
        });
    }

    confirmDeleteEntry(ev: TaskEventItem): void {
        this.confirmationService.confirm({
            message: 'Delete this task/event?',
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => this.deleteEntry(ev)
        });
    }

    deleteEntry(ev: TaskEventItem): void {
        const id = parseInt(ev.id, 10);
        if (isNaN(id)) return;
        this.calendarService.delete(id).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Task/Event deleted.' });
                this.loadEvents();
            },
            error: (err) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? err?.message ?? 'Delete failed' })
        });
    }

    formatDateForList(date: Date): string {
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return '—';
        return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    }

    formatDateTimeForList(date: Date, allDay?: boolean): string {
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return '—';
        const dateStr = this.formatDateForList(d);
        if (allDay) return dateStr;
        return `${dateStr} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    prevMonth(): void {
        this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1);
        this.updateMonthLabel();
        this.loadEvents();
    }

    nextMonth(): void {
        this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1);
        this.updateMonthLabel();
        this.loadEvents();
    }

    goToToday(): void {
        this.currentDate = new Date();
        this.updateMonthLabel();
        this.loadEvents();
    }

    private updateMonthLabel(): void {
        const y = this.currentDate.getFullYear();
        const m = this.currentDate.getMonth();
        this.monthYearLabel = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    private mapApiToEvent(api: CalendarEventApi): TaskEventItem {
        const a = api as Record<string, unknown>;
        const id = api.calendarEventId ?? a['CalendarEventId'] ?? 0;
        const title = (api.title ?? a['Title'] ?? '') as string;
        const startDate = (api.startDate ?? a['StartDate'] ?? '') as string;
        const endDate = api.endDate ?? a['EndDate'];
        const allDayRaw = api.allDay ?? a['AllDay'] ?? false;
        const allDay = allDayRaw === true || allDayRaw === false ? allDayRaw : false;
        const description = api.description ?? a['Description'];
        const reminder = api.reminder ?? a['Reminder'];
        const eventType = (api.eventType ?? a['EventType'] ?? 'event') as string;
        const color = api.color ?? a['Color'];
        return {
            id: String(id),
            title,
            start: new Date(startDate),
            end: endDate != null && endDate !== '' ? new Date(endDate as string) : undefined,
            allDay,
            description: (description != null && typeof description === 'string' ? description : undefined),
            reminder: (reminder != null && typeof reminder === 'string' ? reminder : undefined),
            type: (eventType === 'task' || eventType === 'event' ? eventType : 'event') as 'task' | 'event',
            color: (color != null && typeof color === 'string' ? color : undefined)
        };
    }

    private loadEvents(): void {
        const y = this.currentDate.getFullYear();
        const m = this.currentDate.getMonth();
        const start = new Date(y, m, 1);
        const end = new Date(y, m + 1, 0, 23, 59, 59);
        this.loading = true;
        this.calendarService.getByDateRange(start, end).subscribe({
            next: (list) => { this.events = list.map((e) => this.mapApiToEvent(e)); },
            error: () => { this.events = []; },
            complete: () => (this.loading = false)
        });
    }
}
