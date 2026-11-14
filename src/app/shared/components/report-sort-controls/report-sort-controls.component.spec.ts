import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Select } from 'primeng/select';
import { ReportSortControlsComponent, ReportSortState } from './report-sort-controls.component';

describe('Shared report sorting controls', () => {
    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ReportSortControlsComponent],
            providers: [provideNoopAnimations()],
        }).compileComponents();
    });

    async function create(state = new ReportSortState()) {
        const fixture = TestBed.createComponent(ReportSortControlsComponent);
        fixture.componentRef.setInput('state', state);
        fixture.detectChanges();
        await fixture.whenStable();
        return fixture;
    }

    it('starts with the existing overall organization seniority', async () => {
        const fixture = await create();
        expect(fixture.componentInstance.state.request).toEqual({
            reportOrder: 'OverallSeniority', nominalRollSeniority: 'OrganizationSeniority',
        });
        expect(fixture.debugElement.queryAll(By.directive(Select)).length).toBe(2);
        expect(fixture.nativeElement.textContent).not.toContain('Orders members within each unit.');
    });

    it('updates request state before notifying the report to reload', async () => {
        const fixture = await create();
        const requests: object[] = [];
        fixture.componentInstance.sortChange.subscribe(() => requests.push(fixture.componentInstance.state.request));
        const controls = fixture.debugElement.queryAll(By.directive(Select));
        controls[0].triggerEventHandler('ngModelChange', 'UnitSeniority');
        controls[1].triggerEventHandler('ngModelChange', 'RankSeniority');
        expect(requests).toEqual([
            { reportOrder: 'UnitSeniority', nominalRollSeniority: 'OrganizationSeniority' },
            { reportOrder: 'UnitSeniority', nominalRollSeniority: 'RankSeniority' },
        ]);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Uses the unit Sort Order from Org Tree.');
        expect(fixture.nativeElement.textContent).toContain('Orders members within each unit.');
    });

    it('resets both sorting options when a report clears its filters', async () => {
        const state = new ReportSortState();
        state.reportOrder = 'UnitSeniority';
        state.seniority = 'RankSeniority';
        const fixture = await create(state);
        state.reset();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(state.request).toEqual({
            reportOrder: 'OverallSeniority', nominalRollSeniority: 'OrganizationSeniority',
        });
        expect(fixture.nativeElement.textContent).not.toContain('Orders members within each unit.');
    });

    it('keeps report instances independent and gives their labels unique input ids', async () => {
        const first = await create();
        const second = await create();
        first.debugElement.queryAll(By.directive(Select))[0].triggerEventHandler('ngModelChange', 'UnitSeniority');
        expect(second.componentInstance.state.reportOrder).toBe('OverallSeniority');
        const firstId = first.nativeElement.querySelector('label').getAttribute('for');
        const secondId = second.nativeElement.querySelector('label').getAttribute('for');
        expect(firstId).not.toBe(secondId);
        expect(first.nativeElement.querySelector('[role="combobox"]').id).toBe(firstId);
    });
});
