/**
 * ADOFAI writes "JSON" that is not always valid: a UTF-8 BOM, trailing commas,
 * raw newlines inside strings, and occasionally missing commas between objects.
 * Try the strict parser first and fall back to a repair pass.
 */
export function parseLenientJson(text: string): unknown {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  try {
    return JSON.parse(src);
  } catch {
    return JSON.parse(repairJson(src));
  }
}

const isWs = (c: number) => c === 32 || c === 9 || c === 10 || c === 13;

function escapeControl(c: number): string {
  if (c === 10) return '\\n';
  if (c === 13) return '\\r';
  if (c === 9) return '\\t';
  return '\\u' + c.toString(16).padStart(4, '0');
}

export function repairJson(src: string): string {
  const out: string[] = [];
  const n = src.length;
  let start = 0;
  let inString = false;
  const nextNonWs = (from: number) => {
    let j = from;
    while (j < n && isWs(src.charCodeAt(j))) j++;
    return j;
  };
  for (let i = 0; i < n; i++) {
    const c = src.charCodeAt(i);
    if (inString) {
      if (c === 92) {
        i++;
      } else if (c === 34) {
        inString = false;
      } else if (c < 0x20) {
        out.push(src.slice(start, i), escapeControl(c));
        start = i + 1;
      }
      continue;
    }
    if (c === 34) {
      inString = true;
    } else if (c === 44) {
      // Drop trailing / doubled commas.
      const j = nextNonWs(i + 1);
      const next = src.charCodeAt(j);
      if (j >= n || next === 125 || next === 93 || next === 44) {
        out.push(src.slice(start, i));
        start = i + 1;
      }
    } else if (c === 125 || c === 93) {
      // Insert a missing comma between `}` / `]` and a following value or key.
      const j = nextNonWs(i + 1);
      const next = src.charCodeAt(j);
      if (next === 123 || next === 91 || next === 34) {
        out.push(src.slice(start, i + 1), ',');
        start = i + 1;
      }
    }
  }
  out.push(src.slice(start));
  return out.join('');
}
