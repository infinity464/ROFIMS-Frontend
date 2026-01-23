export interface PageInfo {
  rows: number;
  totalPages: number;
}

export interface PagedResponse<T> {
  datalist: T[];
  pages: PageInfo;
}

