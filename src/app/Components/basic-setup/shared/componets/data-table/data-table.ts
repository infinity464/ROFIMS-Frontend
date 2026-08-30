import { Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { FluidModule } from 'primeng/fluid';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { FormBuilder, FormGroup, FormsModule, Validators } from '@angular/forms';
import { TextareaModule } from 'primeng/textarea';
import { MultiSelectModule } from 'primeng/multiselect';
import { SliderModule } from 'primeng/slider';
import { Table, TableModule } from 'primeng/table';
import { ProgressBarModule } from 'primeng/progressbar';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { ToastModule } from 'primeng/toast';
import { CommonModule } from '@angular/common';
import { RatingModule } from 'primeng/rating';
import { RippleModule } from 'primeng/ripple';
import { InputIconModule } from 'primeng/inputicon';
import { IconFieldModule } from 'primeng/iconfield';
import { TagModule } from 'primeng/tag';
import { ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { TableConfig } from '../../models/dataTableConfig';


@Component({
    selector: 'app-data-table',

    imports: [
        ReactiveFormsModule,
        InputTextModule,
        FluidModule,
        ButtonModule,
        SelectModule,
        FormsModule,
        TextareaModule,
        TableModule,
        MultiSelectModule,
        SelectModule,
        InputIconModule,
        TagModule,
        InputTextModule,
        SliderModule,
        ProgressBarModule,
        ToggleButtonModule,
        ToastModule,
        CommonModule,
        FormsModule,
        ButtonModule,
        RatingModule,
        RippleModule,
        IconFieldModule
    ],
    templateUrl: './data-table.html',
    styleUrl: './data-table.scss'
})

export class DataTable implements OnInit {
    @Input() config!: TableConfig;
    @Input() data: any[] = [];
    @Input() first = 0;
    @Input() totalRecords = 0;
    @Input() rows = 10;
    @Input() loading = false;
    /** When false, table displays data without lazy loading (client-side paging) */
    @Input() lazy = true;
    /** Permission flags – hide edit/delete buttons when false */
    @Input() canUpdate = true;
    @Input() canDelete = true;
    @Output() edit = new EventEmitter<any>();
    @Output() delete = new EventEmitter<{ row: any; event: Event }>();
    @Output() lazyLoad = new EventEmitter<any>();
    @Output() search = new EventEmitter<string>();

    @ViewChild(Table) table?: Table;

    searchSubject = new Subject<string>();

    ngOnInit() {
        this.searchSubject.pipe(debounceTime(500), distinctUntilChanged()).subscribe((keyword) => {
            // Reset the paginator back to the first page whenever the search keyword
            // changes. The parent's `first` input stays at 0 (paginator page changes
            // are not tracked back to it), so the one-way `[first]` binding cannot
            // reset the table on its own – reset the table's internal page directly.
            if (this.table) {
                this.table.first = 0;
            }
            this.first = 0;
            this.search.emit(keyword);
        });
    }

    onSearch(value: string) {
        this.searchSubject.next(value);
    }

    onEdit(row: any) {
        this.edit.emit(row);
    }

    onDelete(row: any, event: Event) {
        this.delete.emit({ row, event });
    }

    onLazyLoad(event: any) {
        this.lazyLoad.emit(event);
    }
}
