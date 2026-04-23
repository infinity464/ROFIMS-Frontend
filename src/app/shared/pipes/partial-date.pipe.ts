import { Pipe, PipeTransform } from '@angular/core';
import { DatePrecision, formatPartialDate } from '../utils/partial-date.util';

/**
 * Renders a stored date + precision indicator ('D' | 'M' | 'Y') as a report-ready string.
 * Usage: {{ row.serviceFrom | partialDate: row.serviceFromPrecision }}
 */
@Pipe({
    name: 'partialDate',
    standalone: true
})
export class PartialDatePipe implements PipeTransform {
    transform(value: Date | string | null | undefined, precision: DatePrecision | null | undefined): string {
        return formatPartialDate(value, precision);
    }
}
