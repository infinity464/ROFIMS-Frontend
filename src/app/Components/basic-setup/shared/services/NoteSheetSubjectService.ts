import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { PagedResponse } from '@/Core/Models/Pagination';

export interface NoteSheetSubjectModel {
    id: number;
    noteSheetType: string;
    subjectEN: string;
    subjectBN: string;
    status: boolean;
    isClearanceSubject?: boolean;
}

@Injectable({ providedIn: 'root' })
export class NoteSheetSubjectService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apis.core}/NoteSheetSubject`;

    /** Paged grid. noteSheetType empty = all three types. */
    getPaged(noteSheetType: string, search: string, pageNo: number, pageSize: number): Observable<PagedResponse<NoteSheetSubjectModel>> {
        let params = `page_no=${pageNo}&row_per_page=${pageSize}`;
        if (noteSheetType) params += `&noteSheetType=${encodeURIComponent(noteSheetType)}`;
        if (search) params += `&searchValue=${encodeURIComponent(search)}`;
        return this.http.get<PagedResponse<NoteSheetSubjectModel>>(`${this.apiUrl}/GetPaginated?${params}`);
    }

    /** Active subjects for a given note-sheet type (consumer dropdowns). */
    getActiveByType(noteSheetType: string): Observable<NoteSheetSubjectModel[]> {
        return this.http.get<NoteSheetSubjectModel[]>(`${this.apiUrl}/GetActiveByType/${encodeURIComponent(noteSheetType)}`);
    }

    create(model: Partial<NoteSheetSubjectModel>): Observable<any> {
        return this.http.post(`${this.apiUrl}/Save`, model);
    }

    update(model: Partial<NoteSheetSubjectModel>): Observable<any> {
        return this.http.put(`${this.apiUrl}/Update`, model);
    }

    delete(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/Delete/${id}`);
    }
}
