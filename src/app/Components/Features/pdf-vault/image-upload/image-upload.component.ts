import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { PdfVaultService } from '../services/pdf-vault.service';

@Component({
  selector: 'app-image-upload',
  standalone: true,
  imports: [CommonModule, CardModule, ButtonModule],
  templateUrl: './image-upload.component.html',
  styleUrl: './image-upload.component.scss'
})
export class ImageUploadComponent {
  selectedFile: File | null = null;
  imagePreviewUrl: string | null = null;
  isUploading = false;
  uploadError = '';
  uploadSuccess = false;

  constructor(
    private pdfVaultService: PdfVaultService,
    private cdr: ChangeDetectorRef
  ) {}

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  private handleFile(file: File): void {
    const validTypes = ['image/png', 'image/jpeg', 'image/tiff', 'image/bmp'];
    if (!validTypes.includes(file.type)) {
      this.uploadError = 'Unsupported image format. Use PNG, JPEG, TIFF, or BMP.';
      return;
    }
    this.selectedFile = file;
    this.uploadError = '';
    this.uploadSuccess = false;

    const reader = new FileReader();
    reader.onload = () => {
      this.imagePreviewUrl = reader.result as string;
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
  }

  clearSelection(): void {
    this.selectedFile = null;
    this.imagePreviewUrl = null;
    this.uploadError = '';
    this.uploadSuccess = false;
  }

  upload(): void {
    if (!this.selectedFile) return;

    this.isUploading = true;
    this.uploadError = '';
    this.uploadSuccess = false;

    this.pdfVaultService.uploadImage(this.selectedFile).subscribe({
      next: () => {
        this.uploadSuccess = true;
        this.isUploading = false;
        this.selectedFile = null;
        this.imagePreviewUrl = null;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isUploading = false;
        this.uploadError = err.error?.message || err.message || 'Upload failed';
        console.error('Image upload error:', err);
        this.cdr.detectChanges();
      }
    });
  }
}
