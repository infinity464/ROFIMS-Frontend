import type { CombinedReportRemarks } from '@/models/report.model';

/** Matches the member-type report's language selection and line handling. */
export function reportRemarksValue(row: CombinedReportRemarks, lang: 'en' | 'bn'): string {
    return (lang === 'bn' ? row.allRemarksBN : row.allRemarks) || '';
}

export function reportRemarksLines(row: CombinedReportRemarks, lang: 'en' | 'bn'): string[] {
    const text = reportRemarksValue(row, lang);
    return text ? text.split('\n').filter(line => line.trim() !== '') : [];
}
