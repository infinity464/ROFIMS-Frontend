/**
 * Saved print / Word style — mirrors the C# entity rab.Models.NoteSheetStyleConfig: the
 * default for a note-sheet type (noteSheetId empty) or the style of one note sheet.
 */
export interface NotesheetStyleConfig {
    configId: number;
    noteSheetType: string;
    /** Set when this is a note sheet's own style; empty for the type default / built-in defaults. */
    noteSheetId?: number | null;
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

/** Types whose preview spaces its signature blocks differently from the posting sheet. */
const TYPE_DEFAULTS: Record<string, Partial<NotesheetStyleConfig>> = {
    General: { defaultPageSize: 'A4', approverGapPx: 24, approverGapEm: 0, sigDateGapEm: 2, initiatorTopMarginPx: 24, approverMinHeightPx: 90 },
    ExBDLeave: { approverGapPx: 24, approverGapEm: 6.25, sigDateGapEm: 2, initiatorTopMarginPx: 40, approverMinHeightPx: 90 }
};

export function defaultNotesheetStyle(noteSheetType: string): NotesheetStyleConfig {
    return { ...DEFAULT_NOTESHEET_STYLE, ...(TYPE_DEFAULTS[noteSheetType] ?? {}), noteSheetType };
}
