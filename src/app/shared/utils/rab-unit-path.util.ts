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
