import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, timeout } from 'rxjs';
import { PdfDocument, PdfDocumentList, PageText, PdfTag } from '../models/document.model';
import { SearchResult, ImageDocument, ImageFindResult } from '../models/search.model';
import { environment } from '@/Core/Environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PdfVaultService {
  private baseUrl = environment.apis.pdfVault;

  constructor(private http: HttpClient) {}

  uploadDocument(file: File, tags: string[]): Observable<PdfDocument> {
    const formData = new FormData();
    formData.append('file', file);
    if (tags.length > 0) {
      formData.append('tags', tags.join(','));
    }
    return this.http.post<PdfDocument>(`${this.baseUrl}/documents`, formData).pipe(
      timeout(120000)
    );
  }

  getDocuments(page: number = 1, pageSize: number = 20): Observable<PdfDocumentList> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());
    return this.http.get<PdfDocumentList>(`${this.baseUrl}/documents`, { params });
  }

  getDocument(id: string): Observable<PdfDocument> {
    return this.http.get<PdfDocument>(`${this.baseUrl}/documents/${id}`);
  }

  getDocumentFileUrl(id: string): string {
    return `${this.baseUrl}/documents/${id}/file`;
  }

  getPageText(documentId: string, pageNumber: number): Observable<PageText> {
    return this.http.get<PageText>(`${this.baseUrl}/documents/${documentId}/pages/${pageNumber}/text`);
  }

  deleteDocument(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/documents/${id}`);
  }

  search(query?: string, tags?: string[], page: number = 1, pageSize: number = 20): Observable<SearchResult> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    if (query) {
      params = params.set('query', query);
    }
    if (tags && tags.length > 0) {
      params = params.set('tags', tags.join(','));
    }

    return this.http.get<SearchResult>(`${this.baseUrl}/search`, { params }).pipe(
      timeout(30000)
    );
  }

  getTags(): Observable<PdfTag[]> {
    return this.http.get<PdfTag[]>(`${this.baseUrl}/tags`);
  }

  // Image Vault
  uploadImage(file: File): Observable<ImageDocument> {
    const formData = new FormData();
    formData.append('image', file);
    return this.http.post<ImageDocument>(`${this.baseUrl}/image-vault`, formData).pipe(
      timeout(60000)
    );
  }

  findImage(file: File): Observable<ImageFindResult> {
    const formData = new FormData();
    formData.append('image', file);
    return this.http.post<ImageFindResult>(`${this.baseUrl}/image-vault/find`, formData).pipe(
      timeout(60000)
    );
  }

  getImageFileUrl(id: string): string {
    return `${this.baseUrl}/image-vault/${id}/file`;
  }
}
