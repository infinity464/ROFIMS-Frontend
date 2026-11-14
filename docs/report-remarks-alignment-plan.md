# Plan: match report remarks to member-type reporting

Date: 2026-11-14
Status: implemented; manual verification pending. Builds and tests were skipped at the user's request.

## Implementation record

- Added conditional combined-remarks enrichment to the four target repository methods, reusing `EnrichAllRemarksAsync` and its existing page-scoped query.
- Updated all five reports to request `allRemarks` through their existing `rmks` display column and retain both English and Bangla values.
- Added a shared remarks utility and row interface for language selection and line splitting.
- Updated screen, print, Word, and Excel rendering to follow the reference report's combined-remarks behavior.
- Kept existing additional-only `rmks` API handling for other callers. No database or permission migration was changed.
- No field-registry changes were needed: these endpoints accept requested column keys and enrich the projected rows separately, as the reference report already does.
- Reviewed source changes only. Builds, automated tests, browser checks, and live database verification are left for the user's manual validation.

## Objective

Replace the existing Remark column content in these reports with the same combined, language-aware remarks shown in `/member-type-reporting`:

| Target route | Frontend component | Current dynamic API method / repository method |
| --- | --- | --- |
| `/report-unit-duration-nominal-roll` | `report-unit-duration-nominal-roll` | `runDynamicUnitDurationReport` / `RunUnitDurationAsync` |
| `/report-long-stay-nominal-roll` | `report-long-stay-nominal-roll` | `runDynamicLongStayReport` / `RunLongStayAsync` |
| `/report-stay-after-reliever-joined` | `report-stay-after-reliever-joined` | `runDynamicLongStayReport` / `RunLongStayAsync` |
| `/report-rank-wise` | `report-rank-wise` | `runDynamicRankWiseReport` / `RunRankWiseAsync` |
| `/report-present-status` | `report-present-status` | `runDynamicPresentStatusReport` / `RunPresentStatusAsync` |

Apply the change to the screen table, print output, Word export, and Excel export.

## Findings from the current code

- The reference component is `src/app/Components/Features/employee-reports/report-member-type-serving/report-member-type-serving.component.ts`.
- It requests `allRemarks` through `runDynamicEmployeeBaseReport`, adapts both `allRemarks` and `allRemarksBN`, and selects the displayed value using the current report language.
- Its `remarksCellValue` and `remarksLines` methods provide the text for screen and export rendering. Multiple remarks appear on separate lines, with bullets supplied by the backend.
- In `../rofims/rab.Repository/Repositories/DynamicReportQuery.cs`, `EnrichAllRemarksAsync` already reads `vw_MemberAllRemarks` in one query scoped to the returned employees. It produces both language variants.
- The combined content is ordered as: present status, posted out, inter-posting joining, leave, temporary movement, Formal/Clearance office order, RTU office order, and non-confidential additional remarks.
- The five targets currently request and render `rmks`. Their four repository methods call `EnrichAdditionalRemarksAsync`, which only supplies non-confidential additional remarks. Consequently, members with other remark types can have a blank cell in these reports while the reference report has content.
- The stay-after-reliever report uses the dynamic long-stay endpoint despite its older component comment referring to a legacy endpoint.

## Implementation steps

### 1. Reuse the existing combined-remarks backend path

In `../rofims/rab.Repository/Repositories/DynamicReportQuery.cs`:

- Add conditional `EnrichAllRemarksAsync` calls to `RunUnitDurationAsync`, `RunLongStayAsync`, `RunRankWiseAsync`, and `RunPresentStatusAsync`, following `RunEmployeeBaseAsync`.
- Enrich only when `allRemarks` is requested and returned items exist. Use the effective requested column set consistently, including any applicable default-column behavior.
- Preserve each method's projected `employeeId`, which the helper uses to associate remarks with members.
- Keep existing `rmks` handling for callers that still request additional remarks only. The five updated screens will request `allRemarks` instead.
- Verify column expansion and field metadata support the synthetic `allRemarks` key and its returned `allRemarksBN` companion. Add metadata only where required by the target endpoint; no physical view columns are needed for enrichment.
- Keep enrichment after report filtering and paging, using the existing employee and member-type access scope.

### 2. Update the five frontend data mappings

In each target component under `src/app/Components/Features/employee-reports/`:

- Keep the existing visible column key `rmks` so saved column selection and ordering remain compatible.
- Change its backend column mapping from `rmks` to `allRemarks`.
- Adapt both returned fields, `allRemarks` and `allRemarksBN`, into the report row.
- Add optional combined-remarks properties to the five corresponding interfaces in `src/app/models/report.model.ts`.
- Select English or Bangla text at render time so switching the report language uses the correct variant.
- Reuse the reference report's text selection and line-splitting behavior. A small shared utility may be used if it reduces repetition without changing the reference report's behavior.

### 3. Match screen and export formatting

- Screen: render each non-empty remark line as its own block, following the reference template; keep text escaped through Angular interpolation.
- Print: render escaped remark lines in separate blocks with the reference report's wrapping and left alignment.
- Word: emit a paragraph per remark line, following the reference export.
- Excel: export the selected language's complete newline-separated remark text.
- Update `cellValue`, templates, export branches, and relevant SCSS together so no renderer continues to read only `row.rmks`.
- Keep genuinely empty combined remarks blank and retain the existing Remark column heading, position, visibility toggle, and reorder behavior.

### 4. Check database prerequisites

- Reuse `../rofims/rab.Data/Sql/vw_MemberAllRemarks.sql` and the existing model/context mapping.
- No new database columns or schema migration are expected because the reference report already uses this source.
- During implementation verification, confirm the running database has the view version needed by the existing helper. If it needs refreshing, document the existing SQL script and its dependencies as deployment prerequisites.
- The active `Add_ProfileSpecialViewPermission.sql` migration is separate from this work. Combined report remarks continue to exclude confidential additional remarks, matching the reference report.

## Validation

1. User-run validation only: build the API solution (`dotnet build rofims.sln` from `rofims/`) and frontend (`npm run build` from `ROFIMS-Frontend/`) when ready. No builds or tests were run during implementation, as requested.
2. For members appearing in both the reference and a target report, compare combined remarks in English and Bangla. Use fixtures or records covering one remark, multiple types, additional remarks only, no remarks, and confidential additional remarks that must be excluded.
3. Repeat the comparison for all five routes, including applicable modes of the stay-after-reliever report.
4. Check table, print preview, Word, and Excel: same remark content, order, language, bullets, and line boundaries as the reference report. Include long text, Bangla characters, and HTML-sensitive characters.
5. Verify hide/show, drag-to-reorder, page changes, language changes, and report filters. Check unit-duration rows still show the correct member's remarks when service-history data is included.
6. Confirm report totals, ordering, access scope, and non-remark columns are unchanged. Confirm the original member-type report still behaves as before.
7. Verify the enrichment remains one batched query per requested page, rather than one request per member, and is skipped when remarks are not requested.

## Completion criteria

- All five existing Remark columns show the same combined remarks as `/member-type-reporting` for the same employee, language, and underlying data state.
- Screen, print, Word, and Excel use the same content.
- Empty remarks remain blank, confidential additional remarks remain excluded, and report access scope remains enforced.
- The user completes the manual validation above; builds and tests were explicitly deferred during implementation.
