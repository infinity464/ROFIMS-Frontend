import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';
import { PdfVaultService } from '../services/pdf-vault.service';
import { ImageFindResult } from '../models/search.model';

@Component({
  selector: 'app-pdf-image-search',
  standalone: true,
  imports: [CommonModule, CardModule, ButtonModule, DividerModule],
  templateUrl: './pdf-image-search.component.html',
  styleUrl: './pdf-image-search.component.scss'
})
export class PdfImageSearchComponent {
  selectedFile: File | null = null;
  imagePreviewUrl: string | null = null;
  isSearching = false;
  findResult: ImageFindResult | null = null;
  matchImageUrl: string | null = null;
  searchError = '';

  constructor(
    private pdfVaultService: PdfVaultService,
    private http: HttpClient,
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
      this.searchError = 'Unsupported image format. Use PNG, JPEG, TIFF, or BMP.';
      return;
    }
    this.selectedFile = file;
    this.searchError = '';
    this.findResult = null;
    this.matchImageUrl = null;

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
    this.findResult = null;
    this.matchImageUrl = null;
    this.searchError = '';
  }

  search(): void {
    if (!this.selectedFile) return;

    this.isSearching = true;
    this.searchError = '';
    this.findResult = null;
    this.matchImageUrl = null;

    this.pdfVaultService.findImage(this.selectedFile).subscribe({
      next: (result) => {
        this.findResult = result;
        if (result.found && result.image) {
          this.matchImageUrl = this.pdfVaultService.getImageFileUrl(result.image.id);
        }
        this.isSearching = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isSearching = false;
        this.searchError = err.error?.message || err.message || 'Image search failed';
        console.error('Image search error:', err);
        this.cdr.detectChanges();
      }
    });
  }

  downloadImage(): void {
    if (!this.findResult?.image || !this.matchImageUrl) return;

    const fileName = this.findResult.image.originalFileName;
    this.http.get(this.matchImageUrl, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  }
}
