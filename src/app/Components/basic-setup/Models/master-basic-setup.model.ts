export interface MasterConfig {
    title: string;
    formFields: MasterFormField[];
    tableColumns: MasterTableColumn[];
    pageSize?: number;
    pageNumber?: number;
}

export interface MasterFormField {
    name: string;
    label: string;
    type: 'text' | 'select';
    options?: any[];
    required: boolean;
    default?: boolean;

}

export interface MasterTableColumn {
    field: string;
    header: string;
    hidden?: boolean;
    type?: 'boolean';
    trueLabel?: string;
    falseLabel?: string;
}
