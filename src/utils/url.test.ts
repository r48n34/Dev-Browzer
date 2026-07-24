import { describe, expect, it } from 'vitest';
import { areUrlsEqual, normalizePreviewUrl } from './url';

describe('normalizePreviewUrl', () => {
  it('adds HTTP to bare development hosts', () => {
    expect(normalizePreviewUrl('localhost:5173/products?q=phone#details')).toBe(
      'http://localhost:5173/products?q=phone#details',
    );
  });

  it('preserves HTTPS path, query, and fragment', () => {
    expect(normalizePreviewUrl('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c');
  });

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'file:///C:/secret.txt'])(
    'rejects unsafe scheme %s',
    (url) => {
      expect(() => normalizePreviewUrl(url)).toThrow('Only HTTP and HTTPS');
    },
  );

  it('rejects an empty address', () => {
    expect(() => normalizePreviewUrl('   ')).toThrow('Enter a URL');
  });
});

describe('areUrlsEqual', () => {
  it('compares normalized addresses', () => {
    expect(areUrlsEqual('localhost:5173', 'http://localhost:5173/')).toBe(true);
  });
});
