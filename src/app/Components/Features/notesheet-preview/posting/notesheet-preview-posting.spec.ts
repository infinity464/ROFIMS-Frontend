import { NotesheetPreviewPostingComponent } from './notesheet-preview-posting';

describe('Notesheet remarks routing from the existing input', () => {
    let component: NotesheetPreviewPostingComponent;

    beforeEach(() => {
        // Exercise the save mapping without constructing the preview's document services.
        component = Object.create(NotesheetPreviewPostingComponent.prototype);
        component.noteSheet = { currentStatus: 'draft', finalApprovalStatus: 'pending' } as any;
        component.postingEmployees = [{
            employeeId: 7, draftPostingDetailId: 12, transferRabUnitId: 34,
            remarks: 'old note', sendingRemark: 'source note', sendingRemarkType: null,
            interPostingRemark: 'inter source', interPostingRemarkType: null
        }] as any;
        component.newRemarks = { 7: ' updated note ' };
        component.remarkTypes = { 7: 'RequestPosting' };
        spyOn(component, 'isInterPosting').and.returnValue(false);
    });

    it('routes the existing input as a new-posting request remark', () => {
        expect((component as any).buildPostingDetailItems()).toEqual([{
            id: 12, transferRabUnitId: 34, remarks: 'updated note',
            sendingRemark: 'updated note', sendingRemarkType: 'RequestPosting', updateSendingRemark: true
        }]);
    });

    it('routes the same input as a confidential inter-posting remark', () => {
        (component.isInterPosting as jasmine.Spy).and.returnValue(true);
        component.remarkTypes[7] = 'ConfidentialRemark';
        expect((component as any).buildPostingDetailItems()).toEqual([{
            id: 12, transferRabUnitId: 34, remarks: 'updated note',
            interPostingRemark: 'updated note', interPostingRemarkType: 'ConfidentialRemark', updateInterPostingRemark: true
        }]);
    });

    it('sends an explicitly cleared type so automatic routing can be removed', () => {
        component.postingEmployees[0].sendingRemarkType = 'RequestPosting';
        component.remarkTypes[7] = null;
        const item = (component as any).buildPostingDetailItems()[0];
        expect(item.sendingRemarkType).toBeNull();
        expect(item.updateSendingRemark).toBeTrue();
    });

    it('preserves the saved sending remark when only the unit is changed', () => {
        component.newRemarks[7] = 'old note';
        component.remarkTypes[7] = null;
        expect((component as any).buildPostingDetailItems()).toEqual([{
            id: 12, transferRabUnitId: 34, remarks: 'old note'
        }]);
    });

    it('includes remark corrections even when the notesheet has been approved', () => {
        component.noteSheet!.finalApprovalStatus = 'approve';
        expect(component.canEditRemarkRouting).toBeTrue();
        expect((component as any).buildPostingDetailItems()[0].updateSendingRemark).toBeTrue();
    });

    it('rejects a selected type without remark text before starting a save', () => {
        component.newRemarks[7] = ' ';
        (component as any).messageService = { add: jasmine.createSpy('add') };
        component.saveChanges();
        expect((component as any).messageService.add).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'warn' }));
        expect(component.saving).toBeFalsy();
    });

    it('shows a routed remark only once when it is also the saved notesheet remark', () => {
        component.postingEmployees[0].sendingRemark = 'old note';
        expect(component.getCombinedRemarks(component.postingEmployees[0])).toBe('old note');
    });
});
