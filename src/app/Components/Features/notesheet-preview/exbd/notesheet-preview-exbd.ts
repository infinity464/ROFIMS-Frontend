import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { NotesheetSignatoryComponent } from '@/Components/Common/notesheet-signatory/notesheet-signatory';
import { NotesheetPreviewBase } from '../notesheet-preview-base';

@Component({
    selector: 'app-notesheet-preview-exbd',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, ToastModule, TooltipModule, NotesheetSignatoryComponent],
    providers: [MessageService],
    templateUrl: './notesheet-preview-exbd.html',
    styleUrl: '../notesheet-preview.scss'
})
export class NotesheetPreviewExbdComponent extends NotesheetPreviewBase {}
