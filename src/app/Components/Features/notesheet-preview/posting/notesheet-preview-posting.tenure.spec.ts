import { NotesheetPreviewPostingComponent } from './notesheet-preview-posting';

describe('Notesheet tenure uses the date in the document header', () => {
    let component: NotesheetPreviewPostingComponent;

    beforeEach(() => {
        component = Object.create(NotesheetPreviewPostingComponent.prototype);
        component.noteSheet = {
            noteSheetDate: '2026-08-31',
            finalApprovalApprovedDate: '2026-09-10T12:00:00Z'
        } as any;
    });

    it('ends on the notesheet date even when viewed years later', () => {
        jasmine.clock().install();
        try {
            jasmine.clock().mockDate(new Date(2030, 0, 1));
            expect(component.calcTenure('2020-01-15')).toEqual({ y: 6, m: 7, d: 16 });
            jasmine.clock().mockDate(new Date(2035, 0, 1));
            expect(component.calcTenure('2020-01-15')).toEqual({ y: 6, m: 7, d: 16 });
        } finally {
            jasmine.clock().uninstall();
        }
    });

    it('recalculates when the displayed notesheet date changes', () => {
        component.noteSheet!.noteSheetDate = '2026-09-01';
        expect(component.calcTenure('2020-01-15')).toEqual({ y: 6, m: 7, d: 17 });
    });

    it('borrows days and months using the notesheet date', () => {
        component.noteSheet!.noteSheetDate = '2026-08-10';
        expect(component.calcTenure('2024-11-20')).toEqual({ y: 1, m: 8, d: 21 });
        component.noteSheet!.noteSheetDate = '2024-03-01';
        expect(component.calcTenure('2024-02-28')).toEqual({ y: 0, m: 0, d: 2 });
    });

    it('returns zero when joining is after the notesheet date', () => {
        expect(component.calcTenure('2026-09-01')).toEqual({ y: 0, m: 0, d: 0 });
        expect(component.calcTenure('2026-08-31')).toEqual({ y: 0, m: 0, d: 0 });
    });

    it('does not fall back to today when dates are missing or invalid', () => {
        expect(component.calcTenure(null)).toEqual({ y: 0, m: 0, d: 0 });
        expect(component.calcTenure('invalid')).toEqual({ y: 0, m: 0, d: 0 });
        component.noteSheet!.noteSheetDate = '';
        expect(component.calcTenure('2020-01-15')).toEqual({ y: 0, m: 0, d: 0 });
        component.noteSheet!.noteSheetDate = 'invalid';
        expect(component.calcTenure('2020-01-15')).toEqual({ y: 0, m: 0, d: 0 });
    });

    it('uses that duration for both English and Bangla table cells', () => {
        const english = spyOn(component, 'isEnglish').and.returnValue(true);
        expect(component.tenure('2020-01-15', 'y')).toBe('6');
        expect(component.tenure('2020-01-15', 'm')).toBe('7');
        expect(component.tenure('2020-01-15', 'd')).toBe('16');
        english.and.returnValue(false);
        expect(component.tenure('2020-01-15', 'y')).toBe('৬');
        expect(component.tenure('2020-01-15', 'm')).toBe('৭');
        expect(component.tenure('2020-01-15', 'd')).toBe('১৬');
    });
});
