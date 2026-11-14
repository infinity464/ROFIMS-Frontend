import { of, Subject } from 'rxjs';
import { MessageService } from 'primeng/api';
import { CommonCodeModel } from '@/models/common-code-model';
import { CommonCodeService } from '@/services/common-code-service';
import { ReportService } from '@/services/report.service';
import { EmployeeReportsComponent } from './employee-reports.component';
import { ReportOfficerTypeComponent } from './report-officer-type/report-officer-type.component';

describe('Batch wise employee reports', () => {
    let component: EmployeeReportsComponent;
    let codes: jasmine.SpyObj<CommonCodeService>;

    const batch = (codeId: number, codeValueEN: string, codeValueBN = '') =>
        ({ codeId, codeValueEN, codeValueBN } as CommonCodeModel);

    beforeEach(() => {
        codes = jasmine.createSpyObj<CommonCodeService>('CommonCodeService', ['getAllActiveCommonCodesType']);
        codes.getAllActiveCommonCodesType.and.returnValue(of([]));
        component = new EmployeeReportsComponent({} as any, {} as any, codes, {} as any);
        component.reportType = 'batch';
    });

    it('offers a separate batch report and loads the member-entry Batch codes', () => {
        expect(component.reportTypes.some(type => type.value === 'batch')).toBeTrue();
        expect(component.reportTypes.some(type => type.value === 'batchCourse')).toBeTrue();
        component.onReportTypeChange();
        expect(codes.getAllActiveCommonCodesType).toHaveBeenCalledOnceWith('Batch');
    });

    it('combines same-name batch codes and includes every matching code in the selection', () => {
        codes.getAllActiveCommonCodesType.and.returnValue(of([
            batch(101, ' 42nd BCS ', '৪২তম বিসিএস'),
            batch(202, '42ND BCS'),
            batch(303, '43rd BCS'),
        ]));
        component.onReportTypeChange();
        expect(component.commonCodeOptions.map(option => option.label)).toEqual(['42nd BCS', '43rd BCS']);
        component.selectedCommonCodeId = 101;
        component.onCommonCodeChange();
        expect(component.selectedCommonCodeIds).toEqual([101, 202]);
        component.reportLang = 'bn';
        expect(component.selectedCommonCodeLabel).toBe('৪২তম বিসিএস');
        component.selectedCommonCodeId = 303;
        component.onCommonCodeChange();
        expect(component.selectedCommonCodeIds).toEqual([303]);
    });

    it('bundles batches that only have a Bangla label', () => {
        codes.getAllActiveCommonCodesType.and.returnValue(of([
            batch(101, '', 'প্রথম ব্যাচ'), batch(202, ' ', ' প্রথম ব্যাচ '),
        ]));
        component.onReportTypeChange();
        expect(component.commonCodeOptions.length).toBe(1);
        component.selectedCommonCodeId = 101;
        component.onCommonCodeChange();
        expect(component.selectedCommonCodeIds).toEqual([101, 202]);
    });

    it('combines N/A codes into one batch option', () => {
        codes.getAllActiveCommonCodesType.and.returnValue(of([batch(101, 'N/A'), batch(202, 'na')]));
        component.onReportTypeChange();
        expect(component.commonCodeOptions.length).toBe(1);
        component.selectedCommonCodeId = component.commonCodeOptions[0].value;
        component.onCommonCodeChange();
        expect(component.selectedCommonCodeIds).toEqual([101, 202]);
    });

    it('clears the old batch selection when report type changes and ignores its late response', () => {
        const pending = new Subject<CommonCodeModel[]>();
        codes.getAllActiveCommonCodesType.and.returnValue(pending);
        component.onReportTypeChange();
        component.selectedCommonCodeId = 101;
        codes.getAllActiveCommonCodesType.and.returnValue(of([batch(909, 'SSC')]));
        component.reportType = 'education';
        component.onReportTypeChange();
        pending.next([batch(101, '42nd BCS')]);
        expect(component.selectedCommonCodeIds).toEqual([]);
        expect(component.commonCodeOptions.map(option => option.label)).toEqual(['SSC']);
        expect(component.hasSelection).toBeFalse();
    });

    describe('member roster request', () => {
        let roster: ReportOfficerTypeComponent;
        let reports: jasmine.SpyObj<ReportService>;

        beforeEach(() => {
            reports = jasmine.createSpyObj<ReportService>('ReportService', ['runDynamicEmployeeBaseReport']);
            reports.runDynamicEmployeeBaseReport.and.returnValue(of({ datalist: [], pages: { Rows: 0 } } as any));
            roster = new ReportOfficerTypeComponent(reports, codes, new MessageService(), {} as any, {} as any);
        });

        it('sends all bundled batch ids alongside status, other filters and paging', () => {
            roster.criterionFieldKey = 'batch';
            roster.commonCodeIds = [101, 202];
            roster.selectedOrgIds = [5];
            roster.postingStatus = 'ExMember';
            roster.first = 100;
            roster.load();
            const request = reports.runDynamicEmployeeBaseReport.calls.mostRecent().args[0];
            expect(request.criteria).toContain({ fieldKey: 'batch', idValues: [101, 202] });
            expect(request.criteria).toContain({ fieldKey: 'motherOrganization', idValues: [5] });
            expect(request.postingStatusFilter).toBe('ExMember');
            expect(request.pagination).toEqual({ page_no: 2, row_per_page: 100 });
            expect(request.criteria?.some(criterion => criterion.fieldKey === 'officerType')).toBeFalse();
        });

        it('supports a batch with a single code', () => {
            roster.criterionFieldKey = 'batch';
            roster.commonCodeIds = [101];
            roster.load();
            expect(reports.runDynamicEmployeeBaseReport.calls.mostRecent().args[0].criteria)
                .toContain({ fieldKey: 'batch', idValue: 101 });
        });

        it('keeps Officer Type as the existing default', () => {
            roster.commonCodeIds = [88];
            roster.load();
            expect(reports.runDynamicEmployeeBaseReport.calls.mostRecent().args[0].criteria)
                .toContain({ fieldKey: 'officerType', idValue: 88 });
        });
    });
});
