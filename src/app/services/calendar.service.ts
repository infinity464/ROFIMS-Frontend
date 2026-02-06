import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

/** API response may use PascalCase or camelCase */
export interface CalendarEventApi {
    calendarEventId?: number;
    CalendarEventId?: number;
    title?: string;
    Title?: string;
    startDate?: string;
    StartDate?: string;
    endDate?: string | null;
    EndDate?: string | null;
    allDay?: boolean;
    AllDay?: boolean;
    description?: string | null;
    Description?: string | null;
    reminder?: string | null;
    Reminder?: string | null;
    eventType?: string | null;
    EventType?: string | null;
    color?: string | null;
    Color?: string | null;
    createdBy?: string;
    lastUpdatedBy?: string;
}

export interface CalendarEventPayload {
    calendarEventId?: number;
    title: string;
    startDate: string;
    endDate?: string | null;
    allDay: boolean;
    description?: string | null;
    reminder?: string | null;
    eventType?: string | null;
    color?: string | null;
    createdBy: string;
    lastUpdatedBy: string;
}

@Injectable({
    providedIn: 'root'
})
export class CalendarService {
    private api = `${environment.apis.core}/CalendarEventInfo`;

    constructor(private http: HttpClient) {}

    private ensureArray<T>(data: T[] | { value?: T[]; data?: T[]; items?: T[] } | T): T[] {
        if (Array.isArray(data)) return data;
        if (data && typeof data === 'object') {
            if (Array.isArray((data as any).value)) return (data as any).value;
            if (Array.isArray((data as any).data)) return (data as any).data;
            if (Array.isArray((data as any).items)) return (data as any).items;
            const entries = Object.entries(data as Record<string, unknown>);
            for (const [, val] of entries) {
                if (Array.isArray(val)) return val as T[];
            }
            if (typeof (data as any).calendarEventId !== 'undefined' || typeof (data as any).CalendarEventId !== 'undefined') {
                return [data as T];
            }
        }
        return [];
    }

    getAll(): Observable<CalendarEventApi[]> {
        return this.http.get<any>(`${this.api}/GetAll`).pipe(
            map((res) => this.ensureArray(res)),
            catchError(() => of([]))
        );
    }

    getById(calendarEventId: number): Observable<CalendarEventApi | null> {
        return this.http.get<any>(`${this.api}/GetById/${calendarEventId}`).pipe(
            map((res) => {
                const arr = this.ensureArray(res);
                return arr.length > 0 ? arr[0] : null;
            }),
            catchError(() => of(null))
        );
    }

    getByDateRange(start: Date, end: Date): Observable<CalendarEventApi[]> {
        const startIso = start.toISOString();
        const endIso = end.toISOString();
        return this.http
            .get<any>(`${this.api}/GetByDateRange`, {
                params: { start: startIso, end: endIso }
            })
            .pipe(
                map((res) => {
                    const arr = this.ensureArray(res);
                    return Array.isArray(arr) ? arr : [];
                }),
                catchError((err) => {
                    console.warn('CalendarEventInfo GetByDateRange failed:', err?.status, err?.message);
                    return of([]);
                })
            );
    }

    save(payload: CalendarEventPayload): Observable<any> {
        return this.http.post(`${this.api}/SaveAsyn`, payload);
    }

    update(payload: CalendarEventPayload): Observable<any> {
        return this.http.post(`${this.api}/UpdateAsyn`, payload);
    }

    saveUpdate(payload: CalendarEventPayload): Observable<any> {
        return this.http.post(`${this.api}/SaveUpdateAsyn`, payload);
    }

    delete(calendarEventId: number): Observable<any> {
        return this.http.delete(`${this.api}/DeleteAsyn/${calendarEventId}`);
    }
}
