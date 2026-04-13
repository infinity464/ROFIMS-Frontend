import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TagModule } from 'primeng/tag';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { LoginAuditService } from './login-audit.service';
import { LoginAudit } from './login-audit.model';

@Component({
  selector: 'app-login-audit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    InputTextModule,
    ButtonModule,
    SelectModule,
    DatePickerModule,
    TagModule,
    IconFieldModule,
    InputIconModule,
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './login-audit.component.html'
})
export class LoginAuditComponent implements OnInit {
  audits: LoginAudit[] = [];
  totalRecords = 0;
  loading = false;
  rows = 10;
  first = 0;

  searchKeyword = '';
  selectedStatus: string | null = null;
  fromDate: Date | null = null;
  toDate: Date | null = null;

  statusOptions = [
    { label: 'All', value: null },
    { label: 'Success', value: 'success' },
    { label: 'Failed', value: 'failed' }
  ];

  private searchSubject = new Subject<string>();

  constructor(
    private auditService: LoginAuditService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.searchSubject
      .pipe(debounceTime(500), distinctUntilChanged())
      .subscribe(() => {
        this.first = 0;
        this.loadData();
      });
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    const page = Math.floor(this.first / this.rows) + 1;

    const fromStr = this.fromDate ? this.fromDate.toISOString() : undefined;
    const toStr = this.toDate ? this.toDate.toISOString() : undefined;

    this.auditService
      .getAll(page, this.rows, this.searchKeyword || undefined, this.selectedStatus || undefined, fromStr, toStr)
      .subscribe({
        next: (res) => {
          this.audits = res.data;
          this.totalRecords = res.totalRecords;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to load login audit data.',
            life: 3000
          });
        }
      });
  }

  onSearch(value: string): void {
    this.searchKeyword = value;
    this.searchSubject.next(value);
  }

  onStatusChange(): void {
    this.first = 0;
    this.loadData();
  }

  onDateFilter(): void {
    this.first = 0;
    this.loadData();
  }

  onClearFilters(): void {
    this.searchKeyword = '';
    this.selectedStatus = null;
    this.fromDate = null;
    this.toDate = null;
    this.first = 0;
    this.loadData();
  }

  onPageChange(event: any): void {
    this.first = event.first;
    this.rows = event.rows;
    this.loadData();
  }

  getStatusSeverity(isSuccess: boolean): "success" | "danger" {
    return isSuccess ? 'success' : 'danger';
  }

  getFailureLabel(reason: string | null): string {
    if (!reason) return '-';
    switch (reason) {
      case 'UserNotFound': return 'User Not Found';
      case 'InvalidPassword': return 'Invalid Password';
      case 'EmailNotConfirmed': return 'Email Not Confirmed';
      case 'RoleNotFound': return 'Role Not Found';
      case 'AccountLockedOut': return 'Account Locked';
      default: return reason;
    }
  }

  private toBdDateTime(utcDateStr: string): Date {
    // Ensure the string is parsed as UTC by appending 'Z' if missing
    const normalized = utcDateStr.endsWith('Z') ? utcDateStr : utcDateStr + 'Z';
    const utc = new Date(normalized);
    // Bangladesh is UTC+6
    return new Date(utc.getTime() + 6 * 60 * 60 * 1000);
  }

  toBdDate(utcDateStr: string): string {
    const bd = this.toBdDateTime(utcDateStr);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const month = months[bd.getUTCMonth()];
    const day = String(bd.getUTCDate()).padStart(2, '0');
    const year = bd.getUTCFullYear();
    return `${month} ${day} ${year}`;
  }

  toBdTime(utcDateStr: string): string {
    const bd = this.toBdDateTime(utcDateStr);
    let hours = bd.getUTCHours();
    const minutes = String(bd.getUTCMinutes()).padStart(2, '0');
    const amPm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${String(hours).padStart(2, '0')}:${minutes} ${amPm}`;
  }
}
