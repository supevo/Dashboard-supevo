import { describe, it, expect } from 'vitest';
import {
  promoDiscountCents,
  hasDiscount,
  type PromoDiscount,
} from '@/features/promotions/discount';

const fixed100: PromoDiscount = { id: 'a', discountKind: 'fixed', discountValue: 10000 };
const percent10: PromoDiscount = { id: 'b', discountKind: 'percent', discountValue: 10 };
const info: PromoDiscount = { id: 'c', discountKind: 'none', discountValue: 0 };

describe('hasDiscount', () => {
  it('erkennt einlösbare Gutscheine', () => {
    expect(hasDiscount(fixed100)).toBe(true);
    expect(hasDiscount(percent10)).toBe(true);
    expect(hasDiscount(info)).toBe(false);
    expect(hasDiscount({ id: 'x', discountKind: 'fixed', discountValue: 0 })).toBe(false);
  });
});

describe('promoDiscountCents', () => {
  it('nur eingelöste zählen', () => {
    expect(promoDiscountCents(50000, [fixed100, percent10], [])).toBe(0);
    expect(promoDiscountCents(50000, [fixed100, percent10], ['a'])).toBe(10000);
  });
  it('Prozent bezieht sich auf den Basispreis', () => {
    expect(promoDiscountCents(50000, [percent10], ['b'])).toBe(5000);
  });
  it('mehrere Gutscheine summieren sich', () => {
    // 100 € fest + 10 % von 500 € = 100 + 50 = 150 €
    expect(promoDiscountCents(50000, [fixed100, percent10], ['a', 'b'])).toBe(15000);
  });
  it('deckelt auf den Paketpreis (nie negativ)', () => {
    expect(promoDiscountCents(8000, [fixed100], ['a'])).toBe(8000);
  });
  it('info-Gutschein ohne Wert zieht nichts ab', () => {
    expect(promoDiscountCents(50000, [info], ['c'])).toBe(0);
  });
});
