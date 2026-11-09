import type { VwPreviousRABServiceInfoModel } from '@/services/previous-rab-service.service';

/** The member's currently-active Previous RAB Service row, if any. */
export function findActiveRabService(rows: VwPreviousRABServiceInfoModel[] | null | undefined): VwPreviousRABServiceInfoModel | undefined {
    return (Array.isArray(rows) ? rows : [])
        .find((r) => (r.isCurrentlyActive as any) === true || (r.isCurrentlyActive as any) === 1);
}

/** Present RAB unit as the full hierarchy path (Unit, Wing, Branch, Sub-branch, Section,
 *  Sub-section). Bangla falls back to English per level when the BN name is missing. */
export function buildRabUnitPath(row: VwPreviousRABServiceInfoModel | undefined | null, bn: boolean): string {
    if (!row) return '';
    const lvl = (en?: string | null, bnName?: string | null): string =>
        (bn ? ((bnName ?? '').trim() || (en ?? '').trim()) : (en ?? '').trim());
    return [
        lvl(row.rabUnitName, row.rabUnitNameBN),
        lvl(row.rabWingName, row.rabWingNameBN),
        lvl(row.rabBranchName, row.rabBranchNameBN),
        lvl(row.rabSubBranchName, row.rabSubBranchNameBN),
        lvl(row.rabSectionName, row.rabSectionNameBN),
        lvl(row.rabSubSectionName, row.rabSubSectionNameBN)
    ].filter((p) => p !== '').join(', ');
}

/**
 * Drop the approved transfer destination from a '/'-joined previous-RAB-service
 * chain (the পূর্ববতী কর্মস্থল column).
 *
 * The chain is built oldest → present. The destination posting may already be
 * recorded as its newest entry (e.g. once the transfer is approved), and that
 * entry does not belong under পূর্ববতী কর্মস্থল — so only the LAST segment that
 * matches is removed. Every earlier occurrence stays: if the member served at
 * that unit before (SRB-2 → SRB-3 → SRB-2), the earlier SRB-2 is real history.
 *
 * The currently-active posting is intentionally NOT passed here — it is the
 * workplace being left, so it stays in the column.
 *
 * Each `omit` entry may be a single node name or a full comma-separated unit
 * path. A chain segment matches when it equals either form (ignoring whitespace
 * and zero-width characters) or when its own deepest (last comma) node does.
 */
export function omitCurrentFromRabChain(chain: string | null | undefined, omit: (string | null | undefined)[]): string {
    if (!chain) return '';
    const norm = (v: string | null | undefined): string =>
        (v ?? '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const deepest = (v: string): string => v.split(',').pop()?.trim() ?? v;

    const blocked = new Set<string>();
    for (const raw of omit) {
        const value = norm(raw);
        if (!value) continue;
        blocked.add(value);
        blocked.add(norm(deepest(value)));
    }

    const parts = chain.split('/').map((part) => part.replace(/[\u200B-\u200D\uFEFF]/g, '').trim());

    // Rightmost matching entry = the most recent posting; drop only that one.
    let dropIndex = -1;
    for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        if (!part) continue;
        if (blocked.has(norm(part)) || blocked.has(norm(deepest(part)))) {
            dropIndex = i;
            break;
        }
    }

    return parts.filter((part, i) => part && i !== dropIndex).join('/ ');
}
