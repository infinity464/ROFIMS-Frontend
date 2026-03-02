import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '@/Core/Environments/environment';
import { NoteSheetType } from '@/models/enums';

// Re-export the interface so existing code that imports it here still works
export type { NoteSheetInfoFull } from './notesheet-preview-base';

/**
 * Fallback dispatcher: reads the notesheet type from the API, then
 * redirects to the correct type-specific preview route.
 * Direct navigation should use /notesheet-preview/general|posting|exbd instead.
 */
@Component({
    selector: 'app-notesheet-preview',
    standalone: true,
    imports: [],
    template: `<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#666">Redirecting...</div>`
})
export class NotesheetPreviewComponent implements OnInit {
    private readonly api = `${environment.apis.core}/NoteSheetInfo`;

    constructor(
        private http: HttpClient,
        private route: ActivatedRoute,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.route.queryParams.subscribe(params => {
            const id = params['id'];
            if (!id) { this.router.navigate(['/notesheet-list/draft']); return; }

            this.http.get<{ noteSheetType?: string }[]>(`${this.api}/GetFilteredByKeysAsyn/${id}`).subscribe({
                next: (data) => {
                    const type = (Array.isArray(data) ? data[0] : null)?.noteSheetType;
                    let route = '/notesheet-preview/general';
                    if (type === NoteSheetType.ExBDLeave) route = '/notesheet-preview/exbd';
                    else if (type === NoteSheetType.NewPosting || type === NoteSheetType.InterPosting) route = '/notesheet-preview/posting';
                    this.router.navigate([route], { queryParams: { id }, replaceUrl: true });
                },
                error: () => this.router.navigate(['/notesheet-preview/general'], { queryParams: { id }, replaceUrl: true })
            });
        });
    }
}
