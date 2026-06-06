import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { EmpService, FaceSearchHistoryItem } from '@/services/emp-service';

@Component({
    selector: 'app-employee-face-search-history',
    standalone: true,
    imports: [CommonModule, ButtonModule, ToastModule, DialogModule, PaginatorModule],
    templateUrl: './employee-face-search-history.html',
    styleUrl: './employee-face-search-history.scss',
    providers: [MessageService]
})
export class EmployeeFaceSearchHistoryComponent implements OnInit, OnDestroy {
    rows: FaceSearchHistoryItem[] = [];
    totalRecords = 0;
    loading = false;
    rowsPerPage = 10;
    first = 0;
    retentionDays = 30;

    /** id → object URL for the row thumbnail. */
    private thumbs = new Map<number, string>();

    // Large preview dialog
    showPreview = false;
    previewUrl = '';

    constructor(
        private empService: EmpService,
        private messageService: MessageService,
        private _router: Router
    ) {}

    ngOnInit(): void {
        this.load(1);
    }

    ngOnDestroy(): void {
        this.revokeThumbs();
        if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    }

    onPageChange(event: PaginatorState): void {
        this.first = event.first ?? 0;
        this.rowsPerPage = event.rows ?? this.rowsPerPage;
        const page = Math.floor(this.first / this.rowsPerPage) + 1;
        this.load(page);
    }

    thumbUrl(id: number): string | undefined {
        return this.thumbs.get(id);
    }

    openPreview(id: number): void {
        const url = this.thumbs.get(id);
        if (url) {
            this.previewUrl = url;
            this.showPreview = true;
        }
    }

    viewProfile(employeeId: number | null): void {
        if (employeeId) {
            this._router.navigate(['/members/profile', employeeId]);
        }
    }

    confidenceSeverity(conf: number): 'success' | 'warn' | 'danger' {
        if (conf >= 0.6) return 'success';
        if (conf >= 0.4) return 'warn';
        return 'danger';
    }

    refresh(): void {
        const page = Math.floor(this.first / this.rowsPerPage) + 1;
        this.load(page);
    }

    private load(page: number): void {
        this.loading = true;
        this.revokeThumbs();
        this.empService.getFaceSearchHistory(page, this.rowsPerPage).subscribe({
            next: (res) => {
                this.rows = res?.datalist ?? [];
                this.totalRecords = res?.pages?.Rows ?? 0;
                if (res?.retentionDays) this.retentionDays = res.retentionDays;
                this.loading = false;
                this.loadThumbnails();
            },
            error: (err: any) => {
                this.loading = false;
                this.rows = [];
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load search history.' });
            }
        });
    }

    private loadThumbnails(): void {
        const withImage = this.rows.filter((r) => r.hasImage);
        if (withImage.length === 0) return;
        forkJoin(
            withImage.map((r) =>
                this.empService.getFaceSearchImageBlob(r.id).pipe(catchError(() => of(null)))
            )
        ).subscribe((blobs) => {
            withImage.forEach((r, idx) => {
                const blob = blobs[idx];
                if (blob && blob.size > 0) {
                    this.thumbs.set(r.id, URL.createObjectURL(blob));
                }
            });
        });
    }

    private revokeThumbs(): void {
        this.thumbs.forEach((url) => URL.revokeObjectURL(url));
        this.thumbs.clear();
    }
}
