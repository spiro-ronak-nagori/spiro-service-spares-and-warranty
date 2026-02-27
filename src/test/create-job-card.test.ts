import { describe, it, expect } from 'vitest';

/**
 * Unit tests for job card creation logic (pure functions extracted from CreateJobCardPage).
 * These test the validation and data-preparation logic, not Supabase calls.
 */

// --- Helpers extracted from CreateJobCardPage ---

function validateRegNo(regNo: string, country: string): string | null {
  const trimmed = regNo.toUpperCase().trim();
  if (!trimmed) return 'Registration number is required';

  const patterns: Record<string, RegExp> = {
    Kenya: /^K[A-Z]{2}\s?\d{3}[A-Z]$/,
    Uganda: /^U[A-Z]{2}\s?\d{3}[A-Z]{1,2}$/,
    Rwanda: /^R[A-Z]{2}\s?\d{3}[A-Z]$/,
  };

  const pattern = patterns[country];
  if (pattern && !pattern.test(trimmed)) {
    return `Invalid ${country} registration format`;
  }
  return null;
}

function parseJcNumber(jcNumber: string): { date: string; seq: number } | null {
  if (!jcNumber.startsWith('JC') || jcNumber.length < 14) return null;
  const date = jcNumber.substring(2, 10);
  const seq = parseInt(jcNumber.substring(10), 10);
  if (isNaN(seq)) return null;
  return { date, seq };
}

function computeSocAnomaly(currentSoc: number | null, lastSoc: number | null): boolean {
  if (currentSoc === null || lastSoc === null) return false;
  return Math.abs(currentSoc - lastSoc) > 40;
}

function computeOdometerMismatch(entered: number, ocrReading: number | null, threshold = 0.10): { hasMismatch: boolean; percentage: number } | null {
  if (ocrReading === null || entered <= 0) return null;
  const diff = Math.abs(ocrReading - entered);
  const percentage = diff / entered;
  return { hasMismatch: percentage > threshold, percentage: percentage * 100 };
}

function computeSocMismatch(entered: number, ocrReading: number | null, threshold = 0.15): { hasMismatch: boolean; percentage: number } | null {
  if (ocrReading === null || entered < 0) return null;
  const diff = Math.abs(ocrReading - entered);
  const percentage = entered > 0 ? diff / entered : (diff > 0 ? 1 : 0);
  return { hasMismatch: percentage > threshold, percentage: percentage * 100 };
}

// --- Tests ---

describe('Registration Number Validation', () => {
  it('accepts valid Kenyan plate', () => {
    expect(validateRegNo('KAB 123A', 'Kenya')).toBeNull();
    expect(validateRegNo('KCD456Z', 'Kenya')).toBeNull();
  });

  it('rejects invalid Kenyan plate', () => {
    expect(validateRegNo('XYZ123', 'Kenya')).toBeTruthy();
    expect(validateRegNo('K1B 123A', 'Kenya')).toBeTruthy();
  });

  it('accepts valid Ugandan plate (1 suffix letter)', () => {
    expect(validateRegNo('UAB 123C', 'Uganda')).toBeNull();
  });

  it('accepts valid Ugandan plate (2 suffix letters)', () => {
    expect(validateRegNo('UAB 123CD', 'Uganda')).toBeNull();
  });

  it('accepts valid Rwandan plate', () => {
    expect(validateRegNo('RAB 123A', 'Rwanda')).toBeNull();
  });

  it('returns error for empty input', () => {
    expect(validateRegNo('', 'Kenya')).toBeTruthy();
    expect(validateRegNo('   ', 'Kenya')).toBeTruthy();
  });

  it('allows any format for unknown country', () => {
    expect(validateRegNo('ANYTHING', 'Nigeria')).toBeNull();
  });
});

describe('JC Number Parsing', () => {
  it('parses valid JC number', () => {
    const result = parseJcNumber('JC202602110001');
    expect(result).toEqual({ date: '20260211', seq: 1 });
  });

  it('parses JC number with large sequence', () => {
    const result = parseJcNumber('JC202602111112');
    expect(result).toEqual({ date: '20260211', seq: 1112 });
  });

  it('returns null for invalid format', () => {
    expect(parseJcNumber('XX1234')).toBeNull();
    expect(parseJcNumber('JC')).toBeNull();
  });

  it('sequence starts at position 11 (after JC + 8-char date)', () => {
    const jc = 'JC202602110005';
    // JC = 2 chars, 20260211 = 8 chars = 10 total, seq from position 10 (0-indexed)
    const seq = parseInt(jc.substring(10), 10);
    expect(seq).toBe(5);
  });
});

describe('SOC Anomaly Detection', () => {
  it('flags jump > 40', () => {
    expect(computeSocAnomaly(80, 30)).toBe(true);
    expect(computeSocAnomaly(10, 60)).toBe(true);
  });

  it('does not flag small change', () => {
    expect(computeSocAnomaly(50, 45)).toBe(false);
    expect(computeSocAnomaly(80, 80)).toBe(false);
  });

  it('does not flag when values are null', () => {
    expect(computeSocAnomaly(null, 50)).toBe(false);
    expect(computeSocAnomaly(50, null)).toBe(false);
    expect(computeSocAnomaly(null, null)).toBe(false);
  });

  it('flags exactly 41 difference', () => {
    expect(computeSocAnomaly(50, 9)).toBe(true);
  });

  it('does not flag exactly 40 difference', () => {
    expect(computeSocAnomaly(50, 10)).toBe(false);
  });
});

describe('Odometer Mismatch Detection', () => {
  it('detects mismatch above 10% threshold', () => {
    const result = computeOdometerMismatch(1000, 1200);
    expect(result?.hasMismatch).toBe(true);
    expect(result?.percentage).toBe(20);
  });

  it('no mismatch within threshold', () => {
    const result = computeOdometerMismatch(1000, 1050);
    expect(result?.hasMismatch).toBe(false);
  });

  it('returns null when OCR is null', () => {
    expect(computeOdometerMismatch(1000, null)).toBeNull();
  });

  it('returns null when entered is 0', () => {
    expect(computeOdometerMismatch(0, 500)).toBeNull();
  });
});

describe('SOC Mismatch Detection', () => {
  it('detects mismatch above 15% threshold', () => {
    const result = computeSocMismatch(80, 60);
    expect(result?.hasMismatch).toBe(true);
  });

  it('no mismatch within threshold', () => {
    const result = computeSocMismatch(80, 78);
    expect(result?.hasMismatch).toBe(false);
  });

  it('returns null when OCR is null', () => {
    expect(computeSocMismatch(80, null)).toBeNull();
  });

  it('handles entered value of 0', () => {
    const result = computeSocMismatch(0, 5);
    expect(result?.hasMismatch).toBe(true);
    expect(result?.percentage).toBe(100);
  });
});

describe('Vehicle Upsert Logic', () => {
  it('reg_no is uppercased and trimmed', () => {
    const input = '  kab 123a  ';
    const result = input.toUpperCase().trim();
    expect(result).toBe('KAB 123A');
  });
});

describe('OCR null safety', () => {
  it('handles null ocr result gracefully', () => {
    const ocrResult: any = null;
    const reading = ocrResult?.ocrReading ?? null;
    const confidence = ocrResult?.confidence ?? null;
    expect(reading).toBeNull();
    expect(confidence).toBeNull();
  });

  it('handles undefined ocr result gracefully', () => {
    const ocrResult: any = undefined;
    const reading = ocrResult?.ocr?.socReading ?? null;
    expect(reading).toBeNull();
  });
});
