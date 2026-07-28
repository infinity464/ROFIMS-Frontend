import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { UserMenuService } from '@/services/user-menu.service';

import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { Toast } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { PaginatorModule } from 'primeng/paginator';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';

import { RftsCourseRefService } from '@/services/rfts-course-ref.service';
import { RftsCourseRefMember, RftsCourseRefModel } from '@/models/rfts-course-ref.model';

/** One course card. Members are fetched only when the card is expanded. */
interface CourseGroup {
    id: number;
    courseRefNo: string;
    courseDate: string;
    remarks: string | null;
    status: boolean;
    memberCount: number;
    members: RftsCourseRefMember[];
    membersLoaded: boolean;
}

/**
 * RFTS Course / Reference list — same card-and-expand shape as
 * /emp-rfts-completed. Entry and editing live on /emp-rfts-course-ref.
 */
@Component({
    selector: 'app-emp-rfts-course-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        RouterLink,
        CardModule,
        TableModule,
        ButtonModule,
        Fluid,
        Toast,
        ConfirmDialogModule,
        InputTextModule,
        IconFieldModule,
        InputIconModule,
        PaginatorModule,
        TooltipModule
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './emp-rfts-course-list.html'
})
export class EmpRftsCourseListComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    courses: CourseGroup[] = [];
    isLoading = false;
    /** True while the expanded course's members are being fetched. */
    isLoadingMembers = false;

    /** The currently expanded course card. Click the same card again to collapse. */
    selectedGroup: CourseGroup | null = null;

    // Server-side paging — the card list is paginated rather than capped.
    first = 0;
    rows = 20;
    totalRecords = 0;
    searchText = '';

    constructor(
        private service: RftsCourseRefService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService
    ) {}

    ngOnInit(): void {
        // This page was split out of /emp-rfts-course-ref. Until it is added to
        // the user_menu permissions table, fall back to the parent page's perms
        // (same pattern as /emp-draft-list) so the action buttons stay usable.
        const own = this._userMenuService.getPermissionsByRoute(this._router.url);
        const parent = this._userMenuService.getPermissionsByRoute('/emp-rfts-course-ref');
        this.canInsert = own.canInsert || parent.canInsert;
        this.canUpdate = own.canUpdate || parent.canUpdate;
        this.canDelete = own.canDelete || parent.canDelete;

        this.loadCourses();
    }

    /** Loads the course headers only (member counts, no member rows). */
    loadCourses(): void {
        this.isLoading = true;
        const pageNo = Math.floor(this.first / this.rows) + 1;

        this.service.getPaged(this.searchText.trim(), pageNo, this.rows).subscribe({
            next: (res) => {
                this.courses = (res.datalist ?? []).map((c: RftsCourseRefModel) => ({
                    id: c.id,
                    courseRefNo: c.courseRefNo,
                    courseDate: c.courseDate,
                    remarks: c.remarks,
                    status: c.status,
                    memberCount: c.memberCount,
                    members: [],
                    membersLoaded: false
                }));
                this.totalRecords = res.pages?.rows ?? 0;
                this.selectedGroup = null;
                this.isLoading = false;
            },
            error: (err) => {
                this.courses = [];
                this.totalRecords = 0;
                this.selectedGroup = null;
                this.isLoading = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.description || err?.error?.message || 'Failed to load courses.'
                });
            }
        });
    }

    onPage(event: { first?: number; rows?: number }): void {
        if (event.first != null) this.first = event.first;
        if (event.rows != null) this.rows = event.rows;
        this.loadCourses();
    }

    onSearch(): void {
        this.first = 0;
        this.loadCourses();
    }

    clearSearch(): void {
        this.searchText = '';
        this.onSearch();
    }

    /** Expand/collapse a course. On first expand, fetch that course's members. */
    toggleGroup(group: CourseGroup): void {
        if (this.selectedGroup?.id === group.id) {
            this.selectedGroup = null;
            return;
        }
        this.selectedGroup = group;
        if (!group.membersLoaded) this.loadMembers(group);
    }

    private loadMembers(group: CourseGroup): void {
        this.isLoadingMembers = true;
        this.service.getById(group.id).subscribe({
            next: (course) => {
                group.members = course?.members ?? [];
                group.membersLoaded = true;
                // The by-id read is authoritative — keep the card badge in step
                // if the count drifted from what the grid returned.
                group.memberCount = group.members.length;
                this.isLoadingMembers = false;
            },
            error: () => {
                this.isLoadingMembers = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load members for this course.' });
            }
        });
    }

    edit(group: CourseGroup, event: Event): void {
        event.stopPropagation();
        this._router.navigate(['/emp-rfts-course-ref'], { queryParams: { id: group.id } });
    }

    // ---------- Member removal ----------
    /** True while this course's members are being removed. */
    isRemovingMember = false;

    /** A completed member is a historical record — the server refuses to remove them. */
    canRemoveMember(member: RftsCourseRefMember): boolean {
        return !member.isRftsCompleted;
    }

    removeMemberTooltip(member: RftsCourseRefMember): string {
        return this.canRemoveMember(member)
            ? 'Remove from course'
            : 'RFTS is already complete for this member — cannot be removed';
    }

    removeMember(group: CourseGroup, member: RftsCourseRefMember, event: Event): void {
        event.stopPropagation();
        if (!this.canRemoveMember(member)) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Not allowed',
                detail: `RFTS is already complete for ${member.fullNameEN || 'this member'} — they cannot be removed from the course.`
            });
            return;
        }

        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: `Remove ${member.fullNameEN || 'this member'} from "${group.courseRefNo}"?`,
            header: 'Remove Member',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Remove', severity: 'danger' },
            accept: () => {
                this.isRemovingMember = true;
                this.service.removeMembers(group.id, [member.employeeId]).subscribe({
                    next: (res) => {
                        this.isRemovingMember = false;
                        if (res && typeof res.statusCode === 'number' && res.statusCode !== 200) {
                            this.messageService.add({
                                severity: 'warn',
                                summary: 'Not allowed',
                                detail: res.description || 'Failed to remove the member.'
                            });
                            return;
                        }
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Member removed.' });
                        // Re-read this course so the panel and the card badge agree.
                        group.membersLoaded = false;
                        this.loadMembers(group);
                    },
                    error: (err) => {
                        this.isRemovingMember = false;
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: err?.error?.description || err?.error?.message || 'Failed to remove the member.'
                        });
                    }
                });
            }
        });
    }

    delete(group: CourseGroup, event: Event): void {
        event.stopPropagation();

        // A course must be emptied first. Checking here turns what would be a
        // server rejection into an upfront explanation of what to do next.
        if (group.memberCount > 0) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Cannot delete',
                detail: `"${group.courseRefNo}" still has ${group.memberCount} member(s). Remove all members before deleting the course.`
            });
            // Open the card so the member list — and its remove buttons — are right there.
            if (this.selectedGroup?.id !== group.id) this.toggleGroup(group);
            return;
        }

        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: `Delete course / reference "${group.courseRefNo}"?`,
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Delete', severity: 'danger' },
            accept: () => {
                this.service.delete(group.id).subscribe({
                    next: (res) => {
                        if (res && typeof res.statusCode === 'number' && res.statusCode !== 200) {
                            this.messageService.add({
                                severity: 'warn',
                                summary: 'Warning',
                                detail: res.description || 'Failed to delete.'
                            });
                            return;
                        }
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Deleted successfully.' });
                        // Deleting the last row of a page would otherwise land on
                        // an empty page — step back one when that happens.
                        if (this.courses.length === 1 && this.first >= this.rows) this.first -= this.rows;
                        this.loadCourses();
                    },
                    error: (err) => {
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: err?.error?.description || err?.error?.message || 'Failed to delete.'
                        });
                    }
                });
            }
        });
    }

    /**
     * The API returns a plain yyyy-MM-dd (DateOnly). Building it from parts
     * keeps it a local date — `new Date('2026-01-12')` parses as UTC midnight
     * and can render as the previous day west of Greenwich.
     */
    formatDate(value: string | null | undefined): string {
        if (!value) return '—';
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
        const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
}
