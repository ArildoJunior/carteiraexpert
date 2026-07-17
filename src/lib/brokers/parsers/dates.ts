// "31/12/2025" -> "2025-12-31"  (BR)
// "2025-12-31" -> "2025-12-31"  (ISO)
// "12/31/2025" -> "2025-12-31"  (US)
// Aceita tambem "31/12/2025 14:30:00" (com hora).
export function parseFlexibleDate(value: string, hint: "BR" | "US" | "ISO" = "BR"): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  // Pega so a parte da data (antes do espaço, se houver)
  const datePart = trimmed.split(/\s+/)[0] ?? trimmed;

  // ISO YYYY-MM-DD (ou YYYY-MM-DDTHH:MM:SS)
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(datePart);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    if (y && m && d) return `${y}-${m}-${d}`;
  }

  // BR DD/MM/YYYY
  if (hint === "BR" || hint === "ISO") {
    const brMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(datePart);
    if (brMatch) {
      const [, d, m, y] = brMatch;
      if (d && m && y) {
        const day = d.padStart(2, "0");
        const month = m.padStart(2, "0");
        if (isValidDate(y, month, day)) return `${y}-${month}-${day}`;
      }
    }
  }

  // US MM/DD/YYYY
  if (hint === "US") {
    const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(datePart);
    if (usMatch) {
      const [, m, d, y] = usMatch;
      if (m && d && y) {
        const day = d.padStart(2, "0");
        const month = m.padStart(2, "0");
        if (isValidDate(y, month, day)) return `${y}-${month}-${day}`;
      }
    }
  }

  return null;
}

function isValidDate(year: string, month: string, day: string): boolean {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  if (y < 1900 || y > 2100) return false;
  return true;
}
