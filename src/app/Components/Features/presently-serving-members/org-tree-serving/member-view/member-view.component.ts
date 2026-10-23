import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';
import { MemberCardComponent } from '../member-card/member-card.component';

@Component({
    selector: 'app-member-view',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, MemberCardComponent],
    templateUrl: './member-view.component.html',
    styleUrl: './member-view.component.scss'
})
export class MemberViewComponent {
    @Input() set members(value: EmployeeServiceOverview[]) {
        this._members.set(value);
    }
    @Input() set title(value: string) {
        this._title.set(value);
    }
    @Input() set loading(value: boolean) {
        this._loading.set(value);
    }

    @Output() cleared = new EventEmitter<void>();

    readonly _members = signal<EmployeeServiceOverview[]>([]);
    readonly _title = signal<string>('');
    readonly _loading = signal<boolean>(false);

    get isEmpty(): boolean {
        return this._title() === '' || this._title() === null || this._title() === undefined;
    }

    get showEmptyState(): boolean {
        return this.isEmpty || this._members().length === 0;
    }

    onClear(): void {
        this.cleared.emit();
    }
}