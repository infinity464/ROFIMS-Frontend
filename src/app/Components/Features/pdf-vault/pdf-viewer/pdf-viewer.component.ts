import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { PdfVaultService } from '../services/pdf-vault.service';
import { PdfDocument } from '../models/document.model';

declare const pdfjsLib: any;

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pdf-viewer.component.html',
  styleUrl: './pdf-viewer.component.scss'
})
export class PdfViewerComponent implements OnInit, OnDestroy {
  @ViewChild('pdfContainer') pdfContainer!: ElementRef;

  document: PdfDocument | null = null;
  currentPage = 1;
  totalPages = 0;
  scale = 1.0;
  isLoading = true;
  error = '';

  private pdfDoc: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private pdfVaultService: PdfVaultService
  ) {}

  ngOnInit(): void {
    const documentId = this.route.snapshot.paramMap.get('id');
    const pageParam = this.route.snapshot.queryParamMap.get('page');

    if (pageParam) {
      this.currentPage = parseInt(pageParam, 10) || 1;
    }

    if (documentId) {
      this.loadDocument(documentId);
    } else {
      this.error = 'No document ID provided';
      this.isLoading = false;
    }
  }

  ngOnDestroy(): void {
    if (this.pdfDoc) {
      this.pdfDoc.destroy();
    }
  }

  async loadDocument(id: string): Promise<void> {
    try {
      this.pdfVaultService.getDocument(id).subscribe({
        next: (doc) => this.document = doc,
        error: (err) => console.error('Error loading document metadata:', err)
      });

      const pdfUrl = this.pdfVaultService.getDocumentFileUrl(id);

      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      this.pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
      this.totalPages = this.pdfDoc.numPages;

      if (this.currentPage > this.totalPages) {
        this.currentPage = this.totalPages;
      }
      if (this.currentPage < 1) {
        this.currentPage = 1;
      }

      await this.renderPage(this.currentPage);
      this.isLoading = false;
    } catch (err: any) {
      this.error = 'Failed to load PDF document';
      this.isLoading = false;
      console.error('Error loading PDF:', err);
    }
  }

  async renderPage(pageNum: number): Promise<void> {
    if (!this.pdfDoc) return;

    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: this.scale });

      const container = this.pdfContainer.nativeElement;
      container.innerHTML = '';

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      container.appendChild(canvas);

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      this.currentPage = pageNum;
    } catch (err) {
      console.error('Error rendering page:', err);
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.renderPage(page);
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.goToPage(this.currentPage - 1);
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.goToPage(this.currentPage + 1);
    }
  }

  zoomIn(): void {
    this.scale = Math.min(this.scale + 0.25, 3.0);
    this.renderPage(this.currentPage);
  }

  zoomOut(): void {
    this.scale = Math.max(this.scale - 0.25, 0.5);
    this.renderPage(this.currentPage);
  }

  resetZoom(): void {
    this.scale = 1.0;
    this.renderPage(this.currentPage);
  }

  goBack(): void {
    this.router.navigate(['/pdf-vault/search']);
  }

  onPageInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const page = parseInt(input.value, 10);
    if (!isNaN(page)) {
      this.goToPage(page);
    }
  }
}
