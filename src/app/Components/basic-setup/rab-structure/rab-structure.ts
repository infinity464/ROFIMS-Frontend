import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TreeNode } from 'primeng/api';
import { TreeModule } from 'primeng/tree';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { CommonCode } from '../shared/models/common-code';
import { forkJoin } from 'rxjs';
import { Fluid } from 'primeng/fluid';

@Component({
    selector: 'app-rab-structure',
    standalone: true,
    imports: [CommonModule, TreeModule, Fluid],
    templateUrl: './rab-structure.html',
    styleUrl: './rab-structure.scss'
})
export class RabStructureComponent implements OnInit {
    treeNodes: TreeNode[] = [];
    loading = false;

    constructor(private masterBasicSetupService: MasterBasicSetupService) {}

    ngOnInit(): void {
        this.loadTree();
    }

    loadTree(): void {
        this.loading = true;
        this.masterBasicSetupService.getAllByType('RabUnit').subscribe({
            next: (units) => {
                if (!units?.length) {
                    this.treeNodes = [];
                    this.loading = false;
                    return;
                }
                const wingsRequests = units.map((u) =>
                    this.masterBasicSetupService.getByParentId(u.codeId)
                );
                forkJoin(wingsRequests).subscribe({
                    next: (wingsPerUnit) => {
                        const allWings = wingsPerUnit.flat();
                        if (allWings.length === 0) {
                            this.treeNodes = units.map((u) => ({
                                label: `${u.codeValueEN || ''} (0)`,
                                type: 'rab-unit',
                                styleClass: 'rab-unit',
                                data: { codeId: u.codeId, codeType: 'RabUnit' },
                                children: []
                            }));
                            this.loading = false;
                            return;
                        }
                        const branchesRequests = allWings.map((w) =>
                            this.masterBasicSetupService.getByParentId(w.codeId)
                        );
                        forkJoin(branchesRequests).subscribe({
                            next: (branchesPerWing) => {
                                this.treeNodes = this.buildTree(
                                    units,
                                    wingsPerUnit,
                                    branchesPerWing
                                );
                                this.loading = false;
                            },
                            error: () => {
                                this.loading = false;
                            }
                        });
                    },
                    error: () => {
                        this.loading = false;
                    }
                });
            },
            error: () => {
                this.loading = false;
            }
        });
    }

    private buildTree(
        units: CommonCode[],
        wingsPerUnit: CommonCode[][],
        branchesPerWing: CommonCode[][]
    ): TreeNode[] {
        let wingIndex = 0;
        return units.map((unit) => {
            const wings = wingsPerUnit[units.indexOf(unit)] || [];
            const wingCount = wings.length;
            const children: TreeNode[] = wings.map((wing) => {
                const branches = branchesPerWing[wingIndex] || [];
                wingIndex += 1;
                const branchNodes: TreeNode[] = (branches as CommonCode[]).map(
                    (b) => ({
                        label: b.codeValueEN || '',
                        type: 'rab-branch',
                        styleClass: 'rab-branch',
                        data: { codeId: b.codeId, codeType: 'RabBranch' }
                    })
                );
                return {
                    label: `${wing.codeValueEN || ''} (${branches.length})`,
                    type: 'rab-wing',
                    styleClass: 'rab-wing',
                    data: { codeId: wing.codeId, codeType: 'RabWing' },
                    children: branchNodes
                };
            });
            return {
                label: `${unit.codeValueEN || ''} (${wingCount})`,
                type: 'rab-unit',
                styleClass: 'rab-unit',
                data: { codeId: unit.codeId, codeType: 'RabUnit' },
                children
            };
        });
    }
}
