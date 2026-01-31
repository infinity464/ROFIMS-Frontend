import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';

@Component({
    selector: 'app-rank-equivalent',
    imports: [ReactiveFormsModule],
    templateUrl: './rank-equivalent.html',
    styleUrl: './rank-equivalent.scss'
})
export class RankEquivalent implements OnInit {
    rankEquvilentForm!: FormGroup;
    constructor(
        private fb: FormBuilder,
        private rankEquivalentService: MasterBasicSetupService
    ) {}
    ngOnInit(): void {
        this.initForm();
    }

    initForm() {
        this.rankEquvilentForm = this.fb.group({
            equivalentNameID: [null, Validators.required],
            motherOrgRankId: [null, Validators.required],
            motherOrgId: [null, Validators.required],
            createdBy: ['', [Validators.required, Validators.maxLength(100)]],
            createdDate: [new Date(), Validators.required],
            lastUpdatedBy: ['', [Validators.required, Validators.maxLength(100)]],
            lastUpdate: [new Date(), Validators.required]
        });
    }

    loadActiveMotherOrg() {
        this.rankEquivalentService.getAllActiveMotherOrgs().subscribe({
            next: (res) => {},
            error: (err) => {}
        });
    }

    loadMotherOrgRank(orgId: number) {
        this.rankEquivalentService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
            next: (res) => {},
            error: (err) => {
                console.error(err);
            }
        });    }

    loadEquivalentName() {
        this.rankEquivalentService.getAllByType('EquivalentName').subscribe({
            next: (res) => {}
        });
    }

    onMotherOrgChange(orgId:number){
        this.loadMotherOrgRank(orgId )
    }


}
