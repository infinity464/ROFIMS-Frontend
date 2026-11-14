export type SendingRemarkType = 'RequestPosting' | 'ConfidentialRemark' | null;

export const SendingRemarkTypeOptions: { label: string; value: SendingRemarkType }[] = [
    { label: '-', value: null },
    { label: 'Request Posting', value: 'RequestPosting' },
    { label: 'Confidential Remark', value: 'ConfidentialRemark' }
];

export function sendingRemarkTypeLabel(value: SendingRemarkType | undefined): string {
    return SendingRemarkTypeOptions.find(option => option.value === value)?.label ?? '-';
}

export function sendingRemarkError(text: string | null | undefined, type: SendingRemarkType | undefined): string | null {
    if (text && text.length > 500) return 'Sending remark cannot exceed 500 characters.';
    if (type && !text?.trim()) return 'Enter a remark for the selected remark type.';
    return null;
}
