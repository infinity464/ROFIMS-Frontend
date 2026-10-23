import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SignatoryDetail {
    step: string;
    name: string;
    nameBN?: string;
    rabId: string;
    rank: string;
    rankBN?: string;
    serviceRank: string;
    appointment: string;
    appointmentBN?: string;
    employeeId?: number;
    signatureDataUrl?: string;
}

@Component({
    selector: 'app-notesheet-signatory',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './notesheet-signatory.html',
    styleUrl: './notesheet-signatory.scss'
})
export class NotesheetSignatoryComponent {
    @Input() detail: SignatoryDetail | null = null;
    @Input() showSignature = false;
    @Input() isEnglish = true;
    @Input() align: 'left' | 'right' = 'left';
    @Input() showDate = false;
    @Input() dateValue = '';
    /** Override the role label (e.g. 'Prepared by'); if not set, uses detail.step with auto translation. */
    @Input() roleLabel = '';
    /** Fallback name when detail is null (e.g. for Prepared by with only string name). */
    @Input() fallbackName = '';

    private readonly stepTranslations: Record<string, string> = {
        'Prepared by': 'প্রস্তুতকারী',
        'Initiator': 'সূচনাকারী',
        'Final Approver': 'চূড়ান্ত অনুমোদনকারী'
    };

    /** Returns the display label for the role, translating to Bangla when needed. */
    getDisplayRole(): string {
        if (this.roleLabel) return this.roleLabel;
        const step = this.detail?.step ?? '';
        if (this.isEnglish) return step;
        // Translate known steps; for "Recommender 1", "Recommender 2" etc., translate the prefix
        if (step.startsWith('Recommender')) {
            const suffix = step.replace('Recommender', '').trim();
            return suffix ? `সুপারিশকারী ${suffix}` : 'সুপারিশকারী';
        }
        return this.stepTranslations[step] ?? step;
    }
}
