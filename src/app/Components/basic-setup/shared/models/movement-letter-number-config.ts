export interface MovementLetterNumberConfigModel {
    configId: number;
    /** CommonCode.codeId where codeType = 'RabUnit'. null = global fallback config. */
    rabUnitId: number | null;
    /** Enum: CC=1, MO=2, Article47Handover=3, Article47Takeover=4 */
    moveOrderType: number;
    prefix: string;
    prefixBN: string;
    startNumber: number;
    /** Zero-pad width taken from how the Start Number was typed: "001" → 3, "0001000" → 7. 0 = unpadded. */
    numberPadding: number;
    currentNumber: number;
    /** Year the sequence is running in — it resets to startNumber when the year rolls over. */
    currentYear: number;
    currentMonth: number;
    /** "Include Year" on the config screen — appends the year to the letter number. */
    includeDateInNumber: boolean;
    /** Unit contact number printed on the movement letter. Free text. */
    telephoneNo: string | null;
    /**
     * Fallback config for this move-order type — used when the issuing unit has no
     * config of its own. Only one config per move-order type can hold it; saving a
     * new default clears the previous one.
     */
    isDefault: boolean;
    status: boolean;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string;
}
