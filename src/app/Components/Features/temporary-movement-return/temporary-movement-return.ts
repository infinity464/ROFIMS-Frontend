import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TooltipModule } from 'primeng/tooltip';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

import { TemporaryMovementReturnService } from '@/services/temporary-movement-return.service';
import { EmpService } from '@/services/emp-service';
import { SharedService } from '@/shared/services/shared-service';
import { UserMenuService } from '@/services/user-menu.service';

import {
    TemporaryMovementReturnModel,
    TemporaryMovementEligiblePersonnel
} from '@/models/temporary-movement-return.model';
import { TemporaryMovementReturnListComponent } from './temporary-movement-return-list';

@Component({
    selector: 'app-temporary-movement-return',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        FormsModule,
        ButtonModule,
        InputTextModule,
        SelectModule,
        DatePickerModule,
        TooltipModule,
        Toast,
        FileReferencesFormComponent,
        RichEditorComponent,
        FlexibleDateDirective,
        TemporaryMovementReturnListComponent
    ],
    providers: [MessageService],
    templateUrl: './temporary-movement-return.html',
    styleUrl: './temporary-movement-return.scss'
})
export class TemporaryMovementReturnComponent implements OnInit {
    private fb = inject(FormBuilder);
    private service = inject(TemporaryMovementReturnService);
    private empService = inject(EmpService);
    private sharedService = inject(SharedService);
    private messageService = inject(MessageService);
    private userMenuService = inject(UserMenuService);
    private router = inject(Router);

    canInsert = true;
    canUpdate = true;
    canDelete = true;
    saving = false;

    /** View toggle between the entry Form and the List. */
    mode: 'form' | 'list' = 'form';

    form!: FormGroup;
    editingId: number | null = null;

    /** Eligible personnel (out on a Temporary movement to a Mother Unit, not yet returned). */
    personnelOptions: { label: string; value: number; data: TemporaryMovementEligiblePersonnel }[] = [];
    private personnelById = new Map<number, TemporaryMovementEligiblePersonnel>();

    @ViewChild('filesForm') filesForm!: FileReferencesFormComponent;
    fileRows: FileRowData[] = [];

    ngOnInit(): void {
        // If a menu/permission entry exists for this route, honour it. Until one is
        // registered, getPermissionsByRoute returns all-false — fall back to permissive
        // so the screen is usable (otherwise Save stays disabled).
        const perms = this.userMenuService.getPermissionsByRoute(this.router.url);
        const hasMenuEntry = perms.canView || perms.canInsert || perms.canUpdate || perms.canDelete;
        if (hasMenuEntry) {
            this.canInsert = perms.canInsert;
            this.canUpdate = perms.canUpdate;
            this.canDelete = perms.canDelete;
        }

        this.initForm();
        this.loadPersonnel();
    }

    showForm(): void { this.mode = 'form'; }
    showList(): void { this.mode = 'list'; }

    private initForm(): void {
        this.form = this.fb.group({
            employeeId: [null, Validators.required],
            // Auto-filled (read-only) from the chosen person's movement.
            destinedMotherUnitId: [null],
            destinedMotherUnitName: [{ value: '', disabled: true }],
            movementId: [null],
            letterNo: [null],
            letterIssueDate: [null],
            auth: [null],
            detailsInformation: [null],
            returnDate: [null],
            remarks: [null]
        });
    }

    private loadPersonnel(): void {
        this.service.getEligiblePersonnel().subscribe({
            next: (list) => {
                this.personnelById.clear();
                this.personnelOptions = (list || []).map((p) => {
                    this.personnelById.set(p.employeeId, p);
                    const parts = [
                        p.fullNameEN || `Employee #${p.employeeId}`,
                        p.serviceId ? `SVC: ${p.serviceId}` : '',
                        p.rabId ? `RAB: ${p.rabId}` : ''
                    ].filter(Boolean);
                    return { label: parts.join(' | '), value: p.employeeId, data: p };
                });
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load personnel.' });
            }
        });
    }

    /** When a person is picked, auto-fill destination + originating movement. */
    onPersonnelChange(employeeId: number | null): void {
        const p = employeeId != null ? this.personnelById.get(employeeId) : undefined;
        this.form.patchValue({
            destinedMotherUnitId: p?.destinedMotherUnitId ?? null,
            destinedMotherUnitName: p?.destinedMotherUnitName ?? '',
            movementId: p?.movementId ?? null
        });
    }

    onFilesChange(rows: FileRowData[]): void {
        this.fileRows = rows;
    }

    onDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download file.' })
        });
    }

    submit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            this.messageService.add({ severity: 'error', summary: 'Validation', detail: 'Please select a person.' });
            return;
        }

        const v = this.form.getRawValue();
        const currentUser = this.sharedService.getCurrentUser();

        const newFileRows: FileRowData[] = this.filesForm?.getFilesToUpload() ?? [];
        const existingRefs: any[] = this.filesForm?.getExistingFileReferences() ?? [];

        const proceed = (uploaded: { fileId: number; fileName: string }[]) => {
            const refs = [
                ...existingRefs.map((r: any) => ({ fileId: r.fileId ?? r.FileId, fileName: r.fileName })),
                ...uploaded
            ];
            const payload: Partial<TemporaryMovementReturnModel> = {
                id: this.editingId ?? 0,
                movementId: v.movementId ?? null,
                employeeId: v.employeeId,
                destinedMotherUnitId: v.destinedMotherUnitId ?? null,
                letterNo: v.letterNo ?? null,
                letterIssueDate: this.toIsoDate(v.letterIssueDate),
                auth: v.auth ?? null,
                detailsInformation: v.detailsInformation ?? null,
                returnDate: this.toIsoDate(v.returnDate),
                remarks: v.remarks ?? null,
                filesReferences: refs.length ? JSON.stringify(refs) : null,
                status: true,
                createdBy: currentUser,
                lastUpdatedBy: currentUser
            };

            this.service.saveUpdate(payload).subscribe({
                next: () => {
                    this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Return recorded successfully.' });
                    this.saving = false;
                    this.resetForm();
                    this.loadPersonnel();
                    // Jump to the list (re-instantiated via *ngIf → re-fetches).
                    this.mode = 'list';
                },
                error: (err) => {
                    this.saving = false;
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to save return.' });
                }
            });
        };

        this.saving = true;
        if (newFileRows.length > 0) {
            forkJoin(newFileRows.map((r) => this.empService.uploadEmployeeFile(r.file!))).subscribe({
                next: (results: any[]) => proceed(results as { fileId: number; fileName: string }[]),
                error: () => {
                    this.saving = false;
                    this.messageService.add({ severity: 'error', summary: 'Upload', detail: 'File upload failed.' });
                }
            });
        } else {
            proceed([]);
        }
    }

    /** Edit triggered from the list — load into form and switch to the form view. */
    onEditFromList(row: TemporaryMovementReturnModel): void {
        this.editingId = row.id;
        // The person may no longer be in the eligible list — add a transient option so it displays.
        if (!this.personnelById.has(row.employeeId)) {
            const transient: TemporaryMovementEligiblePersonnel = {
                employeeId: row.employeeId,
                movementId: row.movementId ?? 0,
                movementLetterNo: row.movementLetterNo ?? null,
                serviceId: row.serviceId ?? null,
                rabId: row.rabId ?? null,
                fullNameEN: row.fullNameEN ?? null,
                fullNameBN: row.fullNameBN ?? null,
                destinedMotherUnitId: row.destinedMotherUnitId ?? null,
                destinedMotherUnitName: row.destinedMotherUnitName ?? null,
                destinedMotherUnitNameBN: row.destinedMotherUnitNameBN ?? null
            };
            this.personnelById.set(row.employeeId, transient);
            this.personnelOptions = [
                { label: `${row.fullNameEN || 'Employee #' + row.employeeId}${row.serviceId ? ' | SVC: ' + row.serviceId : ''}`, value: row.employeeId, data: transient },
                ...this.personnelOptions
            ];
        }
        this.form.patchValue({
            employeeId: row.employeeId,
            destinedMotherUnitId: row.destinedMotherUnitId ?? null,
            destinedMotherUnitName: row.destinedMotherUnitName ?? '',
            movementId: row.movementId ?? null,
            letterNo: row.letterNo ?? null,
            letterIssueDate: this.toDate(row.letterIssueDate),
            auth: row.auth ?? null,
            detailsInformation: row.detailsInformation ?? null,
            returnDate: this.toDate(row.returnDate),
            remarks: row.remarks ?? null
        });
        this.fileRows = this.parseFileReferences(row.filesReferences);
        this.mode = 'form';
    }

    /** A delete happened in the list — refresh the eligible personnel dropdown. */
    onListChanged(): void {
        this.loadPersonnel();
    }

    resetForm(): void {
        this.editingId = null;
        this.fileRows = [];
        this.form.reset({
            employeeId: null,
            destinedMotherUnitId: null,
            destinedMotherUnitName: '',
            movementId: null,
            letterNo: null,
            letterIssueDate: null,
            auth: null,
            detailsInformation: null,
            returnDate: null,
            remarks: null
        });
    }

    private parseFileReferences(json: string | null | undefined): FileRowData[] {
        if (!json) return [];
        try {
            const arr = JSON.parse(json);
            if (!Array.isArray(arr)) return [];
            return arr
                .map((r: any) => {
                    const fileId = r?.fileId ?? r?.FileId;
                    const fileName = (r?.fileName ?? r?.FileName ?? '') as string;
                    if (fileId == null) return null;
                    return { displayName: fileName, file: null, fileId } as FileRowData;
                })
                .filter((row): row is FileRowData => row !== null);
        } catch {
            return [];
        }
    }

    private toDate(value: string | null | undefined): Date | null {
        if (!value) return null;
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    private toIsoDate(d: Date | string | null | undefined): string | null {
        if (!d) return null;
        if (typeof d === 'string') return d;
        const yyyy = d.getFullYear();
        const mm = `${d.getMonth() + 1}`.padStart(2, '0');
        const dd = `${d.getDate()}`.padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
}
