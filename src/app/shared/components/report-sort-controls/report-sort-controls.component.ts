import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { ReportSortState } from './report-sort.state';

export { ReportSortState } from './report-sort.state';

@Component({
    selector: 'app-report-sort-controls',
    standalone: true,
    imports: [FormsModule, SelectModule],
    template: `
        <div class="sort-fields">
            <div class="sort-field">
                <label [for]="id + '-order'">Report Order</label>
                <p-select [inputId]="id + '-order'" [options]="orderOptions"
                    [(ngModel)]="state.reportOrder" (ngModelChange)="sortChange.emit()"
                    optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
                @if (state.reportOrder === 'UnitSeniority') {
                    <small>Uses the unit Sort Order from Org Tree.</small>
                }
            </div>
            <div class="sort-field">
                <label [for]="id + '-seniority'">Nominal Roll Seniority</label>
                <p-select [inputId]="id + '-seniority'" [options]="seniorityOptions"
                    [(ngModel)]="state.seniority" (ngModelChange)="sortChange.emit()"
                    optionLabel="label" optionValue="value" styleClass="w-full" appendTo="body" />
                @if (state.reportOrder === 'UnitSeniority') {
                    <small>Orders members within each unit.</small>
                }
            </div>
        </div>
    `,
    styles: [`
        :host { display: block; margin-bottom: 1rem; }
        .sort-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; max-width: 44rem; }
        .sort-field { display: flex; flex-direction: column; gap: .4rem; min-width: 0; }
        label { font-size: .8rem; font-weight: 600; color: var(--text-color-secondary); }
        small { font-size: .75rem; color: var(--text-color-secondary); }
        @media (max-width: 600px) { .sort-fields { grid-template-columns: minmax(0, 1fr); } }
    `],
})
export class ReportSortControlsComponent {
    private static nextId = 0;
    readonly id = `report-sort-${ReportSortControlsComponent.nextId++}`;
    @Input({ required: true }) state!: ReportSortState;
    @Output() sortChange = new EventEmitter<void>();

    readonly orderOptions = [
        { label: 'Overall Seniority', value: 'OverallSeniority' },
        { label: 'Unit Seniority', value: 'UnitSeniority' },
    ];
    readonly seniorityOptions = [
        { label: 'Organization Seniority', value: 'OrganizationSeniority' },
        { label: 'SRB Rank Seniority', value: 'RankSeniority' },
    ];
}
