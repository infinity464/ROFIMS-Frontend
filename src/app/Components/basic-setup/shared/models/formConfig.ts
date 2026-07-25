export interface FormConfig {
    formFields: FormField[];
}

export interface FormField {
    name: string;
    label: string;
    type: 'text' | 'select' | 'multiselect' | 'number' | 'date' | 'checkbox' | 'textarea';
    default?: any;
    required?: boolean;
    options?: { label: string; value: any }[];
    dependsOn?: string;
    cascadeLoad?: boolean;
    /** Show this field only when another field's value equals `equals`. */
    visibleWhen?: { field: string; equals: any };

}
