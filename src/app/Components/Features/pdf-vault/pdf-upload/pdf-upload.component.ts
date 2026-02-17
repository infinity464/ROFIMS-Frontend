import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PdfVaultService } from '../services/pdf-vault.service';

@Component({
  selector: 'app-pdf-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pdf-upload.component.html',
  styleUrl: './pdf-upload.component.scss'
})
export class PdfUploadComponent {
  selectedFile: File | null = null;
  tagsInput: string = '';
  isUploading = false;
  uploadSuccess = false;
  uploadError = '';

  constructor(
    private pdfVaultService: PdfVaultService,
    private cdr: ChangeDetectorRef
  ) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (file.type === 'application/pdf') {
        this.selectedFile = file;
        this.uploadError = '';
      } else {
        this.uploadError = 'Please select a PDF file';
        this.selectedFile = null;
      }
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf') {
        this.selectedFile = file;
        this.uploadError = '';
      } else {
        this.uploadError = 'Please select a PDF file';
      }
    }
  }

  upload(): void {
    if (!this.selectedFile) {
      this.uploadError = 'Please select a file';
      return;
    }

    this.isUploading = true;
    this.uploadSuccess = false;
    this.uploadError = '';

    const tags = this.tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    this.pdfVaultService.uploadDocument(this.selectedFile, tags).subscribe({
      next: (doc) => {
        this.uploadSuccess = true;
        this.selectedFile = null;
        this.tagsInput = '';
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isUploading = false;
        this.uploadError = err.error?.message || err.message || 'Upload failed';
        this.cdr.detectChanges();
      },
      complete: () => {
        this.isUploading = false;
        this.cdr.detectChanges();
      }
    });
  }

  clearSelection(): void {
    this.selectedFile = null;
    this.uploadError = '';
    this.uploadSuccess = false;
  }
}
