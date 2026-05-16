import { Component, Input, OnInit, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { PostingService } from '@/services/posting.service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { IdentityService } from '@/services/identity.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { ApproverRoleType } from '@/models/enums';
import { forkJoin } from 'rxjs';

@Component({
    selector: 'app-notesheet-approver-select',
    standalone: true,
    imports: [CommonModule, FormsModule, SelectModule, MultiSelectModule],
    styles: [`:host { display: block; margin-bottom: 1rem; }`],
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
    /** When true, load approver options from Identity user list instead of approval employees */
    @Input() useUserList = false;

    @Output() initiatorIdChange = new EventEmitter<number | null>();
    @Output() recommenderIdsChange = new EventEmitter<number[]>();
    @Output() finalApproverIdChange = new EventEmitter<number | null>();

    initiatorOptions: { label: string; value: number }[] = [];
    recommenderOptions: { label: string; value: number }[] = [];
    finalApproverOptions: { label: string; value: number }[] = [];

    private loaded = false;

    constructor(
        private postingService: PostingService,
        private masterBasicSetupService: MasterBasicSetupService,
        private identityService: IdentityService,
        private identityMappingService: IdentityUserMappingService
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
        if (this.useUserList) {
            this.loadOptionsFromUserList();
        } else {
            this.loadOptionsFromEmployees();
        }
    }

    /** Load approver options from approval employees (default) */
    private loadOptionsFromEmployees(): void {
        this.postingService.getApprovalEmployees().subscribe({
            next: (allOpts) => {
                const opts = allOpts ?? [];
                this.applyApproverConfig(opts);
            },
            error: () => {}
        });
    }

    /** Load approver options from Identity user list with employee mappings */
    private loadOptionsFromUserList(): void {
        forkJoin({
            users: this.identityService.getAllUsers(),
            mappings: this.identityMappingService.getMappings()
        }).subscribe({
            next: ({ users, mappings }) => {
                const userList = Array.isArray(users) ? users : [];
                const mappingList = Array.isArray(mappings) ? mappings : [];

                // Build map: userId -> employeeId
                const userEmpMap = new Map<string, number>();
                for (const m of mappingList) {
                    const empId = (m as any).employeeId ?? (m as any).EmployeeId;
                    const uid = (m as any).userId ?? (m as any).UserId;
                    if (uid && typeof empId === 'number' && empId > 0) {
                        userEmpMap.set(uid, empId);
                    }
                }

                // Build options from users that have employee mappings
                const opts: { label: string; value: number }[] = [];
                for (const u of userList) {
                    const empId = userEmpMap.get(u.id);
                    if (empId) {
                        // Find mapping for extra info
                        const mapping = mappingList.find((m: any) => ((m as any).userId ?? (m as any).UserId) === u.id);
                        const empName = (mapping as any)?.employeeName ?? null;
                        const rabId = (mapping as any)?.rabID ?? null;
                        const serviceId = (mapping as any)?.serviceId ?? null;
                        const parts = [empName || u.userName, rabId ? `RAB: ${rabId}` : '', serviceId ? `SVC: ${serviceId}` : ''].filter(Boolean);
                        opts.push({ label: parts.join(' | '), value: empId });
                    } else {
                        // User without employee mapping — still show with negative id placeholder
                        // so admin can see all users; use a hash of the user id as value
                        // Skip unmapped users since backend requires employee IDs
                    }
                }
                opts.sort((a, b) => a.label.localeCompare(b.label));
                this.applyApproverConfig(opts);
            },
            error: () => {
                // Fallback to employee list
                this.loadOptionsFromEmployees();
            }
        });
    }

    /** Apply approver config filtering to the given options */
    private applyApproverConfig(opts: { label: string; value: number }[]): void {
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
    }
}
