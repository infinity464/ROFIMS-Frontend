import { Component, Input, OnInit, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { PostingService } from '@/services/posting.service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { ApproverRoleType } from '@/models/enums';

@Component({
    selector: 'app-notesheet-approver-select',
    standalone: true,
    imports: [CommonModule, FormsModule, SelectModule, MultiSelectModule],
    template: `
        <div class="form-row">
            <ng-content></ng-content>
            <div class="form-field">
                <label class="form-label">Select Initiator <span class="form-label-required">*</span></label>
                <p-select
                    [options]="initiatorOptions"
                    [ngModel]="initiatorId"
                    (ngModelChange)="onInitiatorChange($event)"
                    optionLabel="label"
                    optionValue="value"
                    [filter]="true"
                    filterBy="label"
                    placeholder="Search & Select"
                    [showClear]="true"
                    [disabled]="disableInitiator"
                    styleClass="w-full">
                </p-select>
                @if (showErrors && !initiatorId) {
                    <small class="form-error">Initiator is required</small>
                }
            </div>
        </div>
        <div class="form-row">
            <div class="form-field">
                <label class="form-label">Select Recommender's (If Applicable)</label>
                <p-multiselect
                    [options]="recommenderOptions"
                    [ngModel]="recommenderIds"
                    (ngModelChange)="onRecommenderChange($event)"
                    optionLabel="label"
                    optionValue="value"
                    [filter]="true"
                    filterBy="label"
                    placeholder="Search & Select"
                    [showClear]="true"
                    styleClass="w-full">
                </p-multiselect>
            </div>
            <div class="form-field">
                <label class="form-label">Select Final Approver <span class="form-label-required">*</span></label>
                <p-select
                    [options]="finalApproverOptions"
                    [ngModel]="finalApproverId"
                    (ngModelChange)="onFinalApproverChange($event)"
                    optionLabel="label"
                    optionValue="value"
                    [filter]="true"
                    filterBy="label"
                    placeholder="Search & Select"
                    [showClear]="true"
                    styleClass="w-full">
                </p-select>
                @if (showErrors && !finalApproverId) {
                    <small class="form-error">Final Approver is required</small>
                }
            </div>
        </div>
    `
})
export class NotesheetApproverSelectComponent implements OnInit, OnChanges {
    @Input() noteSheetType!: string;
    @Input() initiatorId: number | null = null;
    @Input() recommenderIds: number[] = [];
    @Input() finalApproverId: number | null = null;
    @Input() showErrors = false;
    @Input() disableInitiator = false;

    @Output() initiatorIdChange = new EventEmitter<number | null>();
    @Output() recommenderIdsChange = new EventEmitter<number[]>();
    @Output() finalApproverIdChange = new EventEmitter<number | null>();

    initiatorOptions: { label: string; value: number }[] = [];
    recommenderOptions: { label: string; value: number }[] = [];
    finalApproverOptions: { label: string; value: number }[] = [];

    private loaded = false;

    constructor(
        private postingService: PostingService,
        private masterBasicSetupService: MasterBasicSetupService
    ) {}

    ngOnInit(): void {
        this.loadOptions();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['noteSheetType'] && !changes['noteSheetType'].firstChange) {
            this.loadOptions();
        }
    }

    onInitiatorChange(val: number | null): void {
        this.initiatorId = val;
        this.initiatorIdChange.emit(val);
    }

    onRecommenderChange(val: number[]): void {
        this.recommenderIds = val;
        this.recommenderIdsChange.emit(val);
    }

    onFinalApproverChange(val: number | null): void {
        this.finalApproverId = val;
        this.finalApproverIdChange.emit(val);
    }

    private loadOptions(): void {
        this.postingService.getApprovalEmployees().subscribe({
            next: (allOpts) => {
                const opts = allOpts ?? [];
                this.masterBasicSetupService.getNoteSheetApproverConfigByType(this.noteSheetType).subscribe({
                    next: (configs: any) => {
                        const cfg = Array.isArray(configs) ? configs[0] : configs;
                        if (cfg?.details?.length) {
                            const initIds = cfg.details.filter((d: any) => d.roleType === ApproverRoleType.Initiator).map((d: any) => d.employeeId);
                            const recIds = cfg.details.filter((d: any) => d.roleType === ApproverRoleType.Recommender).map((d: any) => d.employeeId);
                            const faIds = cfg.details.filter((d: any) => d.roleType === ApproverRoleType.FinalApprover).map((d: any) => d.employeeId);
                            this.initiatorOptions = initIds.length > 0 ? opts.filter(o => initIds.includes(o.value)) : opts;
                            this.recommenderOptions = recIds.length > 0 ? opts.filter(o => recIds.includes(o.value)) : opts;
                            this.finalApproverOptions = faIds.length > 0 ? opts.filter(o => faIds.includes(o.value)) : opts;
                        } else {
                            this.initiatorOptions = opts;
                            this.recommenderOptions = opts;
                            this.finalApproverOptions = opts;
                        }
                    },
                    error: () => {
                        this.initiatorOptions = opts;
                        this.recommenderOptions = opts;
                        this.finalApproverOptions = opts;
                    }
                });
            },
            error: () => {}
        });
    }
}
