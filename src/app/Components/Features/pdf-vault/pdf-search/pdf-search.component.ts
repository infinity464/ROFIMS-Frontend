import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PdfVaultService } from '../services/pdf-vault.service';
import { SearchResult, SearchResultItem } from '../models/search.model';
import { PdfTag } from '../models/document.model';

@Component({
  selector: 'app-pdf-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pdf-search.component.html',
  styleUrl: './pdf-search.component.scss'
})
export class PdfSearchComponent implements OnInit {
  searchQuery = '';
  selectedTags: string[] = [];
  availableTags: PdfTag[] = [];
  searchResult: SearchResult | null = null;
  isSearching = false;
  searchError = '';
  currentPage = 1;
  pageSize = 20;

  constructor(
    private pdfVaultService: PdfVaultService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadTags();
  }

  loadTags(): void {
    this.pdfVaultService.getTags().subscribe({
      next: (tags) => this.availableTags = tags,
      error: (err) => console.error('Error loading tags:', err)
    });
  }

  toggleTag(tagName: string): void {
    const index = this.selectedTags.indexOf(tagName);
    if (index > -1) {
      this.selectedTags.splice(index, 1);
    } else {
      this.selectedTags.push(tagName);
    }
  }

  isTagSelected(tagName: string): boolean {
    return this.selectedTags.includes(tagName);
  }

  search(page: number = 1): void {
    if (!this.searchQuery.trim() && this.selectedTags.length === 0) {
      this.searchError = 'Please enter a search query or select tags';
      return;
    }

    this.isSearching = true;
    this.searchError = '';
    this.currentPage = page;

    this.pdfVaultService.search(
      this.searchQuery.trim() || undefined,
      this.selectedTags.length > 0 ? this.selectedTags : undefined,
      page,
      this.pageSize
    ).subscribe({
      next: (result) => {
        this.searchResult = result;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isSearching = false;
        this.searchError = err.error?.message || err.message || 'Search failed';
        console.error('Search error:', err);
        this.cdr.detectChanges();
      },
      complete: () => {
        this.isSearching = false;
        this.cdr.detectChanges();
      }
    });
  }

  openDocument(item: SearchResultItem): void {
    this.router.navigate(['/pdf-vault/view', item.documentId], {
      queryParams: { page: item.pageNumber }
    });
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.selectedTags = [];
    this.searchResult = null;
    this.searchError = '';
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= (this.searchResult?.totalPages || 1)) {
      this.search(page);
    }
  }

  getPageNumbers(): number[] {
    if (!this.searchResult) return [];
    const total = this.searchResult.totalPages;
    const current = this.currentPage;
    const pages: number[] = [];

    for (let i = Math.max(1, current - 2); i <= Math.min(total, current + 2); i++) {
      pages.push(i);
    }
    return pages;
  }
}
