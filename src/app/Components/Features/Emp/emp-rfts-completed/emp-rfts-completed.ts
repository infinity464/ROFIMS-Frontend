import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { Toast } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';

import { DraftCourseService } from '@/services/draft-course.service';
import { RftsCourseSummary, RftsTrainingRow } from '@/models/draft-course.model';
import { RftsNominalRollService } from '@/services/rfts-nominal-roll.service';

interface RftsGroup {
    courseNo: string | null;
    courseTypeName: string | null;
    courseNameDisplay: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    memberCount: number;
    /** Lazily loaded when the course card is expanded. */
    members: RftsTrainingRow[];
    membersLoaded: boolean;
}

@Component({
    selector: 'app-emp-rfts-completed',
    standalone: true,
    imports: [
        CommonModule,
        CardModule,
        TableModule,
        ButtonModule,
        Fluid,
        Toast,
        TooltipModule
    ],
    providers: [MessageService],
    templateUrl: './emp-rfts-completed.html'
})
export class EmpRftsCompletedComponent implements OnInit {
    rftsGroupedList: RftsGroup[] = [];
    isLoadingCompleted = false;
    /** True while the expanded course's members are being fetched. */
    isLoadingMembers = false;

    /** The currently expanded course card. Click the same card again to collapse. */
    selectedGroup: RftsGroup | null = null;

    constructor(
        private draftCourseService: DraftCourseService,
        private nominalRoll: RftsNominalRollService,
        private messageService: MessageService
    ) {}

    // ---------- Nominal roll export ----------
    /** Course no whose export is currently being fetched. */
    exportingCourseNo: string | null = null;

    /**
     * Fetches the roll then hands it to the chosen renderer. Read fresh each
     * time rather than reusing the expanded panel's members, because the export
     * needs the Bangla names and units the panel never loads.
     *
     * annexureLabel is null: like the draft roll, a completed-course list is not
     * an annexure, so it drops the "ক্রোড়পত্র ক" line.
     */
    exportRoll(group: RftsGroup, format: 'print' | 'word' | 'excel', event: Event): void {
        event.stopPropagation();
        if (this.exportingCourseNo != null) return;

        if (group.memberCount === 0) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Nothing to export',
                detail: `"${group.courseNo ?? '—'}" has no members.`
            });
            return;
        }

        // Sentinel, so an empty course no still marks an export in flight.
        this.exportingCourseNo = group.courseNo ?? '';
        this.draftCourseService.getRftsTrainingNominalRoll(group.courseNo).subscribe({
            next: async (roll) => {
                const opts = { annexureLabel: null };
                try {
                    if (format === 'print') {
                        if (!this.nominalRoll.print(roll, opts)) {
                            this.messageService.add({
                                severity: 'warn',
                                summary: 'Popup blocked',
                                detail: 'Allow popups for this site to open the print view.'
                            });
                        }
                    } else if (format === 'word') {
                        await this.nominalRoll.exportWord(roll, opts);
                    } else {
                        this.nominalRoll.exportExcel(roll, opts);
                    }
                } catch {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to build the export.' });
                } finally {
                    this.exportingCourseNo = null;
                }
            },
            error: (err) => {
                this.exportingCourseNo = null;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.description || err?.error?.message || 'Failed to load the export data.'
                });
            }
        });
    }

    ngOnInit(): void {
        this.loadCourseSummaries();
    }

    /** Loads only the course-group headers (no members) — fast even with many courses. */
    loadCourseSummaries(): void {
        this.isLoadingCompleted = true;
        this.draftCourseService.getRftsCourseSummaries().subscribe({
            next: (list: RftsCourseSummary[]) => {
                this.rftsGroupedList = (list ?? []).map((s) => ({
                    courseNo: s.courseNo,
                    courseTypeName: s.courseTypeName,
                    courseNameDisplay: s.courseNameDisplay,
                    dateFrom: s.dateFrom,
                    dateTo: s.dateTo,
                    memberCount: s.memberCount,
                    members: [],
                    membersLoaded: false
                }));
                this.selectedGroup = null;
                this.isLoadingCompleted = false;
            },
            error: () => {
                this.rftsGroupedList = [];
                this.selectedGroup = null;
                this.isLoadingCompleted = false;
            }
        });
    }

    /** Expand/collapse a course. On first expand, fetch that course's members. */
    toggleGroup(group: RftsGroup): void {
        if (this.selectedGroup?.courseNo === group.courseNo) {
            this.selectedGroup = null;
            return;
        }
        this.selectedGroup = group;
        if (!group.membersLoaded) {
            this.loadMembers(group);
        }
    }

    private loadMembers(group: RftsGroup): void {
        this.isLoadingMembers = true;
        this.draftCourseService.getRftsTrainingByCourseNo(group.courseNo).subscribe({
            next: (members) => {
                group.members = members ?? [];
                group.membersLoaded = true;
                this.isLoadingMembers = false;
            },
            error: () => {
                this.isLoadingMembers = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load members for this course.' });
            }
        });
    }

    /**
     * Inclusive day count between two ISO date strings — both start and
     * end days count, so 01 May → 22 May is 22 days, not 21.
     * Returns 0 when either is missing or invalid.
     */
    daysBetween(fromIso: string | null | undefined, toIso: string | null | undefined): number {
        if (!fromIso || !toIso) return 0;
        const a = new Date(fromIso).getTime();
        const b = new Date(toIso).getTime();
        if (isNaN(a) || isNaN(b)) return 0;
        const diff = Math.round((b - a) / 86_400_000);
        return Math.max(0, diff + 1);
    }
}
