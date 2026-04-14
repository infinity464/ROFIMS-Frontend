import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { PagedResponse } from '@/Core/Models/Pagination';

export type SearchCategory = 'Employee' | 'OfficeManagement';

export interface FieldOption {
    label: string;
    value: any;
}

export interface SearchFieldDefinition {
    fieldKey: string;
    displayLabel: string;
    displayLabelBN: string;
    fieldType: 'Text' | 'ExactId' | 'DateRange';
    category: SearchCategory;
    entityProperty: string;
    codeType: string | null;
    isStringId: boolean;
    options: FieldOption[] | null;
}

export interface DynamicSearchCriterion {
    fieldKey: string;
    textValue?: string;
    idValue?: number | null;
    stringIdValue?: string;
    dateFrom?: string | null;
    dateTo?: string | null;
}

export interface DynamicSearchRequest {
    category: SearchCategory;
    pagination: { page_no: number; row_per_page: number };
    criteria: DynamicSearchCriterion[];
    postingStatusFilter?: string | null;
}

@Injectable({
    providedIn: 'root'
})
export class DynamicSearchService {
    private readonly apiUrl = `${environment.apis.core}/DynamicSearch`;

    constructor(private http: HttpClient) {}

    getSearchFields(category: SearchCategory): Observable<SearchFieldDefinition[]> {
        const params = new HttpParams().set('category', category);
        return this.http.get<SearchFieldDefinition[]>(`${this.apiUrl}/GetSearchFields`, { params });
    }

    search(request: DynamicSearchRequest): Observable<PagedResponse<any>> {
        return this.http.post<PagedResponse<any>>(`${this.apiUrl}/Search`, request);
    }
}
