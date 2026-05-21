/**
 * Shared helpers for the access-scope chip + export config on every report
 * under /employee-reports. Components that want the unit / member-type chip
 * + the landscape export and preDateLines treatment should:
 *
 *  1. Store the most recent `accessibleScope` from the report response.
 *  2. Bind the template chips through `unitScopeLine()` / `memberTypeScopeLine()`.
 *  3. Read `statusLocked()` to drive `[disabled]` on the PostingStatus dropdown.
 *  4. Spread `buildExportConfig(...)` into their existing `ReportConfig` (or
 *     pass `preDateLines` and `landscape: true` explicitly) so PDF / Print /
 *     Word / Excel mirror the on-screen header.
 *
 * Single source of truth for the scope chip semantics — keeps every report
 * looking the same and avoids drift.
 */

import type { ReportAccessibleScope } from '@/models/report.model';

export type ScopeLang = 'en' | 'bn';

/**
 * Unit-scope line — rendered ABOVE the date so the picked org-tree nodes
 * read close to the title. Bare comma-separated list (no "Units:" prefix).
 * Null when unrestricted on this axis.
 */
export function unitScopeLine(
  scope: ReportAccessibleScope | null | undefined,
  lang: ScopeLang
): string | null {
  if (!scope) return null;
  const names = (lang === 'bn' ? scope.rabUnitNamesBN : scope.rabUnitNames) ?? scope.rabUnitNames;
  if (!names || names.length === 0) return null;
  return names.join(', ');
}

/**
 * Member-type scope line — rendered BELOW the date with the "Member Types:"
 * prefix. Null when unrestricted on this axis.
 */
export function memberTypeScopeLine(
  scope: ReportAccessibleScope | null | undefined,
  lang: ScopeLang
): string | null {
  if (!scope) return null;
  const names = (lang === 'bn' ? scope.memberTypeNamesBN : scope.memberTypeNames) ?? scope.memberTypeNames;
  if (!names || names.length === 0) return null;
  const label = lang === 'bn' ? 'সদস্য ধরণ' : 'Member Types';
  return `${label}: ${names.join(', ')}`;
}

/**
 * True when the caller has org-tree restrictions configured. The component
 * should `[disabled]` the PostingStatus dropdown and pin its value to
 * "Servings" — the backend will hard-override anyway, this just keeps the
 * UI honest.
 */
export function statusLocked(scope: ReportAccessibleScope | null | undefined): boolean {
  return scope?.orgScopeRestricted === true;
}

/**
 * Builds the scope arrays for the export header so PDF / Print / Word / Excel
 * banners read:
 *
 *    REPORT TITLE
 *    Unit A, Wing 1                          <- preDateLines (above date)
 *    21 MAY 2026                             <- export service injects the date
 *    Member Types: Civil, ORs  |  filter1    <- filterLines (below date)
 *
 * Spread the returned `preDateLines` and `filterLines` into your existing
 * `ReportConfig` (or pass directly into `ExportService.export*`). Also flip
 * `landscape: true` on the config — every scope-aware report under
 * /employee-reports renders 10+ columns and clips in portrait.
 */
export function buildScopeExportLines(
  scope: ReportAccessibleScope | null | undefined,
  lang: ScopeLang,
  applied: string[]
): { preDateLines: string[]; filterLines: string[] } {
  const preDate: string[] = [];
  const unit = unitScopeLine(scope, lang);
  if (unit) preDate.push(unit);

  const belowDate: string[] = [];
  const mt = memberTypeScopeLine(scope, lang);
  if (mt) belowDate.push(mt);

  return {
    preDateLines: preDate,
    filterLines: [...belowDate, ...applied],
  };
}
