import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CardModule } from 'primeng/card';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { PdfVaultService } from '../services/pdf-vault.service';
import { PdfDocument } from '../models/document.model';

@Component({
  selector: 'app-pdf-document-list',
  standalone: true,
  imports: [CommonModule, CardModule, TableModule, ButtonModule, TagModule, ConfirmDialogModule, ToastModule],
  providers: [ConfirmationService, MessageService],
  templateUrl: './pdf-document-list.component.html',
  styleUrl: './pdf-document-list.component.scss'
})
export class PdfDocumentListComponent implements OnInit {
  documents: PdfDocument[] = [];
  totalCount = 0;
  first = 0;
  pageSize = 20;
  isLoading = true;
  error = '';
  private initialLoadDone = false;

  constructor(
    private pdfVaultService: PdfVaultService,
    private router: Router,
    private confirmationService: ConfirmationService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.loadDocuments(1);
  }

  onPageChange(event: TableLazyLoadEvent): void {
    // Skip the initial lazy load event since ngOnInit already loads page 1
    if (!this.initialLoadDone) {
      return;
    }
    const first = event.first ?? 0;
    const rows = event.rows ?? this.pageSize;
    this.first = first;
    this.pageSize = rows;
    const page = Math.floor(first / rows) + 1;
    this.loadDocuments(page);
  }

  loadDocuments(page: number): void {
    this.isLoading = true;

    this.pdfVaultService.getDocuments(page, this.pageSize).subscribe({
      next: (result) => {
        this.documents = result.documents;
        this.totalCount = result.totalCount;
        this.isLoading = false;
        this.initialLoadDone = true;
      },
      error: (err) => {
        this.error = 'Failed to load documents';
        this.isLoading = false;
        this.initialLoadDone = true;
        console.error('Error loading documents:', err);
      }
    });
  }

  viewDocument(doc: PdfDocument): void {
    this.router.navigate(['/pdf-vault/view', doc.id]);
  }

  deleteDocument(doc: PdfDocument, event: Event): void {
    event.stopPropagation();
    this.confirmationService.confirm({
      target: event.target as EventTarget,
      message: `Are you sure you want to delete "${doc.originalFileName}"?`,
      header: 'Delete Confirmation',
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
      acceptButtonProps: { label: 'Delete', severity: 'danger' },
      accept: () => {
        const page = Math.floor(this.first / this.pageSize) + 1;
        this.pdfVaultService.deleteDocument(doc.id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Document deleted successfully' });
            this.loadDocuments(page);
          },
          error: (err) => {
            console.error('Error deleting document:', err);
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete document' });
          }
        });
      }
    });
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
}
