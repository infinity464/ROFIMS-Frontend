import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { Fluid } from 'primeng/fluid';
import { CalendarService, CalendarEventApi } from '@/services/calendar.service';

export interface CalendarEvent {
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

@Component({
    selector: 'app-calendar',
    standalone: true,
    imports: [CommonModule, RouterModule, ButtonModule, DialogModule, TagModule, Fluid],
    templateUrl: './calendar.component.html',
    styleUrl: './calendar.component.scss'
})
export class CalendarComponent implements OnInit {
    currentDate = new Date();
    weeks: { date: Date; isCurrentMonth: boolean; events: CalendarEvent[] }[][] = [];
    weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    monthYearLabel = '';
    selectedEvent: CalendarEvent | null = null;
    showDetailDialog = false;
    events: CalendarEvent[] = [];
    loading = false;

    constructor(private calendarService: CalendarService) {}

    ngOnInit(): void {
        this.buildMonth();
        this.loadEvents();
    }

    private mapApiToEvent(api: CalendarEventApi): CalendarEvent {
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
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        const start = new Date(year, month, 1);
        const end = new Date(year, month + 1, 0, 23, 59, 59);
        this.loading = true;
        this.calendarService.getByDateRange(start, end).subscribe({
            next: (list) => {
                this.events = list.map((e) => this.mapApiToEvent(e));
                this.buildMonth();
            },
            error: () => {
                this.events = [];
                this.buildMonth();
            },
            complete: () => (this.loading = false)
        });
    }

    private buildMonth(): void {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        this.monthYearLabel = new Date(year, month, 1).toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric'
        });

        const first = new Date(year, month, 1);
        const last = new Date(year, month + 1, 0);
        const startPad = first.getDay();
        const daysInMonth = last.getDate();
        const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
        const days: { date: Date; isCurrentMonth: boolean; events: CalendarEvent[] }[] = [];

        for (let i = 0; i < startPad; i++) {
            const d = new Date(year, month, -startPad + i + 1);
            days.push({ date: d, isCurrentMonth: false, events: this.getEventsForDay(d) });
        }
        for (let i = 1; i <= daysInMonth; i++) {
            const d = new Date(year, month, i);
            days.push({ date: d, isCurrentMonth: true, events: this.getEventsForDay(d) });
        }
        const remaining = totalCells - days.length;
        for (let i = 1; i <= remaining; i++) {
            const d = new Date(year, month + 1, i);
            days.push({ date: d, isCurrentMonth: false, events: this.getEventsForDay(d) });
        }

        this.weeks = [];
        for (let i = 0; i < days.length; i += 7) {
            this.weeks.push(days.slice(i, i + 7));
        }
    }

    private getEventsForDay(date: Date): CalendarEvent[] {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        return this.events.filter((e) => {
            const start = new Date(e.start);
            const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            if (e.allDay) return startDay.getTime() === d.getTime();
            return start >= d && start < next;
        });
    }

    prevMonth(): void {
        this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1);
        this.loadEvents();
    }

    nextMonth(): void {
        this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1);
        this.loadEvents();
    }

    goToToday(): void {
        this.currentDate = new Date();
        this.loadEvents();
    }

    isToday(date: Date): boolean {
        const t = new Date();
        return (
            date.getDate() === t.getDate() &&
            date.getMonth() === t.getMonth() &&
            date.getFullYear() === t.getFullYear()
        );
    }

    onEventClick(event: CalendarEvent): void {
        this.selectedEvent = event;
        this.showDetailDialog = true;
    }

    closeDetail(): void {
        this.showDetailDialog = false;
        this.selectedEvent = null;
    }

    formatTime(date: Date): string {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    formatDate(date: Date): string {
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
}
