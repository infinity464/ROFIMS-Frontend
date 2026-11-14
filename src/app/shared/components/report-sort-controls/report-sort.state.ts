import type { DynamicReportRequest, NominalRollReportOrder, NominalRollSeniority } from '@/models/report.model';

/** Per-report state; sorting never changes the report's filter criteria. */
export class ReportSortState {
    reportOrder: NominalRollReportOrder = 'OverallSeniority';
    seniority: NominalRollSeniority = 'OrganizationSeniority';

    get request(): Pick<DynamicReportRequest, 'reportOrder' | 'nominalRollSeniority'> {
        return { reportOrder: this.reportOrder, nominalRollSeniority: this.seniority };
    }

    reset(): void {
        this.reportOrder = 'OverallSeniority';
        this.seniority = 'OrganizationSeniority';
    }
}
