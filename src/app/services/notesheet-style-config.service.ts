import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, switchMap, tap } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { NotesheetStyleConfig, defaultNotesheetStyle } from '@/models/notesheet-style-config.model';

interface ApiResult {
    statusCode: number;
    description: string;
    data: unknown;
}

const CACHE_PREFIX = 'ns_style_';

/**
 * Saved note-sheet style (font offset, signature gaps, page size). A note sheet uses the
 * style saved for it; without one, its type's default; without that, the built-in
 * defaults — the API resolves that order. localStorage keeps the last known row per note
 * sheet and per type, so a preview can render in the saved style before the request
 * returns, and when it fails.
 */
@Injectable({ providedIn: 'root' })
export class NotesheetStyleConfigService {
    private http = inject(HttpClient);
    private api = `${environment.apis.core}/NoteSheetStyleConfig`;

    /** Last known style for the note sheet, synchronously: its own cached row, else the
     *  type's, else built-in defaults. */
    cached(noteSheetType: string, noteSheetId?: number | null): NotesheetStyleConfig {
        const keys = noteSheetId ? [this.cacheKey(noteSheetType, noteSheetId), this.cacheKey(noteSheetType)] : [this.cacheKey(noteSheetType)];
        for (const key of keys) {
            try {
                const raw = localStorage.getItem(key);
                if (raw) return { ...defaultNotesheetStyle(noteSheetType), ...JSON.parse(raw), noteSheetType };
            } catch {
                /* ignore */
            }
        }
        return defaultNotesheetStyle(noteSheetType);
    }

    /** Fetches the style that applies to the note sheet (without an id: the type default).
     *  Falls back to the cache on error — never errors. */
    load(noteSheetType: string, noteSheetId?: number | null): Observable<NotesheetStyleConfig> {
        return this.http.get<NotesheetStyleConfig>(`${this.api}/GetByType/${encodeURIComponent(noteSheetType)}`, { params: this.idParams(noteSheetId) }).pipe(
            // Nothing saved (configId 0): use the client defaults, which differ per type.
            map((cfg) => (cfg?.configId ? { ...defaultNotesheetStyle(noteSheetType), ...cfg, noteSheetType } : defaultNotesheetStyle(noteSheetType))),
            tap((cfg) => {
                // The note sheet has no style of its own (any more): drop a stale copy.
                if (noteSheetId && !cfg.noteSheetId) this.removeCache(noteSheetType, noteSheetId);
                this.writeCache(cfg);
            }),
            catchError(() => of(this.cached(noteSheetType, noteSheetId)))
        );
    }

    /** Saves for config.noteSheetId, or as the type default when that is empty. */
    save(config: NotesheetStyleConfig): Observable<NotesheetStyleConfig> {
        return this.http.post<ApiResult>(`${this.api}/SaveUpdateAsyn`, config).pipe(
            map((res) => ({ ...config, ...((res?.data as Partial<NotesheetStyleConfig>) ?? {}) })),
            tap((saved) => this.writeCache(saved))
        );
    }

    /** Deletes the style saved for this one note sheet (other note sheets keep theirs) and
     *  returns the style that now applies to it. */
    reset(noteSheetType: string, noteSheetId: number): Observable<NotesheetStyleConfig> {
        return this.http.delete<ApiResult>(`${this.api}/DeleteAsyn/${encodeURIComponent(noteSheetType)}`, { params: this.idParams(noteSheetId) }).pipe(
            tap(() => this.removeCache(noteSheetType, noteSheetId)),
            switchMap(() => this.load(noteSheetType, noteSheetId))
        );
    }

    private idParams(noteSheetId?: number | null): Record<string, string> {
        return noteSheetId ? { noteSheetId: String(noteSheetId) } : {};
    }

    private cacheKey(noteSheetType: string, noteSheetId?: number | null): string {
        return noteSheetId ? `${CACHE_PREFIX}${noteSheetType}_${noteSheetId}` : CACHE_PREFIX + noteSheetType;
    }

    private writeCache(cfg: NotesheetStyleConfig): void {
        try {
            localStorage.setItem(this.cacheKey(cfg.noteSheetType, cfg.noteSheetId), JSON.stringify(cfg));
        } catch {
            /* ignore */
        }
    }

    private removeCache(noteSheetType: string, noteSheetId?: number | null): void {
        try {
            localStorage.removeItem(this.cacheKey(noteSheetType, noteSheetId));
        } catch {
            /* ignore */
        }
    }
}
