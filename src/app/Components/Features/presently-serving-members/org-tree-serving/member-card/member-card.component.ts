import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';

@Component({
    selector: 'app-member-card',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule],
    templateUrl: './member-card.component.html',
    styleUrl: './member-card.component.scss'
})
export class MemberCardComponent {
    @Input() member!: EmployeeServiceOverview;
}