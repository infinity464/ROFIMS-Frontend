import { Component, OnInit } from '@angular/core';
import { MasterConfig } from '../Models/master-basic-setup.model';
import { MasterBasicSetup } from '../shared/master-basic-setup/master-basic-setup';
import { MotherOrgService } from '../Services/mother-org-service';
import { CommonCode } from '../Models/common-code';
@Component({
    selector: 'app-mother-org',
    imports: [MasterBasicSetup],
    templateUrl: './mother-org.html',
    styleUrl: './mother-org.scss'
})
export class MotherOrg implements OnInit {
    motherOrgDate: CommonCode[] = [];
    editingId: number | null = null;
    constructor(private motherOrgService: MotherOrgService) {}

    ngOnInit(): void {
        this.getMotherOrg();
    }

    motherOrgConfig: MasterConfig = {
        title: 'Mother Org Setup',

        formFields: [
            {
                name: 'codeValueEN',
                label: 'Mother Org Name',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'Mother Org Name (Bangla)',
                type: 'text',
                required: true
            },
            {
                name: 'status', // ✅ FIXED
                label: 'Status',
                type: 'select',
                required: true,
                default: true, // ✅ Active by default
                options: [
                    { label: 'Active', value: true },
                    { label: 'Inactive', value: false }
                ]
            }
        ],

        tableColumns: [
            { field: 'codeValueEN', header: 'Mother Org Name' },
            { field: 'codeValueBN', header: 'Mother Org Name (Bangla)' },
            { field: 'status', header: 'Status' }
        ]
    };

    genderData = [];

    getMotherOrg() {
        this.motherOrgService.getAll().subscribe({
            next: (res) => {
                this.motherOrgDate = res;
                console.log(res);
            },
            error: (err) => {
                console.error('Error fetching data:', err);
            }
        });
    }

    submit(data: any) {
        if (this.editingId) {
            // Update existing record
            this.motherOrgService.update(this.editingId, data).subscribe({
                next: (res) => {
                    console.log('Updated:', res);
                    this.editingId = null;
                    this.getMotherOrg();
                },
                error: (err) => {
                    console.error('Error updating:', err);
                }
            });
        } else {
            // Create new record
            this.motherOrgService.create(data).subscribe({
                next: (res) => {
                    console.log('Created:', res);
                    this.getMotherOrg();
                },
                error: (err) => {
                    console.error('Error creating:', err);
                }
            });
        }
    }

    update(row: any) {
        this.editingId = row.id;
        console.log('Edit:', row);
    }

    delete(row: any) {
        if (confirm('Are you sure you want to delete this record?')) {
            this.motherOrgService.delete(row.id).subscribe({
                next: () => {
                    console.log('Deleted successfully');
                    this.getMotherOrg();
                },
                error: (err) => {
                    console.error('Error deleting:', err);
                }
            });
        }
    }
}
