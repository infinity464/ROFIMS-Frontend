import { Injectable } from '@angular/core';

/**
 * When navigating from Draft list "Update" we fetch the note sheet to determine type (and to pass to the form).
 * The form uses this cache so it gets data even if the edit API call would return empty.
 */
@Injectable({ providedIn: 'root' })
export class NoteSheetEditCacheService {
  private cache: { id: number; data: any } | null = null;

  set(id: number, data: any): void {
    this.cache = { id, data };
  }

  /** Returns cached data for this id and removes it (one-time use). */
  get(id: number): any | null {
    if (this.cache && this.cache.id === id) {
      const data = this.cache.data;
      this.cache = null;
      return data;
    }
    return null;
  }

  clear(): void {
    this.cache = null;
  }
}
