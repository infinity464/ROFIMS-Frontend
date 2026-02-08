import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FileUpload } from 'primeng/fileupload';
import { Button } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';

export interface FileRowData {
    displayName: string;
    file: File | null;
    fileId?: number;
}

@Component({
    selector: 'app-file-references-form',
    templateUrl: './file-references-form.html',
    styleUrl: './file-references-form.scss',
    standalone: true,
    imports: [CommonModule, FormsModule, FileUpload, Button, InputTextModule, TooltipModule]
})
export class FileReferencesFormComponent implements OnInit, OnChanges {
    @Input() fileRows: FileRowData[] = [];
    @Input() isViewMode: boolean = false;
    @Input() title: string = 'Files';

    @Output() fileRowsChange = new EventEmitter<FileRowData[]>();
    @Output() filesUploaded = new EventEmitter<{ index: number; file: File }[]>();
    /** Emits when user clicks Download on a saved file. Parent should call API and trigger download with fileName. */
    @Output() onDownloadFile = new EventEmitter<{ fileId: number; fileName: string }>();

    /** Local copy so template updates when parent sets fileRows asynchronously (e.g. after load). */
    rows: FileRowData[] = [];

    ngOnInit(): void {
        this.rows = Array.isArray(this.fileRows) && this.fileRows.length > 0 ? [...this.fileRows] : [];
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['fileRows'] && changes['fileRows'].currentValue != null) {
            const val = changes['fileRows'].currentValue as FileRowData[];
            this.rows = Array.isArray(val) ? [...val] : [];
        }
    }

    addFileRow(): void {
        this.fileRows.push({ displayName: '', file: null });
        this.rows = [...this.fileRows];
        this.emitChanges();
    }

    removeFileRow(index: number): void {
        this.fileRows.splice(index, 1);
        this.rows = [...this.fileRows];
        this.emitChanges();
    }

    onFileSelectForRow(index: number, event: { files: File[] }): void {
        const file = event.files?.[0];
        if (file && this.fileRows[index]) {
            this.fileRows[index].file = file;
            if (!this.fileRows[index].displayName?.trim()) {
                this.fileRows[index].displayName = file.name;
            }
            this.rows = [...this.fileRows];
            this.emitChanges();
        }
    }

    clearFileForRow(index: number): void {
        if (this.fileRows[index]) {
            this.fileRows[index].file = null;
            this.rows = [...this.fileRows];
            this.emitChanges();
        }
    }

    openFilePreview(index: number): void {
        const fileRow = this.rows[index];
        if (fileRow && fileRow.file) {
            // Create a blob URL and open in new window
            const fileUrl = URL.createObjectURL(fileRow.file);
            window.open(fileUrl, '_blank');
            // Clean up the URL after a delay
            setTimeout(() => URL.revokeObjectURL(fileUrl), 100);
        }
    }

    private emitChanges(): void {
        this.fileRowsChange.emit(this.fileRows);
    }

    getFilesToUpload(): FileRowData[] {
        return this.fileRows.filter((r) => r.file != null);
    }

    getExistingFileReferences(): { FileId: number; fileName: string }[] {
        return this.fileRows
            .filter((r) => r.fileId != null && r.file == null)
            .map((r) => ({ FileId: r.fileId!, fileName: r.displayName || '' }));
    }
}
