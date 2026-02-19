export interface PdfDocument {
  id: string;
  originalFileName: string;
  totalPages: number;
  uploadedAt: Date;
  status: string;
  tags: string[];
}

export interface PdfDocumentList {
  documents: PdfDocument[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface PageText {
  documentId: string;
  pageNumber: number;
  text: string;
  hasOcr: boolean;
}

export interface PdfTag {
  id: string;
  name: string;
}
