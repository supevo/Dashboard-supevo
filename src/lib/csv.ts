/**
 * Minimal RFC-4180 CSV parser (dependency-free). Handles quoted fields,
 * embedded commas, embedded newlines and escaped double-quotes ("") — which
 * matters because the board export packs multi-line descriptions and comment
 * threads into single cells. Accepts a custom delimiter (',' default; ';' is
 * common in German Excel exports) and tolerates both \n and \r\n line endings.
 */
export function parseCsv(input: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // Strip a UTF-8 BOM if present.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      // Handle \r\n as a single break; a lone \r or \n also ends the row.
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }

  // Flush the final field/row if the file didn't end on a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully empty trailing rows (a single empty field from a final newline).
  return rows.filter((r) => !(r.length === 1 && (r[0] ?? '').trim() === ''));
}
