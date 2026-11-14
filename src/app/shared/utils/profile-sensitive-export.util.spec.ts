import { protectProfileExport } from './profile-sensitive-export.util';

describe('sensitive profile exports', () => {
    const labels = {
        'section.presentRabService': 'Present service',
        'section.previousRabService': 'Previous service',
        'section.additionalRemarks': 'Additional Remarks',
        'section.confidentialRemarks': 'Confidential Remarks',
        'table.remarks': 'Remarks',
        'table.ser': 'Ser',
        'table.confidentialRemarks': 'Confidential Remarks',
        'empty.noConfidentialRemarks': 'No confidential remarks'
    };
    const sections = [
        { title: 'Present service', columns: ['Ser', 'Remarks'], rows: [['1', 'sensitive']] },
        { title: 'Previous service', columns: ['Ser', 'Remarks'], rows: [['2', 'historical sensitive']] },
        { title: 'Additional Remarks', columns: ['Remarks'], rows: [['ordinary remark']] },
        { title: 'Documents', columns: ['Name'], rows: [['document']] }
    ];

    it('omits sensitive columns and preserves ordinary additional remarks without permission', () => {
        const result = protectProfileExport(sections, labels, false, [{ additionalRemarks: 'secret' }]);
        expect(result[0].columns).toEqual(['Ser']);
        expect(result[0].rows).toEqual([['1']]);
        expect(result[1].rows).toEqual([['2']]);
        expect(result[2].rows).toEqual([['ordinary remark']]);
        expect(JSON.stringify(result)).not.toContain('sensitive');
        expect(JSON.stringify(result)).not.toContain('secret');
        expect(sections[0].rows[0][1]).toBe('sensitive');
    });

    it('inserts confidential remarks immediately after Additional Remarks for an authorized role', () => {
        const result = protectProfileExport(sections, labels, true, [{ additionalRemarks: 'secret' }]);
        expect(result.map(section => section.title)).toEqual(['Present service', 'Previous service', 'Additional Remarks', 'Confidential Remarks', 'Documents']);
        expect(result[3].rows).toEqual([['1', 'secret']]);
        expect(result[0].rows).toEqual([['1', 'sensitive']]);
    });

    it('adds an empty message only for an authorized role', () => {
        const result = protectProfileExport(sections, labels, true, []);
        expect(result[3].rows).toEqual([['No confidential remarks']]);
        expect(protectProfileExport(sections, labels, false, []).some(section => section.title === 'Confidential Remarks')).toBeFalse();
    });
});
