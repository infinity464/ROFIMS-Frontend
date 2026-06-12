import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { DatePickerModule } from 'primeng/datepicker';
import { MultiSelectModule } from 'primeng/multiselect';
import { RadioButtonModule } from 'primeng/radiobutton';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';

import { UserMenuService } from '@/services/user-menu.service';
import { IdentityService } from '@/services/identity.service';
import type { ApplicationUser } from '@/models/identity.model';
import { NoticeService, NoticeListDto, NoticeSaveDto, NoticeAudienceType } from '@/services/notice.service';

/** Notice-tag taxonomy: 5 priority bands, CRITICAL highest. Selecting drives chip colour + dashboard sort. */
export interface NoticeTagOption {
    name: string;
    icon: string;
}
export interface NoticeTagBand {
    band: string;
    label: string;
    classes: string;
    selectedClasses: string;
    tags: NoticeTagOption[];
}
export const NOTICE_TAG_BANDS: NoticeTagBand[] = [
    {
        band: 'critical',
        label: 'CRITICAL · act now',
        classes: 'text-red-600 dark:text-red-400 border-red-500/40',
        selectedClasses: 'bg-red-500/15 border-red-500 text-red-600 dark:text-red-400',
        tags: [
            { name: 'URGENT', icon: 'pi-exclamation-triangle' },
            { name: 'ALERT', icon: 'pi-bell' },
            { name: 'RECALL', icon: 'pi-replay' },
            { name: 'OPERATION', icon: 'pi-bullseye' }
        ]
    },
    {
        band: 'action',
        label: 'ACTION · response needed',
        classes: 'text-amber-600 dark:text-amber-400 border-amber-500/40',
        selectedClasses: 'bg-amber-500/15 border-amber-500 text-amber-600 dark:text-amber-400',
        tags: [
            { name: 'ORDER', icon: 'pi-file' },
            { name: 'DEADLINE', icon: 'pi-clock' },
            { name: 'DEPLOYMENT', icon: 'pi-map-marker' },
            { name: 'SECURITY', icon: 'pi-shield' }
        ]
    },
    {
        band: 'personnel',
        label: 'PERSONNEL',
        classes: 'text-green-600 dark:text-green-400 border-green-500/40',
        selectedClasses: 'bg-green-500/15 border-green-500 text-green-600 dark:text-green-400',
        tags: [
            { name: 'POSTING', icon: 'pi-sync' },
            { name: 'PROMOTION', icon: 'pi-angle-double-up' },
            { name: 'LEAVE', icon: 'pi-send' },
            { name: 'RECRUITMENT', icon: 'pi-user-plus' }
        ]
    },
    {
        band: 'informational',
        label: 'INFORMATIONAL',
        classes: 'text-blue-600 dark:text-blue-400 border-blue-500/40',
        selectedClasses: 'bg-blue-500/15 border-blue-500 text-blue-600 dark:text-blue-400',
        tags: [
            { name: 'POLICY', icon: 'pi-check-square' },
            { name: 'EVENT', icon: 'pi-calendar' },
            { name: 'MEETING', icon: 'pi-users' },
            { name: 'CIRCULAR', icon: 'pi-envelope' }
        ]
    },
    {
        band: 'routine',
        label: 'ROUTINE',
        classes: 'text-surface-500 dark:text-surface-400 border-surface-400/40',
        selectedClasses: 'bg-surface-500/15 border-surface-500 text-surface-700 dark:text-surface-300',
        tags: [
            { name: 'TRAINING', icon: 'pi-book' },
            { name: 'MAINTENANCE', icon: 'pi-cog' },
            { name: 'WELFARE', icon: 'pi-heart' },
            { name: 'ADMIN', icon: 'pi-folder' }
        ]
    }
];

@Component({
    selector: 'app-notice-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        TableModule,
        ButtonModule,
        Dialog,
        InputTextModule,
        TextareaModule,
        DatePickerModule,
        MultiSelectModule,
        RadioButtonModule,
        ToggleSwitchModule,
        AutoCompleteModule,
        TagModule,
        TooltipModule,
        Toast,
        ConfirmDialog
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './notice-list.component.html',
    styleUrl: './notice-list.component.scss'
})
export class NoticeListComponent implements OnInit {
    private fb = inject(FormBuilder);
    private router = inject(Router);
    private userMenuService = inject(UserMenuService);
    private noticeService = inject(NoticeService);
    private identityService = inject(IdentityService);
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    notices: NoticeListDto[] = [];
    loading = false;
    dialogVisible = false;
    isSubmitting = false;
    editingId = 0;
    changingCompleteIds = new Set<number>();

    form!: FormGroup;

    /** Identity users for the "Specific" recipient multi-select. */
    userOptions: { label: string; value: string }[] = [];
    /** Free-text tag suggestions (empty — acts as a plain chip input). */
    tagSuggestions: string[] = [];

    ngOnInit(): void {
        const perms = this.userMenuService.getPermissionsByRoute(this.router.url);
        this.canInsert = perms.canInsert;
        this.canUpdate = perms.canUpdate;
        this.canDelete = perms.canDelete;

        this.initForm();
        this.loadNotices();
        this.loadUsers();
    }

    initForm(): void {
        this.form = this.fb.group({
            topic: ['', Validators.required],
            details: ['', Validators.required],
            expireDate: [null as Date | null],
            audienceType: ['All' as NoticeAudienceType],
            recipientUserIds: [[] as string[]],
            tags: [[] as string[]],
            isComplete: [false]
        });
    }

    private endOfDay(date = new Date()): Date {
        const d = new Date(date);
        d.setHours(23, 59, 0, 0);
        return d;
    }

    /**
     * Time the expire-date picker opens at when the field is empty (23:59 today).
     * MUST be a stable reference — a getter returns a fresh Date each change-detection
     * cycle, which makes p-datepicker re-render and swallow clicks (needs multiple taps
     * to select). Computed once at construction instead.
     */
    readonly defaultExpireDate: Date = this.endOfDay();

    get isSpecific(): boolean {
        return this.form?.get('audienceType')?.value === 'Specific';
    }

    loadNotices(): void {
        this.loading = true;
        this.noticeService.getAll().subscribe({
            next: (list) => {
                this.notices = list;
                this.loading = false;
            },
            error: () => {
                this.loading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load notices' });
            }
        });
    }

    loadUsers(): void {
        this.identityService.getAllUsers().subscribe({
            next: (users: ApplicationUser[]) => {
                this.userOptions = (Array.isArray(users) ? users : []).map((u) => ({
                    label: u.email ? `${u.userName} (${u.email})` : u.userName,
                    value: u.id
                }));
            },
            error: () => {
                /* non-fatal — recipient picker stays empty */
            }
        });
    }

    isTogglingComplete(row: NoticeListDto): boolean {
        return this.changingCompleteIds.has(row.noticeId);
    }

    toggleComplete(row: NoticeListDto): void {
        if (this.isTogglingComplete(row)) {
            return;
        }

        // ngModel has already flipped row.isComplete by the time onChange fires —
        // use that as the target value (do NOT negate again, or it double-flips).
        const nextValue = row.isComplete;
        this.changingCompleteIds.add(row.noticeId);

        const payload: NoticeSaveDto = {
            noticeId: row.noticeId,
            topic: row.topic,
            details: row.details,
            expireDate: row.expireDate ?? null,
            audienceType: row.audienceType,
            tags: Array.isArray(row.tags) ? row.tags : [],
            isComplete: nextValue,
            recipientUserIds: Array.isArray(row.recipientUserIds) ? row.recipientUserIds : []
        };

        this.noticeService.update(payload).subscribe({
            next: (res) => {
                this.changingCompleteIds.delete(row.noticeId);
                const code = res.statusCode ?? res.StatusCode;
                if (code === 200) {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: nextValue ? 'Marked complete' : 'Marked pending'
                    });
                } else {
                    row.isComplete = !nextValue;
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update completion status' });
                }
            },
            error: () => {
                this.changingCompleteIds.delete(row.noticeId);
                row.isComplete = !nextValue;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update completion status' });
            }
        });
    }

    /** Echoes the typed query so the user can add arbitrary free-text tags. */
    filterTags(event: { query: string }): void {
        const q = (event.query || '').trim();
        this.tagSuggestions = q ? [q] : [];
    }

    /** Categorised tag taxonomy shown in the form (CRITICAL first). */
    readonly tagBands = NOTICE_TAG_BANDS;

    private get selectedTags(): string[] {
        return (this.form?.get('tags')?.value as string[]) ?? [];
    }

    isTagSelected(name: string): boolean {
        return this.selectedTags.includes(name);
    }

    /** Map a saved tag → chip classes + icon for the list table (falls back to routine/pi-tag). */
    tagDisplay(tag: string): { classes: string; icon: string } {
        const key = (tag ?? '').trim().toUpperCase();
        for (const b of NOTICE_TAG_BANDS) {
            const t = b.tags.find((x) => x.name === key);
            if (t) return { classes: b.selectedClasses, icon: t.icon };
        }
        const routine = NOTICE_TAG_BANDS[NOTICE_TAG_BANDS.length - 1];
        return { classes: routine.selectedClasses, icon: 'pi-tag' };
    }

    /** Single-select: choosing a tag replaces any prior one; clicking the active tag clears it. */
    toggleTag(name: string): void {
        const next = this.isTagSelected(name) ? [] : [name];
        this.form.get('tags')?.setValue(next);
        this.form.get('tags')?.markAsDirty();
    }

    openCreate(): void {
        this.editingId = 0;
        this.form.reset({
            topic: '',
            details: '',
            expireDate: null,
            audienceType: 'All',
            recipientUserIds: [],
            tags: [],
            isComplete: false
        });
        this.dialogVisible = true;
    }

    openEdit(row: NoticeListDto): void {
        this.editingId = row.noticeId;
        this.form.reset({
            topic: row.topic,
            details: row.details,
            expireDate: row.expireDate ? new Date(row.expireDate) : null,
            audienceType: row.audienceType,
            recipientUserIds: row.recipientUserIds ?? [],
            tags: row.tags ?? [],
            isComplete: row.isComplete
        });
        this.dialogVisible = true;
    }

    onSubmit(): void {
        if (this.isSubmitting) return;
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }
        const v = this.form.getRawValue();
        // Expire date always lands at 23:59 (end of day), regardless of the time spinner.
        const expire: Date | null = v.expireDate ? this.endOfDay(v.expireDate) : null;
        const payload: NoticeSaveDto = {
            noticeId: this.editingId,
            topic: (v.topic || '').trim(),
            details: (v.details || '').trim(),
            expireDate: expire ? expire.toISOString() : null,
            audienceType: v.audienceType,
            tags: Array.isArray(v.tags) ? v.tags : [],
            isComplete: !!v.isComplete,
            recipientUserIds: v.audienceType === 'Specific' && Array.isArray(v.recipientUserIds) ? v.recipientUserIds : []
        };

        this.isSubmitting = true;
        const req = this.editingId > 0 ? this.noticeService.update(payload) : this.noticeService.save(payload);
        req.subscribe({
            next: (res) => {
                this.isSubmitting = false;
                const code = res.statusCode ?? res.StatusCode;
                if (code === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: this.editingId > 0 ? 'Notice updated' : 'Notice created' });
                    this.dialogVisible = false;
                    this.loadNotices();
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? res.Description ?? 'Save failed' });
                }
            },
            error: () => {
                this.isSubmitting = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Save failed' });
            }
        });
    }

    confirmDeactivate(row: NoticeListDto): void {
        this.confirmationService.confirm({
            message: `Deactivate notice "${row.topic}"?`,
            header: 'Confirm',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                this.noticeService.deactivate(row.noticeId).subscribe({
                    next: () => {
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Notice deactivated' });
                        this.loadNotices();
                    },
                    error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Deactivate failed' })
                });
            }
        });
    }

    confirmDelete(row: NoticeListDto): void {
        this.confirmationService.confirm({
            message: `Permanently delete notice "${row.topic}"?`,
            header: 'Confirm delete',
            icon: 'pi pi-trash',
            accept: () => {
                this.noticeService.delete(row.noticeId).subscribe({
                    next: () => {
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Notice deleted' });
                        this.loadNotices();
                    },
                    error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Delete failed' })
                });
            }
        });
    }
}
