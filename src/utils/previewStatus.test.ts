import { describe, expect, it } from 'vitest';
import { getFriendlyPreviewError, summarizePreviewStatuses } from './previewStatus';

describe('preview status helpers', () => {
  it('summarizes only enabled viewport statuses', () => {
    expect(
      summarizePreviewStatuses(['phone', 'desktop'], {
        phone: { sourceId: 'phone', state: 'ready' },
        desktop: { sourceId: 'desktop', state: 'error' },
        ignored: { sourceId: 'ignored', state: 'ready' },
      }),
    ).toEqual({ ready: 1, loading: 0, unavailable: 1, total: 2 });
  });

  it('translates native connection failures', () => {
    expect(getFriendlyPreviewError('WebView2 navigation failed: ConnectionRefused')).toBe(
      'The development server is not accepting connections.',
    );
  });
});
