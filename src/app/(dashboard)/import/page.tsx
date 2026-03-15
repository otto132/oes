'use client';

import { useState, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api-client';
import { Badge, Spinner } from '@/components/ui';
import { LEAD_IMPORT_FIELDS, type ColumnMapping } from '@/lib/import-fields';
import { Upload, ArrowRight, Check } from 'lucide-react';

type Step = 'upload' | 'mapping' | 'preview' | 'results';

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  // Auto-detect delimiter from header line: semicolon or comma
  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : ',';

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) { result.push(current.trim()); current = ''; }
      else current += ch;
    }
    result.push(current.trim());
    return result;
  };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

export default function ImportPage() {
  const { addToast } = useStore();
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      addToast({ type: 'error', message: 'File too large (max 5MB)' });
      return;
    }

    setFileName(file.name);
    let parsedHeaders: string[] = [];
    let parsedRows: string[][] = [];

    if (file.name.endsWith('.csv') || file.name.endsWith('.tsv')) {
      const text = await file.text();
      const parsed = parseCSV(text);
      parsedHeaders = parsed.headers;
      parsedRows = parsed.rows;
    } else if (file.name.match(/\.xlsx?$/)) {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (data.length < 2) {
        addToast({ type: 'error', message: 'File has no data rows' });
        return;
      }
      parsedHeaders = data[0].map(String);
      parsedRows = data.slice(1).map(row => row.map(cell => cell == null ? '' : String(cell)));
    } else {
      addToast({ type: 'error', message: 'Unsupported file type. Use .csv, .tsv, .xlsx, or .xls' });
      return;
    }

    if (parsedHeaders.length === 0 || parsedRows.length === 0) {
      addToast({ type: 'error', message: 'File has no data' });
      return;
    }

    if (parsedRows.length > 2000) {
      addToast({ type: 'error', message: `Too many rows (${parsedRows.length}). Maximum is 2000.` });
      return;
    }

    setHeaders(parsedHeaders);
    setAllRows(parsedRows);

    // Send to AI for mapping
    setAnalyzing(true);
    try {
      const sampleRows = parsedRows.slice(0, 5);
      const result = await api.import.analyze(parsedHeaders, sampleRows);
      const aiMapping = result.data;
      setMappings(aiMapping.mappings || parsedHeaders.map((h: string) => ({ sourceColumn: h, targetField: null })));
      setStep('mapping');
    } catch (err) {
      addToast({ type: 'error', message: 'AI analysis failed. Setting up manual mapping.' });
      setMappings(parsedHeaders.map(h => ({ sourceColumn: h, targetField: null })));
      setStep('mapping');
    } finally {
      setAnalyzing(false);
    }
  }, [addToast]);

  const handleConfirmMapping = () => {
    const hasMapped = mappings.some(m => m.targetField);
    if (!hasMapped) {
      addToast({ type: 'error', message: 'Map at least one column before importing' });
      return;
    }
    setStep('preview');
  };

  const handleExecuteImport = async () => {
    setImporting(true);
    try {
      const result = await api.import.execute({
        mappings,
        rows: allRows,
        headers,
      });
      setResults(result.data);
      setStep('results');
      addToast({
        type: result.data.created > 0 ? 'success' : 'info',
        message: `Import complete: ${result.data.created} created, ${result.data.skipped} skipped, ${result.data.errors} errors`,
      });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Import failed' });
    } finally {
      setImporting(false);
    }
  };

  const STEPS: { key: Step; label: string }[] = [
    { key: 'upload', label: 'Upload' },
    { key: 'mapping', label: 'Map Columns' },
    { key: 'preview', label: 'Preview' },
    { key: 'results', label: 'Results' },
  ];

  return (
    <div className="max-w-[800px] page-enter">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Import Leads</h1>
      <p className="text-sm text-sub mb-5">Upload CSV or Excel files. AI will map your columns automatically.</p>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              step === s.key ? 'bg-brand text-brand-on' :
              STEPS.findIndex(st => st.key === step) > i ? 'bg-brand/20 text-brand' :
              'bg-[var(--surface)] text-[var(--muted)]'
            }`}>
              {STEPS.findIndex(st => st.key === step) > i ? <Check size={12} /> : <span>{i + 1}</span>}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <ArrowRight size={14} className="text-[var(--muted)]" />}
          </div>
        ))}
      </div>

      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="rounded-lg bg-[var(--elevated)] border-2 border-dashed border-[var(--border)] p-12 text-center">
          {analyzing ? (
            <div className="flex flex-col items-center gap-3">
              <Spinner className="h-8 w-8" />
              <p className="text-sm text-[var(--sub)]">AI is analyzing your columns...</p>
              <p className="text-xs text-[var(--muted)]">{fileName}</p>
            </div>
          ) : (
            <>
              <Upload size={32} className="mx-auto text-[var(--muted)] mb-3" />
              <p className="text-sm font-medium text-[var(--text)] mb-1">Drop a file or click to browse</p>
              <p className="text-xs text-[var(--muted)] mb-4">CSV, TSV, XLSX, XLS · Max 2000 rows · Max 5MB</p>
              <label className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors cursor-pointer">
                <Upload size={14} /> Choose File
                <input
                  type="file"
                  accept=".csv,.tsv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </>
          )}
        </div>
      )}

      {/* Step: Mapping */}
      {step === 'mapping' && (
        <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">Column Mapping</h2>
              <p className="text-xs text-[var(--muted)]">{fileName} · {allRows.length} rows</p>
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block rounded-lg border border-[var(--border)] overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-3xs font-semibold uppercase tracking-wide text-[var(--muted)] text-left px-3 py-2 bg-[var(--surface)] border-b border-[var(--border)]">Source Column</th>
                  <th className="text-3xs font-semibold uppercase tracking-wide text-[var(--muted)] text-left px-3 py-2 bg-[var(--surface)] border-b border-[var(--border)]">Sample</th>
                  <th className="text-3xs font-semibold uppercase tracking-wide text-[var(--muted)] text-left px-3 py-2 bg-[var(--surface)] border-b border-[var(--border)]">Maps To</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m, i) => {
                  const colIdx = headers.indexOf(m.sourceColumn);
                  const sample = colIdx >= 0 ? allRows.slice(0, 3).map(r => r[colIdx]).filter(Boolean).join(', ') : '';
                  return (
                    <tr key={i} className="border-b border-[var(--border)]">
                      <td className="px-3 py-2 text-sm font-medium text-[var(--text)]">{m.sourceColumn}</td>
                      <td className="px-3 py-2 text-xs text-[var(--muted)] max-w-[200px] truncate">{sample || '—'}</td>
                      <td className="px-3 py-2">
                        <select
                          value={m.targetField || ''}
                          onChange={(e) => {
                            const updated = [...mappings];
                            updated[i] = { ...updated[i], targetField: e.target.value || null };
                            setMappings(updated);
                          }}
                          className={`w-full px-2 py-1 text-xs rounded-md bg-[var(--surface)] border border-[var(--border)] ${m.targetField ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}
                        >
                          <option value="">— Skip —</option>
                          {LEAD_IMPORT_FIELDS.map(f => (
                            <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card layout */}
          <div className="sm:hidden space-y-2">
            {mappings.map((m, i) => {
              const colIdx = headers.indexOf(m.sourceColumn);
              const sample = colIdx >= 0 ? allRows.slice(0, 3).map(r => r[colIdx]).filter(Boolean).join(', ') : '';
              return (
                <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--text)]">{m.sourceColumn}</span>
                  </div>
                  {sample && <p className="text-xs text-[var(--muted)] truncate">{sample}</p>}
                  <select
                    value={m.targetField || ''}
                    onChange={(e) => {
                      const updated = [...mappings];
                      updated[i] = { ...updated[i], targetField: e.target.value || null };
                      setMappings(updated);
                    }}
                    className={`w-full px-2 py-2 text-sm rounded-md bg-[var(--elevated)] border border-[var(--border)] ${m.targetField ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}
                  >
                    <option value="">— Skip —</option>
                    {LEAD_IMPORT_FIELDS.map(f => (
                      <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between mt-4">
            <button
              onClick={() => { setStep('upload'); setHeaders([]); setAllRows([]); setMappings([]); }}
              className="px-3.5 py-1.5 text-sm text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleConfirmMapping}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors"
            >
              Continue <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-5">
          <h2 className="text-base font-semibold mb-1">Preview Import</h2>
          <p className="text-xs text-[var(--muted)] mb-4">
            Importing {allRows.length} rows as <Badge variant="info">leads</Badge>
          </p>

          <div className="overflow-x-auto rounded-lg border border-[var(--border)] mb-4">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="text-3xs uppercase text-[var(--muted)] text-left px-2 py-1.5 bg-[var(--surface)] border-b border-[var(--border)]">#</th>
                  {mappings.filter(m => m.targetField).map(m => (
                    <th key={m.sourceColumn} className="text-3xs uppercase text-[var(--muted)] text-left px-2 py-1.5 bg-[var(--surface)] border-b border-[var(--border)]">
                      {LEAD_IMPORT_FIELDS.find(f => f.key === m.targetField)?.label || m.targetField}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRows.slice(0, 10).map((row, i) => (
                  <tr key={i} className="border-b border-[var(--border)]">
                    <td className="px-2 py-1.5 text-[var(--muted)]">{i + 1}</td>
                    {mappings.filter(m => m.targetField).map(m => {
                      const idx = headers.indexOf(m.sourceColumn);
                      return <td key={m.sourceColumn} className="px-2 py-1.5 text-[var(--text)]">{idx >= 0 ? row[idx] : ''}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {allRows.length > 10 && (
            <p className="text-2xs text-[var(--muted)] mb-4">Showing first 10 of {allRows.length} rows</p>
          )}

          <div className="flex justify-between">
            <button
              onClick={() => setStep('mapping')}
              className="px-3.5 py-1.5 text-sm text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleExecuteImport}
              disabled={importing}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors disabled:opacity-50"
            >
              {importing ? <><Spinner className="h-3.5 w-3.5" /> Importing...</> : <>Import {allRows.length} leads</>}
            </button>
          </div>
        </div>
      )}

      {/* Step: Results */}
      {step === 'results' && results && (
        <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-5">
          <h2 className="text-base font-semibold mb-3">Import Complete</h2>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg bg-brand/10 border border-brand/20 p-3 text-center">
              <div className="font-mono text-xl font-bold text-brand">{results.created}</div>
              <div className="text-2xs text-brand">Created</div>
            </div>
            <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 text-center">
              <div className="font-mono text-xl font-bold text-yellow-500">{results.skipped}</div>
              <div className="text-2xs text-yellow-500">Skipped</div>
            </div>
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-center">
              <div className="font-mono text-xl font-bold text-red-500">{results.errors}</div>
              <div className="text-2xs text-red-500">Errors</div>
            </div>
          </div>

          {results.results?.some((r: any) => r.status !== 'created') && (
            <div className="max-h-[300px] overflow-y-auto rounded-lg border border-[var(--border)]">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="text-left px-2 py-1.5 bg-[var(--surface)] border-b border-[var(--border)] text-3xs uppercase text-[var(--muted)]">Row</th>
                    <th className="text-left px-2 py-1.5 bg-[var(--surface)] border-b border-[var(--border)] text-3xs uppercase text-[var(--muted)]">Name</th>
                    <th className="text-left px-2 py-1.5 bg-[var(--surface)] border-b border-[var(--border)] text-3xs uppercase text-[var(--muted)]">Status</th>
                    <th className="text-left px-2 py-1.5 bg-[var(--surface)] border-b border-[var(--border)] text-3xs uppercase text-[var(--muted)]">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {results.results.filter((r: any) => r.status !== 'created').map((r: any) => (
                    <tr key={r.row} className="border-b border-[var(--border)]">
                      <td className="px-2 py-1.5 text-[var(--muted)]">{r.row}</td>
                      <td className="px-2 py-1.5 text-[var(--text)]">{r.name}</td>
                      <td className="px-2 py-1.5">
                        <Badge variant={r.status === 'skipped' ? 'warn' : 'err'}>{r.status}</Badge>
                      </td>
                      <td className="px-2 py-1.5 text-[var(--muted)]">{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={() => { setStep('upload'); setHeaders([]); setAllRows([]); setMappings([]); setResults(null); }}
              className="px-3.5 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors"
            >
              Import More
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
