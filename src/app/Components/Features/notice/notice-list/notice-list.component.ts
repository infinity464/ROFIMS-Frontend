import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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

@Component({
    selector: 'app-notice-list',
    standalone: true,
    imports: [
        CommonModule,
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
            error: () => { /* non-fatal — recipient picker stays empty */ }
        });
    }

    /** Echoes the typed query so the user can add arbitrary free-text tags. */
    filterTags(event: { query: string }): void {
        const q = (event.query || '').trim();
        this.tagSuggestions = q ? [q] : [];
    }

    openCreate(): void {
        this.editingId = 0;
        this.form.reset({
            topic: '', details: '', expireDate: null,
            audienceType: 'All', recipientUserIds: [], tags: [], isComplete: false
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
        const expire: Date | null = v.expireDate;
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
