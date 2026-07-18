import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { NoteSheetSubjectService, NoteSheetSubjectModel } from '@/Components/basic-setup/shared/services/NoteSheetSubjectService';
import { MessageService } from 'primeng/api';
import { SharedService } from '@/shared/services/shared-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { FluidModule } from 'primeng/fluid';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';
import { CommonCode } from '@/Components/basic-setup/shared/models/common-code';
import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { forkJoin, Subject, of } from 'rxjs';
import { take, catchError } from 'rxjs/operators';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { EmpService } from '@/services/emp-service';
import { ActivatedRoute, Router } from '@angular/router';
import { NoteSheetEditCacheService } from '@/services/note-sheet-edit-cache.service';
import { UserMenuService } from '@/services/user-menu.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { PostingService } from '@/services/posting.service';
import { NoteSheetType, NoteSheetOperationType, NoteSheetOperationTypeOptions, ApprovalStatus, CodeType } from '@/models/enums';
import { NotesheetApproverSelectComponent } from '@/Components/Common/notesheet-approver-select/notesheet-approver-select';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { CheckboxModule } from 'primeng/checkbox';
import { FieldsetModule } from 'primeng/fieldset';
import { TreeSelectModule } from 'primeng/treeselect';
import { TreeNode } from 'primeng/api';
import { OrgService } from '@/Components/basic-setup/org-tree/org.service';
import { DialogModule } from 'primeng/dialog';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { FamilyInfoService, FamilyInfoByEmployeeView } from '@/services/family-info-service';
import { MainTextBlock, parseMainTextBlocks, serializeMainTextBlocks } from '@/shared/utils/notesheet-main-text';
import { getFormattedMemberName } from '@/shared/utils/member-display-name.util';
import { PreviousRABServiceService, VwPreviousRABServiceInfoModel } from '@/services/previous-rab-service.service';

/** Reference paragraph row (serial + text + optional file) */
export interface ReferenceParagraph {
    text: string;
    fileRows: FileRowData[];
}

/** Available column definition for the Members table */
export interface MemberColumnDef {
    key: string;
    label: string;
    group: 'basic' | 'personal' | 'family' | 'custom' | 'merged';
    /** Only for merged columns — stores source keys + separator */
    mergedFrom?: { keys: string[]; separator: string };
    /** Column width as percentage (auto-distributed if omitted) */
    width?: number;
}

/** One member row in the MembersJson table — stores all fetched data */
export interface MemberRow {
    employeeId: number;
    values: Record<string, string>;
}

/** Shape stored in NoteSheetInfo.MembersJson */
export interface MembersJsonData {
    columns: MemberColumnDef[];
    members: MemberRow[];
}

/** All available columns from Basic Info, Personal Info, Family Info */
export const AVAILABLE_MEMBER_COLUMNS: MemberColumnDef[] = [
    // Basic Info
    { key: 'serviceId', label: 'Service ID', group: 'basic' },
    { key: 'rabId', label: 'RAB ID', group: 'basic' },
    { key: 'nameEnglish', label: 'Name (EN)', group: 'basic' },
    { key: 'nameBN', label: 'Name (BN)', group: 'basic' },
    // Composite name as shown at the top of the member profile: Name, Award, Qualification, Corps.
    { key: 'formattedName', label: 'Name — Full (EN)', group: 'basic' },
    { key: 'formattedNameBN', label: 'Name — Full (BN)', group: 'basic' },
    { key: 'armyRank', label: 'Rank (EN)', group: 'basic' },
    { key: 'armyRankBN', label: 'Rank (BN)', group: 'basic' },
    { key: 'corps', label: 'Corps (EN)', group: 'basic' },
    { key: 'corpsBN', label: 'Corps (BN)', group: 'basic' },
    { key: 'trade', label: 'Trade (EN)', group: 'basic' },
    { key: 'tradeBN', label: 'Trade (BN)', group: 'basic' },
    { key: 'motherOrganization', label: 'Mother Organization (EN)', group: 'basic' },
    { key: 'motherOrganizationBN', label: 'Mother Organization (BN)', group: 'basic' },
    { key: 'motherUnit', label: 'Mother Unit (EN)', group: 'basic' },
    { key: 'motherUnitBN', label: 'Mother Unit (BN)', group: 'basic' },
    { key: 'memberType', label: 'Member Type (EN)', group: 'basic' },
    { key: 'memberTypeBN', label: 'Member Type (BN)', group: 'basic' },
    { key: 'appointment', label: 'Appointment (EN)', group: 'basic' },
    { key: 'appointmentBN', label: 'Appointment (BN)', group: 'basic' },
    { key: 'joiningDate', label: 'Joining Date in RAB', group: 'basic' },
    { key: 'gender', label: 'Gender (EN)', group: 'basic' },
    { key: 'genderBN', label: 'Gender (BN)', group: 'basic' },
    { key: 'batch', label: 'Batch (EN)', group: 'basic' },
    { key: 'batchBN', label: 'Batch (BN)', group: 'basic' },
    { key: 'rabUnit', label: 'RAB Unit (EN)', group: 'basic' },
    { key: 'rabUnitBN', label: 'RAB Unit (BN)', group: 'basic' },
    // Full present-posting hierarchy path (Unit > Wing > Branch > Sub-branch > Section > Sub-section)
    // from the currently-active Previous RAB Service row.
    { key: 'presentRabUnit', label: 'Present RAB Unit — Full (EN)', group: 'basic' },
    { key: 'presentRabUnitBN', label: 'Present RAB Unit — Full (BN)', group: 'basic' },
    { key: 'postingStatus', label: 'Posting Status', group: 'basic' },
    { key: 'permanentDistrictTypeName', label: 'Permanent District (EN)', group: 'basic' },
    { key: 'permanentDistrictTypeNameBN', label: 'Permanent District (BN)', group: 'basic' },
    { key: 'prefix', label: 'Prefix (EN)', group: 'basic' },
    { key: 'prefixBN', label: 'Prefix (BN)', group: 'basic' },
    { key: 'prefixWithServiceId', label: 'Prefix with Service ID (EN)', group: 'basic' },
    { key: 'prefixWithServiceIdBN', label: 'Prefix with Service ID (BN)', group: 'basic' },
    { key: 'tradeRemarks', label: 'Trade Remarks', group: 'basic' },
    // Personal Info
    { key: 'dateOfBirth', label: 'Date of Birth', group: 'personal' },
    { key: 'bloodGroup', label: 'Blood Group', group: 'personal' },
    { key: 'nid', label: 'NID', group: 'personal' },
    { key: 'mobileNo', label: 'Mobile No (Personal)', group: 'personal' },
    { key: 'mobileNoOfficial', label: 'Mobile No (Official)', group: 'personal' },
    { key: 'emailAddress', label: 'Email Address', group: 'personal' },
    { key: 'religion', label: 'Religion (EN)', group: 'personal' },
    { key: 'religionBN', label: 'Religion (BN)', group: 'personal' },
    { key: 'passportNo', label: 'Passport No', group: 'personal' },
    { key: 'maritalStatus', label: 'Marital Status (EN)', group: 'personal' },
    { key: 'maritalStatusBN', label: 'Marital Status (BN)', group: 'personal' },
    { key: 'emergencyContactNo', label: 'Emergency Contact', group: 'personal' },
    { key: 'dateOfCommission', label: 'Date of Commission', group: 'personal' },
    { key: 'dateOfJoiningInServiceTraining', label: 'Date of Joining in Service', group: 'personal' },
    { key: 'medicalCategory', label: 'Medical Category (EN)', group: 'personal' },
    { key: 'medicalCategoryBN', label: 'Medical Category (BN)', group: 'personal' },
    { key: 'educationQualification', label: 'Education Qualification (EN)', group: 'personal' },
    { key: 'educationQualificationBN', label: 'Education Qualification (BN)', group: 'personal' },
    { key: 'professionalQualification', label: 'Professional Qualification (EN)', group: 'personal' },
    { key: 'professionalQualificationBN', label: 'Professional Qualification (BN)', group: 'personal' },
    { key: 'personalQualification', label: 'Personal Qualification (EN)', group: 'personal' },
    { key: 'personalQualificationBN', label: 'Personal Qualification (BN)', group: 'personal' },
    { key: 'gallantryAwardsDecoration', label: 'Gallantry Awards (EN)', group: 'personal' },
    { key: 'gallantryAwardsDecorationBN', label: 'Gallantry Awards (BN)', group: 'personal' },
    { key: 'height', label: 'Height', group: 'personal' },
    { key: 'weight', label: 'Weight', group: 'personal' },
    { key: 'identificationMark', label: 'Identification Mark', group: 'personal' },
    // Family Info
    { key: 'family_spouse', label: 'Spouse Name', group: 'family' },
    { key: 'family_father', label: 'Father Name', group: 'family' },
    { key: 'family_mother', label: 'Mother Name', group: 'family' },
    { key: 'family_members', label: 'Family Members (All)', group: 'family' },
];

@Component({
    selector: 'app-notesheet-generate',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        FormsModule,
        FluidModule,
        InputTextModule,
        ButtonModule,
        SelectModule,
        MultiSelectModule,
        DatePickerModule, FlexibleDateDirective,
        AutoCompleteModule,
        RichEditorComponent,
        FileReferencesFormComponent,
        TooltipModule,
        ToastModule,
        CheckboxModule,
        FieldsetModule,
        TreeSelectModule,
        DialogModule,
        EmployeeSearchComponent,
        NotesheetApproverSelectComponent
    ],
    templateUrl: './notesheet-generate.html',
    providers: [MessageService],
    styleUrl: './notesheet-generate.scss'
})
export class NotesheetGenerateComponent implements OnInit {
    title = 'Generate NoteSheet';
    form!: FormGroup;
    isSubmitting = false;
    editMode = false;
    editId: number | null = null;
    originalCreatedBy: string | null = null;
    isPreparedByMapped = false;
    textTypeOptions = [
        { label: 'English', value: 'en' },
        { label: 'Bangla', value: 'bn' }
    ];
    readonly noteSheetOperationTypeOptions = NoteSheetOperationTypeOptions;

    // Unit hierarchy tree
    unitTreeNodes: TreeNode[] = [];
    selectedUnitNode: TreeNode | null = null;
    unitTreeLoading = false;
    private unitNodeMap: Record<number, TreeNode> = {};
    private unitTreeReady$ = new Subject<void>();

    preparedByOptions: { label: string; value: number }[] = [];
    referenceEmployeeOptions: { label: string; labelBn: string | null; value: number }[] = [];

    // Reference paragraphs (JSON array with serial + file)
    referenceParagraphs: ReferenceParagraph[] = [{ text: '', fileRows: [] }];

    // Main Text blocks — repeatable rich-text paragraphs, each rendered with its
    // own serial in the note-sheet. Stored in NoteSheetInfo.MainText as a JSON array.
    mainTextParagraphs: MainTextBlock[] = [{ text: '' }];

    // Last Text blocks — repeatable rich-text paragraphs, each with its own serial.
    // Stored in NoteSheetInfo.ParagraphText as a JSON array of HTML strings
    // (["<p>..</p>", ...]) — the same convention posting note-sheets already use.
    lastTextParagraphs: string[] = [''];

    // ── Members Table (MembersJson) ─────────────────────────────────────
    membersData: MembersJsonData = { columns: [], members: [] };
    /** True once the default column set has been auto-applied, so we don't fight the
     *  user if they clear columns, and don't override columns loaded in edit mode. */
    private defaultColumnsApplied = false;
    /** True while the columns are still the untouched default set — lets a language
     *  switch rebuild them; cleared once the user manually add/remove/rename/merge a column. */
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

    // Merge columns
    showMergeColumnDialog = false;
    mergeSelectedColumns: MemberColumnDef[] = [];
    mergeSeparator = ' ';
    mergeCustomSeparator = '';
    mergeLabel = '';
    mergeSeparatorOptions = [
        { label: 'Space', value: ' ' },
        { label: 'Comma + Space', value: ', ' },
        { label: 'Dash', value: '-' },
        { label: 'Slash', value: '/' },
        { label: 'Parentheses ( )', value: '()' },
        { label: 'Custom', value: '__custom__' },
    ];

    // Subject autocomplete (legacy free-text — kept for backward compat)
    subjectSuggestions: string[] = [];

    // Subject dropdown — General subjects from the NoteSheetSubject master.
    // The selected subject's id is stored (NoteSheetInfo.NoteSheetSubjectId); the
    // text is also mirrored into `subject` for list/search. Label follows textType.
    private subjectPickList: NoteSheetSubjectModel[] = [];
    subjectOptions: { label: string; value: number }[] = [];

    // NoteSheet number config
    allNoteSheetConfigs: any[] = [];
    private memberTypeMap = new Map<number, { en: string; bn: string }>();
    noteSheetConfigOptions: { label: string; value: number }[] = [];
    private noteSheetPrefixEN = '';
    private noteSheetPrefixBN = '';

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    /** Member Type (CommonCode 'EmployeeType') options + the logged-in user's accessible set. */
    allMemberTypes: { value: number; en: string; bn: string }[] = [];
    allowedMemberTypeIds: number[] | null = null;

    @ViewChild('fileReferencesForm') fileReferencesForm!: FileReferencesFormComponent;

    constructor(
        private masterBasicSetupService: MasterBasicSetupService,
        private messageService: MessageService,
        private fb: FormBuilder,
        private sharedService: SharedService,
        private http: HttpClient,
        private empService: EmpService,
        private route: ActivatedRoute,
        private router: Router,
        private sanitizer: DomSanitizer,
        private noteSheetEditCache: NoteSheetEditCacheService,
        private identityMappingService: IdentityUserMappingService,
        private memberTypeAccess: IdentityUserMemberTypeAccessService,
        private _userMenuService: UserMenuService,
        private postingService: PostingService,
        private orgService: OrgService,
        private servingMembersService: ServingMembersService,
        private familyInfoService: FamilyInfoService,
        private noteSheetSubjectService: NoteSheetSubjectService,
        private previousRABService: PreviousRABServiceService
    ) {
        this.form = this.fb.group({
            noteSheetTemplateId: [null as number | null],
            textType: ['bn'],
            noteSheetDate: [null as Date | null, Validators.required],
            unitId: [null as number | null],
            wingBattalionId: [null as number | null],
            branchId: [null as number | null],
            subBranchId: [null as number | null],
            sectionId: [null as number | null],
            subSectionId: [null as number | null],
            noteSheetNo: [''],
            noteSheetNumberConfigId: [null as number | null, Validators.required],
            noteSheetSubjectId: [null as number | null, Validators.required],
            subject: [''],
            note: [''],
            preparedBy: [''],
            preparedByEmployeeId: [null as number | null],
            initiatorId: [null as number | null, Validators.required],
            recommenderIds: [[] as number[]],
            finalApproverId: [null as number | null, Validators.required],
            isSecret: [false],
            noteSheetOperationType: [NoteSheetOperationType.Manual as string, Validators.required],
            referenceEmployeeIds: [[] as number[]],
            memberTypeIds: [[] as number[]]
        });
    }

    /** Initiator/final approver are required only for manual note sheets. System-generate note
     *  sheets get the chain from config, so the pickers are hidden and these validators dropped. */
    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this.router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;
        this.loadUnitTree();
        this.loadPreparedByOptions();
        this.loadReferenceEmployeeOptions();
        this.loadNoteSheetNumberConfig();
        this.loadCurrentUserMemberTypePermissions();
        this.loadSubjectPickList();
        const user = this.sharedService.getCurrentUser?.() ?? '';
        this.form.get('preparedBy')?.setValue(user);
        this.resolvePreparedByMapping();
        this.route.queryParams.pipe(take(1)).subscribe((params) => {
            const id = params['id'];
            if (id != null && id !== '') {
                const numId = Number(id);
                if (!isNaN(numId) && numId > 0) {
                    this.editId = numId;
                    this.editMode = true;
                    this.title = 'Update Draft Note-Sheet';
                    this.form.get('noteSheetNumberConfigId')?.clearValidators();
                    this.form.get('noteSheetNumberConfigId')?.updateValueAndValidity();
                    this.loadNoteSheetForEdit(numId);
                }
            }
        });

        this.form.get('textType')?.valueChanges.subscribe((newType: string) => {
            this.buildNoteSheetConfigOptions();
            this.buildSubjectOptions();
            // Type drives the whole document's language — reflect it in the (untouched) member table too.
            this.relanguageDefaultColumns();
            if (this.editMode) {
                this.transformNoteSheetNo(newType);
            }
        });
    }

    // ── Subject dropdown (General subject master) ───────────────────────────

    /** Load active General-type subjects for the subject dropdown. */
    private loadSubjectPickList(): void {
        this.noteSheetSubjectService.getActiveByType(NoteSheetType.General).subscribe({
            next: (list) => {
                this.subjectPickList = Array.isArray(list) ? list : [];
                this.buildSubjectOptions();
            },
            error: () => {
                this.subjectPickList = [];
                this.subjectOptions = [];
            }
        });
    }

    /** Option labels follow the current textType (bn/en). */
    private buildSubjectOptions(): void {
        const isBn = this.form.get('textType')?.value === 'bn';
        this.subjectOptions = this.subjectPickList.map((s) => ({
            label: (isBn ? s.subjectBN : s.subjectEN) || s.subjectEN || s.subjectBN || '',
            value: s.id
        }));
    }

    /** Mirror the picked subject's text into `subject` (stored for list/search; preview resolves BN/EN by id). */
    onSubjectPicked(id: number | null): void {
        this.form.get('subject')?.setValue(this.subjectTextById(id, this.form.get('textType')?.value === 'bn'));
    }

    /** Resolve a subject's display text (current language) from the master list by id. */
    private subjectTextById(id: number | null | undefined, isBn: boolean): string {
        const picked = this.subjectPickList.find((s) => s.id === id);
        return picked ? ((isBn ? picked.subjectBN : picked.subjectEN) || picked.subjectEN || picked.subjectBN || '') : '';
    }

    /** Subject text for the payload — the form value, or derived from the picked id if empty. */
    private resolveSubjectText(d: any): string {
        const existing = d.subject != null ? String(d.subject) : '';
        if (existing.trim()) return existing;
        return this.subjectTextById(d.noteSheetSubjectId, d.textType === 'bn');
    }

    // ── Unit Hierarchy Tree ─────────────────────────────────────────────

    private loadUnitTree(): void {
        if (this.unitTreeNodes.length > 0) return;
        this.unitTreeLoading = true;
        this.orgService.getAll(0).subscribe({
            next: (roots) => {
                this.unitNodeMap = {};
                this.unitTreeNodes = roots
                    .filter((r: any) => r.status === 1)
                    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                    .map((r: any) => this.toTreeNode(r, null));
                this.unitTreeLoading = false;
                this.unitTreeReady$.next();
            },
            error: () => { this.unitTreeLoading = false; }
        });
    }

    private toTreeNode(node: any, parent: TreeNode | null): TreeNode {
        const tn: TreeNode = {
            key: String(node.id),
            label: node.nameEN || node.nameBN || `ID ${node.id}`,
            data: { id: node.id, nameEN: node.nameEN, nameBN: node.nameBN, codeType: node.codeType, parent },
            leaf: false,
            children: []
        };
        this.unitNodeMap[node.id] = tn;
        return tn;
    }

    onUnitNodeExpand(event: any): void {
        const node: TreeNode = event.node;
        if (node.children && node.children.length > 0) return;
        this.orgService.loadChildren(Number(node.key)).subscribe({
            next: (children: any[]) => {
                node.children = children
                    .filter((c: any) => c.status === 1)
                    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                    .map((c: any) => this.toTreeNode(c, node));
                if (node.children!.length === 0) node.leaf = true;
                this.unitTreeNodes = [...this.unitTreeNodes];
            }
        });
    }

    onUnitNodeSelect(event: any): void {
        this.selectedUnitNode = event.node;
    }

    onUnitNodeClear(): void {
        this.selectedUnitNode = null;
    }

    getUnitFullPath(node: TreeNode | null): string {
        if (!node) return '';
        const parts: string[] = [];
        let cur: TreeNode | null = node;
        while (cur) {
            parts.unshift(cur.label ?? '');
            cur = cur.data?.parent ?? null;
        }
        return parts.join(' > ');
    }

    /** Map selected tree node's hierarchy to unitId/wingBattalionId/branchId/subBranchId/sectionId/subSectionId */
    private getHierarchyIdsFromSelectedNode(): Record<string, number | null> {
        const levels: { key: string; codeType: string }[] = [
            { key: 'unitId', codeType: 'Unit' },
            { key: 'wingBattalionId', codeType: 'Wing' },
            { key: 'branchId', codeType: 'Branch' },
            { key: 'subBranchId', codeType: 'Sub-Branch' },
            { key: 'sectionId', codeType: 'Section' },
            { key: 'subSectionId', codeType: 'Sub-Section' }
        ];
        const result: Record<string, number | null> = {};
        levels.forEach(l => result[l.key] = null);

        if (!this.selectedUnitNode) return result;

        // Walk up from selected node to root, collecting each level
        const chain: TreeNode[] = [];
        let cur: TreeNode | null = this.selectedUnitNode;
        while (cur) {
            chain.unshift(cur);
            cur = cur.data?.parent ?? null;
        }

        for (const node of chain) {
            const ct = node.data?.codeType ?? '';
            const match = levels.find(l => l.codeType === ct);
            if (match) {
                result[match.key] = Number(node.key);
            }
        }

        return result;
    }

    /** In edit mode, expand the tree to show the deepest selected unit */
    private expandTreeToNode(nodeId: number): void {
        const doExpand = () => {
            this.masterBasicSetupService.getAncestorsOfCommonCode(nodeId).subscribe({
                next: (ancestors) => {
                    const chain = Array.isArray(ancestors) ? ancestors : [];
                    if (chain.length === 0) return;
                    // Chain is root→...→leaf. Expand each level sequentially.
                    this.expandChain(chain, 0);
                }
            });
        };

        // Wait for unit tree to be loaded before expanding
        if (this.unitTreeNodes.length > 0) {
            doExpand();
        } else {
            this.unitTreeReady$.pipe(take(1)).subscribe(() => doExpand());
        }
    }

    private expandChain(chain: any[], index: number): void {
        if (index >= chain.length) {
            // All expanded, select the leaf node
            const leafId = chain[chain.length - 1].codeId ?? chain[chain.length - 1].CodeId;
            const leafNode = this.unitNodeMap[leafId];
            if (leafNode) {
                this.selectedUnitNode = leafNode;
            }
            return;
        }

        const item = chain[index];
        const id = item.codeId ?? item.CodeId;
        const existing = this.unitNodeMap[id];

        if (existing) {
            existing.expanded = true;
            // If children not loaded yet, load them
            if (!existing.children || existing.children.length === 0) {
                this.orgService.loadChildren(id).subscribe({
                    next: (children: any[]) => {
                        existing.children = children
                            .filter((c: any) => c.status === 1)
                            .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                            .map((c: any) => this.toTreeNode(c, existing));
                        if (existing.children!.length === 0) existing.leaf = true;
                        this.unitTreeNodes = [...this.unitTreeNodes];
                        this.expandChain(chain, index + 1);
                    }
                });
            } else {
                this.expandChain(chain, index + 1);
            }
        } else {
            // Node not yet in tree, skip and continue
            this.expandChain(chain, index + 1);
        }
    }

    // ── Subject Autocomplete ─────────────────────────────────────────────

    searchSubject(event: { query: string }): void {
        const api = `${environment.apis.core}/NoteSheetInfo`;
        this.http.get<string[]>(`${api}/SearchSubjects`, { params: { query: event.query } }).subscribe({
            next: (results) => { this.subjectSuggestions = results ?? []; },
            error: () => { this.subjectSuggestions = []; }
        });
    }

    // ── Reference Paragraphs (Serial + File) ─────────────────────────────

    addReferenceParagraph(): void {
        this.referenceParagraphs.push({ text: '', fileRows: [] });
    }

    removeReferenceParagraph(index: number): void {
        if (this.referenceParagraphs.length > 1) {
            this.referenceParagraphs.splice(index, 1);
        }
    }

    /** Get serial label based on textType: ক,খ,গ for Bangla, A,B,C for English */
    getSerialLabel(index: number): string {
        if (this.isBangla) {
            const banglaLetters = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ', 'ঝ', 'ঞ', 'ট', 'ঠ', 'ড', 'ঢ', 'ণ', 'ত', 'থ', 'দ', 'ধ', 'ন'];
            return (banglaLetters[index] ?? String(index + 1)) + '.';
        } else {
            return String.fromCharCode(65 + index) + '.';
        }
    }

    onRefFileRowsChange(event: FileRowData[], index: number): void {
        if (event && Array.isArray(event)) {
            this.referenceParagraphs[index].fileRows = event;
        }
    }

    onRefDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to download file.' })
        });
    }

    trackByIndex(index: number): number {
        return index;
    }

    // ── Main Text Blocks (repeatable) ────────────────────────────────────

    addMainTextParagraph(): void {
        this.mainTextParagraphs.push({ text: '' });
    }

    removeMainTextParagraph(index: number): void {
        if (this.mainTextParagraphs.length > 1) {
            this.mainTextParagraphs.splice(index, 1);
        }
    }

    /** Numeric serial for a Main Text block: ১।/২। in Bangla, 1./2. in English. */
    getMainTextSerial(index: number): string {
        const n = String(index + 1);
        return this.isBangla ? BanglaNumerals.toBangla(n) + '।' : n + '.';
    }

    // ── Last Text Blocks (repeatable) ────────────────────────────────────

    addLastTextParagraph(): void {
        this.lastTextParagraphs.push('');
    }

    removeLastTextParagraph(index: number): void {
        if (this.lastTextParagraphs.length > 1) {
            this.lastTextParagraphs.splice(index, 1);
        }
    }

    /** Numeric serial for a Last Text block: ১।/২। in Bangla, 1./2. in English. */
    getLastTextSerial(index: number): string {
        const n = String(index + 1);
        return this.isBangla ? BanglaNumerals.toBangla(n) + '।' : n + '.';
    }

    /** Parse stored ParagraphText into blocks. JSON array → strings; legacy plain
     *  HTML → single block; empty → one blank block. */
    private parseLastTextBlocks(raw: string | null | undefined): string[] {
        const s = (raw ?? '').trim();
        if (!s) return [''];
        if (s.startsWith('[')) {
            try {
                const arr = JSON.parse(s);
                if (Array.isArray(arr)) {
                    const blocks = arr.map((p: any) => String(p ?? '')).filter((p) => p.trim() !== '');
                    return blocks.length ? blocks : [''];
                }
            } catch { /* legacy HTML string below */ }
        }
        return [s];
    }

    // ── NoteSheet Number Config ──────────────────────────────────────────

    private loadNoteSheetNumberConfig(): void {
        const configApi = `${environment.apis.core}/NoteSheetNumberConfig`;
        forkJoin([
            this.http.get<any[]>(`${configApi}/GetAll`),
            this.masterBasicSetupService.getAllByType(CodeType.EmployeeType)
        ]).subscribe({
            next: ([configs, memberTypes]) => {
                (memberTypes ?? []).forEach(mt => {
                    this.memberTypeMap.set(mt.codeId, {
                        en: mt.codeValueEN ?? '',
                        bn: mt.codeValueBN ?? mt.codeValueEN ?? ''
                    });
                });

                // Options for the "Member Type" multi-select (accessible subset applied by getter).
                this.allMemberTypes = (memberTypes ?? [])
                    .filter((mt: any) => mt.status !== false)
                    .map((mt: any) => ({ value: mt.codeId, en: mt.codeValueEN ?? '', bn: mt.codeValueBN ?? mt.codeValueEN ?? '' }));

                this.allNoteSheetConfigs = (configs ?? []).filter(
                    (c: any) => (c.noteSheetType ?? c.NoteSheetType) === 'General'
                        && (c.status ?? c.Status) !== false
                );

                const first = this.allNoteSheetConfigs[0];
                if (first) {
                    this.noteSheetPrefixEN = first.prefix ?? first.Prefix ?? '';
                    this.noteSheetPrefixBN = first.prefixBN ?? first.PrefixBN ?? '';
                }

                this.buildNoteSheetConfigOptions();
            }
        });
    }

    private buildNoteSheetConfigOptions(): void {
        const isBn = this.form.get('textType')?.value === 'bn';

        this.noteSheetConfigOptions = this.allNoteSheetConfigs.map((c: any) => {
            const configId = c.configId ?? c.ConfigId;
            const prefix = isBn
                ? (c.prefixBN ?? c.PrefixBN ?? c.prefix ?? c.Prefix ?? '')
                : (c.prefix ?? c.Prefix ?? '');
            const memberTypeId = c.memberTypeId ?? c.MemberTypeId;
            const mt = this.memberTypeMap.get(memberTypeId);
            const memberLabel = mt ? (isBn ? mt.bn : mt.en) : '';
            const includeDate = c.includeDateInNumber ?? c.IncludeDateInNumber ?? false;

            let pattern: string;
            if (includeDate) {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const yearStr = isBn ? BanglaNumerals.toBangla(String(year)) : String(year);
                const monthStr = isBn ? BanglaNumerals.toBangla(month) : month;
                pattern = `${prefix}/${yearStr}/${monthStr}/***`;
            } else {
                pattern = `${prefix}/***`;
            }
            const label = memberLabel ? `${pattern}  (${memberLabel})` : pattern;
            return { label, value: configId };
        });

        const ctrl = this.form.get('noteSheetNumberConfigId');
        const currentVal = ctrl?.value;
        if (this.noteSheetConfigOptions.length === 1) {
            ctrl?.setValue(this.noteSheetConfigOptions[0].value);
        } else if (currentVal != null && this.noteSheetConfigOptions.some(o => o.value === currentVal)) {
            // Force PrimeNG p-select to refresh displayed label after options rebuild
            ctrl?.setValue(currentVal);
        }
    }

    // ── Misc ─────────────────────────────────────────────────────────────

    get isBangla(): boolean {
        return this.form?.get('textType')?.value === 'bn';
    }

    /** Member type dropdown options limited to the user's accessible set (label follows language). */
    get memberTypeOptions(): { label: string; value: number }[] {
        const isBn = this.isBangla;
        let list = this.allMemberTypes;
        if (this.allowedMemberTypeIds != null) {
            const allowed = this.allowedMemberTypeIds;
            list = list.filter((o) => allowed.includes(o.value));
        }
        return list.map((o) => ({ label: (isBn ? o.bn : o.en) || o.en || o.bn || String(o.value), value: o.value }));
    }

    /** Resolve the current user's accessible member type ids (cache first, then always refetch
     *  so admin changes apply without a re-login). */
    private loadCurrentUserMemberTypePermissions(): void {
        const userId = this.sharedService.getCurrentUserId?.() ?? null;
        if (!userId) { this.allowedMemberTypeIds = null; return; }
        this.allowedMemberTypeIds = this.memberTypeAccess.getCachedMemberTypeIds(userId);
        this.memberTypeAccess.cacheForUser(userId).subscribe({
            next: (ids) => { this.allowedMemberTypeIds = Array.isArray(ids) ? ids : []; },
            error: () => { /* keep cached value on network error */ }
        });
    }

    /** Parse comma-separated "1,2,3" → number[]. */
    private parseMemberTypeIds(ids: string | null | undefined): number[] {
        if (!ids) return [];
        return String(ids).split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    }

    memberSerial(index: number): string {
        const n = index + 1;
        return this.isBangla ? BanglaNumerals.toBangla(String(n)) + '।' : String(n) + '.';
    }

    get referenceEmployeeOptionsDisplay(): { label: string; value: number }[] {
        return this.referenceEmployeeOptions.map((o) => ({ label: o.label, value: o.value }));
    }

    onTextTypeChange(): void {
        // Language switch refreshes labels via getters.
    }

    onFileRowsChange(event: FileRowData[]): void {
        if (event && Array.isArray(event)) {
            // handled by fileReferencesForm viewchild
        }
    }

    onDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to download file.' })
        });
    }

    private loadPreparedByOptions(): void {
        this.postingService.getApprovalEmployees().subscribe({
            next: (opts) => { this.preparedByOptions = opts ?? []; },
            error: () => {}
        });
    }

    loadReferenceEmployeeOptions(): void {
        const api = `${environment.apis.core}/EmployeeInfo`;
        this.http.get<any[]>(`${api}/GetBasicServiceInformationOfServingMember`).subscribe({
            next: (list) => {
                this.referenceEmployeeOptions = (Array.isArray(list) ? list : []).map((e: any) => {
                    const name = e.nameEnglish || e.NameEnglish || '';
                    const rabId = e.rabId || e.RabId || '';
                    const serviceId = e.serviceId || e.ServiceId || '';
                    const parts = [name, rabId ? `RAB: ${rabId}` : '', serviceId ? `SVC: ${serviceId}` : ''].filter(Boolean);
                    return {
                        label: parts.join(' | ') || `ID ${e.employeeID ?? e.EmployeeID}`,
                        labelBn: e.nameBN || e.NameBN || null,
                        value: e.employeeID ?? e.EmployeeID
                    };
                });
            }
        });
    }

    private resolvePreparedByMapping(): void {
        const userId = this.sharedService.getCurrentUserId?.();
        if (!userId) {
            this.isPreparedByMapped = false;
            return;
        }
        this.identityMappingService.getEmployeeIdForUser(userId).subscribe({
            next: (empId) => {
                if (empId) {
                    this.isPreparedByMapped = true;
                    this.form.get('preparedByEmployeeId')?.setValue(empId);
                    this.empService.getEmployeeById(empId).subscribe({
                        next: (emp: any) => {
                            const name = emp?.FullNameEN || emp?.fullNameEN || '';
                            const rabId = emp?.RABID || emp?.rabid || emp?.Rabid || '';
                            const serviceId = emp?.ServiceId || emp?.serviceId || '';
                            const parts = [name, rabId ? `RAB: ${rabId}` : '', serviceId ? `SVC: ${serviceId}` : ''].filter(Boolean);
                            this.form.get('preparedBy')?.setValue(parts.join(' | ') || `Employee #${empId}`);
                        }
                    });
                } else {
                    this.isPreparedByMapped = false;
                }
            },
            error: () => { this.isPreparedByMapped = false; }
        });
    }

    // ── Edit Mode ────────────────────────────────────────────────────────

    private loadNoteSheetForEdit(noteSheetId: number): void {
        const user = this.sharedService.getCurrentUser?.() ?? '';
        const cached = this.noteSheetEditCache.get(noteSheetId);
        if (cached != null && typeof cached === 'object') {
            const d = cached;
            if (d.noteSheetType === NoteSheetType.ExBDLeave || d.NoteSheetType === NoteSheetType.ExBDLeave) {
                this.noteSheetEditCache.set(noteSheetId, d);
                this.router.navigate(['/notesheet-ex-bd-leave'], { queryParams: { id: noteSheetId } });
                return;
            }
            this.applyCachedNoteSheetToForm(d, user);
            return;
        }
        const api = `${environment.apis.core}/NoteSheetInfo`;
        this.http.get<any>(`${api}/GetFilteredByKeysAsyn/${noteSheetId}`).subscribe({
            next: (data) => {
                const raw = data != null && typeof data === 'object' ? (data.data ?? data.value ?? data) : data;
                const list = Array.isArray(raw) ? raw : raw != null && typeof raw === 'object' && !Array.isArray(raw) ? [raw] : [];
                const row = list[0];
                if (!row) return;
                if (row.noteSheetType === NoteSheetType.ExBDLeave || row.NoteSheetType === NoteSheetType.ExBDLeave) {
                    this.router.navigate(['/notesheet-ex-bd-leave'], { queryParams: { id: noteSheetId } });
                    return;
                }
                this.applyCachedNoteSheetToForm(row, user);
            },
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load note-sheet for edit.' })
        });
    }

    private applyCachedNoteSheetToForm(d: any, user: string): void {
        // Editing an existing draft — keep whatever columns were saved; never auto-apply/relanguage defaults.
        this.defaultColumnsApplied = true;
        this.columnsAreDefault = false;
        this.originalCreatedBy = d.createdBy ?? d.CreatedBy ?? d.lastUpdatedBy ?? d.LastUpdatedBy ?? user ?? null;
        const noteSheetDate = (d.noteSheetDate ?? d.NoteSheetDate) != null ? this.parseDate(d.noteSheetDate ?? d.NoteSheetDate) : null;
        let recommenderIds: number[] = [];
        const recommendersJson = d.recommendersJson ?? d.RecommendersJson;
        const recommenderIdsJson = d.recommenderIdsJson ?? d.RecommenderIdsJson;
        const rawJson = recommendersJson ?? recommenderIdsJson;
        if (rawJson && typeof rawJson === 'string') {
            try {
                const arr = JSON.parse(rawJson);
                if (Array.isArray(arr) && arr.length > 0) {
                    if (typeof arr[0] === 'object' && arr[0] !== null) {
                        recommenderIds = arr.map((r: any) => r.recomender_id ?? r.recomenderId ?? r.RecomenderId).filter(Boolean);
                    } else {
                        recommenderIds = arr.filter((x: any) => typeof x === 'number');
                    }
                }
            } catch {}
        }
        this.form.patchValue({
            noteSheetTemplateId: d.noteSheetTemplateId ?? d.NoteSheetTemplateId ?? null,
            textType: (d.textType ?? d.TextType) === 1 ? 'bn' : 'en',
            noteSheetDate,
            unitId: d.unitId ?? d.UnitId ?? null,
            wingBattalionId: d.wingBattalionId ?? d.WingBattalionId ?? null,
            branchId: d.branchId ?? d.BranchId ?? null,
            subBranchId: d.subBranchId ?? d.SubBranchId ?? null,
            sectionId: d.sectionId ?? d.SectionId ?? null,
            subSectionId: d.subSectionId ?? d.SubSectionId ?? null,
            noteSheetNo: String(d.noteSheetNo ?? d.NoteSheetNo ?? ''),
            noteSheetSubjectId: d.noteSheetSubjectId ?? d.NoteSheetSubjectId ?? null,
            subject: String(d.subject ?? d.Subject ?? ''),
            note: String(d.note ?? d.Note ?? ''),
            preparedBy: d.createdBy ?? d.CreatedBy ?? d.lastUpdatedBy ?? d.LastUpdatedBy ?? user,
            preparedByEmployeeId: d.preparedByEmployeeId ?? d.PreparedByEmployeeId ?? null,
            initiatorId: d.initiatorId ?? d.InitiatorId ?? null,
            recommenderIds,
            finalApproverId: d.finalApprovalId ?? d.FinalApprovalId ?? null,
            isSecret: !!(d.isSecret ?? d.IsSecret ?? false),
            noteSheetOperationType: d.noteSheetOperationType ?? d.NoteSheetOperationType ?? null,
            memberTypeIds: this.parseMemberTypeIds(d.employeeTypeIds ?? d.EmployeeTypeIds)
        });
        if (d.createdBy ?? d.CreatedBy) this.form.get('preparedBy')?.setValue(d.createdBy ?? d.CreatedBy);

        // Load Main Text blocks (JSON array; legacy HTML string → single block)
        this.mainTextParagraphs = parseMainTextBlocks(d.mainText ?? d.MainText);

        // Load Last Text blocks (JSON array of strings; legacy HTML string → single block)
        this.lastTextParagraphs = this.parseLastTextBlocks(d.paragraphText ?? d.ParagraphText);

        // Load reference number paragraphs
        const refNumber = d.referenceNumber ?? d.ReferenceNumber;
        if (refNumber && typeof refNumber === 'string') {
            try {
                const arr = JSON.parse(refNumber);
                if (Array.isArray(arr) && arr.length > 0) {
                    this.referenceParagraphs = arr.map((item: any) => ({
                        text: item.text ?? item.Text ?? '',
                        fileRows: (item.files ?? item.Files ?? []).map((f: any) => ({
                            displayName: f.fileName ?? f.FileName ?? '',
                            file: null,
                            fileId: f.FileId ?? f.fileId
                        }))
                    }));
                }
            } catch {
                // Legacy plain string - put in first paragraph
                this.referenceParagraphs = [{ text: refNumber, fileRows: [] }];
            }
        }

        // Expand tree to the deepest selected unit level in edit mode
        const deepestId = d.subSectionId ?? d.SubSectionId
            ?? d.sectionId ?? d.SectionId
            ?? d.subBranchId ?? d.SubBranchId
            ?? d.branchId ?? d.BranchId
            ?? d.wingBattalionId ?? d.WingBattalionId
            ?? d.unitId ?? d.UnitId;
        if (deepestId) {
            this.expandTreeToNode(deepestId);
        }

        // Load members from NoteSheetReferenceEmployee
        const noteSheetId = d.noteSheetId ?? d.NoteSheetId;
        if (noteSheetId) {
            const refApi = `${environment.apis.core}/NoteSheetReferenceEmployee`;
            this.http.get<any[]>(`${refApi}/GetByNoteSheetId/${noteSheetId}`).subscribe({
                next: (list) => {
                    const rows = (Array.isArray(list) ? list : []).filter(r => r.informationJson || r.InformationJson);
                    if (rows.length > 0) {
                        try {
                            const firstParsed = JSON.parse(rows[0].informationJson || rows[0].InformationJson);
                            const columns = Array.isArray(firstParsed.columns) ? firstParsed.columns : [];
                            const members: MemberRow[] = rows.map(r => {
                                const parsed = JSON.parse(r.informationJson || r.InformationJson);
                                const vals = parsed.values || {};
                                // Recompute derived fields if missing
                                if (!vals['prefixWithServiceId'] && (vals['prefix'] || vals['serviceId'])) {
                                    vals['prefixWithServiceId'] = ((vals['prefix'] ?? '') + ' ' + (vals['serviceId'] ?? '')).trim();
                                }
                                if (!vals['prefixWithServiceIdBN'] && (vals['prefixBN'] || vals['serviceId'])) {
                                    vals['prefixWithServiceIdBN'] = ((vals['prefixBN'] ?? '') + ' ' + (vals['serviceId'] ?? '')).trim();
                                }
                                return {
                                    employeeId: r.employeeId ?? r.EmployeeId,
                                    values: vals
                                };
                            });
                            this.membersData = { columns, members };
                            // Match create-mode behaviour in edit mode:
                            //  • no saved column config → show the default set;
                            //  • saved config that IS the default set → let a language switch relanguage it;
                            //  • otherwise → keep the user's saved columns as-is.
                            if (columns.length === 0) {
                                this.defaultColumnsApplied = false;
                                this.applyDefaultMemberColumnsIfEmpty();
                            } else {
                                this.columnsAreDefault = this.columnsMatchDefaultSet(columns);
                            }
                        } catch { /* malformed JSON — leave default */ }
                    } else {
                        // Draft has no saved members → let the default columns appear when one is added.
                        this.defaultColumnsApplied = false;
                        this.columnsAreDefault = false;
                    }
                }
            });
        }
    }

    private parseDate(value: string | Date): Date | null {
        if (value instanceof Date) return value;
        if (typeof value !== 'string') return null;
        const dt = new Date(value);
        return isNaN(dt.getTime()) ? null : dt;
    }

    private toEnglishDigits(str: string): string {
        return str.replace(/[\u09E6-\u09EF]/g, (c) => String(c.charCodeAt(0) - 0x09E6));
    }

    private transformNoteSheetNo(newTextType: string): void {
        const currentNo: string = this.form.get('noteSheetNo')?.value ?? '';
        if (!currentNo || (!this.noteSheetPrefixEN && !this.noteSheetPrefixBN)) return;

        let transformed: string;
        if (newTextType === 'bn') {
            if (this.noteSheetPrefixEN && currentNo.startsWith(this.noteSheetPrefixEN + '/')) {
                const rest = currentNo.substring(this.noteSheetPrefixEN.length);
                const bnPrefix = this.noteSheetPrefixBN || this.noteSheetPrefixEN;
                transformed = bnPrefix + BanglaNumerals.toBangla(rest);
            } else {
                transformed = BanglaNumerals.toBangla(currentNo);
            }
        } else {
            if (this.noteSheetPrefixBN && currentNo.startsWith(this.noteSheetPrefixBN + '/')) {
                const rest = currentNo.substring(this.noteSheetPrefixBN.length);
                transformed = this.noteSheetPrefixEN + this.toEnglishDigits(rest);
            } else {
                transformed = this.toEnglishDigits(currentNo);
            }
        }
        this.form.get('noteSheetNo')?.setValue(transformed, { emitEvent: false });
    }

    // ── Members Table (MembersJson) ─────────────────────────────────────

    onMemberFound(emp: EmployeeBasicInfo): void {
        // Access gate FIRST: block adding members outside the logged-in user's
        // scope (accessible org-tree nodes + accessible member types). Reuses the
        // same access mechanism as the serving/ex-member lists. We fall back to
        // ALLOWING the add on a network/check error so a transient backend hiccup
        // never blocks a legitimate user.
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
                this.addFoundMember(emp);
            },
            error: () => {
                // Resilient: don't hard-block on a network error — proceed with the add.
                this.addFoundMember(emp);
            }
        });
    }

    private addFoundMember(emp: EmployeeBasicInfo): void {
        if (this.membersData.members.some(m => m.employeeId === emp.employeeID)) {
            this.messageService.add({ severity: 'warn', summary: 'Duplicate', detail: 'This member is already added.' });
            return;
        }

        this.memberAddLoading = true;
        // Fetch full profile + family + previous RAB service (for the present-unit hierarchy path).
        forkJoin([
            this.servingMembersService.getEmployeePersonalServiceOverview(emp.employeeID),
            this.familyInfoService.getFamilyInfoByEmployeeView(emp.employeeID),
            this.previousRABService.getViewByEmployeeId(emp.employeeID).pipe(catchError(() => of([] as VwPreviousRABServiceInfoModel[])))
        ]).subscribe({
            next: ([profile, familyList, rabServiceList]) => {
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
                const spouse = family.find(f => (f.relation ?? '').toLowerCase().includes('spouse') || (f.relation ?? '').toLowerCase().includes('wife') || (f.relation ?? '').toLowerCase().includes('husband'));
                const father = family.find(f => (f.relation ?? '').toLowerCase().includes('father'));
                const mother = family.find(f => (f.relation ?? '').toLowerCase().includes('mother'));
                values['family_spouse'] = spouse?.name ?? '';
                values['family_father'] = father?.name ?? '';
                values['family_mother'] = mother?.name ?? '';
                values['family_members'] = family.map(f => `${f.relation ?? ''}: ${f.name ?? ''}`).join('; ');

                // Composite name exactly as shown at the top of the member profile.
                values['formattedName'] = getFormattedMemberName(profile, false);
                values['formattedNameBN'] = getFormattedMemberName(profile, true);

                // Present RAB unit as the full hierarchy path (Unit > Wing > Branch > Sub-branch >
                // Section > Sub-section) from the currently-active Previous RAB Service row.
                const activeRab = (Array.isArray(rabServiceList) ? rabServiceList : [])
                    .find((r) => (r.isCurrentlyActive as any) === true || (r.isCurrentlyActive as any) === 1);
                values['presentRabUnit'] = this.buildRabUnitPath(activeRab, false) || (profile.rabUnit ?? '');
                values['presentRabUnitBN'] = this.buildRabUnitPath(activeRab, true) || (profile.rabUnitBN ?? profile.rabUnit ?? '');

                // Keep any already-present custom columns (e.g. Remarks) in sync for the new row.
                for (const col of this.membersData.columns) {
                    if (col.group === 'custom' && values[col.key] === undefined) values[col.key] = '';
                }

                this.membersData.members.push({ employeeId: emp.employeeID, values });
                // First member added with no columns configured → show a sensible default set.
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
        this.membersData.members.splice(index, 1);
    }

    /**
     * Full present-posting path from a Previous RAB Service row:
     * "Unit, Wing, Branch, Sub-branch, Section, Sub-section", skipping empty levels.
     * In Bangla it uses each level's BN name, falling back to the EN name when BN is unset.
     */
    private buildRabUnitPath(row: VwPreviousRABServiceInfoModel | undefined | null, bn: boolean): string {
        if (!row) return '';
        const lvl = (en?: string | null, bnName?: string | null): string =>
            (bn ? ((bnName ?? '').trim() || (en ?? '').trim()) : (en ?? '').trim());
        return [
            lvl(row.rabUnitName, row.rabUnitNameBN),
            lvl(row.rabWingName, row.rabWingNameBN),
            lvl(row.rabBranchName, row.rabBranchNameBN),
            lvl(row.rabSubBranchName, row.rabSubBranchNameBN),
            lvl(row.rabSectionName, row.rabSectionNameBN),
            lvl(row.rabSubSectionName, row.rabSubSectionNameBN)
        ].filter((p) => p !== '').join(', ');
    }

    /** Cell display value: digits become Bangla numerals when the note-sheet is Bangla,
     *  stay Latin otherwise. Follows the same rule as the preview and the dates. */
    formatMemberCellDisplay(value: string | null | undefined): string {
        const v = value ?? '';
        return this.isBangla ? BanglaNumerals.toBangla(v) : v;
    }

    /**
     * The default column set: Prefix & Service ID, Rank, Name (profile's full name),
     * Present RAB Unit (full hierarchy path), and an editable Remarks column. Both the
     * value keys and the header labels follow the current note-sheet language.
     */
    private buildDefaultColumns(): MemberColumnDef[] {
        const bn = this.isBangla;
        const lbl = (en: string, bnLabel: string) => (bn ? bnLabel : en);
        return [
            { key: bn ? 'prefixWithServiceIdBN' : 'prefixWithServiceId', label: lbl('Prefix & Service ID', 'সার্ভিস আইডি'), group: 'basic' },
            { key: bn ? 'armyRankBN' : 'armyRank', label: lbl('Rank', 'পদবি'), group: 'basic' },
            { key: bn ? 'formattedNameBN' : 'formattedName', label: lbl('Name', 'নাম'), group: 'basic' },
            { key: bn ? 'presentRabUnitBN' : 'presentRabUnit', label: lbl('Present RAB Unit', 'বর্তমান র‍্যাব ইউনিট'), group: 'basic' },
            { key: 'custom_Remarks', label: lbl('Remarks', 'মন্তব্য'), group: 'custom' }
        ];
    }

    /** Apply the default columns the first time a member is added (nothing configured yet). */
    private applyDefaultMemberColumnsIfEmpty(): void {
        if (this.defaultColumnsApplied || this.membersData.columns.length > 0) return;
        this.defaultColumnsApplied = true;
        this.columnsAreDefault = true;
        this.membersData.columns = this.buildDefaultColumns();
        // Ensure the editable Remarks cell exists on every current row.
        for (const m of this.membersData.members) {
            if (m.values['custom_Remarks'] === undefined) m.values['custom_Remarks'] = '';
        }
    }

    /** On a language switch, re-apply the default columns (new-language keys + labels) so the
     *  whole table follows the note-sheet type — but only while the user hasn't customised them. */
    private relanguageDefaultColumns(): void {
        if (this.columnsAreDefault && this.membersData.members.length > 0) {
            this.membersData.columns = this.buildDefaultColumns();
        }
    }

    /** True when a loaded column set is exactly the auto-default set (either language) —
     *  used in edit mode to decide whether a language switch may relanguage them. */
    private columnsMatchDefaultSet(cols: MemberColumnDef[]): boolean {
        const keys = cols.map((c) => c.key);
        const en = ['prefixWithServiceId', 'armyRank', 'formattedName', 'presentRabUnit', 'custom_Remarks'];
        const bn = ['prefixWithServiceIdBN', 'armyRankBN', 'formattedNameBN', 'presentRabUnitBN', 'custom_Remarks'];
        const eq = (a: string[]) => a.length === keys.length && a.every((k, i) => k === keys[i]);
        return eq(en) || eq(bn);
    }

    // Column management
    get unusedColumns(): MemberColumnDef[] {
        const usedKeys = new Set(this.membersData.columns.map(c => c.key));
        return this.availableColumns.filter(c => !usedKeys.has(c.key));
    }

    get groupedUnusedColumns(): { label: string; value: string; items: { label: string; value: string }[] }[] {
        const groups: Record<string, { label: string; value: string }[]> = {};
        const groupLabels: Record<string, string> = {
            basic: 'Basic Info',
            personal: 'Personal Info',
            family: 'Family Info'
        };
        for (const col of this.unusedColumns) {
            const g = col.group;
            if (!groups[g]) groups[g] = [];
            groups[g].push({ label: col.label, value: col.key });
        }
        return Object.entries(groups).map(([key, items]) => ({
            label: groupLabels[key] ?? key,
            value: key,
            items
        }));
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
            // Initialize blank value for existing members
            for (const member of this.membersData.members) {
                member.values[key] = '';
            }
        }
        this.columnsAreDefault = false;
        this.closeAddColumnDialog();
    }

    removeColumn(colKey: string): void {
        this.membersData.columns = this.membersData.columns.filter(c => c.key !== colKey);
        this.columnsAreDefault = false;
    }

    // Column label editing
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

    // Inline cell editing (for custom columns or any editable cell)
    isCustomColumn(col: MemberColumnDef): boolean {
        return col.group === 'custom';
    }

    /** Any non-merged cell is inline-editable, so users can adjust the fetched values. */
    isEditableCell(col: MemberColumnDef): boolean {
        return !col.mergedFrom;
    }

    memberCellKey(rowIndex: number, colKey: string): string {
        return `${rowIndex}_${colKey}`;
    }

    startEditMemberCell(rowIndex: number, colKey: string, event: Event): void {
        this.editingMemberCellKey = this.memberCellKey(rowIndex, colKey);
        this.editingMemberCellValue = this.membersData.members[rowIndex]?.values[colKey] ?? '';
        setTimeout(() => {
            const el = (event.target as HTMLElement)?.closest('td')?.querySelector('input');
            el?.focus();
            el?.select();
        });
    }

    onMemberCellBlur(rowIndex: number, colKey: string): void {
        if (this.editingMemberCellKey === this.memberCellKey(rowIndex, colKey)) {
            this.saveMemberCell(rowIndex, colKey);
        }
    }

    onMemberCellKeydown(event: KeyboardEvent, rowIndex: number, colKey: string): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.saveMemberCell(rowIndex, colKey);
        } else if (event.key === 'Escape') {
            this.editingMemberCellKey = null;
        }
    }

    private saveMemberCell(rowIndex: number, colKey: string): void {
        if (this.membersData.members[rowIndex]) {
            this.membersData.members[rowIndex].values[colKey] = this.editingMemberCellValue;
        }
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

    // ── Column Resize ────────────────────────────────────────────────────

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
        const th = (event.target as HTMLElement).closest('th');
        const table = th?.closest('table');
        this.resizeTableWidth = table?.offsetWidth ?? 800;
        this.resizeStartWidth = this.membersData.columns[colIndex]?.width ?? this.getDefaultColWidth();
        document.addEventListener('mousemove', this.resizeBoundMove);
        document.addEventListener('mouseup', this.resizeBoundUp);
    }

    private onResizeMove(event: MouseEvent): void {
        if (this.resizeColIndex === null) return;
        const dx = event.clientX - this.resizeStartX;
        const dPct = (dx / this.resizeTableWidth) * 100;
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

    // ── Merge Columns ─────────────────────────────────────────────────────

    openMergeColumnDialog(): void {
        this.mergeSelectedColumns = [];
        this.mergeSeparator = ' ';
        this.mergeCustomSeparator = '';
        this.mergeLabel = '';
        this.showMergeColumnDialog = true;
    }

    closeMergeColumnDialog(): void {
        this.showMergeColumnDialog = false;
    }

    get mergePreview(): string {
        if (this.mergeSelectedColumns.length < 2) return '';
        const separator = this.mergeSeparator === '__custom__' ? this.mergeCustomSeparator : this.mergeSeparator;
        const sampleValues = this.mergeSelectedColumns.map(c => c.label);
        if (separator === '()') {
            return `${sampleValues[0]} (${sampleValues.slice(1).join(', ')})`;
        }
        return sampleValues.join(separator);
    }

    confirmMergeColumns(): void {
        if (this.mergeSelectedColumns.length < 2) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Select at least 2 columns to merge.' });
            return;
        }
        const keys = this.mergeSelectedColumns.map(c => c.key);
        const separator = this.mergeSeparator === '__custom__' ? this.mergeCustomSeparator : this.mergeSeparator;
        const mergedCol: MemberColumnDef = {
            key: 'merged_' + keys.join('_'),
            label: this.mergeLabel.trim() || this.mergeSelectedColumns.map(c => c.label).join(' + '),
            group: 'merged',
            mergedFrom: { keys, separator }
        };

        // Insert merged column at position of first source column, remove source columns
        const firstIndex = Math.min(...keys.map(k => this.membersData.columns.findIndex(c => c.key === k)));
        this.membersData.columns = this.membersData.columns.filter(c => !keys.includes(c.key));
        this.membersData.columns.splice(firstIndex, 0, mergedCol);
        this.columnsAreDefault = false;
        this.closeMergeColumnDialog();
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

    // ── Reset ────────────────────────────────────────────────────────────

    private resetForm(): void {
        const user = this.sharedService.getCurrentUser?.() ?? '';
        this.form.reset({
            noteSheetTemplateId: null,
            textType: 'en',
            noteSheetDate: null,
            unitId: null,
            wingBattalionId: null,
            branchId: null,
            subBranchId: null,
            sectionId: null,
            subSectionId: null,
            noteSheetNo: '',
            noteSheetNumberConfigId: null,
            noteSheetSubjectId: null,
            subject: '',
            note: '',
            preparedBy: user,
            preparedByEmployeeId: null,
            initiatorId: null,
            recommenderIds: [],
            finalApproverId: null,
            isSecret: false,
            noteSheetOperationType: 'manual',
            referenceEmployeeIds: [],
            memberTypeIds: []
        });
        this.referenceParagraphs = [{ text: '', fileRows: [] }];
        this.mainTextParagraphs = [{ text: '' }];
        this.lastTextParagraphs = [''];
        this.membersData = { columns: [], members: [] };
        this.defaultColumnsApplied = false;
        this.columnsAreDefault = false;
        this.selectedUnitNode = null;
        this.resolvePreparedByMapping();
    }

    // ── Submit ───────────────────────────────────────────────────────────

    submit(): void {
        if (this.isSubmitting) return;
        if (this.editMode ? !this.canUpdate : !this.canInsert) {
            this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You do not have permission to perform this action.' });
            return;
        }
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please fill required fields.' });
            return;
        }
        this.isSubmitting = true;

        // First upload reference paragraph files, then main supporting docs
        this.uploadReferenceParagraphFiles().then((refParagraphsJson) => {
            const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
            const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

            const doSave = (filesReferencesJson: string | null) => {
                try {
                    const payload = this.buildNoteSheetInfoPayload(filesReferencesJson, refParagraphsJson);
                    if (this.editMode && this.editId != null) {
                        (payload as any).noteSheetId = this.editId;
                    }
                    const api = `${environment.apis.core}/NoteSheetInfo`;
                    const endpoint = this.editMode && this.editId != null ? '/UpdateAsyn' : '/SaveAsyn';
                    this.http.post<any>(api + endpoint, payload).subscribe({
                        next: (res) => {
                            const noteSheetId = this.editMode && this.editId != null
                                ? this.editId
                                : (res?.data?.noteSheetId ?? res?.data?.NoteSheetId ?? res?.Data?.NoteSheetId ?? null);

                            // Sync members to NoteSheetReferenceEmployee with InformationJson
                            if (noteSheetId) {
                                const refApi = `${environment.apis.core}/NoteSheetReferenceEmployee`;
                                const employees = this.membersData.members.map(m => ({
                                    employeeId: m.employeeId,
                                    informationJson: JSON.stringify({
                                        columns: this.membersData.columns,
                                        values: m.values
                                    })
                                }));
                                const syncPayload = {
                                    noteSheetId,
                                    employees,
                                    updatedBy: payload.createdBy ?? payload.lastUpdatedBy ?? 'system'
                                };
                                this.http.post(refApi + '/Sync', syncPayload).subscribe({
                                    error: () => this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Saved but failed to sync members.' })
                                });
                            }

                            this.messageService.add({
                                severity: 'success',
                                summary: 'Note Sheet',
                                detail: this.editMode ? 'Note Sheet updated successfully.' : 'Note Sheet generated successfully.'
                            });
                            this.isSubmitting = false;
                            if (this.editMode) {
                                this.router.navigate(['/notesheet-list/draft']);
                            } else {
                                this.resetForm();
                            }
                        },
                        error: (err) => {
                            const detail = this.getApiErrorMessage(err);
                            this.messageService.add({ severity: 'error', summary: 'Error', detail });
                            this.isSubmitting = false;
                        }
                    });
                } catch (e) {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: e instanceof Error ? e.message : 'Failed to build or send request.' });
                    this.isSubmitting = false;
                }
            };

            if (filesToUpload.length > 0) {
                const uploads = filesToUpload.map((r: FileRowData) =>
                    this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name)
                );
                forkJoin(uploads).subscribe({
                    next: (results: unknown) => {
                        const resultsArray = Array.isArray(results) ? results : [];
                        const newRefs = (resultsArray as { fileId: number; fileName: string }[]).map((r) => ({ FileId: r.fileId, fileName: r.fileName }));
                        const allRefs: { FileId: number; fileName: string }[] = [
                            ...existingRefs.map((r) => ({ FileId: r.FileId, fileName: r.fileName })),
                            ...newRefs
                        ];
                        doSave(allRefs.length > 0 ? JSON.stringify(allRefs) : null);
                    },
                    error: (err: any) => {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to upload one or more files.' });
                        this.isSubmitting = false;
                    }
                });
                return;
            }

            const filesReferencesJson = existingRefs.length > 0 ? JSON.stringify(existingRefs) : null;
            doSave(filesReferencesJson);
        }).catch(() => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to upload reference files.' });
            this.isSubmitting = false;
        });
    }

    /** Upload files in reference paragraphs and return the final JSON string */
    private async uploadReferenceParagraphFiles(): Promise<string> {
        const result: { text: string; files: { FileId: number; fileName: string }[] }[] = [];

        for (const para of this.referenceParagraphs) {
            const existingFiles = para.fileRows.filter(r => r.fileId != null).map(r => ({ FileId: r.fileId!, fileName: r.displayName ?? '' }));
            const newFiles = para.fileRows.filter(r => r.file != null);

            if (newFiles.length > 0) {
                const uploads = newFiles.map(r => this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name).toPromise());
                const uploaded = await Promise.all(uploads);
                const uploadedRefs = (uploaded as any[]).map(r => ({ FileId: r.fileId, fileName: r.fileName }));
                result.push({ text: para.text, files: [...existingFiles, ...uploadedRefs] });
            } else {
                result.push({ text: para.text, files: existingFiles });
            }
        }

        return JSON.stringify(result);
    }

    private getApiErrorMessage(err: any): string {
        if (err?.status === 0 || err?.message === 'Http failure response')
            return 'Cannot reach server. Check that the API is running at ' + (environment?.apis?.core ?? '') + ' and CORS is allowed.';
        const body = err?.error;
        if (!body) return err?.message || 'Failed to generate Note Sheet.';
        if (typeof body === 'string') return body;
        if (body.description) return body.description;
        if (body.message) return body.message;
        if (body.errors && typeof body.errors === 'object') {
            const parts = Object.entries(body.errors as Record<string, string[]>)
                .flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((s: string) => `${k}: ${s}`));
            if (parts.length) return parts.join(' ');
        }
        return body.title || 'Failed to generate Note Sheet.';
    }

    private formatNoteSheetDate(value: Date | string | null | undefined): string {
        if (value instanceof Date) {
            const y = value.getFullYear(), m = value.getMonth(), d = value.getDate();
            return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))
            return value.slice(0, 10);
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    private buildNoteSheetInfoPayload(filesReferencesJson?: string | null, referenceNumberJson?: string | null): any {
        const d = this.form.getRawValue();
        const dateStr = this.formatNoteSheetDate(d.noteSheetDate);
        const now = new Date().toISOString();
        const preparedBy = (d.preparedBy && String(d.preparedBy).trim()) || 'system';
        const createdBy = this.editMode && this.originalCreatedBy ? this.originalCreatedBy : preparedBy;
        const lastUpdatedBy = preparedBy;

        const recommenderIds: number[] = Array.isArray(d.recommenderIds) ? d.recommenderIds : [];
        const recommendersJson = recommenderIds.length
            ? JSON.stringify(recommenderIds.map((id, idx) => ({
                recomender_no: idx + 1,
                recomender_id: id,
                recomender_status: ApprovalStatus.Pending,
                recomender_approve_remark: '',
                recomender_cancel_remark: '',
                recomender_approved_date: null
            })))
            : null;

        const payload: Record<string, unknown> = {
            noteSheetId: 0,
            noteSheetType: NoteSheetType.General,
            noteSheetNo: this.editMode ? (d.noteSheetNo || 'AUTO') : 'AUTO',
            noteSheetNumberConfigId: d.noteSheetNumberConfigId ?? null,
            noteSheetDate: dateStr,
            noteSheetTemplateId: d.noteSheetTemplateId ?? null,
            referenceNumber: referenceNumberJson ?? null,
            noteSheetSubjectId: d.noteSheetSubjectId ?? null,
            // Always store the subject text too (mirrored from the picked subject) so the preview
            // shows it even before the id→master relation resolves / if the master is unavailable.
            subject: this.resolveSubjectText(d),
            // Main Text stored as a JSON array of rich-text blocks (each its own serial).
            mainText: serializeMainTextBlocks(this.mainTextParagraphs),
            note: d.note != null ? String(d.note) : null,
            // Last Text stored as a JSON array of HTML strings (each its own serial), or null when empty.
            paragraphText: this.lastTextParagraphs.some((p) => (p ?? '').trim() !== '')
                ? JSON.stringify(this.lastTextParagraphs.filter((p) => (p ?? '').trim() !== ''))
                : null,
            textType: d.textType === 'bn' ? 1 : 0,
            isSecret: d.isSecret ?? false,
            noteSheetOperationType: d.noteSheetOperationType ?? null,
            // Member types selected for this General note-sheet (comma-separated CommonCode ids).
            employeeTypeIds: (Array.isArray(d.memberTypeIds) ? d.memberTypeIds : []).join(',') || null,
            employeeId: null,
            preparedByEmployeeId: d.preparedByEmployeeId ?? null,
            ...this.getHierarchyIdsFromSelectedNode(),
            initiatorId: d.initiatorId ?? 0,
            recommendersJson,
            finalApprovalId: d.finalApproverId ?? null,
            familyInfoJson: null,
            createdBy,
            lastUpdatedBy,
            createdDate: now,
            lastupdate: now
        };
        if (filesReferencesJson != null && filesReferencesJson !== '') {
            payload['filesReferences'] = filesReferencesJson;
        }
        return payload;
    }
}
