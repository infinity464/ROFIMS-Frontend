import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { FieldsetModule } from 'primeng/fieldset';
import { DialogModule } from 'primeng/dialog';
import { environment } from '@/Core/Environments/environment';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { NotesheetMemberStripsComponent } from '@/Components/Shared/notesheet-member-strips/notesheet-member-strips';
import { ServingMembersService } from '@/services/serving-members.service';
import { FamilyInfoService } from '@/services/family-info-service';
import { PreviousRABServiceService, VwPreviousRABServiceInfoModel } from '@/services/previous-rab-service.service';
import { getFormattedMemberName } from '@/shared/utils/member-display-name.util';
import { buildRabUnitPath, findActiveRabService } from '@/shared/utils/rab-unit-path.util';
import {
    AVAILABLE_MEMBER_COLUMNS,
    MemberColumnDef,
    MemberRow,
    MembersJsonData,
    PostedOutClearanceInfo
} from '@/Components/Features/notesheet-generate/notesheet-generate';

/**
 * Members picker + editable members table, the same UI the General note-sheet form has
 * (copied from it — that form is left as is). Used by the office-order screen for an order
 * generated without a note sheet. The host owns `membersData`; this component edits it in place.
 * Stored rows use the note-sheet shape: { employeeId, postedOutId, informationJson: { columns, values } }.
 */
@Component({
    selector: 'app-members-editor',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, SelectModule, InputTextModule, FieldsetModule, DialogModule, EmployeeSearchComponent, NotesheetMemberStripsComponent],
    templateUrl: './members-editor.html',
    styleUrl: './members-editor.scss'
})
export class MembersEditorComponent implements OnChanges {
    @Input({ required: true }) membersData!: MembersJsonData;
    @Input() isBangla = false;
    /** Clearance subject → each member must be posted-out; adds the Posting Unit column. */
    @Input() isClearance = false;
    /** Show the editable table; otherwise compact member strips. */
    @Input() showTable = true;
    @Input() collapsed = false;

    /** True once the default column set has been auto-applied, so we don't fight the
     *  user if they clear columns, and don't override columns loaded in edit mode. */
    private defaultColumnsApplied = false;
    /** True while the columns are still the untouched default set — lets a language
     *  switch rebuild them; cleared once the user manually adds/removes/renames a column. */
    private columnsAreDefault = false;
    memberAddLoading = false;
    showAddColumnDialog = false;
    addColumnMode: 'field' | 'custom' = 'field';
    selectedColumnKey: string | null = null;
    newCustomColumnName = '';
    editingMemberCellKey: string | null = null;
    editingMemberCellValue = '';
    readonly availableColumns = AVAILABLE_MEMBER_COLUMNS;

    // Column label editing
    editingColLabelKey: string | null = null;
    editingColLabelValue = '';

    // Drag & drop column reorder
    dragColIndex: number | null = null;
    dragOverColIndex: number | null = null;

    constructor(
        private http: HttpClient,
        private messageService: MessageService,
        private servingMembersService: ServingMembersService,
        private familyInfoService: FamilyInfoService,
        private previousRABService: PreviousRABServiceService
    ) {}

    ngOnChanges(changes: SimpleChanges): void {
        // Language drives the whole document — reflect it in the (untouched) member table too.
        if (changes['isBangla'] && !changes['isBangla'].firstChange) {
            this.relanguageDefaultColumns();
        }
    }

    // ── Host API ─────────────────────────────────────────────────────────

    /** Saved member rows ({ employeeId, postedOutId, informationJson }) → membersData (edit mode). */
    loadSavedRows(list: any[] | null | undefined): void {
        this.defaultColumnsApplied = true;
        this.columnsAreDefault = false;
        const rows = (Array.isArray(list) ? list : []).filter(r => r.informationJson || r.InformationJson);
        if (rows.length === 0) {
            // Nothing saved → let the default columns appear when a member is added.
            this.defaultColumnsApplied = false;
            return;
        }
        try {
            const firstParsed = JSON.parse(rows[0].informationJson || rows[0].InformationJson);
            const columns = Array.isArray(firstParsed.columns) ? firstParsed.columns : [];
            const members: MemberRow[] = rows.map(r => {
                const parsed = JSON.parse(r.informationJson || r.InformationJson);
                return {
                    employeeId: r.employeeId ?? r.EmployeeId,
                    values: parsed.values || {},
                    postedOutId: r.postedOutId ?? r.PostedOutId ?? null
                };
            });
            this.membersData.columns = columns;
            this.membersData.members = members;
            if (columns.length === 0) {
                this.defaultColumnsApplied = false;
                this.applyDefaultMemberColumnsIfEmpty();
            } else {
                this.columnsAreDefault = this.columnsMatchDefaultSet(columns);
            }
        } catch { /* malformed JSON — leave empty */ }
    }

    /** Rows to send on save, in the stored shape. */
    toSaveRows(): { employeeId: number; postedOutId: number | null; informationJson: string }[] {
        this.commitMemberCellEdit();
        return this.membersData.members.map(m => ({
            employeeId: m.employeeId,
            postedOutId: m.postedOutId ?? null,
            informationJson: JSON.stringify({ columns: this.membersData.columns, values: m.values })
        }));
    }

    // ── Adding members ───────────────────────────────────────────────────

    onMemberFound(emp: EmployeeBasicInfo): void {
        // Access gate FIRST: block adding members outside the logged-in user's scope.
        // A network/check error falls back to allowing the add.
        this.servingMembersService.checkMemberAccess(emp.employeeID).subscribe({
            next: (res) => {
                if (res && res.accessible === false) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Access denied',
                        detail: res.reason || "You don't have permission to view this employee (outside your assigned units / member types)."
                    });
                    return;
                }
                this.proceedAddMember(emp);
            },
            error: () => this.proceedAddMember(emp)
        });
    }

    /** Clearance: verify the posted-out record + that no note sheet already uses it; otherwise add normally. */
    private proceedAddMember(emp: EmployeeBasicInfo): void {
        if (this.membersData.members.some(m => m.employeeId === emp.employeeID)) {
            this.messageService.add({ severity: 'warn', summary: 'Duplicate', detail: 'This member is already added.' });
            return;
        }
        if (!this.isClearance) {
            this.addFoundMember(emp, null);
            return;
        }

        this.memberAddLoading = true;
        const api = `${environment.apis.core}/NoteSheetReferenceEmployee`;
        this.http.get<PostedOutClearanceInfo>(`${api}/GetPostedOutClearanceInfo`, { params: { employeeId: String(emp.employeeID) } }).subscribe({
            next: (info) => {
                this.memberAddLoading = false;
                if (!info?.hasPostedOut) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'No Posted Out record',
                        detail: `${emp.fullNameEN || 'This member'} has no Posted Out entry. Please generate the Posted Out (Permanent Posting MO Change) record first.`,
                        life: 7000
                    });
                    return;
                }
                if (info.usedInNoteSheetId != null) {
                    const nsRef = info.usedInNoteSheetNo || ('#' + info.usedInNoteSheetId);
                    this.messageService.add({
                        severity: 'error',
                        summary: info.usedInNoteSheetApproved ? 'Clearance already approved' : 'Already in a note-sheet',
                        detail: info.usedInNoteSheetApproved
                            ? `This posted-out member's clearance is already approved in note-sheet ${nsRef} and cannot be added again.`
                            : `This posted-out member is already in note-sheet ${nsRef}. (If that note-sheet is cancelled, the member becomes available again.)`,
                        life: 8000
                    });
                    return;
                }
                this.addFoundMember(emp, info.postedOutId, info.postingUnitName ?? '', info.postingUnitNameBN ?? '');
            },
            error: () => {
                this.memberAddLoading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to verify the posted-out record. Please try again.' });
            }
        });
    }

    private addFoundMember(emp: EmployeeBasicInfo, postedOutId: number | null, postingUnitEN = '', postingUnitBN = ''): void {
        this.memberAddLoading = true;
        forkJoin([
            this.servingMembersService.getEmployeePersonalServiceOverview(emp.employeeID),
            this.familyInfoService.getFamilyInfoByEmployeeView(emp.employeeID),
            this.previousRABService.getViewByEmployeeId(emp.employeeID).pipe(catchError(() => of([] as VwPreviousRABServiceInfoModel[])))
        ]).subscribe({
            next: ([profile, familyList, rabServiceList]) => {
                if (this.membersData.members.some(m => m.employeeId === emp.employeeID)) {
                    this.memberAddLoading = false;
                    return;
                }
                const values: Record<string, string> = {};

                // Basic Info fields (EN + BN)
                values['serviceId'] = profile.serviceId ?? '';
                values['rabId'] = profile.rabId ?? '';
                values['nameEnglish'] = profile.nameEnglish ?? '';
                values['nameBN'] = profile.nameBN ?? '';
                values['armyRank'] = profile.armyRank ?? '';
                values['armyRankBN'] = profile.armyRankBN ?? '';
                values['corps'] = profile.corps ?? '';
                values['corpsBN'] = profile.corpsBN ?? '';
                values['trade'] = profile.trade ?? '';
                values['tradeBN'] = profile.tradeBN ?? '';
                values['motherOrganization'] = profile.motherOrganization ?? '';
                values['motherOrganizationBN'] = profile.motherOrganizationBN ?? '';
                values['motherUnit'] = profile.motherUnit ?? '';
                values['motherUnitBN'] = profile.motherUnitBN ?? '';
                values['memberType'] = profile.memberType ?? '';
                values['memberTypeBN'] = profile.memberTypeBN ?? '';
                values['appointment'] = profile.appointment ?? '';
                values['appointmentBN'] = profile.appointmentBN ?? '';
                values['joiningDate'] = profile.joiningDate ?? '';
                values['gender'] = profile.gender ?? '';
                values['genderBN'] = profile.genderBN ?? '';
                values['batch'] = profile.batch ?? '';
                values['batchBN'] = profile.batchBN ?? '';
                values['rabUnit'] = profile.rabUnit ?? '';
                values['rabUnitBN'] = profile.rabUnitBN ?? '';
                values['postingStatus'] = profile.postingStatus ?? '';
                values['permanentDistrictTypeName'] = profile.permanentDistrictTypeName ?? '';
                values['permanentDistrictTypeNameBN'] = profile.permanentDistrictTypeNameBN ?? '';
                values['prefix'] = profile.prefix ?? '';
                values['prefixBN'] = profile.prefixBN ?? '';
                values['prefixWithServiceId'] = ((profile.prefix ?? '') + ' ' + (profile.serviceId ?? '')).trim();
                values['prefixWithServiceIdBN'] = ((profile.prefixBN ?? '') + ' ' + (profile.serviceId ?? '')).trim();
                values['tradeRemarks'] = profile.tradeRemarks ?? '';

                // Personal Info fields (EN + BN)
                values['dateOfBirth'] = profile.dateOfBirth ?? '';
                values['bloodGroup'] = profile.bloodGroup ?? '';
                values['nid'] = profile.nid ?? '';
                values['mobileNo'] = profile.mobileNo ?? '';
                values['mobileNoOfficial'] = profile.mobileNoOfficial ?? '';
                values['emailAddress'] = profile.emailAddress ?? '';
                values['religion'] = profile.religion ?? '';
                values['religionBN'] = profile.religionBN ?? '';
                values['passportNo'] = profile.passportNo ?? '';
                values['maritalStatus'] = profile.maritalStatus ?? '';
                values['maritalStatusBN'] = profile.maritalStatusBN ?? '';
                values['emergencyContactNo'] = profile.emergencyContactNo ?? '';
                values['dateOfCommission'] = profile.dateOfCommission ?? '';
                values['dateOfJoiningInServiceTraining'] = profile.dateOfJoiningInServiceTraining ?? '';
                values['medicalCategory'] = profile.medicalCategory ?? '';
                values['medicalCategoryBN'] = profile.medicalCategoryBN ?? '';
                values['educationQualification'] = profile.educationQualification ?? '';
                values['educationQualificationBN'] = profile.educationQualificationBN ?? '';
                values['professionalQualification'] = profile.professionalQualification ?? '';
                values['professionalQualificationBN'] = profile.professionalQualificationBN ?? '';
                values['personalQualification'] = profile.personalQualification ?? '';
                values['personalQualificationBN'] = profile.personalQualificationBN ?? '';
                values['gallantryAwardsDecoration'] = profile.gallantryAwardsDecoration ?? '';
                values['gallantryAwardsDecorationBN'] = profile.gallantryAwardsDecorationBN ?? '';
                values['height'] = profile.height != null ? String(profile.height) : '';
                values['weight'] = profile.weight != null ? String(profile.weight) : '';
                values['identificationMark'] = profile.identificationMark ?? '';

                // Family Info — extract specific relations
                const family = Array.isArray(familyList) ? familyList : [];
                const rel = (f: any) => (f.relation ?? '').toLowerCase();
                const spouse = family.find(f => rel(f).includes('spouse') || rel(f).includes('wife') || rel(f).includes('husband'));
                const father = family.find(f => rel(f).includes('father'));
                const mother = family.find(f => rel(f).includes('mother'));
                values['family_spouse'] = spouse?.name ?? '';
                values['family_father'] = father?.name ?? '';
                values['family_mother'] = mother?.name ?? '';
                values['family_members'] = family.map(f => `${f.relation ?? ''}: ${f.name ?? ''}`).join('; ');

                // Composite name exactly as shown at the top of the member profile.
                values['formattedName'] = getFormattedMemberName(profile, false);
                values['formattedNameBN'] = getFormattedMemberName(profile, true);

                // Present RAB unit as the full hierarchy path from the currently-active Previous RAB Service row.
                const activeRab = findActiveRabService(rabServiceList);
                values['presentRabUnit'] = buildRabUnitPath(activeRab, false) || (profile.rabUnit ?? '');
                values['presentRabUnitBN'] = buildRabUnitPath(activeRab, true) || (profile.rabUnitBN ?? profile.rabUnit ?? '');

                // Posted-out Posting Unit (mother-org transfer destination) — clearance only.
                values['postingUnit'] = postingUnitEN;
                values['postingUnitBN'] = postingUnitBN;

                // Keep any already-present custom columns (e.g. Remarks) in sync for the new row.
                for (const col of this.membersData.columns) {
                    if (col.group === 'custom' && values[col.key] === undefined) values[col.key] = '';
                }

                this.membersData.members.push({ employeeId: emp.employeeID, values, postedOutId });
                this.applyDefaultMemberColumnsIfEmpty();
                this.memberAddLoading = false;
                this.messageService.add({ severity: 'success', summary: 'Member Added', detail: `${profile.nameEnglish || emp.fullNameEN} added.` });
            },
            error: () => {
                this.memberAddLoading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load member profile.' });
            }
        });
    }

    onMemberSearchReset(): void {
        // No action needed
    }

    removeMember(index: number): void {
        this.commitMemberCellEdit(); // settle an open cell edit before the rows below shift up
        this.membersData.members.splice(index, 1);
    }

    // ── Display helpers ──────────────────────────────────────────────────

    memberSerial(index: number): string {
        const n = String(index + 1);
        return this.isBangla ? BanglaNumerals.toBangla(n) + '।' : n + '.';
    }

    /** Digits become Bangla numerals when the document is Bangla. */
    formatMemberCellDisplay(value: string | null | undefined): string {
        const v = value ?? '';
        return this.isBangla ? BanglaNumerals.toBangla(v) : v;
    }

    getMergedCellValue(member: MemberRow, col: MemberColumnDef): string {
        if (!col.mergedFrom) return member.values[col.key] || '—';
        const { keys, separator } = col.mergedFrom;
        if (separator === '()') {
            const parts = keys.map(k => member.values[k] || '').filter(Boolean);
            if (parts.length <= 1) return parts[0] || '—';
            return `${parts[0]} (${parts.slice(1).join(', ')})`;
        }
        return keys.map(k => member.values[k] || '').filter(Boolean).join(separator) || '—';
    }

    // ── Default columns ──────────────────────────────────────────────────

    /** Prefix & Service ID, Rank, Name, Present SRB Unit, (Posting Unit for clearance), Remarks. */
    private buildDefaultColumns(): MemberColumnDef[] {
        const bn = this.isBangla;
        const lbl = (en: string, bnLabel: string) => (bn ? bnLabel : en);
        const cols: MemberColumnDef[] = [
            { key: bn ? 'prefixWithServiceIdBN' : 'prefixWithServiceId', label: lbl('Prefix & Service ID', 'ব্যক্তিগত নম্বর'), group: 'basic' },
            { key: bn ? 'armyRankBN' : 'armyRank', label: lbl('Rank', 'পদবি'), group: 'basic' },
            { key: bn ? 'formattedNameBN' : 'formattedName', label: lbl('Name', 'নাম'), group: 'basic' },
            { key: bn ? 'presentRabUnitBN' : 'presentRabUnit', label: lbl('Present SRB Unit', 'বর্তমান এসআরবি ইউনিট'), group: 'basic' }
        ];
        if (this.isClearance) {
            cols.push({ key: bn ? 'postingUnitBN' : 'postingUnit', label: lbl('Posting Unit', 'বদলি ইউনিট'), group: 'basic' });
        }
        cols.push({ key: 'custom_Remarks', label: lbl('Remarks', 'মন্তব্য'), group: 'custom' });
        return cols;
    }

    private applyDefaultMemberColumnsIfEmpty(): void {
        if (this.defaultColumnsApplied || this.membersData.columns.length > 0) return;
        this.defaultColumnsApplied = true;
        this.columnsAreDefault = true;
        this.membersData.columns = this.buildDefaultColumns();
        for (const m of this.membersData.members) {
            if (m.values['custom_Remarks'] === undefined) m.values['custom_Remarks'] = '';
        }
    }

    private relanguageDefaultColumns(): void {
        if (this.columnsAreDefault && this.membersData.members.length > 0) {
            this.membersData.columns = this.buildDefaultColumns();
        }
    }

    private columnsMatchDefaultSet(cols: MemberColumnDef[]): boolean {
        const keys = cols.map((c) => c.key);
        const en = ['prefixWithServiceId', 'armyRank', 'formattedName', 'presentRabUnit', 'custom_Remarks'];
        const bn = ['prefixWithServiceIdBN', 'armyRankBN', 'formattedNameBN', 'presentRabUnitBN', 'custom_Remarks'];
        const enC = ['prefixWithServiceId', 'armyRank', 'formattedName', 'presentRabUnit', 'postingUnit', 'custom_Remarks'];
        const bnC = ['prefixWithServiceIdBN', 'armyRankBN', 'formattedNameBN', 'presentRabUnitBN', 'postingUnitBN', 'custom_Remarks'];
        const eq = (a: string[]) => a.length === keys.length && a.every((k, i) => k === keys[i]);
        return eq(en) || eq(bn) || eq(enC) || eq(bnC);
    }

    // ── Column management ────────────────────────────────────────────────

    get groupedUnusedColumns(): { label: string; value: string; items: { label: string; value: string }[] }[] {
        const usedKeys = new Set(this.membersData.columns.map(c => c.key));
        const groups: Record<string, { label: string; value: string }[]> = {};
        const groupLabels: Record<string, string> = { basic: 'Basic Info', personal: 'Personal Info', family: 'Family Info' };
        for (const col of this.availableColumns.filter(c => !usedKeys.has(c.key))) {
            (groups[col.group] ??= []).push({ label: col.label, value: col.key });
        }
        return Object.entries(groups).map(([key, items]) => ({ label: groupLabels[key] ?? key, value: key, items }));
    }

    openAddColumnDialog(): void {
        this.addColumnMode = 'field';
        this.selectedColumnKey = null;
        this.newCustomColumnName = '';
        this.showAddColumnDialog = true;
    }

    closeAddColumnDialog(): void {
        this.showAddColumnDialog = false;
    }

    confirmAddColumn(): void {
        if (this.addColumnMode === 'field') {
            if (!this.selectedColumnKey) {
                this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select a field.' });
                return;
            }
            const def = this.availableColumns.find(c => c.key === this.selectedColumnKey);
            if (def && !this.membersData.columns.some(c => c.key === def.key)) {
                this.membersData.columns.push({ ...def });
            }
        } else {
            const name = this.newCustomColumnName.trim();
            if (!name) {
                this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Column name cannot be empty.' });
                return;
            }
            const key = `custom_${name}`;
            if (this.membersData.columns.some(c => c.key === key)) {
                this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'A column with that name already exists.' });
                return;
            }
            this.membersData.columns.push({ key, label: name, group: 'custom' });
            for (const member of this.membersData.members) member.values[key] = '';
        }
        this.columnsAreDefault = false;
        this.closeAddColumnDialog();
    }

    removeColumn(colKey: string): void {
        this.membersData.columns = this.membersData.columns.filter(c => c.key !== colKey);
        this.columnsAreDefault = false;
    }

    startEditColLabel(colKey: string, currentLabel: string, event: Event): void {
        event.stopPropagation();
        this.editingColLabelKey = colKey;
        this.editingColLabelValue = currentLabel;
        setTimeout(() => {
            const el = (event.target as HTMLElement)?.closest('th')?.querySelector('input');
            el?.focus();
            el?.select();
        });
    }

    saveColLabel(colKey: string): void {
        const trimmed = this.editingColLabelValue.trim();
        if (trimmed) {
            const col = this.membersData.columns.find(c => c.key === colKey);
            if (col) col.label = trimmed;
            this.columnsAreDefault = false;
        }
        this.editingColLabelKey = null;
    }

    // ── Inline cell editing ──────────────────────────────────────────────

    isEditableCell(col: MemberColumnDef): boolean {
        return !col.mergedFrom;
    }

    /** Cell-edit identity is the MEMBER, not the row number, so row shifts can't misdirect an edit. */
    private editingMember: MemberRow | null = null;
    private editingColKey: string | null = null;

    memberCellKey(rowIndex: number, colKey: string): string {
        return `${this.membersData.members[rowIndex]?.employeeId}_${colKey}`;
    }

    startEditMemberCell(rowIndex: number, colKey: string, event: Event): void {
        const member = this.membersData.members[rowIndex];
        if (!member) return;
        this.commitMemberCellEdit();
        this.editingMember = member;
        this.editingColKey = colKey;
        this.editingMemberCellKey = this.memberCellKey(rowIndex, colKey);
        this.editingMemberCellValue = (member.values[colKey] ?? '').toString();
        setTimeout(() => {
            const el = (event.target as HTMLElement)?.closest('td')?.querySelector('input');
            el?.focus();
            el?.select();
        });
    }

    onMemberCellBlur(rowIndex: number, colKey: string): void {
        if (this.editingMember && this.editingMember === this.membersData.members[rowIndex] && this.editingColKey === colKey) {
            this.commitMemberCellEdit();
        }
    }

    onMemberCellKeydown(event: KeyboardEvent, rowIndex: number, colKey: string): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.commitMemberCellEdit();
        } else if (event.key === 'Escape') {
            this.cancelMemberCellEdit();
        }
    }

    /** Name / rank / service-id cells can be corrected but never blanked while the member has a value. */
    private isRequiredMemberCell(colKey: string): boolean {
        return ['nameEnglish', 'nameBN', 'formattedName', 'formattedNameBN', 'armyRank', 'armyRankBN',
            'serviceId', 'prefixWithServiceId', 'prefixWithServiceIdBN'].includes(colKey);
    }

    commitMemberCellEdit(): void {
        const member = this.editingMember, colKey = this.editingColKey;
        if (member && colKey && this.membersData.members.includes(member)) {
            const next = (this.editingMemberCellValue ?? '').trim();
            const current = (member.values[colKey] ?? '').toString().trim();
            if (!next && current && this.isRequiredMemberCell(colKey)) {
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Required',
                    detail: this.isBangla ? 'নাম, পদবি ও সার্ভিস আইডি খালি রাখা যাবে না।' : 'Name, rank and service ID cannot be empty.'
                });
            } else {
                member.values[colKey] = next;
            }
        }
        this.cancelMemberCellEdit();
    }

    private cancelMemberCellEdit(): void {
        this.editingMember = null;
        this.editingColKey = null;
        this.editingMemberCellKey = null;
    }

    // ── Drag & Drop Column Reorder ───────────────────────────────────────

    onColDragStart(index: number, event: DragEvent): void {
        this.dragColIndex = index;
        event.dataTransfer!.effectAllowed = 'move';
        event.dataTransfer!.setData('text/plain', String(index));
    }

    onColDragOver(index: number, event: DragEvent): void {
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'move';
    }

    onColDragEnter(index: number, event: DragEvent): void {
        event.preventDefault();
        this.dragOverColIndex = index;
    }

    onColDragLeave(event: DragEvent): void {
        // handled by dragenter on next th
    }

    onColDrop(targetIndex: number, event: DragEvent): void {
        event.preventDefault();
        if (this.dragColIndex !== null && this.dragColIndex !== targetIndex) {
            const cols = [...this.membersData.columns];
            const [moved] = cols.splice(this.dragColIndex, 1);
            cols.splice(targetIndex, 0, moved);
            this.membersData.columns = cols;
        }
        this.dragColIndex = null;
        this.dragOverColIndex = null;
    }

    onColDragEnd(): void {
        this.dragColIndex = null;
        this.dragOverColIndex = null;
    }

    // ── Column Width ─────────────────────────────────────────────────────

    private resizeColIndex: number | null = null;
    private resizeStartX = 0;
    private resizeStartWidth = 0;
    private resizeTableWidth = 0;
    private resizeBoundMove = this.onResizeMove.bind(this);
    private resizeBoundUp = this.onResizeUp.bind(this);

    onResizeStart(colIndex: number, event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.resizeColIndex = colIndex;
        this.resizeStartX = event.clientX;
        const table = (event.target as HTMLElement).closest('th')?.closest('table');
        this.resizeTableWidth = table?.offsetWidth ?? 800;
        this.resizeStartWidth = this.membersData.columns[colIndex]?.width ?? this.getDefaultColWidth();
        document.addEventListener('mousemove', this.resizeBoundMove);
        document.addEventListener('mouseup', this.resizeBoundUp);
    }

    private onResizeMove(event: MouseEvent): void {
        if (this.resizeColIndex === null) return;
        const dPct = ((event.clientX - this.resizeStartX) / this.resizeTableWidth) * 100;
        const newWidth = Math.max(3, Math.min(80, this.resizeStartWidth + dPct));
        this.membersData.columns[this.resizeColIndex].width = Math.round(newWidth * 10) / 10;
    }

    private onResizeUp(): void {
        this.resizeColIndex = null;
        document.removeEventListener('mousemove', this.resizeBoundMove);
        document.removeEventListener('mouseup', this.resizeBoundUp);
    }

    getDefaultColWidth(): number {
        const colCount = this.membersData.columns.length;
        if (colCount === 0) return 100;
        // Reserve ~5% for SL and ~5% for Action
        return Math.round(((100 - 10) / colCount) * 10) / 10;
    }

    getColWidth(col: MemberColumnDef): number {
        return col.width ?? this.getDefaultColWidth();
    }

    setColWidth(col: MemberColumnDef, value: number | string): void {
        const n = Number(value);
        if (isNaN(n)) return;
        col.width = Math.max(3, Math.min(80, Math.round(n * 10) / 10));
        this.columnsAreDefault = false;
    }
}
