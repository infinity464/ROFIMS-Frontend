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
import { RftsTrainingRow } from '@/models/draft-course.model';

interface RftsGroup {
    courseNo: string;
    courseTypeName: string | null;
    courseNameDisplay: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    memberCount: number;
    members: RftsTrainingRow[];
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
    rftsCompletedList: RftsTrainingRow[] = [];
    rftsGroupedList: RftsGroup[] = [];
    isLoadingCompleted = false;

    /** The currently expanded course card. Click the same card again to collapse. */
    selectedGroup: RftsGroup | null = null;

    constructor(private draftCourseService: DraftCourseService) {}

    ngOnInit(): void {
        this.loadRftsCompleted();
    }

    loadRftsCompleted(): void {
        this.isLoadingCompleted = true;
        this.draftCourseService.getAllRftsTraining().subscribe({
            next: (list) => {
                this.rftsCompletedList = list ?? [];
                this.groupRftsCompleted();
                this.isLoadingCompleted = false;
            },
            error: () => {
                this.rftsCompletedList = [];
                this.rftsGroupedList = [];
                this.isLoadingCompleted = false;
            }
        });
    }

    private groupRftsCompleted(): void {
        const map = new Map<string, RftsTrainingRow[]>();
        for (const row of this.rftsCompletedList) {
            const key = row.courseNo || 'N/A';
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(row);
        }
        this.rftsGroupedList = Array.from(map.entries()).map(([courseNo, members]) => ({
            courseNo,
            courseTypeName: members[0].courseTypeName,
            courseNameDisplay: members[0].courseNameDisplay,
            dateFrom: members[0].dateFrom,
            dateTo: members[0].dateTo,
            memberCount: members.length,
            members
        }));
    }

    toggleGroup(group: RftsGroup): void {
        this.selectedGroup = this.selectedGroup?.courseNo === group.courseNo ? null : group;
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
