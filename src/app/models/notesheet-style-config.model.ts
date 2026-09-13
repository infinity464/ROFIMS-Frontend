/**
 * Saved print / Word style for one note-sheet type — mirrors the C# entity
 * rab.Models.NoteSheetStyleConfig (one row per NoteSheetType).
 */
export interface NotesheetStyleConfig {
    configId: number;
    noteSheetType: string;
    /** Points added to every base font size (-2 … +2). */
    fontDelta: number;
    defaultPageSize: 'A4' | 'Legal';
    /** Blank space below each approver block except the last = px + em (em follows the font size). */
    approverGapPx: number;
    approverGapEm: number;
    /** Space above the signature date line, in em. */
    sigDateGapEm: number;
    /** Space between the body text and the initiator's signature block. */
    initiatorTopMarginPx: number;
    /** Height reserved for an approver block, signed or not. */
    approverMinHeightPx: number;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
}

/** Must match NoteSheetStyleConfigDefaults.cs and the var() fallbacks in the preview SCSS. */
export const DEFAULT_NOTESHEET_STYLE: Omit<NotesheetStyleConfig, 'noteSheetType'> = {
    configId: 0,
    fontDelta: 0,
    defaultPageSize: 'Legal',
    approverGapPx: 24,
    approverGapEm: 6.25,
    sigDateGapEm: 1,
    initiatorTopMarginPx: 25,
    approverMinHeightPx: 45
};

export function defaultNotesheetStyle(noteSheetType: string): NotesheetStyleConfig {
    return { ...DEFAULT_NOTESHEET_STYLE, noteSheetType };
}
