import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { PdfVaultService } from '../services/pdf-vault.service';
import { PdfDocument } from '../models/document.model';

@Component({
  selector: 'app-pdf-document-list',
  standalone: true,
  imports: [CommonModule, CardModule, TableModule, ButtonModule, TagModule],
  templateUrl: './pdf-document-list.component.html',
  styleUrl: './pdf-document-list.component.scss'
})
export class PdfDocumentListComponent implements OnInit {
  documents: PdfDocument[] = [];
  totalCount = 0;
  currentPage = 1;
  pageSize = 20;
  totalPages = 0;
  isLoading = true;
  error = '';

  constructor(
    private pdfVaultService: PdfVaultService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadDocuments();
  }

  loadDocuments(page: number = 1): void {
    this.isLoading = true;
    this.currentPage = page;

    this.pdfVaultService.getDocuments(page, this.pageSize).subscribe({
      next: (result) => {
        this.documents = result.documents;
        this.totalCount = result.totalCount;
        this.totalPages = Math.ceil(result.totalCount / this.pageSize);
        this.isLoading = false;
      },
      error: (err) => {
        this.error = 'Failed to load documents';
        this.isLoading = false;
        console.error('Error loading documents:', err);
      }
    });
  }

  viewDocument(doc: PdfDocument): void {
    this.router.navigate(['/pdf-vault/view', doc.id]);
  }

  deleteDocument(doc: PdfDocument, event: Event): void {
    event.stopPropagation();
    if (confirm(`Are you sure you want to delete "${doc.originalFileName}"?`)) {
      this.pdfVaultService.deleteDocument(doc.id).subscribe({
        next: () => {
          this.loadDocuments(this.currentPage);
        },
        error: (err) => {
          console.error('Error deleting document:', err);
          alert('Failed to delete document');
        }
      });
    }
  }

  getStatusSeverity(status: string): "success" | "info" | "warn" | "danger" | "secondary" | "contrast" | undefined {
    switch (status.toLowerCase()) {
      case 'ready': return 'success';
      case 'pending': return 'warn';
      case 'processing': return 'info';
      case 'error': return 'danger';
      default: return 'secondary';
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.loadDocuments(page);
    }
  }
}
