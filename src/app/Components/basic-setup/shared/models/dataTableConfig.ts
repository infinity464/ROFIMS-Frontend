export interface TableConfig {
    tableColumns: TableColumn[];
}

export interface TableColumn {
    field: string;
    header: string;
    hidden?: boolean;
    type?: 'boolean' | 'text';
    trueLabel?: string;
    falseLabel?: string;
}
