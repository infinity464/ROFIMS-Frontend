import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrgNode } from '../models/org-node.model';
import { LEVELS, LEVEL_COLORS } from '../models/org-node.model';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

@Component({
    selector: 'app-tree-node',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, ButtonModule, TooltipModule],
    templateUrl: './tree-node.component.html',
    styleUrl: './tree-node.component.scss'
})
export class TreeNodeComponent {
    @Input() node!: OrgNode;
    @Input() depth = 0;
    @Input() loadingParentId: number | null = null;
    @Output() addChild = new EventEmitter<OrgNode>();
    @Output() edit = new EventEmitter<OrgNode>();
    @Output() delete = new EventEmitter<OrgNode>();
    @Output() expandRequest = new EventEmitter<OrgNode>();
    @Output() expandToggled = new EventEmitter<{ node: OrgNode; expanded: boolean }>();

    readonly LEVELS = LEVELS;
    readonly LEVEL_COLORS = LEVEL_COLORS;
    readonly maxLevel = LEVELS.length - 1;

    /** Sub-Section is leaf level; no Add Child. */
    get canAddChild(): boolean {
        if (this.node.codeType === 'Sub-Section') return false;
        return this.node.level < this.maxLevel;
    }

    /** Show expand arrow: has children OR (can have children and not yet loaded) */
    get hasChildrenOrCanExpand(): boolean {
        const hasChildren = (this.node.children?.length ?? 0) > 0;
        const canExpand = this.node.level < this.maxLevel;
        const notLoaded = !this.node.childrenLoaded;
        return hasChildren || (canExpand && notLoaded);
    }

    get hasChildrenLoaded(): boolean {
        return (this.node.children?.length ?? 0) > 0;
    }

    get badgeColor(): string {
        return this.LEVEL_COLORS[this.node.codeType as keyof typeof LEVEL_COLORS] ?? '#666';
    }

    toggleExpand(): void {
        const willExpand = !this.node.expanded;
        this.expandToggled.emit({ node: this.node, expanded: willExpand });
        if (willExpand && !this.hasChildrenLoaded && this.node.level < this.maxLevel) {
            this.expandRequest.emit(this.node);
        }
    }

    onAddChild(e: Event): void {
        e.stopPropagation();
        this.addChild.emit(this.node);
    }

    onEdit(e: Event): void {
        e.stopPropagation();
        this.edit.emit(this.node);
    }

    onDelete(e: Event): void {
        e.stopPropagation();
        this.delete.emit(this.node);
    }

    trackById(_: number, n: OrgNode): number {
        return n.id;
    }
}
