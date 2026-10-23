import { Component, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageService } from 'primeng/api';

import { MovementInfoService } from '@/services/movement-info.service';
import { MovementInfoModel } from '@/models/movement-info.model';
import { EmpService } from '@/services/emp-service';
import { MovementType } from '@/models/enums';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';

/**
 * Reusable Return action for Temporary movements: renders a button (only when
 * the movement is Temporary) that opens a modal to record the return date,
 * details, remark and files. Shared across the CC / MO / Article-47 previews.
 */
@Component({
    selector: 'app-movement-return-button',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        DialogModule,
        TextareaModule,
        DatePickerModule,
        FileReferencesFormComponent
    ],
    template: `
        @if (isTemporary) {
            <button type="button" pButton
                    label="Return" icon="pi pi-replay"
                    severity="success" [outlined]="true"
                    (click)="open()" [disabled]="!movement"></button>
        }

        <p-dialog
            header="Record Return"
            [(visible)]="dialogVisible"
            [modal]="true"
            [style]="{ width: '40rem' }"
            [draggable]="false"
            [resizable]="false"
            [focusOnShow]="false">
            <div class="flex flex-col gap-4">
                <div>
                    <label class="block mb-2 text-sm font-medium">Return Date</label>
                    <p-datepicker
                        [(ngModel)]="returnDate"
                        appendTo="body" dateFormat="dd/mm/yy"
                        [showIcon]="true" iconDisplay="input"
                        [showOnFocus]="false"
                        placeholder="dd/mm/yyyy" [inputStyle]="{ width: '100%' }"
                        class="w-full"></p-datepicker>
                </div>
                <div>
                    <label class="block mb-2 text-sm font-medium">Return Details</label>
                    <textarea pTextarea [(ngModel)]="returnDetails" rows="3" class="w-full"
                              placeholder="Return details..."></textarea>
                </div>
                <div>
                    <label class="block mb-2 text-sm font-medium">Return Remark</label>
                    <textarea pTextarea [(ngModel)]="returnRemark" rows="3" class="w-full"
                              placeholder="Return remark..."></textarea>
                </div>
                <div>
                    <label class="block mb-2 text-sm font-medium">Return Files</label>
                    <app-file-references-form
                        #returnFilesForm
                        [fileRows]="returnFileRows"
                        namePlaceholder="e.g. Return order, Annexure"
                        (fileRowsChange)="onFilesChange($event)"
                        (onDownloadFile)="onDownloadFile($event)">
                    </app-file-references-form>
                </div>
            </div>
            <ng-template pTemplate="footer">
                <button type="button" pButton label="Cancel" icon="pi pi-times"
                        severity="secondary" [text]="true"
                        (click)="dialogVisible = false"></button>
                <button type="button" pButton label="Save" icon="pi pi-check"
                        [loading]="saving"
                        (click)="save()"></button>
            </ng-template>
        </p-dialog>
    `
})
export class MovementReturnButtonComponent {
    private movementService = inject(MovementInfoService);
    private empService = inject(EmpService);
    private messageService = inject(MessageService);

    @Input() movement: MovementInfoModel | null = null;
    /** Emitted after a return is saved successfully so the parent can reload. */
    @Output() saved = new EventEmitter<void>();

    @ViewChild('returnFilesForm') returnFilesForm?: FileReferencesFormComponent;

    dialogVisible = false;
    saving = false;
    returnDate: Date | null = null;
    returnDetails = '';
    returnRemark = '';
    returnFileRows: FileRowData[] = [];

    get isTemporary(): boolean {
        return this.movement?.movementType === MovementType.Temporary;
    }

    open(): void {
        if (!this.movement) return;
        this.returnDate = this.movement.returnDate ? new Date(this.movement.returnDate) : new Date();
        this.returnDetails = this.movement.returnDetails ?? '';
        this.returnRemark = this.movement.returnRemark ?? '';
        this.returnFileRows = this.parseFileReferences(this.movement.returnFiles);
        this.dialogVisible = true;
    }

    onFilesChange(rows: FileRowData[]): void {
        this.returnFileRows = rows;
    }

    onDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download')
        });
    }

    private parseFileReferences(json: string | null | undefined): FileRowData[] {
        if (!json) return [];
        try {
            const parsed = JSON.parse(json);
            if (!Array.isArray(parsed)) return [];
            return parsed
                .map((r: any) => {
                    const fileId = r?.fileId ?? r?.FileId;
                    const fileName = r?.fileName ?? r?.FileName ?? '';
                    if (fileId == null) return null;
                    return { displayName: fileName, file: null, fileId } as FileRowData;
                })
                .filter((r): r is FileRowData => r != null);
        } catch {
            return [];
        }
    }

    save(): void {
        if (!this.movement) return;
        const toDateOnly = (d: Date | null): string | null =>
            d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : null;

        const movementId = this.movement.movementId;
        const newFileRows: FileRowData[] = this.returnFilesForm?.getFilesToUpload() ?? [];
        const existingRefs = this.returnFilesForm?.getExistingFileReferences() ?? [];

        const proceed = (uploaded: { fileId: number; fileName: string }[]) => {
            const refs = [
                ...existingRefs.map((r) => ({ fileId: r.FileId, fileName: r.fileName })),
                ...uploaded
            ];
            this.movementService
                .recordReturn({
                    movementId,
                    returnDate: toDateOnly(this.returnDate),
                    returnDetails: this.returnDetails?.trim() || null,
                    returnRemark: this.returnRemark?.trim() || null,
                    returnFiles: refs.length ? JSON.stringify(refs) : null
                })
                .subscribe({
                    next: () => {
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'Return recorded successfully'
                        });
                        this.saving = false;
                        this.dialogVisible = false;
                        if (this.movement) {
                            this.movement.isReturned = true;
                            this.movement.returnDate = toDateOnly(this.returnDate);
                            this.movement.returnDetails = this.returnDetails?.trim() || null;
                            this.movement.returnRemark = this.returnRemark?.trim() || null;
                            this.movement.returnFiles = refs.length ? JSON.stringify(refs) : null;
                        }
                        this.saved.emit();
                    },
                    error: (err) => {
                        this.saving = false;
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: err?.error?.description || err?.error?.message || 'Failed to record return'
                        });
                    }
                });
        };

        this.saving = true;
        if (newFileRows.length > 0) {
            forkJoin(newFileRows.map((r) => this.empService.uploadEmployeeFile(r.file!))).subscribe({
                next: (results: any[]) => proceed(results as { fileId: number; fileName: string }[]),
                error: () => {
                    this.saving = false;
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to upload return files.'
                    });
                }
            });
        } else {
            proceed([]);
        }
    }
}
