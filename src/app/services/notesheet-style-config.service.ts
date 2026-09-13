import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { NotesheetStyleConfig, defaultNotesheetStyle } from '@/models/notesheet-style-config.model';

interface ApiResult {
    statusCode: number;
    description: string;
    data: unknown;
}

const CACHE_PREFIX = 'ns_style_';

/**
 * Saved note-sheet style (font offset, signature gaps, page size) per note-sheet type.
 * The API is the source of truth; localStorage keeps the last known value so a preview
 * can render in the saved style before the request returns, and when it fails.
 */
@Injectable({ providedIn: 'root' })
export class NotesheetStyleConfigService {
    private http = inject(HttpClient);
    private api = `${environment.apis.core}/NoteSheetStyleConfig`;

    /** Last known style for the type, synchronously: cache, else built-in defaults. */
    cached(noteSheetType: string): NotesheetStyleConfig {
        try {
            const raw = localStorage.getItem(CACHE_PREFIX + noteSheetType);
            if (raw) return { ...defaultNotesheetStyle(noteSheetType), ...JSON.parse(raw), noteSheetType };
        } catch {
            /* ignore */
        }
        return defaultNotesheetStyle(noteSheetType);
    }

    /** Fetches the saved style (or server defaults). Falls back to the cache on error — never errors. */
    load(noteSheetType: string): Observable<NotesheetStyleConfig> {
        return this.http.get<NotesheetStyleConfig>(`${this.api}/GetByType/${encodeURIComponent(noteSheetType)}`).pipe(
            map((cfg) => ({ ...defaultNotesheetStyle(noteSheetType), ...(cfg ?? {}), noteSheetType })),
            tap((cfg) => this.writeCache(cfg)),
            catchError(() => of(this.cached(noteSheetType)))
        );
    }

    save(config: NotesheetStyleConfig): Observable<NotesheetStyleConfig> {
        return this.http.post<ApiResult>(`${this.api}/SaveUpdateAsyn`, config).pipe(
            map((res) => ({ ...config, ...((res?.data as Partial<NotesheetStyleConfig>) ?? {}) })),
            tap((saved) => this.writeCache(saved))
        );
    }

    /** Deletes the saved row so the type is back on the built-in defaults. */
    reset(noteSheetType: string): Observable<NotesheetStyleConfig> {
        return this.http.delete<ApiResult>(`${this.api}/DeleteAsyn/${encodeURIComponent(noteSheetType)}`).pipe(
            map(() => defaultNotesheetStyle(noteSheetType)),
            tap((cfg) => this.writeCache(cfg))
        );
    }

    private writeCache(cfg: NotesheetStyleConfig): void {
        try {
            localStorage.setItem(CACHE_PREFIX + cfg.noteSheetType, JSON.stringify(cfg));
        } catch {
            /* ignore */
        }
    }
}
