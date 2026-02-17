export interface SearchRequest {
  query?: string;
  tags?: string[];
  page: number;
  pageSize: number;
}

export interface SearchResult {
  items: SearchResultItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SearchResultItem {
  documentId: string;
  fileName: string;
  pageNumber: number;
  snippet: string;
  score: number;
  tags: string[];
}

export interface ImageDocument {
  id: string;
  originalFileName: string;
  fileSize: number;
  uploadedAt: string;
}

export interface ImageDocumentList {
  images: ImageDocument[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface ImageFindResult {
  found: boolean;
  image?: ImageDocument;
}
