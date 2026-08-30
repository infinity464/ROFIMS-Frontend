import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChartModule } from 'primeng/chart';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { CalendarService, type CalendarEventApi } from '@/services/calendar.service';
import { EmpService } from '@/services/emp-service';
import { NoticeService, type NoticeListDto } from '@/services/notice.service';
import { NotificationService, type AppNotification } from '@/services/notification.service';
import { ChatService } from '@/services/chat.service';
import { Router } from '@angular/router';
import { RabUnitAorMap } from '../../Components/basic-setup/rab-unit-aor-map/rab-unit-aor-map';
import { ServingMembersService } from '@/services/serving-members.service';
import { LeaveInfoService } from '@/services/leave-info.service';
import { MovementInfoService } from '@/services/movement-info.service';
import { PostingService } from '@/services/posting.service';
import type { EmployeePostingProcessingStatusDto } from '@/models/posting.model';
import { PermanentPostingMORecordService } from '@/services/permanent-posting-mo-record.service';
import { PermanentPostingJoineeDetailService } from '@/services/permanent-posting-joinee-detail.service';
import { StatisticsService, type ManpowerSummaryResponse } from '@/services/statistics.service';
import { ReportService } from '@/services/report.service';

const SLICE_COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#22c55e', '#0ea5e9', '#a855f7', '#fb923c', '#84cc16'];

/** Draws percentage labels on each pie slice (baked into the canvas). */
const PIE_PERCENTAGE_PLUGIN = {
    id: 'piePercentageLabels',
    afterDatasetsDraw(chart: any): void {
        const { ctx } = chart;
        chart.data.datasets.forEach((_: any, di: number) => {
            const meta = chart.getDatasetMeta(di);
            if (meta.hidden) return;
            const data: number[] = chart.data.datasets[di].data;
            // Legend clicks hide individual slices — skip their labels. The total stays
            // the full dataset, so the remaining percentages keep their original values.
            const isVisible = (i: number): boolean =>
                typeof chart.getDataVisibility === 'function'
                    ? chart.getDataVisibility(i)
                    : !meta.data[i]?.hidden;
            const total = data.reduce((s: number, v: number) => s + (v || 0), 0);
            if (total === 0) return;
            meta.data.forEach((arc: any, i: number) => {
                if (!isVisible(i)) return;
                const value = data[i] ?? 0;
                if (value <= 0) return;
                const label = `${((value / total) * 100).toFixed(1)}%`;
                const midAngle = (arc.startAngle + arc.endAngle) / 2;
                const sweep = Math.min(Math.abs(arc.endAngle - arc.startAngle), Math.PI);
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // Fit the label to the arc as drawn, not to its value. Roomy slices keep the
                // default size at ~65 % of the radius; narrower ones step the font down and slide
                // outward, where the arc is wider.
                const halfChord = Math.sin(sweep / 2);
                let r = 0;
                let fitted = false;
                for (const size of [11, 10, 9, 8]) {
                    ctx.font = `bold ${size}px Arial, sans-serif`;
                    const need = ctx.measureText(label).width + 2;
                    for (const factor of [0.65, 0.75, 0.85]) {
                        r = arc.outerRadius * factor;
                        if (2 * r * halfChord >= need) { fitted = true; break; }
                    }
                    if (fitted) break;
                }
                ctx.shadowColor = 'rgba(0,0,0,0.55)';
                ctx.shadowBlur = 3;
                ctx.fillStyle = '#ffffff';
                if (fitted) {
                    ctx.fillText(label, arc.x + Math.cos(midAngle) * r, arc.y + Math.sin(midAngle) * r);
                    ctx.restore();
                    return;
                }
                // Nothing fits across the wedge — turn the label to run along it instead. A thin
                // wedge is narrow across but long from centre to rim, so the text fits sideways.
                for (const size of [10, 9, 8]) {
                    ctx.font = `bold ${size}px Arial, sans-serif`;
                    const w = ctx.measureText(label).width;
                    const inner = (size + 1) / (2 * halfChord); // where the wedge is as wide as the glyph height
                    const mid = inner + w / 2 + 2;
                    if (mid + w / 2 > arc.outerRadius - 3) continue; // would run past the rim
                    ctx.translate(arc.x + Math.cos(midAngle) * mid, arc.y + Math.sin(midAngle) * mid);
                    // Flip on the left half so the text never reads upside-down.
                    ctx.rotate(Math.cos(midAngle) < 0 ? midAngle + Math.PI : midAngle);
                    ctx.fillText(label, 0, 0);
                    break;
                }
                ctx.restore();
            });
        });
    }
};

type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

/** Notice-tag taxonomy: 5 severity bands, CRITICAL highest. Drives chip colour + sort order. */
type NoticeBand = 'critical' | 'action' | 'personnel' | 'informational' | 'routine';
const NOTICE_BAND_META: Record<NoticeBand, { rank: number; classes: string }> = {
    critical: { rank: 0, classes: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30' },
    action: { rank: 1, classes: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30' },
    personnel: { rank: 2, classes: 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/30' },
    informational: { rank: 3, classes: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30' },
    routine: { rank: 4, classes: 'text-surface-500 dark:text-surface-400 bg-surface-500/10 border-surface-400/30' }
};
/** Known tag (UPPER) → band + icon. Unknown tags fall back to routine / pi-tag. */
const NOTICE_TAG_META: Record<string, { band: NoticeBand; icon: string }> = {
    URGENT: { band: 'critical', icon: 'pi-exclamation-triangle' },
    ALERT: { band: 'critical', icon: 'pi-bell' },
    RECALL: { band: 'critical', icon: 'pi-replay' },
    OPERATION: { band: 'critical', icon: 'pi-bullseye' },
    ORDER: { band: 'action', icon: 'pi-file' },
    DEADLINE: { band: 'action', icon: 'pi-clock' },
    DEPLOYMENT: { band: 'action', icon: 'pi-map-marker' },
    SECURITY: { band: 'action', icon: 'pi-shield' },
    POSTING: { band: 'personnel', icon: 'pi-sync' },
    PROMOTION: { band: 'personnel', icon: 'pi-angle-double-up' },
    LEAVE: { band: 'personnel', icon: 'pi-send' },
    RECRUITMENT: { band: 'personnel', icon: 'pi-user-plus' },
    POLICY: { band: 'informational', icon: 'pi-check-square' },
    EVENT: { band: 'informational', icon: 'pi-calendar' },
    MEETING: { band: 'informational', icon: 'pi-users' },
    CIRCULAR: { band: 'informational', icon: 'pi-envelope' },
    TRAINING: { band: 'routine', icon: 'pi-book' },
    MAINTENANCE: { band: 'routine', icon: 'pi-cog' },
    WELFARE: { band: 'routine', icon: 'pi-heart' },
    ADMIN: { band: 'routine', icon: 'pi-folder' }
};
type LookupCard = {
    employeeId: number;
    name: string;
    nameBn: string;
    rabId: string;
    serviceId: string;
    rank: string;
    corps: string;
    trade: string;
    motherOrg: string;
    motherUnit: string;
    rabUnit: string;
    profileImages: string | null;
    photoUrl: string | null;
    /** Presently on leave (today within an approved leave window). */
    onLeave: boolean;
    leaveType: string;
    leaveFrom: string | null;
    leaveTo: string | null;
    /** On a temporary movement whose return has not been recorded. */
    onMovement: boolean;
    movementDestination: string;
    /** In-progress posting line, e.g. "New Posting: Notesheet - Draft" (empty when none). */
    postingStatus: string;
};

/** Posting-step code → display label (mirrors profile-labels.ts 'posting.step.*'). */
const POSTING_STEP_LABELS: Record<string, string> = {
    DraftPosting: 'Draft Posting',
    DraftInterPosting: 'Draft Inter Posting',
    NoteSheetDraft: 'Notesheet - Draft',
    NoteSheetInitiator: 'Notesheet - Pending Initiator',
    NoteSheetRecommender: 'Notesheet - Pending Recommender',
    NoteSheetFinalApproval: 'Notesheet - Pending Final Approval',
    NoteSheetApproved: 'Notesheet Approved',
    PostingOrderGenerated: 'Posting Order Generated',
    PostingOrderApproved: 'Posting Order Approved'
};
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
            <p-tag severity="success" [rounded]="true" [value]="'LIVE · ' + liveDate"></p-tag>
        </div>

        <div class="grid grid-cols-12 gap-6">
            <!-- ===== Row 1: KPI + Notice ===== -->
            <div [class]="kpiColClass">
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

            @if (hasFullOrgAccess) {
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
            }

            <div [class]="kpiColClass">
                <div class="card mb-0 h-full flex flex-col">
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-muted-color font-medium uppercase text-sm tracking-wide">Urgent Notice</span>
                        @if (criticalNotices.length) {
                            <span class="inline-flex items-center gap-2 text-muted-color text-sm">
                                <span class="w-2 h-2 rounded-full bg-green-500"></span>
                                {{ criticalIndex + 1 }}/{{ criticalNotices.length }}
                            </span>
                        }
                    </div>

                    @if (criticalNotices.length === 0) {
                        <div class="text-muted-color text-sm py-6 text-center">No urgent notices.</div>
                    } @else if (currentCritical; as n) {
                        <div class="flex-1 cursor-pointer" (click)="openNotice(n)">
                            @if (n.tags?.length) {
                                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold uppercase mb-2 text-red-600 dark:text-red-400 bg-red-500/10">
                                    <i class="pi {{ tagMeta(n.tags[0]).icon }} text-[0.7rem]"></i>{{ tagMeta(n.tags[0]).label }}
                                </span>
                            }
                            <div class="font-medium text-surface-900 dark:text-surface-0 mt-1 notice-topic-clamp">{{ n.topic }}</div>
                            <div class="text-muted-color text-sm mt-1">{{ noticeDate(n) }}</div>
                        </div>

                        @if (criticalNotices.length > 1) {
                            <div class="flex items-center gap-1.5 mt-4">
                                @for (n2 of criticalNotices; track n2.noticeId; let i = $index) {
                                    <button type="button" class="notice-seg flex-1" (click)="goCritical(i)" aria-label="Go to notice">
                                        @if (i < criticalIndex) {
                                            <span class="notice-seg-fill" style="width:100%"></span>
                                        } @else if (i === criticalIndex) {
                                            <span class="notice-seg-fill notice-seg-anim"></span>
                                        }
                                    </button>
                                }
                            </div>
                        }
                    }
                </div>
            </div>

            <!-- ===== Row 2: Two pie charts + Notifications ===== -->
            <div class="col-span-12 xl:col-span-4">
                <div class="card mb-0 h-full">
                    <div class="font-semibold text-lg text-surface-900 dark:text-surface-0">Held Strength</div>
                    <div class="text-muted-color text-sm mb-4">
                        Manpower by organization
                        @if (manpowerScopeLine) {
                            <span class="block mt-1 text-primary font-medium">{{ manpowerScopeLine }}</span>
                        }
                    </div>
                    <div class="dash-chart-wrap">
                        <p-chart type="pie" [data]="heldData" [options]="pieOptions" [plugins]="chartPlugins"></p-chart>
                    </div>
                </div>
            </div>

            <div class="col-span-12 xl:col-span-4">
                <div class="card mb-0 h-full">
                    <div class="font-semibold text-lg text-surface-900 dark:text-surface-0">Authorized Strength</div>
                    <div class="text-muted-color text-sm mb-4">
                        From equivalent-name man-power setup
                        @if (manpowerScopeLine) {
                            <span class="block mt-1 text-primary font-medium">{{ manpowerScopeLine }}</span>
                        }
                    </div>
                    <div class="dash-chart-wrap">
                        <p-chart type="pie" [data]="authData" [options]="pieOptions" [plugins]="chartPlugins"></p-chart>
                    </div>
                </div>
            </div>

            <div class="col-span-12 xl:col-span-4">
                <div class="card mb-0 h-full">
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-semibold text-lg text-surface-900 dark:text-surface-0">Notifications</span>
                        @if (notificationService.getUnreadCount() > 0) {
                            <span class="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-semibold">
                                {{ notificationService.getUnreadCount() }}
                            </span>
                        }
                    </div>
                    <div class="text-muted-color text-sm mb-4">Your latest alerts</div>

                    @if (notificationService.notifications.length === 0) {
                        <div class="py-10 text-center text-muted-color border border-dashed border-surface-300 dark:border-surface-600 rounded">No notifications.</div>
                    } @else {
                        <ul class="list-none p-0 m-0 notif-scroll">
                            @for (n of notificationService.notifications; track n.id) {
                                <li
                                    class="flex gap-3 items-start py-3 px-2 -mx-2 rounded border-b border-surface-200 dark:border-surface-700 last:border-0 cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800"
                                    [class.notif-unread]="!n.read"
                                    (click)="onNotificationClick(n)"
                                >
                                    <span class="flex items-center justify-center rounded-full shrink-0" [style.background]="notifColor(n.type) + '22'" style="width:2rem;height:2rem">
                                        <i [class]="'pi ' + notifIcon(n.type)" [style.color]="notifColor(n.type)"></i>
                                    </span>
                                    <div class="flex-1 min-w-0">
                                        <div class="text-surface-900 dark:text-surface-0 text-sm font-medium truncate" [title]="n.title">{{ n.title }}</div>
                                        <div class="text-muted-color text-xs truncate" [title]="n.message">{{ n.message }}</div>
                                        <div class="text-muted-color text-xs mt-1">{{ notifTime(n.createdAt) }}</div>
                                    </div>
                                    <div class="flex flex-col items-center gap-1.5 shrink-0">
                                        @if (!n.read) {
                                            <span class="w-2 h-2 rounded-full bg-red-500"></span>
                                        }
                                        <button type="button" class="text-surface-400 hover:text-red-500 p-1 -m-1" (click)="onDeleteNotification(n, $event)" aria-label="Delete notification">
                                            <i class="pi pi-trash text-sm"></i>
                                        </button>
                                    </div>
                                </li>
                            }
                        </ul>
                    }
                </div>
            </div>

            <!-- ===== Row 3: Map + Event Calendar ===== -->
            <div class="col-span-12 xl:col-span-7">
                <div class="card mb-0 h-full">
                    <div class="font-semibold text-lg text-surface-900 dark:text-surface-0">RAB Area of Responsibility Map</div>
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
                        <div class="py-10 text-center text-muted-color border border-dashed border-surface-300 dark:border-surface-600 rounded">No tasks or events scheduled for the rest of the month.</div>
                    } @else {
                        <div class="dash-scroll">
                            @for (e of events; track e.id; let even = $even) {
                                <div class="event-row flex items-center gap-4 px-2 py-3 rounded cursor-pointer" [class.event-row-alt]="even" (click)="openEvent(e)">
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
                                    <button type="button" pButton text rounded icon="pi pi-ellipsis-v" class="shrink-0" (click)="$event.stopPropagation(); openEvent(e)" aria-label="View details"></button>
                                </div>
                            }
                        </div>
                    }
                </div>
            </div>

            <!-- ===== Row 4: Personnel Lookup + Notice Board ===== -->
            <div class="col-span-12 xl:col-span-7">
                <div class="card mb-0 h-full">
                    <div class="font-semibold text-lg text-surface-900 dark:text-surface-0">Personnel Lookup</div>
                    <div class="text-muted-color text-sm mb-4">Enter a unique identifier above to find personnel.</div>
                    <div class="flex gap-2">
                        <div class="relative flex-1">
                            <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-muted-color"></i>
                            <input
                                type="text"
                                [(ngModel)]="lookup"
                                (keyup.enter)="runLookup()"
                                placeholder="e.g. 19880801"
                                class="w-full p-3 pl-10 border border-surface-300 dark:border-surface-600 rounded bg-transparent text-surface-900 dark:text-surface-0"
                            />
                        </div>
                        <button type="button" pButton label="Search" icon="pi pi-search" [loading]="lookupLoading" (click)="runLookup()"></button>
                    </div>

                    @if (lookupLoading) {
                        <div class="mt-6 flex items-center gap-3 text-muted-color"><i class="pi pi-spin pi-spinner"></i> Searching…</div>
                    } @else if (lookupError) {
                        <div class="mt-6 py-6 text-center text-red-500 border border-dashed border-red-300 dark:border-red-700 rounded">
                            {{ lookupError }}
                        </div>
                    } @else if (lookupResult; as r) {
                        <div class="mt-6 border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden">
                            <!-- header -->
                            <div class="flex items-center px-4 py-2 bg-primary-50 dark:bg-primary-400/10 border-b border-surface-200 dark:border-surface-700">
                                <span class="inline-flex items-center gap-2 text-primary font-medium text-sm"> <i class="pi pi-check-circle"></i> Match found </span>
                            </div>

                            <!-- identity -->
                            <div class="flex gap-5 p-4">
                                <div class="shrink-0 w-28 h-32 rounded-lg overflow-hidden bg-surface-100 dark:bg-surface-800 flex items-center justify-center border border-surface-200 dark:border-surface-700">
                                    @if (r.photoUrl) {
                                        <img [src]="r.photoUrl" alt="Profile" class="w-full h-full object-cover" />
                                    } @else {
                                        <i class="pi pi-user text-5xl text-muted-color"></i>
                                    }
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="text-2xl font-bold text-surface-900 dark:text-surface-0 truncate">{{ r.name || 'Unknown' }}</div>
                                    @if (r.nameBn) {
                                        <div class="text-muted-color truncate">{{ r.nameBn }}</div>
                                    }
                                    @if (r.postingStatus) {
                                        <div class="text-primary font-medium text-sm mt-1 truncate" [title]="r.postingStatus">{{ r.postingStatus }}</div>
                                    }
                                    <div class="flex flex-wrap gap-2 mt-3">
                                        <span class="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-sm">
                                            <span class="text-muted-color uppercase text-xs">RAB ID</span>
                                            <span class="font-semibold text-surface-900 dark:text-surface-0">{{ r.rabId || '—' }}</span>
                                        </span>
                                        <span class="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-sm">
                                            <span class="text-muted-color uppercase text-xs">Service ID</span>
                                            <span class="font-semibold text-surface-900 dark:text-surface-0">{{ r.serviceId || '—' }}</span>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <!-- present status: on leave / on temporary movement -->
                            @if (r.onLeave || r.onMovement) {
                                <div class="flex flex-wrap gap-2 px-4 pb-4">
                                    @if (r.onLeave) {
                                        <button
                                            type="button"
                                            class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-100 dark:bg-amber-400/10 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-sm cursor-pointer"
                                            (click)="goToLeaveHistory()"
                                            title="View leave history"
                                        >
                                            <i class="pi pi-calendar-times"></i>
                                            <span class="font-medium">On Leave</span>
                                            <span class="opacity-80">{{ r.leaveType ? '(' + r.leaveType + ') ' : '' }}{{ fmtDate(r.leaveFrom) }} – {{ fmtDate(r.leaveTo) }}</span>
                                        </button>
                                    }
                                    @if (r.onMovement) {
                                        <button
                                            type="button"
                                            class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-100 dark:bg-blue-400/10 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300 text-sm cursor-pointer"
                                            (click)="goToMovementList()"
                                            title="View movement list"
                                        >
                                            <i class="pi pi-map-marker"></i>
                                            <span class="font-medium">Present Location</span>
                                            <span class="opacity-80">{{ r.movementDestination || 'On temporary movement' }}</span>
                                        </button>
                                    }
                                </div>
                            }

                            <!-- attribute boxes -->
                            <div class="grid grid-cols-2 sm:grid-cols-4 border-t border-surface-200 dark:border-surface-700">
                                <div class="p-3 border-r border-surface-200 dark:border-surface-700">
                                    <div class="flex items-center gap-2 text-muted-color text-xs uppercase mb-1"><i class="pi pi-star"></i> Rank</div>
                                    <div class="text-surface-900 dark:text-surface-0 truncate" [class.text-muted-color]="!r.rank" [class.italic]="!r.rank">{{ r.rank || 'Not assigned' }}</div>
                                </div>
                                <div class="p-3 border-r border-surface-200 dark:border-surface-700">
                                    <div class="flex items-center gap-2 text-muted-color text-xs uppercase mb-1"><i class="pi pi-shield"></i> Corps</div>
                                    <div class="text-surface-900 dark:text-surface-0 truncate" [class.text-muted-color]="!r.corps" [class.italic]="!r.corps">{{ r.corps || 'Not assigned' }}</div>
                                </div>
                                <div class="p-3 border-r border-surface-200 dark:border-surface-700">
                                    <div class="flex items-center gap-2 text-muted-color text-xs uppercase mb-1"><i class="pi pi-wrench"></i> Trade</div>
                                    <div class="text-surface-900 dark:text-surface-0 truncate" [class.text-muted-color]="!r.trade" [class.italic]="!r.trade">{{ r.trade || 'Not assigned' }}</div>
                                </div>
                                <div class="p-3">
                                    <div class="flex items-center gap-2 text-muted-color text-xs uppercase mb-1"><i class="pi pi-building"></i> Mother Org</div>
                                    <div class="text-surface-900 dark:text-surface-0 truncate" [class.text-muted-color]="!r.motherOrg" [class.italic]="!r.motherOrg">{{ r.motherOrg || 'Not assigned' }}</div>
                                </div>
                            </div>

                            <!-- mother unit + RAB unit -->
                            <div class="grid grid-cols-2 border-t border-surface-200 dark:border-surface-700">
                                <div class="p-3 border-r border-surface-200 dark:border-surface-700">
                                    <div class="flex items-center gap-2 text-muted-color text-xs uppercase mb-1"><i class="pi pi-sitemap"></i> Mother Unit</div>
                                    <div class="text-surface-900 dark:text-surface-0 truncate" [class.text-muted-color]="!r.motherUnit" [class.italic]="!r.motherUnit">{{ r.motherUnit || 'Not assigned' }}</div>
                                </div>
                                <div class="p-3">
                                    <div class="flex items-center gap-2 text-muted-color text-xs uppercase mb-1"><i class="pi pi-map-marker"></i> RAB Unit</div>
                                    <div class="text-surface-900 dark:text-surface-0 truncate" [class.text-muted-color]="!r.rabUnit" [class.italic]="!r.rabUnit">{{ r.rabUnit || 'Not assigned' }}</div>
                                </div>
                            </div>

                            <!-- action -->
                            <div class="p-3 border-t border-surface-200 dark:border-surface-700">
                                <button type="button" pButton class="w-full" icon="pi pi-user" label="View profile" (click)="viewProfile(r.employeeId)"></button>
                            </div>
                        </div>
                    } @else {
                        <div class="mt-6 py-10 text-center text-muted-color border border-dashed border-surface-300 dark:border-surface-600 rounded">Search by RAB ID, Service ID, Mobile, Office Mobile, NID, Old NID, Passport or Email</div>
                    }
                </div>
            </div>

            <div class="col-span-12 xl:col-span-5">
                <div class="card mb-0 h-full">
                    <div class="font-semibold text-lg text-surface-900 dark:text-surface-0">Notice Board</div>
                    <div class="text-muted-color text-sm mb-4">Force-wide announcements</div>
                    @if (notices.length === 0) {
                        <div class="py-10 text-center text-muted-color border border-dashed border-surface-300 dark:border-surface-600 rounded">No active notices.</div>
                    } @else {
                        <div class="dash-scroll">
                            @for (n of notices; track n.noticeId) {
                                <div
                                    class="py-3 border-b border-surface-200 dark:border-surface-700 last:border-0 cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800 -mx-2 px-2 rounded"
                                    [class.border-l-4]="isCriticalNotice(n)"
                                    [class.border-l-red-500]="isCriticalNotice(n)"
                                    (click)="openNotice(n)"
                                >
                                    <div class="flex flex-wrap gap-1.5 mb-1">
                                        @for (t of n.tags; track t) {
                                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold uppercase" [class]="tagMeta(t).classes">
                                                <i class="pi {{ tagMeta(t).icon }} text-[0.7rem]"></i>{{ tagMeta(t).label }}
                                            </span>
                                        }
                                    </div>
                                    <div class="font-medium text-surface-900 dark:text-surface-0 mt-1 truncate">{{ n.topic }}</div>
                                    <div class="text-muted-color text-xs mt-1">
                                        {{ noticeDate(n) }}
                                        @if (n.createdByName) {
                                            <span> · By {{ n.createdByName }}</span>
                                        }
                                    </div>
                                </div>
                            }
                        </div>
                    }
                </div>
            </div>
        </div>

        <p-dialog [(visible)]="noticeDialogVisible" [modal]="true" [draggable]="false" [style]="{ width: '52rem' }" [breakpoints]="{ '640px': '92vw' }" [header]="selectedNotice?.topic || 'Notice'">
            @if (selectedNotice; as n) {
                <div class="flex flex-col gap-4">
                    <div class="flex flex-wrap items-center gap-3">
                        @if (n.tags?.length) {
                            @for (t of n.tags; track t) {
                                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold uppercase" [class]="tagMeta(t).classes"> <i class="pi {{ tagMeta(t).icon }} text-[0.7rem]"></i>{{ tagMeta(t).label }} </span>
                            }
                        }
                        <span class="text-muted-color text-sm">{{ noticeDate(n) }}</span>
                    </div>
                    <div>
                        <div class="text-muted-color text-xs uppercase mb-1">Details</div>
                        <div class="text-surface-900 dark:text-surface-0 whitespace-pre-line">{{ n.details || 'No details provided.' }}</div>
                    </div>
                    @if (noticeFiles(n).length) {
                        <div>
                            <div class="text-muted-color text-xs uppercase mb-1">Files</div>
                            <div class="flex flex-col items-start gap-1">
                                @for (f of noticeFiles(n); track f.fileId) {
                                    <button type="button" pButton text size="small" class="justify-start" icon="pi pi-paperclip" [label]="f.fileName" (click)="downloadNoticeFile(f)"></button>
                                }
                            </div>
                        </div>
                    }
                    <div>
                        <div class="text-muted-color text-xs uppercase mb-1">Published by</div>
                        <div class="text-surface-900 dark:text-surface-0">{{ n.createdByName || n.createdBy || 'Unknown' }}</div>
                    </div>
                </div>
            }
        </p-dialog>

        <p-dialog [(visible)]="eventDialogVisible" [modal]="true" [draggable]="false" [style]="{ width: '48rem' }" [breakpoints]="{ '640px': '92vw' }" [header]="selectedEvent?.title || 'Details'">
            @if (selectedEvent; as e) {
                <div class="flex flex-col gap-4">
                    <div class="flex items-center gap-3">
                        <p-tag [severity]="e.sev" [value]="e.tag"></p-tag>
                        <span class="text-muted-color text-sm">{{ e.mon }} {{ e.day }} ({{ e.dow }})</span>
                    </div>
                    <div>
                        <div class="text-muted-color text-xs uppercase mb-1">Description</div>
                        <div class="text-surface-900 dark:text-surface-0 whitespace-pre-line">{{ e.description || 'No description provided.' }}</div>
                    </div>
                </div>
            }
        </p-dialog>

        <p-dialog [(visible)]="candidateDialogVisible" [modal]="true" [draggable]="false" [style]="{ width: '40rem' }" header="Multiple matches — select a person">
            <div class="text-muted-color text-sm mb-3">{{ candidates.length }} records matched this identifier. Choose the correct person.</div>
            <div class="flex flex-col gap-2">
                @for (c of candidates; track c.employeeId) {
                    <div class="flex items-center gap-3 border border-surface-200 dark:border-surface-700 rounded p-3">
                        <div class="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
                            <i class="pi pi-user text-muted-color"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="font-medium text-surface-900 dark:text-surface-0 truncate">{{ c.name || 'Unknown' }}</div>
                            <div class="text-sm text-muted-color truncate">RAB ID: {{ c.rabId || '—' }} · Service ID: {{ c.serviceId || '—' }} · {{ c.motherOrg || '—' }}</div>
                        </div>
                        <button type="button" pButton label="Select" size="small" (click)="chooseCandidate(c)"></button>
                    </div>
                }
            </div>
        </p-dialog>
    `,
    styles: [
        `
            .dash-chart-wrap {
                position: relative;
                width: 100%;
                height: 26rem;
            }
            /* Clamp the urgent-notice title to 2 lines with an ellipsis; fixed height stops card resize. */
            .notice-topic-clamp {
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                white-space: normal;
                line-height: 1.5rem;
                height: 3rem; /* exactly two lines — clips any 3rd line, keeps card height fixed */
            }
            /* Vertical-only scroll for dashboard lists (no horizontal bar). */
            .dash-scroll {
                max-height: 22rem;
                overflow-y: auto;
                overflow-x: hidden;
            }
            /* Notifications list matches the pie-chart body height (.dash-chart-wrap = 26rem),
               so this card stays the same height as its row siblings and the list only
               scrolls once content overflows the full card — not before. */
            .notif-scroll {
                max-height: 26rem;
                overflow-y: auto;
                overflow-x: hidden;
            }
            /* Scrollbar stays hidden until the card is hovered (still scrollable). */
            .notif-scroll,
            .dash-scroll {
                scrollbar-width: none; /* Firefox */
            }
            .notif-scroll::-webkit-scrollbar,
            .dash-scroll::-webkit-scrollbar {
                width: 0;
            }
            .card:hover .notif-scroll,
            .card:hover .dash-scroll {
                scrollbar-width: thin; /* Firefox */
            }
            .card:hover .notif-scroll::-webkit-scrollbar,
            .card:hover .dash-scroll::-webkit-scrollbar {
                width: 8px;
            }
            .card:hover .notif-scroll::-webkit-scrollbar-thumb,
            .card:hover .dash-scroll::-webkit-scrollbar-thumb {
                background: rgba(148, 163, 184, 0.5);
                border-radius: 4px;
            }
            /* Unread notification: subtle pulsing highlight; clears once marked read. */
            .notif-unread {
                background: rgba(239, 68, 68, 0.08);
                animation: notifBlink 1.4s ease-in-out infinite;
            }
            @keyframes notifBlink {
                0%,
                100% {
                    background: rgba(239, 68, 68, 0.04);
                }
                50% {
                    background: rgba(239, 68, 68, 0.16);
                }
            }
            .notice-seg {
                height: 6px;
                border-radius: 999px;
                background: var(--surface-200, #e2e8f0);
                overflow: hidden;
                padding: 0;
                border: 0;
                cursor: pointer;
            }
            :host-context(.app-dark) .notice-seg {
                background: var(--surface-700, #3f3f46);
            }
            .notice-seg-fill {
                display: block;
                height: 100%;
                background: #22c55e;
                border-radius: 999px;
            }
            .notice-seg-anim {
                animation: noticeSegFill 5s linear forwards;
            }
            @keyframes noticeSegFill {
                from {
                    width: 0%;
                }
                to {
                    width: 100%;
                }
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
        `
    ]
})
export class Dashboard implements OnInit, OnDestroy {
    readonly liveDate = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    private themeObserver?: MutationObserver;
    private servingMembers = inject(ServingMembersService);
    private postedOutSvc = inject(PermanentPostingMORecordService);
    private newJoiningSvc = inject(PermanentPostingJoineeDetailService);
    private statisticsSvc = inject(StatisticsService);
    private reportService = inject(ReportService);
    private calendarSvc = inject(CalendarService);
    private empService = inject(EmpService);
    private leaveInfoService = inject(LeaveInfoService);
    private movementInfoService = inject(MovementInfoService);
    private postingService = inject(PostingService);
    private noticeService = inject(NoticeService);
    notificationService = inject(NotificationService);
    private chatService = inject(ChatService);
    private router = inject(Router);
    servingCount: number | null = null;
    postedOutCount: number | null = null;
    newPostingCount: number | null = null;
    /** False when the user has org-tree access restrictions (scoped user). */
    hasFullOrgAccess = false;

    get kpiColClass(): string {
        return this.hasFullOrgAccess ? 'col-span-12 xl:col-span-4' : 'col-span-12 xl:col-span-6';
    }

    readonly chartPlugins = [PIE_PERCENTAGE_PLUGIN];

    lookup = '';
    lookupLoading = false;
    lookupError = '';
    lookupResult: LookupCard | null = null;
    candidates: LookupCard[] = [];
    candidateDialogVisible = false;

    runLookup(): void {
        const term = this.lookup.trim();
        this.lookupError = '';
        this.revokeLookupPhoto();
        this.lookupResult = null;
        this.candidates = [];
        this.candidateDialogVisible = false;
        if (!term) return;

        this.lookupLoading = true;
        this.empService.searchByUniqueIdentifier(term).subscribe({
            next: (list) => {
                this.lookupLoading = false;
                const cards = (list ?? []).map((e) => this.toLookupCard(e));
                if (cards.length === 0) {
                    this.lookupError = 'No personnel found for this identifier.';
                } else if (cards.length === 1) {
                    this.selectLookup(cards[0]);
                } else {
                    // Service ID (or other id) matched multiple people — let the user pick.
                    this.candidates = cards;
                    this.candidateDialogVisible = true;
                }
            },
            error: (err) => {
                this.lookupLoading = false;
                this.lookupError = err?.status === 403 ? err?.error?.message || 'You do not have permission to view this person.' : 'Lookup failed. Please try again.';
            }
        });
    }

    viewProfile(employeeId: number): void {
        if (employeeId) this.router.navigate(['/members/profile', employeeId]);
    }

    chooseCandidate(c: LookupCard): void {
        this.candidateDialogVisible = false;
        this.selectLookup(c);
    }

    private selectLookup(card: LookupCard): void {
        this.lookupResult = card;
        // Enrich rank / corps / trade / mother-org (and name) from the search-info view.
        if (!card.employeeId) return;
        this.empService.getEmployeeSearchInfo(card.employeeId).subscribe((info: any) => {
            if (!info || this.lookupResult !== card) return;
            card.rank = (this.ci(info, 'Rank') ?? card.rank ?? '').toString();
            card.corps = (this.ci(info, 'Corps') ?? card.corps ?? '').toString();
            card.trade = (this.ci(info, 'Trade') ?? card.trade ?? '').toString();
            card.motherOrg = (this.ci(info, 'MotherOrganization') ?? card.motherOrg ?? '').toString();
            if (!card.name) card.name = (this.ci(info, 'FullNameEN') ?? '').toString();
        });
        // Present RAB unit — same source the profile page uses (overview.rabUnit).
        this.servingMembers.getEmployeePersonalServiceOverview(card.employeeId).subscribe((overview) => {
            if (this.lookupResult !== card || !overview) return;
            card.rabUnit = (overview.rabUnit ?? '').toString();
            card.motherUnit = (overview.motherUnit ?? '').toString();
        });
        this.loadLookupPhoto(card);
        this.loadLeaveStatus(card);
        this.loadMovementStatus(card);
        this.loadPostingStatus(card);
    }

    /** Builds the in-progress posting line shown on the member profile (New / Inter posting). */
    private loadPostingStatus(card: LookupCard): void {
        this.postingService.getEmployeePostingProcessingStatus(card.employeeId).subscribe({
            next: (dto) => {
                if (this.lookupResult !== card || !dto) return;
                card.postingStatus = this.buildPostingStatus(dto);
            },
            error: () => {}
        });
    }

    private buildPostingStatus(dto: EmployeePostingProcessingStatusDto): string {
        const parts: string[] = [];
        if (dto.newPostingStep && !dto.newPostingOrderReceived) {
            parts.push(`New Posting: ${this.postingStepLabel(dto.newPostingStep)}`);
        }
        if (dto.interPostingStep && !dto.interPostingOrderReceived) {
            parts.push(`Inter Posting: ${this.postingStepLabel(dto.interPostingStep)}`);
        }
        return parts.join(' • ');
    }

    private postingStepLabel(step: string): string {
        return POSTING_STEP_LABELS[step] ?? step;
    }

    /** Flags the card as on-leave when today falls inside one of this year's leave windows. */
    private loadLeaveStatus(card: LookupCard): void {
        const year = new Date().getFullYear();
        this.leaveInfoService.getViewByEmployeeIdAndYear(card.employeeId, year).subscribe((rows) => {
            if (this.lookupResult !== card || !rows?.length) return;
            const today = this.toDateOnly(new Date());
            const current = rows.find((r) => {
                const from = r.durationFrom ? this.toDateOnly(new Date(r.durationFrom)) : null;
                const to = r.durationTo ? this.toDateOnly(new Date(r.durationTo)) : null;
                return from !== null && to !== null && from <= today && today <= to;
            });
            if (!current) return;
            card.onLeave = true;
            card.leaveType = (current.typeOfLeave ?? '').toString();
            card.leaveFrom = current.durationFrom;
            card.leaveTo = current.durationTo;
        });
    }

    /** Flags the card as on temporary movement when an un-returned temporary movement exists. */
    private loadMovementStatus(card: LookupCard): void {
        this.movementInfoService.getByEmployeeId(card.employeeId).subscribe((rows) => {
            if (this.lookupResult !== card || !rows?.length) return;
            // Rows are ordered newest-first; pick the latest temporary movement not yet returned.
            const active = rows.find((m) => m.movementType === 2 && !m.isReturned);
            if (!active) return;
            card.onMovement = true;
            card.movementDestination = (active.destinedRABUnit || active.destinedMotherUnit || '').toString();
        });
    }

    /** Local YYYY-MM-DD string for date-only comparison (avoids UTC drift). */
    private toDateOnly(d: Date): string {
        const m = `${d.getMonth() + 1}`.padStart(2, '0');
        const day = `${d.getDate()}`.padStart(2, '0');
        return `${d.getFullYear()}-${m}-${day}`;
    }

    goToLeaveHistory(): void {
        this.router.navigate(['/leave-application/history']);
    }

    goToMovementList(): void {
        this.router.navigate(['/movement-list']);
    }

    /** "21 Jun 2026" for a date-only/ISO string; falls back to the raw value. */
    fmtDate(value: string | null): string {
        if (!value) return '';
        const d = new Date(value);
        return isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    /** Case-insensitive property read — the API serializes camelCase but field casing varies. */
    private ci(obj: any, key: string): any {
        if (!obj) return undefined;
        const want = key.toLowerCase();
        for (const k of Object.keys(obj)) {
            if (k.toLowerCase() === want) return obj[k];
        }
        return undefined;
    }

    private toLookupCard(e: any): LookupCard {
        return {
            employeeId: Number(this.ci(e, 'EmployeeID')) || 0,
            name: (this.ci(e, 'FullNameEN') ?? '').toString(),
            nameBn: (this.ci(e, 'FullNameBN') ?? '').toString(),
            rabId: (this.ci(e, 'RABID') ?? '').toString().trim(),
            serviceId: (this.ci(e, 'ServiceId') ?? '').toString().trim(),
            rank: '',
            corps: '',
            trade: '',
            motherOrg: '',
            motherUnit: '',
            rabUnit: '',
            profileImages: (this.ci(e, 'ProfileImages') ?? null) as string | null,
            photoUrl: null,
            onLeave: false,
            leaveType: '',
            leaveFrom: null,
            leaveTo: null,
            onMovement: false,
            movementDestination: '',
            postingStatus: ''
        };
    }

    private revokeLookupPhoto(): void {
        if (this.lookupResult?.photoUrl) {
            URL.revokeObjectURL(this.lookupResult.photoUrl);
            this.lookupResult.photoUrl = null;
        }
    }

    /** ProfileImages JSON → first FileId → download blob → object URL. */
    private loadLookupPhoto(card: LookupCard): void {
        const json = card.profileImages;
        if (!json || typeof json !== 'string') return;
        let refs: { FileId?: number; fileId?: number }[];
        try {
            refs = JSON.parse(json);
        } catch {
            return;
        }
        const first = Array.isArray(refs) && refs.length > 0 ? refs[0] : null;
        const fileId = first?.FileId ?? first?.fileId;
        if (fileId == null || fileId <= 0) return;
        this.empService.downloadFile(fileId).subscribe({
            next: (blob) => {
                if (blob && blob.size > 0 && this.lookupResult === card) {
                    card.photoUrl = URL.createObjectURL(blob);
                }
            },
            error: () => {}
        });
    }

    selectedEvent: CalItem | null = null;
    eventDialogVisible = false;

    openEvent(e: CalItem): void {
        this.selectedEvent = e;
        this.eventDialogVisible = true;
    }

    authData: any;
    heldData: any;
    pieOptions: any;
    /** Scope line under pie charts when the user is org-restricted (e.g. "RAB 1"). */
    manpowerScopeLine: string | null = null;

    // ── Notifications (real, per-user) ───────────────────────────────────
    notifColor(type: string): string {
        if (type === 'notice') return '#ef4444';
        if (type === 'leaveApproval') return '#f59e0b';
        if (type === 'leaveReturn') return '#3b82f6';
        return '#a855f7';
    }
    notifIcon(type: string): string {
        if (type === 'notice') return 'pi-megaphone';
        if (type === 'leaveApproval') return 'pi-check-circle';
        if (type === 'leaveReturn') return 'pi-replay';
        return 'pi-bell';
    }
    notifTime(d: Date): string {
        const dt = d instanceof Date ? d : new Date(d);
        if (isNaN(dt.getTime())) return '';
        return dt.toLocaleString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    onNotificationClick(n: AppNotification): void {
        if (!n.read) this.notificationService.markAsRead(n.id); // clears the unread highlight

        if (n.type === 'notice') {
            // Open the notice detail modal; fall back to the feed if not in the current list.
            const noticeId = Number((n.data as any)?.noticeId);
            const match = noticeId ? this.notices.find((x) => x.noticeId === noticeId) : undefined;
            if (match) {
                this.openNotice(match);
                return;
            }
        }
        // Leave (and anything else) → behave as before: navigate to the linked page.
        if (n.link) this.router.navigateByUrl(n.link);
    }

    onDeleteNotification(n: AppNotification, e: Event): void {
        e.stopPropagation();
        this.notificationService.deleteNotification(n.id);
    }

    events: CalItem[] = [];

    notices: NoticeListDto[] = [];
    selectedNotice: NoticeListDto | null = null;
    noticeDialogVisible = false;
    criticalIndex = 0;
    private criticalTimer?: ReturnType<typeof setInterval>;

    get criticalNotices(): NoticeListDto[] {
        return this.notices.filter((n) => this.isCriticalNotice(n));
    }

    get currentCritical(): NoticeListDto | null {
        const list = this.criticalNotices;
        if (list.length === 0) return null;
        return list[this.criticalIndex % list.length] ?? list[0];
    }

    /** Auto-advance the urgent-notice slider; restarts the dwell timer on manual jump. */
    private startCriticalRotation(): void {
        clearInterval(this.criticalTimer);
        this.criticalTimer = setInterval(() => {
            const len = this.criticalNotices.length;
            if (len > 1) this.criticalIndex = (this.criticalIndex + 1) % len;
        }, 5000);
    }

    goCritical(i: number): void {
        this.criticalIndex = i;
        this.startCriticalRotation();
    }

    openNotice(n: NoticeListDto): void {
        this.selectedNotice = n;
        this.noticeDialogVisible = true;
    }

    /** Parsed file references for a notice (FilesReferences JSON → { fileId, fileName }[]). */
    noticeFiles(n: NoticeListDto): { fileId: number; fileName: string }[] {
        if (!n?.filesReferences || typeof n.filesReferences !== 'string') return [];
        try {
            const refs = JSON.parse(n.filesReferences) as { FileId?: number; fileId?: number; fileName?: string }[];
            if (!Array.isArray(refs)) return [];
            return refs.map((r) => ({ fileId: (r.FileId ?? r.fileId) as number, fileName: r.fileName ?? 'file' })).filter((r) => r.fileId != null);
        } catch {
            return [];
        }
    }

    downloadNoticeFile(f: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(f.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, f.fileName || 'download'),
            error: () => {}
        });
    }

    private loadNotices(): void {
        this.noticeService.getForCurrentUser().subscribe({
            next: (list) => {
                // Completed notices drop off the dashboard (both Urgent Notice & Notice Board).
                this.notices = (list ?? []).filter((n) => !n.isComplete).sort((a, b) => this.noticeRank(a) - this.noticeRank(b));
                this.criticalIndex = 0;
                this.startCriticalRotation();
            },
            error: () => (this.notices = [])
        });
    }

    /** Lowest band rank among a notice's tags — CRITICAL (0) sorts first. */
    private noticeRank(n: NoticeListDto): number {
        const ranks = (n.tags ?? []).map((t) => this.tagMeta(t).rank);
        return ranks.length ? Math.min(...ranks) : 99;
    }

    /** Resolve a tag string → display label, chip classes, icon and band rank. */
    tagMeta(tag: string): { label: string; classes: string; icon: string; rank: number } {
        const key = (tag ?? '').trim().toUpperCase();
        const meta = NOTICE_TAG_META[key];
        const band = meta?.band ?? 'routine';
        const bandMeta = NOTICE_BAND_META[band];
        return { label: key || 'TAG', classes: bandMeta.classes, icon: meta?.icon ?? 'pi-tag', rank: bandMeta.rank };
    }

    /** Notices carrying a CRITICAL-band tag — used to flag the row. */
    isCriticalNotice(n: NoticeListDto): boolean {
        return this.noticeRank(n) === 0;
    }

    noticeDate(n: NoticeListDto): string {
        const d = n.createdDate ? new Date(n.createdDate) : null;
        return d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    }

    /** Default range: today 00:00 → last day of the current month 23:59. */
    private loadCalendar(): void {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        this.calendarSvc.getByDateRange(start, end).subscribe({
            next: (list) => {
                this.events = (list ?? []).map((a) => this.mapCalItem(a)).sort((x, y) => x.sortTs - y.sortTs);
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

    ngOnInit(): void {
        this.loadCalendar();
        this.loadNotices();
        this.notificationService.loadFromApi();
        this.chatService.connectToHub().catch(() => {});

        // Total serving members = count of presently-serving (Posting Status = Serving).
        // Dedicated count endpoint: no row payload, no ordering — fast KPI load.
        this.servingMembers.getPresentlyServingCount().subscribe({
            next: (count) => (this.servingCount = count),
            error: () => (this.servingCount = 0)
        });

        this.reportService.getMyReportAccessScope().subscribe({
            next: (scope) => {
                this.hasFullOrgAccess = scope?.orgScopeRestricted !== true;
                if (this.hasFullOrgAccess) this.loadPostingKpis();
            },
            error: () => {
                this.hasFullOrgAccess = true;
                this.loadPostingKpis();
            }
        });

        this.pieOptions = this.buildPieOptions();

        // Re-render legends with theme-appropriate text colour when dark mode toggles.
        this.themeObserver = new MutationObserver(() => (this.pieOptions = this.buildPieOptions()));
        this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        // Authorized & Held manpower pies — scoped to the user's org-tree access.
        // Auth is sourced from basic-setup/equivalent-name-vacancy (EquivalentNameVacancyDistribution).
        this.statisticsSvc.getManpowerSummaryByEquivalentName(null).subscribe({
            next: (res: ManpowerSummaryResponse) => {
                const names = res.accessibleRabUnitNames;
                this.manpowerScopeLine = names?.length ? names.join(', ') : null;
                this.buildManpowerCharts(res.rows ?? []);
            },
            error: () => {
                this.manpowerScopeLine = null;
                this.buildManpowerCharts([]);
            }
        });
    }

    ngOnDestroy(): void {
        this.themeObserver?.disconnect();
        this.revokeLookupPhoto();
        clearInterval(this.criticalTimer);
    }

    private loadPostingKpis(): void {
        this.postedOutSvc.getCount().subscribe({
            next: (count) => (this.postedOutCount = count),
            error: () => (this.postedOutCount = 0)
        });

        this.newJoiningSvc.getCountFiltered({ isAddedInNewJoineeDataEntry: false }).subscribe({
            next: (count) => (this.newPostingCount = count),
            error: () => (this.newPostingCount = 0)
        });
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
        const visible = rows.filter((r) => (r.auth ?? 0) > 0 || (r.held ?? 0) > 0);
        const labels = visible.map((r) => r.orgName);
        const colors = visible.map((_, i) => SLICE_COLORS[i % SLICE_COLORS.length]);
        const hover = colors.map((c) => c + 'cc');

        this.authData = {
            labels,
            datasets: [{ data: visible.map((r) => r.auth), backgroundColor: colors, hoverBackgroundColor: hover }]
        };
        this.heldData = {
            labels,
            datasets: [{ data: visible.map((r) => r.held), backgroundColor: colors, hoverBackgroundColor: hover }]
        };
    }
}
