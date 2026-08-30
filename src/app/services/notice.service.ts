import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

export type NoticeAudienceType = 'All' | 'Specific';

/** Read/grid projection of a notice (mirrors backend NoticeListDto). */
export interface NoticeListDto {
    noticeId: number;
    topic: string;
    details: string;
    expireDate?: string | null;
    audienceType: NoticeAudienceType;
    tags: string[];
    isComplete: boolean;
    isActive: boolean;
    createdDate?: string;
    createdBy?: string;
    /** Publisher display name (Rank + English name), resolved server-side. */
    createdByName?: string;
    recipientUserIds?: string[];
    /** Attached files as a JSON array string of { FileId, fileName }. */
    filesReferences?: string | null;
}

/** Create/update payload (mirrors backend NoticeSaveDto). */
export interface NoticeSaveDto {
    noticeId: number;
    topic: string;
    details: string;
    expireDate?: string | null;
    audienceType: NoticeAudienceType;
    tags: string[];
    isComplete: boolean;
    recipientUserIds: string[];
    /** Attached files as a JSON array string of { FileId, fileName }. */
    filesReferences?: string | null;
    /** When true (default), publishing notifies the audience; when false, saved silently. */
    sendNotification?: boolean;
}

export interface ResultViewModel {
    statusCode?: number;
    StatusCode?: number;
    description?: string;
    Description?: string;
    data?: unknown;
}

@Injectable({ providedIn: 'root' })
export class NoticeService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apis.core}/Notice`;

    private normalize(r: any): NoticeListDto {
        return {
            noticeId: r.noticeId ?? r.NoticeId ?? 0,
            topic: r.topic ?? r.Topic ?? '',
            details: r.details ?? r.Details ?? '',
            expireDate: r.expireDate ?? r.ExpireDate ?? null,
            audienceType: (r.audienceType ?? r.AudienceType ?? 'All') as NoticeAudienceType,
            tags: r.tags ?? r.Tags ?? [],
            isComplete: r.isComplete ?? r.IsComplete ?? false,
            isActive: r.isActive ?? r.IsActive ?? false,
            createdDate: r.createdDate ?? r.CreatedDate,
            createdBy: r.createdBy ?? r.CreatedBy,
            createdByName: r.createdByName ?? r.CreatedByName,
            recipientUserIds: r.recipientUserIds ?? r.RecipientUserIds ?? [],
            filesReferences: r.filesReferences ?? r.FilesReferences ?? null
        };
    }

    getAll(): Observable<NoticeListDto[]> {
        return this.http.get<NoticeListDto[]>(`${this.apiUrl}/GetAll`).pipe(
            map((res: unknown) => (Array.isArray(res) ? res.map((r) => this.normalize(r)) : []))
        );
    }

    getForCurrentUser(): Observable<NoticeListDto[]> {
        return this.http.get<NoticeListDto[]>(`${this.apiUrl}/GetForCurrentUser`).pipe(
            map((res: unknown) => (Array.isArray(res) ? res.map((r) => this.normalize(r)) : []))
        );
    }

    save(model: NoticeSaveDto): Observable<ResultViewModel> {
        return this.http.post<ResultViewModel>(`${this.apiUrl}/SaveAsyn`, model);
    }

    update(model: NoticeSaveDto): Observable<ResultViewModel> {
        return this.http.post<ResultViewModel>(`${this.apiUrl}/UpdateAsyn`, model);
    }

    deactivate(noticeId: number): Observable<ResultViewModel> {
        return this.http.post<ResultViewModel>(`${this.apiUrl}/DeactivateAsyn/${noticeId}`, {});
    }

    delete(noticeId: number): Observable<ResultViewModel> {
        return this.http.delete<ResultViewModel>(`${this.apiUrl}/DeleteAsyn/${noticeId}`);
    }
}
