import { Component, OnInit, OnDestroy, ElementRef, ViewChild, ChangeDetectorRef, NgZone } from '@angular/core';
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
  @ViewChild('pdfScroller', { static: true }) pdfScroller!: ElementRef<HTMLDivElement>;

  document: PdfDocument | null = null;
  currentPage = 1;
  totalPages = 0;
  scale = 1.5;
  isLoading = true;
  error = '';

  private pdfDoc: any = null;
  private pageWrappers: HTMLDivElement[] = [];
  private renderedPages = new Set<number>();
  private observer!: IntersectionObserver;
  private scrollHandler!: () => void;
  private initialPage = 1;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private pdfVaultService: PdfVaultService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    const documentId = this.route.snapshot.paramMap.get('id');
    const pageParam = this.route.snapshot.queryParamMap.get('page');

    if (pageParam) {
      this.initialPage = parseInt(pageParam, 10) || 1;
      this.currentPage = this.initialPage;
    }

    if (documentId) {
      this.loadDocument(documentId);
    } else {
      this.error = 'No document ID provided';
      this.isLoading = false;
    }
  }

  ngOnDestroy(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.scrollHandler) {
      this.pdfScroller?.nativeElement?.removeEventListener('scroll', this.scrollHandler);
    }
    if (this.pdfDoc) {
      this.pdfDoc.destroy();
    }
  }

  async loadDocument(id: string): Promise<void> {
    try {
      this.pdfVaultService.getDocument(id).subscribe({
        next: (doc) => {
          this.document = doc;
          this.cdr.detectChanges();
        },
        error: (err) => console.error('Error loading document metadata:', err)
      });

      const pdfUrl = this.pdfVaultService.getDocumentFileUrl(id);
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      this.pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
      this.totalPages = this.pdfDoc.numPages;

      if (this.initialPage > this.totalPages) this.initialPage = this.totalPages;
      if (this.initialPage < 1) this.initialPage = 1;
      this.currentPage = this.initialPage;

      await this.buildAllPagePlaceholders();
      this.setupIntersectionObserver();
      this.setupScrollTracking();

      this.isLoading = false;
      this.cdr.detectChanges();

      // Scroll to initial page after layout settles
      setTimeout(() => this.scrollToPage(this.initialPage), 100);
    } catch (err: any) {
      this.error = 'Failed to load PDF document';
      this.isLoading = false;
      this.cdr.detectChanges();
      console.error('Error loading PDF:', err);
    }
  }

  private async buildAllPagePlaceholders(): Promise<void> {
    const container = this.pdfScroller.nativeElement;
    container.innerHTML = '';
    this.pageWrappers = [];
    this.renderedPages.clear();

    for (let i = 1; i <= this.totalPages; i++) {
      const page = await this.pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: this.scale });

      const wrapper = document.createElement('div');
      wrapper.className = 'page-wrapper';
      wrapper.dataset['pageNum'] = String(i);
      wrapper.style.width = `${viewport.width}px`;
      wrapper.style.height = `${viewport.height}px`;

      const label = document.createElement('div');
      label.className = 'page-label';
      label.textContent = `Page ${i}`;
      wrapper.appendChild(label);

      container.appendChild(wrapper);
      this.pageWrappers.push(wrapper);
    }
  }

  private setupIntersectionObserver(): void {
    const scroller = this.pdfScroller.nativeElement;

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = parseInt((entry.target as HTMLElement).dataset['pageNum']!, 10);
            if (!this.renderedPages.has(pageNum)) {
              this.renderPageCanvas(pageNum);
            }
          }
        });
      },
      { root: scroller, rootMargin: '600px 0px' }
    );

    this.pageWrappers.forEach((w) => this.observer.observe(w));
  }

  private setupScrollTracking(): void {
    const scroller = this.pdfScroller.nativeElement;
    this.scrollHandler = () => {
      const scrollerRect = scroller.getBoundingClientRect();
      const scrollerMid = scrollerRect.top + scrollerRect.height / 2;

      let closestPage = 1;
      let closestDist = Infinity;

      for (const w of this.pageWrappers) {
        const r = w.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        const dist = Math.abs(mid - scrollerMid);
        if (dist < closestDist) {
          closestDist = dist;
          closestPage = parseInt(w.dataset['pageNum']!, 10);
        }
      }

      if (closestPage !== this.currentPage) {
        this.ngZone.run(() => {
          this.currentPage = closestPage;
          this.cdr.detectChanges();
        });
      }
    };

    scroller.addEventListener('scroll', this.scrollHandler, { passive: true });
  }

  private async renderPageCanvas(pageNum: number): Promise<void> {
    if (this.renderedPages.has(pageNum)) return;
    this.renderedPages.add(pageNum);

    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: this.scale });
      const wrapper = this.pageWrappers[pageNum - 1];

      // Remove the placeholder label
      const label = wrapper.querySelector('.page-label');
      if (label) label.remove();

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.display = 'block';
      wrapper.appendChild(canvas);

      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context, viewport }).promise;
    } catch (err) {
      console.error(`Error rendering page ${pageNum}:`, err);
    }
  }

  async reRenderAllPages(): Promise<void> {
    if (!this.pdfDoc) return;

    const scrollerEl = this.pdfScroller.nativeElement;
    // Remember current scroll ratio
    const scrollRatio = scrollerEl.scrollTop / (scrollerEl.scrollHeight || 1);

    if (this.observer) this.observer.disconnect();

    await this.buildAllPagePlaceholders();
    this.setupIntersectionObserver();

    this.cdr.detectChanges();

    // Restore approximate scroll position
    requestAnimationFrame(() => {
      scrollerEl.scrollTop = scrollRatio * scrollerEl.scrollHeight;
    });
  }

  scrollToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    const wrapper = this.pageWrappers[page - 1];
    if (wrapper) {
      wrapper.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.scrollToPage(page);
      this.cdr.detectChanges();
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
    this.reRenderAllPages();
  }

  zoomOut(): void {
    this.scale = Math.max(this.scale - 0.25, 0.5);
    this.reRenderAllPages();
  }

  resetZoom(): void {
    this.scale = 1.5;
    this.reRenderAllPages();
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
