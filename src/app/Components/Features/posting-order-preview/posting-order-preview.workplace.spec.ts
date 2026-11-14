import { PostingOrderPreviewPageComponent } from './posting-order-preview';
import { NotesheetPreviewPostingComponent } from '../notesheet-preview/posting/notesheet-preview-posting';

describe('Approved inter-posting previous workplace', () => {
    const member = () => ({
        approvedPreviousWorkplace: 'Mother unit/ Unit A',
        approvedPreviousWorkplaceBN: 'মাতৃ ইউনিট/ ইউনিট ক',
        motherUnitName: 'Changed mother unit',
        prevRabServiceChain: 'Unit A/ Unit B/ Unit C',
        transferRabUnitName: 'Unit B',
        presentRabUnitName: 'Unit C'
    } as any);

    it('keeps the notesheet frozen in both languages after later transfers', () => {
        const preview = Object.create(NotesheetPreviewPostingComponent.prototype) as NotesheetPreviewPostingComponent;
        const english = spyOn(preview, 'isEnglish').and.returnValue(true);
        expect(preview.getInterPrevWorkplace(member())).toBe('Mother unit/ Unit A');
        english.and.returnValue(false);
        expect(preview.getInterPrevWorkplace(member())).toBe('মাতৃ ইউনিট/ ইউনিট ক');
    });

    it('uses the same approved value in the office order', () => {
        const preview = Object.create(PostingOrderPreviewPageComponent.prototype) as PostingOrderPreviewPageComponent;
        preview.postingType = 'InterPosting';
        preview.isBangla = false;
        expect(preview.empPrevWorkplace(member())).toBe('Mother unit/ Unit A');
        preview.isBangla = true;
        expect(preview.empPrevWorkplace(member())).toBe('মাতৃ ইউনিট/ ইউনিট ক');
    });

    it('preserves an approved empty column instead of using a later present unit', () => {
        const row = { ...member(), approvedPreviousWorkplace: '' };
        const order = Object.create(PostingOrderPreviewPageComponent.prototype) as PostingOrderPreviewPageComponent;
        order.postingType = 'InterPosting';
        order.isBangla = false;
        expect(order.empPrevWorkplace(row)).toBe('');
        const notesheet = Object.create(NotesheetPreviewPostingComponent.prototype) as NotesheetPreviewPostingComponent;
        spyOn(notesheet, 'isEnglish').and.returnValue(true);
        expect(notesheet.getInterPrevWorkplace(row)).toBe('');
    });

    it('continues to build live workplaces for drafts without snapshots', () => {
        const preview = Object.create(NotesheetPreviewPostingComponent.prototype) as NotesheetPreviewPostingComponent;
        spyOn(preview, 'isEnglish').and.returnValue(true);
        const row = member();
        row.approvedPreviousWorkplace = null;
        expect(preview.getInterPrevWorkplace(row)).toBe('Changed mother unit/ Unit A/ Unit C');
    });
});
