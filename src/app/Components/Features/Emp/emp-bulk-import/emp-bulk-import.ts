import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { BulkEmployeeImportService, EmployeeImportResult } from '@/services/bulk-employee-import.service';

@Component({
    selector: 'app-emp-bulk-import',
    standalone: true,
    imports: [CommonModule, ButtonModule, Fluid, TableModule, TagModule],
    templateUrl: './emp-bulk-import.html',
    styleUrl: './emp-bulk-import.scss'
})
export class EmpBulkImport {
    selectedFile: File | null = null;
    isDownloading = false;
    isUploading = false;
    result: EmployeeImportResult | null = null;

    constructor(
        private bulkService: BulkEmployeeImportService,
        private messageService: MessageService
    ) {}

    downloadTemplate(): void {
        this.isDownloading = true;
        this.bulkService.downloadTemplate().subscribe({
            next: (blob) => {
                this.triggerDownload(blob, 'EmployeeBulkImportTemplate.xlsx');
                this.isDownloading = false;
            },
            error: (err) => {
                this.isDownloading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to download template' });
            }
        });
    }

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files && input.files.length > 0 ? input.files[0] : null;
        if (file && !file.name.toLowerCase().endsWith('.xlsx')) {
            this.messageService.add({ severity: 'warn', summary: 'Invalid file', detail: 'Please select a .xlsx file.' });
            this.selectedFile = null;
            input.value = '';
            return;
        }
        this.selectedFile = file;
        this.result = null;
    }

    upload(): void {
        if (!this.selectedFile) {
            this.messageService.add({ severity: 'warn', summary: 'No file', detail: 'Please choose an Excel file first.' });
            return;
        }
        this.isUploading = true;
        this.bulkService.upload(this.selectedFile).subscribe({
            next: (res) => {
                this.isUploading = false;
                this.result = res;
                this.messageService.add({
                    severity: res.failedCount > 0 ? 'warn' : 'success',
                    summary: 'Import complete',
                    detail: `${res.insertedCount} inserted, ${res.skippedCount} skipped, ${res.failedCount} failed.`
                });
            },
            error: (err) => {
                this.isUploading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || err?.error || 'Upload failed' });
            }
        });
    }

    statusSeverity(status: string): 'success' | 'warn' | 'danger' | 'info' {
        switch (status) {
            case 'Inserted': return 'success';
            case 'Skipped': return 'warn';
            case 'Failed': return 'danger';
            default: return 'info';
        }
    }

    private triggerDownload(blob: Blob, fileName: string): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 500);
    }
}
