import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChartModule } from 'primeng/chart';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { CalendarService, type CalendarEventApi } from '@/services/calendar.service';
import { RabUnitAorMap } from '../../Components/basic-setup/rab-unit-aor-map/rab-unit-aor-map';
import { ServingMembersService } from '@/services/serving-members.service';
import { PermanentPostingMORecordService } from '@/services/permanent-posting-mo-record.service';
import { PermanentPostingJoineeDetailService } from '@/services/permanent-posting-joinee-detail.service';
import { StatisticsService, type ManpowerSummaryResponse } from '@/services/statistics.service';

const SLICE_COLORS = [
    '#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
    '#22c55e', '#0ea5e9', '#a855f7', '#fb923c', '#84cc16'
];

/** Draws percentage labels on each pie slice (baked into the canvas). */
const PIE_PERCENTAGE_PLUGIN = {
    id: 'piePercentageLabels',
    afterDatasetsDraw(chart: any): void {
        const { ctx } = chart;
        chart.data.datasets.forEach((_: any, di: number) => {
            const meta = chart.getDatasetMeta(di);
            if (meta.hidden) return;
            const data: number[] = chart.data.datasets[di].data;
            const total = data.reduce((s: number, v: number) => s + (v || 0), 0);
            if (total === 0) return;
            meta.data.forEach((arc: any, i: number) => {
                const pct = ((data[i] ?? 0) / total) * 100;
                if (pct < 3) return;
                const midAngle = (arc.startAngle + arc.endAngle) / 2;
                const r = arc.outerRadius * 0.65;
                const x = arc.x + Math.cos(midAngle) * r;
                const y = arc.y + Math.sin(midAngle) * r;
                ctx.save();
                ctx.font = 'bold 11px Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = 'rgba(0,0,0,0.55)';
                ctx.shadowBlur = 3;
                ctx.fillStyle = '#ffffff';
                ctx.fillText(`${pct.toFixed(1)}%`, x, y);
                ctx.restore();
            });
        });
    }
};

type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';
type Notice = { tag: string; severity: Severity; title: string; date: string };
type Notify = { icon: string; color: string; title: string; time: string };
type CalItem = { id: string; day: string; mon: string; dow: string; title: string; description: string; type: 'task' | 'event'; sev: Severity; tag: string; sortTs: number };

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [CommonModule, FormsModule, ChartModule, TagModule, DialogModule, ButtonModule, RabUnitAorMap],
    template: `
        <div class="mb-6 flex items-start justify-between flex-wrap gap-3">
            <div>
                <h1 class="text-3xl font-semibold text-surface-900 dark:text-surface-0 m-0">Dashboard</h1>
            </div>
            <p-tag severity="success" [rounded]="true" value="LIVE · Jun 12, 2026"></p-tag>
        </div>

        <div class="grid grid-cols-12 gap-6">
            <!-- ===== Row 1: KPI + Notice ===== -->
            <div class="col-span-12 xl:col-span-4">
                <div class="card mb-0 h-full">
                    <div class="flex justify-between items-start mb-4">
                        <span class="block text-muted-color font-medium uppercase text-sm tracking-wide">Total Serving Member</span>
                        <div class="flex items-center justify-center bg-primary-100 dark:bg-primary-400/10 rounded-full" style="width:2.75rem;height:2.75rem">
                            <i class="pi pi-users text-primary text-xl!"></i>
                        </div>
                    </div>
                    <div class="text-surface-900 dark:text-surface-0 font-bold text-4xl">{{ (servingCount | number) ?? '—' }}</div>
                </div>
            </div>

            <div class="col-span-12 xl:col-span-4">
                <div class="card mb-0 h-full">
                    <div class="flex justify-between items-start mb-4">
                        <span class="block text-muted-color font-medium uppercase text-sm tracking-wide">Posted Out | New Posting</span>
                        <div class="flex items-center justify-center bg-green-100 dark:bg-green-400/10 rounded-full" style="width:2.75rem;height:2.75rem">
                            <i class="pi pi-sync text-green-500 text-xl!"></i>
                        </div>
                    </div>
                    <div class="flex items-end gap-4">
                        <div>
                            <div class="text-surface-900 dark:text-surface-0 font-bold text-4xl">{{ (postedOutCount | number) ?? '—' }}</div>
                            <span class="text-muted-color text-sm">Posted Out</span>
                        </div>
                        <div class="text-2xl text-muted-color pb-1">|</div>
                        <div>
                            <div class="text-surface-900 dark:text-surface-0 font-bold text-4xl">{{ (newPostingCount | number) ?? '—' }}</div>
                            <span class="text-muted-color text-sm">New Posting</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="col-span-12 xl:col-span-4">
                <div class="card mb-0 h-full">
                    <div class="flex justify-between items-center mb-3">
                        <span class="font-semibold text-surface-900 dark:text-surface-0">Notice</span>
                        <span class="text-muted-color text-sm">1/4</span>
                    </div>
                    <p-tag severity="danger" value="URGENT" class="mb-2"></p-tag>
                    <div class="font-medium text-surface-900 dark:text-surface-0 mt-2">Nationwide security advisory — Election week deployment</div>
                    <div class="text-muted-color text-sm mt-1">11 Jun 2026</div>
                </div>
            </div>

            <!-- ===== Row 2: Two pie charts + Notifications ===== -->
            <div class="col-span-12 xl:col-span-4">
                <div class="card mb-0 h-full">
                    <div class="font-semibold text-lg text-surface-900 dark:text-surface-0">Held Strength</div>
                    <div class="text-muted-color text-sm mb-4">Manpower by organization</div>
                    <div class="dash-chart-wrap">
                        <p-chart type="pie" [data]="heldData" [options]="pieOptions" [plugins]="chartPlugins"></p-chart>
                    </div>
                </div>
            </div>

            <div class="col-span-12 xl:col-span-4">
                <div class="card mb-0 h-full">
                    <div class="font-semibold text-lg text-surface-900 dark:text-surface-0">Authorized Strength</div>
                    <div class="text-muted-color text-sm mb-4">Manpower by organization</div>
                    <div class="dash-chart-wrap">
                        <p-chart type="pie" [data]="authData" [options]="pieOptions" [plugins]="chartPlugins"></p-chart>
                    </div>
                </div>
            </div>

            <div class="col-span-12 xl:col-span-4">
                <div class="card mb-0 h-full">
                    <div class="font-semibold text-lg text-surface-900 dark:text-surface-0">Notifications</div>
                    <div class="text-muted-color text-sm mb-4">Last 24 hours</div>
                    <ul class="list-none p-0 m-0">
                        @for (n of notifications; track n.title) {
                            <li class="flex gap-3 items-start py-3 border-b border-surface-200 dark:border-surface-700 last:border-0">
                                <span class="flex items-center justify-center rounded-full shrink-0" [style.background]="n.color + '22'" style="width:2rem;height:2rem">
                                    <i [class]="'pi ' + n.icon" [style.color]="n.color"></i>
                                </span>
                                <div>
                                    <div class="text-surface-900 dark:text-surface-0 text-sm font-medium">{{ n.title }}</div>
                                    <div class="text-muted-color text-xs mt-1">{{ n.time }}</div>
                                </div>
                            </li>
                        }
                    </ul>
                </div>
            </div>

            <!-- ===== Row 3: Map + Event Calendar ===== -->
            <div class="col-span-12 xl:col-span-7">
                <div class="card mb-0 h-full">
                    <div class="font-semibold text-lg text-surface-900 dark:text-surface-0">Deployment Map</div>
                    <div class="text-muted-color text-sm mb-4">Bangladesh · RAB Unit AOR</div>
                    <app-rab-unit-aor-map [bare]="true" [hideTitle]="true" [hideLegend]="true" [heightPx]="420"></app-rab-unit-aor-map>
                </div>
            </div>

            <div class="col-span-12 xl:col-span-5">
                <div class="card mb-0 h-full">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <div class="font-semibold text-lg text-surface-900 dark:text-surface-0">Event Calendar</div>
                            <div class="text-muted-color text-sm">Today through end of month</div>
                        </div>
                        <p-tag severity="info" [value]="events.length + (events.length === 1 ? ' item' : ' items')"></p-tag>
                    </div>

                    @if (events.length === 0) {
                        <div class="py-10 text-center text-muted-color border border-dashed border-surface-300 dark:border-surface-600 rounded">
                            No tasks or events scheduled for the rest of the month.
                        </div>
                    } @else {
                        @for (e of events; track e.id; let even = $even) {
                            <div class="event-row flex items-center gap-4 px-2 py-3 rounded cursor-pointer"
                                [class.event-row-alt]="even"
                                (click)="openEvent(e)">
                                <div class="text-center shrink-0 px-3 py-1 rounded bg-surface-100 dark:bg-surface-800">
                                    <div class="text-xs text-muted-color uppercase">{{ e.mon }}</div>
                                    <div class="text-xl font-bold text-surface-900 dark:text-surface-0 leading-none">{{ e.day }}</div>
                                    <div class="text-xs text-muted-color">{{ e.dow }}</div>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="font-medium text-surface-900 dark:text-surface-0 truncate">{{ e.title }}</div>
                                    <div class="text-muted-color text-sm truncate">{{ e.description || '—' }}</div>
                                </div>
                                <p-tag [severity]="e.sev" [value]="e.tag"></p-tag>
                                <button type="button" pButton text rounded
                                    icon="pi pi-ellipsis-v" class="shrink-0"
                                    (click)="$event.stopPropagation(); openEvent(e)" aria-label="View details"></button>
                            </div>
                        }
                    }
                </div>
            </div>

            <!-- ===== Row 4: Personnel Lookup + Notice Board ===== -->
            <div class="col-span-12 xl:col-span-7">
                <div class="card mb-0 h-full">
                    <div class="font-semibold text-lg text-surface-900 dark:text-surface-0">Personnel Lookup</div>
                    <div class="text-muted-color text-sm mb-4">Search by Service ID, name or rank</div>
                    <div class="relative w-full">
                        <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-muted-color"></i>
                        <input type="text" [(ngModel)]="lookup" placeholder="e.g. RAB-04821 or Rezaul"
                            class="w-full p-3 pl-10 border border-surface-300 dark:border-surface-600 rounded bg-transparent text-surface-900 dark:text-surface-0" />
                    </div>
                    <div class="mt-6 py-10 text-center text-muted-color border border-dashed border-surface-300 dark:border-surface-600 rounded">
                        Start typing a unique identifier — Service ID, name or rank — to find personnel.
                    </div>
                </div>
            </div>

            <div class="col-span-12 xl:col-span-5">
                <div class="card mb-0 h-full">
                    <div class="font-semibold text-lg text-surface-900 dark:text-surface-0">Notice Board</div>
                    <div class="text-muted-color text-sm mb-4">Force-wide announcements</div>
                    @for (n of notices; track n.title) {
                        <div class="py-3 border-b border-surface-200 dark:border-surface-700 last:border-0">
                            <p-tag [severity]="n.severity" [value]="n.tag" class="mb-1"></p-tag>
                            <div class="font-medium text-surface-900 dark:text-surface-0 mt-1">{{ n.title }}</div>
                            <div class="text-muted-color text-xs mt-1">{{ n.date }}</div>
                        </div>
                    }
                </div>
            </div>
        </div>

        <p-dialog [(visible)]="eventDialogVisible" [modal]="true" [draggable]="false" [style]="{ width: '32rem' }"
            [header]="selectedEvent?.title || 'Details'">
            @if (selectedEvent; as e) {
                <div class="flex flex-col gap-4">
                    <div class="flex items-center gap-3">
                        <p-tag [severity]="e.sev" [value]="e.tag"></p-tag>
                        <span class="text-muted-color text-sm">{{ e.mon }} {{ e.day }} ({{ e.dow }})</span>
                    </div>
                    <div>
                        <div class="text-muted-color text-xs uppercase mb-1">Title</div>
                        <div class="text-surface-900 dark:text-surface-0 font-medium">{{ e.title }}</div>
                    </div>
                    <div>
                        <div class="text-muted-color text-xs uppercase mb-1">Type</div>
                        <div class="text-surface-900 dark:text-surface-0 capitalize">{{ e.type }}</div>
                    </div>
                    <div>
                        <div class="text-muted-color text-xs uppercase mb-1">Description</div>
                        <div class="text-surface-900 dark:text-surface-0 whitespace-pre-line">{{ e.description || 'No description provided.' }}</div>
                    </div>
                </div>
            }
        </p-dialog>
    `,
    styles: [`
        .dash-chart-wrap {
            position: relative;
            width: 100%;
            height: 26rem;
        }
        .event-row {
            transition: background-color 0.15s ease;
        }
        .event-row-alt {
            background: var(--surface-100, #f1f5f9);
        }
        :host-context(.app-dark) .event-row-alt {
            background: color-mix(in srgb, var(--surface-card) 80%, #ffffff 6%);
        }
        .event-row:hover {
            background: var(--surface-200, #e2e8f0);
        }
        :host-context(.app-dark) .event-row:hover {
            background: color-mix(in srgb, var(--surface-card) 70%, #ffffff 12%);
        }
        .dash-chart-wrap :is(p-chart, canvas) {
            width: 100% !important;
            height: 100% !important;
        }
    `]
})
export class Dashboard implements OnInit, OnDestroy {
    private themeObserver?: MutationObserver;
    private servingMembers = inject(ServingMembersService);
    private postedOutSvc = inject(PermanentPostingMORecordService);
    private newJoiningSvc = inject(PermanentPostingJoineeDetailService);
    private statisticsSvc = inject(StatisticsService);
    private calendarSvc = inject(CalendarService);
    servingCount: number | null = null;
    postedOutCount: number | null = null;
    newPostingCount: number | null = null;

    readonly chartPlugins = [PIE_PERCENTAGE_PLUGIN];

    lookup = '';

    selectedEvent: CalItem | null = null;
    eventDialogVisible = false;

    openEvent(e: CalItem): void {
        this.selectedEvent = e;
        this.eventDialogVisible = true;
    }

    authData: any;
    heldData: any;
    pieOptions: any;

    notifications: Notify[] = [
        { icon: 'pi-exclamation-triangle', color: '#ef4444', title: 'Operation Code Red — Sector 7', time: '2 min ago' },
        { icon: 'pi-check-circle', color: '#22c55e', title: 'Posting approval: SI Karim Hossain', time: '18 min ago' },
        { icon: 'pi-clock', color: '#3b82f6', title: 'Roll call rescheduled to 06:30', time: '1 hr ago' },
        { icon: 'pi-bell', color: '#a855f7', title: 'New training module published', time: '3 hr ago' },
        { icon: 'pi-exclamation-triangle', color: '#ef4444', title: 'Vehicle BR-114 reported missing', time: 'Yesterday' }
    ];

    events: CalItem[] = [];

    notices: Notice[] = [
        { tag: 'URGENT', severity: 'danger', title: 'Nationwide security advisory — Election week deployment', date: '11 Jun 2026' },
        { tag: 'POLICY', severity: 'info', title: 'Revised standard operating procedure for narcotics raids', date: '08 Jun 2026' },
        { tag: 'EVENT', severity: 'warn', title: 'Annual Police Week — parade rehearsal schedule released', date: '05 Jun 2026' },
        { tag: 'TRAINING', severity: 'success', title: 'Counter-terrorism workshop, Battalion 4 HQ', date: '02 Jun 2026' }
    ];

    /** Default range: today 00:00 → last day of the current month 23:59. */
    private loadCalendar(): void {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        this.calendarSvc.getByDateRange(start, end).subscribe({
            next: (list) => {
                this.events = (list ?? [])
                    .map((a) => this.mapCalItem(a))
                    .sort((x, y) => x.sortTs - y.sortTs);
            },
            error: () => (this.events = [])
        });
    }

    private mapCalItem(api: CalendarEventApi): CalItem {
        const a = api as Record<string, unknown>;
        const id = String(api.calendarEventId ?? a['CalendarEventId'] ?? '');
        const title = (api.title ?? a['Title'] ?? '') as string;
        const startStr = (api.startDate ?? a['StartDate'] ?? '') as string;
        const desc = (api.description ?? a['Description'] ?? '') as string;
        const rawType = (api.eventType ?? a['EventType'] ?? 'event') as string;
        const type: 'task' | 'event' = rawType === 'task' ? 'task' : 'event';
        const d = new Date(startStr);
        const valid = !isNaN(d.getTime());
        return {
            id,
            title,
            description: typeof desc === 'string' ? desc : '',
            type,
            day: valid ? String(d.getDate()).padStart(2, '0') : '--',
            mon: valid ? d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : '',
            dow: valid ? d.toLocaleDateString('en-US', { weekday: 'short' }) : '',
            sortTs: valid ? d.getTime() : Number.MAX_SAFE_INTEGER,
            sev: type === 'task' ? 'warn' : 'info',
            tag: type === 'task' ? 'TASK' : 'EVENT'
        };
    }

    /** Read the total record count from a paginated response, tolerant of Rows/rows casing. */
    private pagesTotal(res: any): number {
        const p = res?.pages;
        return p?.Rows ?? p?.rows ?? 0;
    }

    ngOnInit(): void {
        this.loadCalendar();

        // Total serving members = total record count of presently-serving (Posting Status = Serving).
        this.servingMembers.getPresentlyServingMembersPaginated(1, 1).subscribe({
            next: (res) => (this.servingCount = this.pagesTotal(res)),
            error: () => (this.servingCount = 0)
        });

        // Posted Out count (posting/posted-out-person-list source).
        this.postedOutSvc.getAllPaginated(1, 10).subscribe({
            next: (res) => (this.postedOutCount = this.pagesTotal(res)),
            error: () => (this.postedOutCount = 0)
        });

        // New Posting count (posting/new-joining-person-list source).
        // The list defaults to "Entry Pending" (isAddedInNewJoineeDataEntry = false); match that view.
        this.newJoiningSvc.getPaginatedFiltered({
            pagination: { page_no: 1, row_per_page: 1 },
            filter: { isAddedInNewJoineeDataEntry: false }
        }).subscribe({
            next: (res) => (this.newPostingCount = this.pagesTotal(res)),
            error: () => (this.newPostingCount = 0)
        });

        this.pieOptions = this.buildPieOptions();

        // Re-render legends with theme-appropriate text colour when dark mode toggles.
        this.themeObserver = new MutationObserver(() => (this.pieOptions = this.buildPieOptions()));
        this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        // Authorized & Held manpower pies — full force (no filter on the dashboard).
        this.statisticsSvc.getManpowerSummary(null).subscribe({
            next: (res: ManpowerSummaryResponse) => this.buildManpowerCharts(res.rows ?? []),
            error: () => this.buildManpowerCharts([])
        });
    }

    ngOnDestroy(): void {
        this.themeObserver?.disconnect();
    }

    private buildPieOptions(): any {
        const isDark = document.documentElement.classList.contains('app-dark');
        const text = isDark ? '#e2e8f0' : '#334155';
        return {
            responsive: true,
            maintainAspectRatio: false,
            // Push the legend away from the pie so the labels aren't cramped against it.
            layout: { padding: { bottom: 6 } },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: text, usePointStyle: true, padding: 16, font: { size: 12 } }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx: any) => {
                            const total = (ctx.dataset.data as number[]).reduce((a: number, b: number) => a + b, 0);
                            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0';
                            return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                        }
                    }
                }
            }
        };
    }

    private buildManpowerCharts(rows: { orgName: string; auth: number; held: number }[]): void {
        const labels = rows.map((r) => r.orgName);
        const colors = rows.map((_, i) => SLICE_COLORS[i % SLICE_COLORS.length]);
        const hover = colors.map((c) => c + 'cc');

        this.authData = {
            labels,
            datasets: [{ data: rows.map((r) => r.auth), backgroundColor: colors, hoverBackgroundColor: hover }]
        };
        this.heldData = {
            labels,
            datasets: [{ data: rows.map((r) => r.held), backgroundColor: colors, hoverBackgroundColor: hover }]
        };
    }
}
