import { describe, expect, it } from 'vitest';
import { fillTemplate, incentiveWord, occasionPhrase, REVIEW_LINK_PLACEHOLDER } from './templates';

describe('fillTemplate', () => {
  const v = { guestName: 'Lakshmi Narayanan', occasion: 'Pilgrimage', nights: 8, reviewLink: null };

  it('fills every placeholder', () => {
    expect(fillTemplate('Vanakkam {guest} ji, thanks for {occasion}, {nights} nights. {review_link}', v)).toBe(
      `Vanakkam Lakshmi ji, thanks for the pilgrimage, 8 nights. ${REVIEW_LINK_PLACEHOLDER}`,
    );
  });

  it('says "1 night", not "1 nights"', () => {
    expect(fillTemplate('for {nights} nights', { ...v, nights: 1 })).toBe('for 1 night');
  });

  it('uses the saved review link', () => {
    expect(fillTemplate('{review_link}', { ...v, reviewLink: 'https://g.page/r/abc/review' })).toBe('https://g.page/r/abc/review');
  });

  it('leaves unknown placeholders alone', () => {
    expect(fillTemplate('{price}', v)).toBe('{price}');
  });
});

describe('occasionPhrase', () => {
  it('reads naturally after "for", with a fallback', () => {
    expect(occasionPhrase('Sashti')).toBe('Sashti');
    expect(occasionPhrase('Temple visit')).toBe('the temple visit');
    expect(occasionPhrase('Holiday')).toBe('your holiday');
    expect(occasionPhrase(null)).toBe('your visit');
    expect(occasionPhrase('Other')).toBe('your visit');
  });
});

describe('incentiveWord (mirrors the database check)', () => {
  it.each(['10% off next time', 'a small GIFT', 'Discount code', 'free night', 'cash back', 'special offer'])('rejects "%s"', (t) => {
    expect(incentiveWord(t)).not.toBeNull();
  });
  it('accepts an honest review request', () => {
    expect(incentiveWord('An honest review on Google would help other families find us.')).toBeNull();
  });
});
