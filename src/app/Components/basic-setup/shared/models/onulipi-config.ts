// A single serial-ordered অনুলিপি (copy-to) entry, as stored inside the JSON columns.
export interface OnulipiItem {
    serial: number;
    text: string;
}

// Mirrors the backend OnulipiConfig entity. The BN and EN lists are stored as
// separate JSON strings: [{ "serial": 1, "text": "..." }, ...]
export interface OnulipiConfigModel {
    configId: number;
    postingType: string;
    onulipiJsonBN: string;
    onulipiJsonEN: string;
    status: boolean;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string;
}
