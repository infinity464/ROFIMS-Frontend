import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { take } from 'rxjs/operators';
import { TreeNode, PrimeTemplate } from 'primeng/api';
import { TreeSelectModule } from 'primeng/treeselect';
import { OrgService } from '@/Components/basic-setup/org-tree/org.service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';

/** Unit → Wing → Branch → Sub-Branch → Section → Sub-Section ids of the picked node. */
export interface UnitHierarchyIds {
    unitId: number | null;
    wingBattalionId: number | null;
    branchId: number | null;
    subBranchId: number | null;
    sectionId: number | null;
    subSectionId: number | null;
}

const LEVELS: { key: keyof UnitHierarchyIds; codeType: string }[] = [
    { key: 'unitId', codeType: 'Unit' },
    { key: 'wingBattalionId', codeType: 'Wing' },
    { key: 'branchId', codeType: 'Branch' },
    { key: 'subBranchId', codeType: 'Sub-Branch' },
    { key: 'sectionId', codeType: 'Section' },
    { key: 'subSectionId', codeType: 'Sub-Section' }
];

/**
 * Lazy-loading org tree picker, the same "Select Unit" control the General note-sheet form has
 * (copied from it — that form is left as is). The host reads the picked level ids via
 * getHierarchyIds() and, when editing, pre-selects a node with selectNode(id).
 */
@Component({
    selector: 'app-unit-hierarchy-select',
    standalone: true,
    imports: [CommonModule, FormsModule, TreeSelectModule, PrimeTemplate],
    template: `
        @if (loading) {
            <div class="text-500 text-xs p-2"><i class="pi pi-spin pi-spinner mr-1"></i>Loading units...</div>
        } @else {
            <p-treeSelect
                [(ngModel)]="selectedNode"
                [options]="nodes"
                placeholder="Select Unit / Wing / Branch / ..."
                [filter]="true"
                [filterInputAutoFocus]="true"
                [showClear]="true"
                selectionMode="single"
                styleClass="w-full"
                appendTo="body"
                (onNodeExpand)="onNodeExpand($event)"
                (onClear)="selectedNode = null">
                <ng-template pTemplate="value" let-node>
                    <span style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        {{ node ? fullPath(node) : 'Select Unit / Wing / Branch / ...' }}
                    </span>
                </ng-template>
            </p-treeSelect>
        }
    `
})
export class UnitHierarchySelectComponent implements OnInit {
    nodes: TreeNode[] = [];
    selectedNode: TreeNode | null = null;
    loading = false;
    private nodeMap: Record<number, TreeNode> = {};
    private ready$ = new Subject<void>();

    constructor(private orgService: OrgService, private masterBasicSetupService: MasterBasicSetupService) {}

    ngOnInit(): void {
        this.loading = true;
        this.orgService.getAll(0).subscribe({
            next: (roots) => {
                this.nodeMap = {};
                this.nodes = roots
                    .filter((r: any) => r.status === 1)
                    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                    .map((r: any) => this.toTreeNode(r, null));
                this.loading = false;
                this.ready$.next();
            },
            error: () => { this.loading = false; }
        });
    }

    /** Level ids of the picked node, walking up to the root. All null when nothing is picked. */
    getHierarchyIds(): UnitHierarchyIds {
        const result: UnitHierarchyIds = { unitId: null, wingBattalionId: null, branchId: null, subBranchId: null, sectionId: null, subSectionId: null };
        let cur: TreeNode | null = this.selectedNode;
        while (cur) {
            const match = LEVELS.find(l => l.codeType === (cur!.data?.codeType ?? ''));
            if (match) result[match.key] = Number(cur.key);
            cur = cur.data?.parent ?? null;
        }
        return result;
    }

    /** Edit mode: expand the tree down to the given node and select it. */
    selectNode(nodeId: number | null | undefined): void {
        if (!nodeId) return;
        const doExpand = () => {
            this.masterBasicSetupService.getAncestorsOfCommonCode(nodeId).subscribe({
                next: (ancestors) => {
                    const chain = Array.isArray(ancestors) ? ancestors : [];
                    if (chain.length > 0) this.expandChain(chain, 0);   // root → … → leaf
                }
            });
        };
        if (this.nodes.length > 0) doExpand();
        else this.ready$.pipe(take(1)).subscribe(() => doExpand());
    }

    fullPath(node: TreeNode | null): string {
        const parts: string[] = [];
        let cur: TreeNode | null = node;
        while (cur) {
            parts.unshift(cur.label ?? '');
            cur = cur.data?.parent ?? null;
        }
        return parts.join(' > ');
    }

    onNodeExpand(event: any): void {
        const node: TreeNode = event.node;
        if (node.children && node.children.length > 0) return;
        this.loadChildren(node, () => {});
    }

    private toTreeNode(node: any, parent: TreeNode | null): TreeNode {
        const tn: TreeNode = {
            key: String(node.id),
            label: node.nameEN || node.nameBN || `ID ${node.id}`,
            data: { id: node.id, nameEN: node.nameEN, nameBN: node.nameBN, codeType: node.codeType, parent },
            leaf: false,
            children: []
        };
        this.nodeMap[node.id] = tn;
        return tn;
    }

    private loadChildren(node: TreeNode, done: () => void): void {
        this.orgService.loadChildren(Number(node.key)).subscribe({
            next: (children: any[]) => {
                node.children = children
                    .filter((c: any) => c.status === 1)
                    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                    .map((c: any) => this.toTreeNode(c, node));
                if (node.children!.length === 0) node.leaf = true;
                this.nodes = [...this.nodes];
                done();
            }
        });
    }

    private expandChain(chain: any[], index: number): void {
        if (index >= chain.length) {
            const leafId = chain[chain.length - 1].codeId ?? chain[chain.length - 1].CodeId;
            const leaf = this.nodeMap[leafId];
            if (leaf) this.selectedNode = leaf;
            return;
        }
        const id = chain[index].codeId ?? chain[index].CodeId;
        const existing = this.nodeMap[id];
        if (!existing) { this.expandChain(chain, index + 1); return; }
        existing.expanded = true;
        if (!existing.children || existing.children.length === 0) {
            this.loadChildren(existing, () => this.expandChain(chain, index + 1));
        } else {
            this.expandChain(chain, index + 1);
        }
    }
}
