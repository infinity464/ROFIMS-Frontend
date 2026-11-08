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
 * Drop the present posting and the new transfer destination from a '/'-joined
 * previous-RAB-service chain (the পূর্ববতী কর্মস্থল column).
 *
 * The view builds the chain oldest → present, so the member's currently-active
 * posting is its last element; the new transfer posting may also already be
 * recorded there. Neither is a *previous* workplace, so both are omitted.
 *
 * Each `omit` entry may be a single node name or a full comma-separated unit
 * path. A chain segment is removed when it equals either form (ignoring
 * whitespace and zero-width characters) or when its own deepest (last comma)
 * node does.
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

    return chain
        .split('/')
        .map((part) => part.replace(/[\u200B-\u200D\uFEFF]/g, '').trim())
        .filter((part) => part && !blocked.has(norm(part)) && !blocked.has(norm(deepest(part))))
        .join('/ ');
}
