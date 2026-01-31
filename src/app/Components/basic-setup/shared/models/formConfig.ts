export interface FormConfig {
    formFields: FormField[];
}

export interface FormField {
    name: string;
    label: string;
    type: 'text' | 'select' | 'number' | 'date' | 'checkbox' | 'textarea';
    default?: any;
    required?: boolean;
    options?: { label: string; value: any }[];
    dependsOn?: string;
    cascadeLoad?: boolean;

}
