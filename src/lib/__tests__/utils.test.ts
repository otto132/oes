import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fmt,
  fDate,
  fRelative,
  isOverdue,
  weightedValue,
  confColor,
  confLabel,
  riskColor,
  riskBorderColor,
  cn,
  confNum,
} from '@/lib/utils';
import { compositeScore, healthAvg, riskLevel } from '@/lib/types';
import type { FIUACScores } from '@/lib/types';

// ── fmt (currency formatter) ───────────────────────────────

describe('fmt', () => {
  it('formats millions with one decimal', () => {
    expect(fmt(1_500_000)).toBe('€1.5M');
  });

  it('formats exactly 1M', () => {
    expect(fmt(1_000_000)).toBe('€1.0M');
  });

  it('formats thousands with no decimals', () => {
    expect(fmt(75_000)).toBe('€75K');
  });

  it('formats exactly 1K', () => {
    expect(fmt(1_000)).toBe('€1K');
  });

  it('formats values below 1K as plain euros', () => {
    expect(fmt(500)).toBe('€500');
  });

  it('formats zero', () => {
    expect(fmt(0)).toBe('€0');
  });
});

// ── fDate (date formatter) ─────────────────────────────────

describe('fDate', () => {
  it('returns em-dash for null', () => {
    expect(fDate(null)).toBe('—');
  });

  it('returns em-dash for empty string', () => {
    expect(fDate('')).toBe('—');
  });

  it('formats a valid ISO date string', () => {
    // en-GB: "15 Jun"
    const result = fDate('2025-06-15T00:00:00Z');
    expect(result).toMatch(/15/);
    expect(result).toMatch(/Jun/);
  });
});

// ── fRelative (relative date formatter) ────────────────────

describe('fRelative', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Never" for null', () => {
    expect(fRelative(null)).toBe('Never');
  });

  it('returns "Never" for empty string', () => {
    expect(fRelative('')).toBe('Never');
  });

  it('returns "Today" for current date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    expect(fRelative('2025-06-15T10:00:00Z')).toBe('Today');
    vi.useRealTimers();
  });

  it('returns "1d ago" for yesterday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    expect(fRelative('2025-06-14T12:00:00Z')).toBe('1d ago');
    vi.useRealTimers();
  });

  it('returns days for 2-6 days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    expect(fRelative('2025-06-12T12:00:00Z')).toBe('3d ago');
    vi.useRealTimers();
  });

  it('returns weeks for 7-29 days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    expect(fRelative('2025-06-01T12:00:00Z')).toBe('2w ago');
    vi.useRealTimers();
  });

  it('returns months for 30+ days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    expect(fRelative('2025-03-15T12:00:00Z')).toBe('3mo ago');
    vi.useRealTimers();
  });
});

// ── isOverdue ──────────────────────────────────────────────

describe('isOverdue', () => {
  it('returns false for null', () => {
    expect(isOverdue(null)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isOverdue('')).toBe(false);
  });

  it('returns true for a past date', () => {
    expect(isOverdue('2020-01-01T00:00:00Z')).toBe(true);
  });

  it('returns false for a far future date', () => {
    expect(isOverdue('2099-01-01T00:00:00Z')).toBe(false);
  });
});

// ── weightedValue ──────────────────────────────────────────

describe('weightedValue', () => {
  it('calculates weighted value for known stage', () => {
    // Solution Fit = 50%
    expect(weightedValue(100_000, 'Solution Fit')).toBe(50_000);
  });

  it('returns 0 for Closed Lost (0%)', () => {
    expect(weightedValue(200_000, 'Closed Lost')).toBe(0);
  });

  it('returns full amount for Closed Won (100%)', () => {
    expect(weightedValue(200_000, 'Closed Won')).toBe(200_000);
  });

  it('returns 0 for unknown stage', () => {
    expect(weightedValue(100_000, 'UnknownStage')).toBe(0);
  });

  it('returns 0 for zero amount', () => {
    expect(weightedValue(0, 'Proposal')).toBe(0);
  });

  it('rounds to nearest integer', () => {
    // Discovery = 20%, 333 * 20/100 = 66.6 → 67
    expect(weightedValue(333, 'Discovery')).toBe(67);
  });
});

// ── confColor / confLabel ──────────────────────────────────

describe('confColor', () => {
  it('returns text-brand for >= 0.8', () => {
    expect(confColor(0.8)).toBe('text-brand');
    expect(confColor(1.0)).toBe('text-brand');
  });

  it('returns text-warn for >= 0.6 and < 0.8', () => {
    expect(confColor(0.6)).toBe('text-warn');
    expect(confColor(0.79)).toBe('text-warn');
  });

  it('returns text-danger for < 0.6', () => {
    expect(confColor(0.5)).toBe('text-danger');
    expect(confColor(0)).toBe('text-danger');
  });
});

describe('confLabel', () => {
  it('converts decimal to percentage string', () => {
    expect(confLabel(0.85)).toBe('85%');
  });

  it('rounds to nearest integer', () => {
    expect(confLabel(0.756)).toBe('76%');
  });

  it('handles zero', () => {
    expect(confLabel(0)).toBe('0%');
  });

  it('handles 1.0', () => {
    expect(confLabel(1)).toBe('100%');
  });
});

// ── riskColor / riskBorderColor ────────────────────────────

describe('riskColor', () => {
  it('returns text-brand for healthy deal (avg >= 60)', () => {
    expect(riskColor({ eng: 80, stake: 70, comp: 60, time: 70 })).toBe('text-brand');
  });

  it('returns text-warn for medium risk (avg 40-59)', () => {
    expect(riskColor({ eng: 50, stake: 40, comp: 50, time: 40 })).toBe('text-warn');
  });

  it('returns text-danger for high risk (avg < 40)', () => {
    expect(riskColor({ eng: 20, stake: 30, comp: 10, time: 20 })).toBe('text-danger');
  });
});

describe('riskBorderColor', () => {
  it('returns border-brand for healthy deal', () => {
    expect(riskBorderColor({ eng: 80, stake: 70, comp: 60, time: 70 })).toBe('border-brand');
  });

  it('returns border-warn for medium risk', () => {
    expect(riskBorderColor({ eng: 50, stake: 40, comp: 50, time: 40 })).toBe('border-warn');
  });

  it('returns border-danger for high risk', () => {
    expect(riskBorderColor({ eng: 20, stake: 30, comp: 10, time: 20 })).toBe('border-danger');
  });
});

// ── cn (classname joiner) ──────────────────────────────────

describe('cn', () => {
  it('joins multiple class strings', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('filters out false values', () => {
    expect(cn('a', false, 'b')).toBe('a b');
  });

  it('filters out null and undefined', () => {
    expect(cn('a', null, undefined, 'b')).toBe('a b');
  });

  it('returns empty string when all falsy', () => {
    expect(cn(false, null, undefined)).toBe('');
  });

  it('handles single class', () => {
    expect(cn('only')).toBe('only');
  });
});

// ── confNum ────────────────────────────────────────────────

describe('confNum', () => {
  it('returns number as-is when given a number', () => {
    expect(confNum(0.75)).toBe(0.75);
  });

  it('maps "high" to 0.85', () => {
    expect(confNum('high')).toBe(0.85);
  });

  it('maps "medium" to 0.65', () => {
    expect(confNum('medium')).toBe(0.65);
  });

  it('maps any other string to 0.35 (low)', () => {
    expect(confNum('low')).toBe(0.35);
    expect(confNum('unknown')).toBe(0.35);
  });
});

// ── Types: compositeScore ──────────────────────────────────

describe('compositeScore', () => {
  it('calculates weighted composite (25/25/20/15/15)', () => {
    const s: FIUACScores = { f: 80, i: 60, u: 100, a: 40, c: 20 };
    // 80*0.25 + 60*0.25 + 100*0.20 + 40*0.15 + 20*0.15
    // = 20 + 15 + 20 + 6 + 3 = 64
    expect(compositeScore(s)).toBe(64);
  });

  it('returns 0 for all-zero scores', () => {
    expect(compositeScore({ f: 0, i: 0, u: 0, a: 0, c: 0 })).toBe(0);
  });

  it('returns 100 for all-100 scores', () => {
    expect(compositeScore({ f: 100, i: 100, u: 100, a: 100, c: 100 })).toBe(100);
  });
});

// ── Types: healthAvg ───────────────────────────────────────

describe('healthAvg', () => {
  it('returns average of four health dimensions rounded', () => {
    expect(healthAvg({ eng: 70, stake: 50, comp: 80, time: 60 })).toBe(65);
  });

  it('rounds to nearest integer', () => {
    // (71 + 50 + 80 + 60) / 4 = 65.25 → 65
    expect(healthAvg({ eng: 71, stake: 50, comp: 80, time: 60 })).toBe(65);
  });

  it('handles all zeros', () => {
    expect(healthAvg({ eng: 0, stake: 0, comp: 0, time: 0 })).toBe(0);
  });
});

// ── Types: riskLevel ───────────────────────────────────────

describe('riskLevel', () => {
  it('returns "low" for avg >= 60', () => {
    expect(riskLevel({ eng: 80, stake: 70, comp: 60, time: 70 })).toBe('low');
  });

  it('returns "medium" for avg 40-59', () => {
    expect(riskLevel({ eng: 50, stake: 40, comp: 50, time: 40 })).toBe('medium');
  });

  it('returns "high" for avg < 40', () => {
    expect(riskLevel({ eng: 20, stake: 30, comp: 10, time: 20 })).toBe('high');
  });
});
