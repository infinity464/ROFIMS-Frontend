import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PdfVaultService } from '../services/pdf-vault.service';
import { PdfDocument } from '../models/document.model';

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pdf-viewer.component.html',
  styleUrl: './pdf-viewer.component.scss'
})
export class PdfViewerComponent implements OnInit, OnDestroy {
  document: PdfDocument | null = null;
  pdfUrl: SafeResourceUrl | null = null;
  isLoading = true;
  error = '';

  private blobUrl: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private pdfVaultService: PdfVaultService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    const documentId = this.route.snapshot.paramMap.get('id');
    const pageParam = this.route.snapshot.queryParamMap.get('page');
    const page = pageParam ? parseInt(pageParam, 10) || 1 : 1;

    if (documentId) {
      this.loadDocument(documentId, page);
    } else {
      this.error = 'No document ID provided';
      this.isLoading = false;
    }
  }

  ngOnDestroy(): void {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
    }
  }

  loadDocument(id: string, page: number): void {
    this.pdfVaultService.getDocument(id).subscribe({
      next: (doc) => this.document = doc,
      error: (err) => console.error('Error loading document metadata:', err)
    });

    // Fetch as blob so the browser displays it inline instead of downloading
    const fileUrl = this.pdfVaultService.getDocumentFileUrl(id);
    this.http.get(fileUrl, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        this.blobUrl = URL.createObjectURL(pdfBlob);
        this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`${this.blobUrl}#page=${page}`);
        this.isLoading = false;
      },
      error: (err) => {
        this.error = 'Failed to load PDF document';
        this.isLoading = false;
        console.error('Error loading PDF:', err);
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/pdf-vault/search']);
  }

  goToDocuments(): void {
    this.router.navigate(['/pdf-vault/documents']);
  }
}
