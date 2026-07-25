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
        private messageService: MessageService
    ) {}

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
