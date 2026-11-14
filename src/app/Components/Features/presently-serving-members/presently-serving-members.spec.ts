import { of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { EmployeeListService } from '@/services/employee-list.service';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';
import { IsSendingNotesheetStatus } from '@/models/enums';
import { PresentlyServingMembers } from './presently-serving-members';

describe('Inter-posting sending remarks', () => {
    let component: PresentlyServingMembers;
    let api: jasmine.SpyObj<EmployeeListService>;
    const member = (id: number) => ({ employeeID: id, serviceId: String(id) } as EmployeeServiceOverview);

    beforeEach(() => {
        api = jasmine.createSpyObj<EmployeeListService>('EmployeeListService', ['setBulkIsSendingNotesheetStatus']);
        api.setBulkIsSendingNotesheetStatus.and.returnValue(of({ statusCode: 200 }));
        component = new PresentlyServingMembers({} as any, api, {} as any, new MessageService(), {} as any, {} as any, {} as any);
        component.interPostingMode = true;
        spyOn(component, 'loadList');
    });

    it('sends each selected member with their own type, including explicit None', () => {
        for (const id of [1, 2, 3]) component.toggleRow(member(id), true);
        component.interPostingRemarks = { 1: ' request ', 2: 'secret', 3: 'keep text', 4: 'unsent' };
        component.interPostingRemarkTypes = { 1: 'RequestPosting', 2: 'ConfidentialRemark', 3: null, 4: 'RequestPosting' };

        component.sendInterPosting();

        expect(api.setBulkIsSendingNotesheetStatus).toHaveBeenCalledOnceWith([
            { employeeId: 1, interPostingRemark: 'request', interPostingRemarkType: 'RequestPosting' },
            { employeeId: 2, interPostingRemark: 'secret', interPostingRemarkType: 'ConfidentialRemark' },
            { employeeId: 3, interPostingRemark: 'keep text', interPostingRemarkType: null }
        ], IsSendingNotesheetStatus.DraftInterPosting);
        expect(component.selectedCount).toBe(0);
        expect(component.interPostingRemarks[4]).toBe('unsent');
        expect(component.interPostingRemarkTypes[4]).toBe('RequestPosting');
    });

    it('keeps an intentionally cleared choice and empty text when the page reloads', () => {
        component.list = [{ ...member(1), interPostingRemark: 'server text', interPostingRemarkType: 'ConfidentialRemark' }];
        component.interPostingRemarks[1] = '';
        component.interPostingRemarkTypes[1] = null;
        (component as any).prefillRemarks();
        expect(component.interPostingRemarks[1]).toBe('');
        expect(component.interPostingRemarkTypes[1]).toBeNull();
    });

    it('initializes an untouched row with its saved choice', () => {
        component.list = [{ ...member(2), interPostingRemark: 'saved', interPostingRemarkType: 'RequestPosting' }];
        (component as any).prefillRemarks();
        expect(component.interPostingRemarks[2]).toBe('saved');
        expect(component.interPostingRemarkTypes[2]).toBe('RequestPosting');
    });

    it('requires text when a destination is selected', () => {
        component.toggleRow(member(1), true);
        component.interPostingRemarks[1] = ' ';
        component.interPostingRemarkTypes[1] = 'ConfidentialRemark';
        component.sendInterPosting();
        expect(api.setBulkIsSendingNotesheetStatus).not.toHaveBeenCalled();
        expect(component.selectedCount).toBe(1);
    });

    it('retains edits and selections when the server rejects a stale batch', () => {
        api.setBulkIsSendingNotesheetStatus.and.returnValue(throwError(() => ({ error: { description: 'Already in process' } })));
        component.toggleRow(member(1), true);
        component.interPostingRemarks[1] = 'retry this';
        component.interPostingRemarkTypes[1] = 'RequestPosting';
        component.sendInterPosting();
        expect(component.selectedCount).toBe(1);
        expect(component.interPostingRemarks[1]).toBe('retry this');
        expect(component.interPostingRemarkTypes[1]).toBe('RequestPosting');
        expect(component.savingInterPosting).toBeFalse();
        expect(component.loadList).not.toHaveBeenCalled();
    });
});
