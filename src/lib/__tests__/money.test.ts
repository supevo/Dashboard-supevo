import { describe, expect, it } from 'vitest';
import { centsToInput, formatEuroCents, parseEuroToCents } from '../money';

describe('formatEuroCents', () => {
  it('formats cents as German euros', () => {
    expect(formatEuroCents(475000)).toBe('4.750,00 €');
    expect(formatEuroCents(0)).toBe('0,00 €');
  });
});

describe('centsToInput', () => {
  it('renders a plain decimal', () => {
    expect(centsToInput(475050)).toBe('4750.50');
    expect(centsToInput(null)).toBe('');
  });
});

describe('parseEuroToCents', () => {
  it('parses plain numbers', () => {
    expect(parseEuroToCents('4750')).toBe(475000);
    expect(parseEuroToCents('4750.50')).toBe(475050);
  });
  it('parses German notation', () => {
    expect(parseEuroToCents('4.750,00')).toBe(475000);
    expect(parseEuroToCents('7.750,00 €')).toBe(775000);
    expect(parseEuroToCents('1234,5')).toBe(123450);
  });
  it('rejects invalid or negative input', () => {
    expect(parseEuroToCents('')).toBeNull();
    expect(parseEuroToCents('abc')).toBeNull();
    expect(parseEuroToCents('-5')).toBeNull();
  });
});
