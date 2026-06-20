import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MovementInfoModel } from '@/models/movement-info.model';
import { EmpService } from '@/services/emp-service';
import { MovementType } from '@/models/enums';

interface FileRef {
    fileId: number;
    fileName: string;
}

/**
 * Screen-only panels shown below a movement preview paper:
 *  1. Attached files (movement.filesReferences) — when any exist.
 *  2. Return information (Temporary movements) — date / details / remark /
 *     files, when a return has been recorded.
 *
 * Wrapped in `.no-print`; the print / PDF / Word exports build their own
 * content and never read this DOM, so they remain unchanged.
 */
@Component({
    selector: 'app-movement-files-info',
    standalone: true,
    imports: [CommonModule],
    template: `
        @if (files.length || hasReturnInfo) {
            <div class="mv-info-panels no-print">
                @if (files.length) {
                    <section class="mv-info-card">
                        <h3 class="mv-info-title"><i class="pi pi-paperclip"></i> Attached Files</h3>
                        <ul class="mv-file-list">
                            @for (f of files; track f.fileId) {
                                <li>
                                    <button type="button" class="mv-file-link" (click)="download(f)">
                                        <i class="pi pi-file"></i> {{ f.fileName || ('File #' + f.fileId) }}
                                        <i class="pi pi-download"></i>
                                    </button>
                                </li>
                            }
                        </ul>
                    </section>
                }

                @if (hasReturnInfo) {
                    <section class="mv-info-card">
                        <h3 class="mv-info-title"><i class="pi pi-replay"></i> Return Information</h3>
                        <div class="mv-info-grid">
                            <div class="mv-info-label">Return Date</div>
                            <div class="mv-info-value">{{ (movement?.returnDate | date: 'dd-MM-yyyy') || '—' }}</div>

                            <div class="mv-info-label">Return Details</div>
                            <div class="mv-info-value" style="white-space:pre-line">{{ movement?.returnDetails || '—' }}</div>

                            <div class="mv-info-label">Return Remark</div>
                            <div class="mv-info-value" style="white-space:pre-line">{{ movement?.returnRemark || '—' }}</div>
                        </div>

                        @if (returnFiles.length) {
                            <div class="mv-info-label" style="margin-top:0.5rem;">Return Files</div>
                            <ul class="mv-file-list">
                                @for (f of returnFiles; track f.fileId) {
                                    <li>
                                        <button type="button" class="mv-file-link" (click)="download(f)">
                                            <i class="pi pi-file"></i> {{ f.fileName || ('File #' + f.fileId) }}
                                            <i class="pi pi-download"></i>
                                        </button>
                                    </li>
                                }
                            </ul>
                        }
                    </section>
                }
            </div>
        }
    `,
    styles: [`
        .mv-info-panels {
            max-width: 210mm;
            margin: 1rem auto;
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        .mv-info-card {
            background: var(--surface-card, #fff);
            border: 1px solid var(--surface-border, #e5e7eb);
            border-radius: 8px;
            padding: 1rem 1.25rem;
        }
        .mv-info-title {
            margin: 0 0 0.75rem;
            font-size: 0.95rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 0.4rem;
        }
        .mv-info-grid {
            display: grid;
            grid-template-columns: 140px 1fr;
            gap: 0.4rem 1rem;
            font-size: 0.875rem;
        }
        .mv-info-label { font-weight: 600; color: var(--text-color-secondary, #6b7280); }
        .mv-info-value { color: var(--text-color, #111827); }
        .mv-file-list { list-style: none; margin: 0.25rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
        .mv-file-link {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            background: none;
            border: none;
            color: var(--primary-color, #2563eb);
            cursor: pointer;
            padding: 0.15rem 0;
            font-size: 0.875rem;
        }
        .mv-file-link:hover { text-decoration: underline; }
    `]
})
export class MovementFilesInfoComponent {
    private empService = inject(EmpService);

    @Input() movement: MovementInfoModel | null = null;

    get files(): FileRef[] {
        return this.parse(this.movement?.filesReferences);
    }

    get returnFiles(): FileRef[] {
        return this.parse(this.movement?.returnFiles);
    }

    get hasReturnInfo(): boolean {
        if (this.movement?.movementType !== MovementType.Temporary) return false;
        const m = this.movement;
        return !!(m?.isReturned || m?.returnDate || m?.returnDetails || m?.returnRemark || this.returnFiles.length);
    }

    download(f: FileRef): void {
        this.empService.downloadFile(f.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, f.fileName || 'download')
        });
    }

    private parse(json: string | null | undefined): FileRef[] {
        if (!json) return [];
        try {
            const parsed = JSON.parse(json);
            if (!Array.isArray(parsed)) return [];
            return parsed
                .map((r: any) => {
                    const fileId = r?.fileId ?? r?.FileId;
                    const fileName = r?.fileName ?? r?.FileName ?? '';
                    if (fileId == null) return null;
                    return { fileId, fileName } as FileRef;
                })
                .filter((r): r is FileRef => r != null);
        } catch {
            return [];
        }
    }
}
