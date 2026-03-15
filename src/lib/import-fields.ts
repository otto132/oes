export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
}

export const LEAD_IMPORT_FIELDS: ImportField[] = [
  { key: 'company', label: 'Company', required: true },
  { key: 'type', label: 'Company Type' },
  { key: 'country', label: 'Country' },
  { key: 'pain', label: 'Pain / Description' },
  { key: 'source', label: 'Source' },
];

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string | null; // null = unmapped
}
