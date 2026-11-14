import type { ProfileExportSection } from '@/services/export.service';

/** Applies the same sensitive-field policy to PDF and Word table data. */
export function protectProfileExport(
    sections: ProfileExportSection[],
    labels: Record<string, string>,
    allowed: boolean,
    confidential: { additionalRemarks: string }[]
): ProfileExportSection[] {
    return sections.flatMap(section => {
        if (!allowed && [labels['section.presentRabService'], labels['section.previousRabService']].includes(section.title)) {
            const remarkIndex = section.columns.indexOf(labels['table.remarks']);
            if (remarkIndex >= 0) {
                section = {
                    ...section,
                    columns: section.columns.filter((_, index) => index !== remarkIndex),
                    rows: section.rows.map(row => row.filter((_, index) => index !== remarkIndex))
                };
            }
        }
        if (allowed && section.title === labels['section.additionalRemarks']) {
            return [section, {
                title: labels['section.confidentialRemarks'],
                columns: [labels['table.ser'], labels['table.confidentialRemarks']],
                rows: confidential.length ? confidential.map((row, index) => [String(index + 1), row.additionalRemarks]) : [[labels['empty.noConfidentialRemarks']]]
            }];
        }
        return [section];
    });
}
