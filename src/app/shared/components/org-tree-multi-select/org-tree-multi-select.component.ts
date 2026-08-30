import { Component, Input, Output, EventEmitter, OnInit, forwardRef, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TreeSelectModule } from 'primeng/treeselect';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService, TreeNode } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import type { CommonCode } from '@/Components/basic-setup/shared/models/common-code';

/**
 * Reusable multi-select picker over the basic-setup org tree (Unit / Wing / Branch /
 * Sub-Branch / Section / Sub-Section). Pre-loads the FULL tree in one shot via
 * 6 parallel `getAllByType` calls (one per codeType) and assembles it client-side.
 *
 * Why eager-load instead of PrimeNG-style lazy expansion: `p-treeSelect`'s
 * combination of `selectionMode="checkbox"` + lazy `onNodeExpand` has a stubborn
 * timing bug — the first click on the chevron expands the node BEFORE the async
 * children arrive, so the user sees an empty expansion and has to click a second
 * time. Pre-loading sidesteps the bug entirely. The org tree is small enough
 * (~hundreds of nodes at most) that the up-front cost is acceptable for an
 * admin-only screen.
 *
 * Value semantics:
 * - The form value is `number[]` of CommonCode CodeIds — exactly the nodes the
 *   admin picked (NOT the descendant closure). Server-side queries should resolve
 *   descendants via the recursive CTE (`GetAccessibleOrgNodeIdsAsync`) before
 *   filtering data.
 * - `propagateSelectionUp/Down = false`: picking "Wing 1" should record Wing 1's
 *   id alone; the server expands.
 */
@Component({
    selector: 'app-org-tree-multi-select',
    standalone: true,
    imports: [CommonModule, FormsModule, TreeSelectModule, TooltipModule],
    template: `
<p-treeSelect
    [options]="treeNodes"
    [(ngModel)]="selectedNodes"
    [disabled]="disabled"
    selectionMode="checkbox"
    [propagateSelectionUp]="false"
    [propagateSelectionDown]="false"
    [metaKeySelection]="false"
    [filter]="true"
    display="chip"
    appendTo="body"
    [placeholder]="placeholder"
    [containerStyle]="{'width':'100%'}"
    styleClass="w-full"
    (onNodeSelect)="emitChange()"
    (onNodeUnselect)="emitChange()">
</p-treeSelect>
`,
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => OrgTreeMultiSelectComponent),
            multi: true
        }
    ]
})
export class OrgTreeMultiSelectComponent implements OnInit, ControlValueAccessor {
    @Input() placeholder = 'Pick units, wings, branches…';
    @Input() disabled = false;
    @Output() selectionChange = new EventEmitter<number[]>();

    private masterBasicSetup = inject(MasterBasicSetupService);
    private messageService = inject(MessageService, { optional: true });
    private cdr = inject(ChangeDetectorRef);

    /** All RAB org codeTypes — order matters only for tie-breaking when building the tree. */
    private static readonly ORG_CODE_TYPES = [
        'RabUnit', 'RabWing', 'RabBranch', 'RabSubBranch', 'RabSection', 'RabSubSection'
    ];

    treeNodes: TreeNode[] = [];
    selectedNodes: TreeNode[] = [];
    /** key: CodeId → TreeNode; used by writeValue to map IDs to nodes O(1). */
    private nodeMap: Record<number, TreeNode> = {};
    /** IDs waiting for the tree to load before we can map them to TreeNodes. */
    private pendingPreselectIds: number[] = [];
    private treeLoaded = false;

    private onChange: (val: number[]) => void = () => { /* noop */ };
    private onTouched: () => void = () => { /* noop */ };

    ngOnInit(): void {
        this.loadFullTree();
    }

    // ─── ControlValueAccessor ──────────────────────────────────
    writeValue(value: number[] | null): void {
        const ids = Array.isArray(value) ? value.filter(n => typeof n === 'number' && n > 0) : [];
        if (!this.treeLoaded) {
            this.pendingPreselectIds = ids;
            return;
        }
        this.applyPreselect(ids);
    }
    registerOnChange(fn: (val: number[]) => void): void { this.onChange = fn; }
    registerOnTouched(fn: () => void): void { this.onTouched = fn; }
    setDisabledState(isDisabled: boolean): void { this.disabled = isDisabled; }

    // ─── Selection plumbing ────────────────────────────────────
    emitChange(): void {
        // Normalise first: descendants of selected ancestors are redundant
        // (the backend's recursive CTE expands to the closure anyway), so we
        // remove them from the selection and grey their checkboxes out.
        this.applyParentCoverageRules();

        const ids = (this.selectedNodes || [])
            .map(n => Number(n.key))
            .filter(n => Number.isFinite(n) && n > 0);
        const unique = Array.from(new Set(ids));
        this.onChange(unique);
        this.onTouched();
        this.selectionChange.emit(unique);

        // NOTE: do NOT replace `this.treeNodes` here. Recreating the options
        // array makes PrimeNG TreeSelect rebuild its tree and collapse every
        // previously-expanded node. We only mutate `selectable` and (sometimes)
        // `selectedNodes` in place — Angular's default change detection picks
        // those up on the next tick without disturbing the expand state.
        this.cdr.markForCheck();
    }

    /**
     * Enforces "ancestor selection covers descendants":
     *  - every descendant of a selected node has `selectable: false` so its
     *    checkbox renders disabled (greyed out)
     *  - any descendant of a selected node that was itself selected gets
     *    removed from the selection (redundant — the backend resolves the
     *    closure server-side)
     * Returns true when the selection array was mutated, so callers can re-emit.
     */
    private applyParentCoverageRules(): boolean {
        // Reset every node to selectable.
        for (const k in this.nodeMap) {
            this.nodeMap[k].selectable = true;
        }

        if (!this.selectedNodes?.length) return false;

        // Walk the subtree under each selected node, marking descendants
        // disabled and collecting their ids so we can prune the selection.
        const coveredIds = new Set<number>();
        const disableSubtree = (parent: TreeNode) => {
            const children = parent.children;
            if (!children?.length) return;
            for (const child of children) {
                const childId = Number(child.key);
                child.selectable = false;
                if (Number.isFinite(childId)) coveredIds.add(childId);
                disableSubtree(child);
            }
        };
        for (const sel of this.selectedNodes) {
            disableSubtree(sel);
        }

        if (coveredIds.size === 0) return false;

        // Prune now-redundant entries from the selection.
        const pruned = this.selectedNodes.filter(n => !coveredIds.has(Number(n.key)));
        if (pruned.length !== this.selectedNodes.length) {
            this.selectedNodes = pruned;
            return true;
        }
        return false;
    }

    // ─── Tree build (eager) ────────────────────────────────────
    private loadFullTree(): void {
        // Fetch every org codeType in parallel; combine into a flat list, then
        // assemble the parent/child tree client-side. ~6 HTTP calls total.
        forkJoin(
            OrgTreeMultiSelectComponent.ORG_CODE_TYPES.map(t =>
                this.masterBasicSetup.getAllByType(t).pipe(catchError(() => of([] as CommonCode[])))
            )
        ).subscribe(buckets => {
            const flat: CommonCode[] = ([] as CommonCode[]).concat(
                ...buckets.map(b => Array.isArray(b) ? b : [])
            ).filter(c => c && c.status !== false && c.codeId > 0);

            this.treeNodes = this.buildTree(flat);
            this.treeLoaded = true;
            this.cdr.markForCheck();

            if (this.pendingPreselectIds.length > 0) {
                const ids = this.pendingPreselectIds;
                this.pendingPreselectIds = [];
                this.applyPreselect(ids);
            }
        });
    }

    /**
     * Build the parent → children tree from a flat list. Populates {@link nodeMap}
     * keyed by CodeId so {@link writeValue} can resolve IDs to TreeNodes in O(1).
     */
    private buildTree(flat: CommonCode[]): TreeNode[] {
        this.nodeMap = {};
        const byId: Record<number, TreeNode> = {};

        // First pass: create a TreeNode for each row (no children yet). Store
        // sortOrder on data so the children-sort pass below is O(n log n), not
        // O(n²) via repeated lookups in `flat`.
        for (const c of flat) {
            const tn: TreeNode = {
                key: String(c.codeId),
                label: c.codeValueEN || c.codeValueBN || `ID ${c.codeId}`,
                data: {
                    id: c.codeId,
                    nameEN: c.codeValueEN,
                    nameBN: c.codeValueBN,
                    codeType: c.codeType,
                    parentId: c.parentCodeId,
                    sortOrder: c.sortOrder ?? 0,
                    parent: null as TreeNode | null
                },
                children: []
            };
            byId[c.codeId] = tn;
            this.nodeMap[c.codeId] = tn;
        }

        // Second pass: wire each non-root into its parent's children array and
        // set the back-pointer on the data payload (used by callers that want
        // to walk up the chain — e.g. for breadcrumb display).
        const roots: TreeNode[] = [];
        for (const c of flat) {
            const node = byId[c.codeId];
            if (c.parentCodeId == null || c.parentCodeId === 0 || !byId[c.parentCodeId]) {
                roots.push(node);
                continue;
            }
            const parentNode = byId[c.parentCodeId];
            (node.data as any).parent = parentNode;
            parentNode.children!.push(node);
        }

        // Sort siblings by sortOrder, and mark leaf nodes (no chevron).
        const byOrder = (a: TreeNode, b: TreeNode) =>
            ((a.data as any).sortOrder ?? 0) - ((b.data as any).sortOrder ?? 0);
        for (const id in byId) {
            const node = byId[id];
            if (node.children && node.children.length > 1) node.children.sort(byOrder);
            if (!node.children || node.children.length === 0) node.leaf = true;
        }

        return roots.sort(byOrder);
    }

    private applyPreselect(ids: number[]): void {
        if (ids.length === 0) {
            this.selectedNodes = [];
            this.emitChange();
            return;
        }
        const matched: TreeNode[] = [];
        const missing: number[] = [];
        for (const id of ids) {
            if (this.nodeMap[id]) matched.push(this.nodeMap[id]);
            else missing.push(id);
        }
        this.selectedNodes = matched;
        this.emitChange();
        if (missing.length > 0 && this.messageService) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Some access entries were dropped',
                detail: `${missing.length} previously-granted node(s) no longer exist and were removed from the selection.`,
                life: 6000
            });
        }
    }
}
