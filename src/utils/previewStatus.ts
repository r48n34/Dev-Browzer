import type { PreviewStatusPayload } from '../types';

export interface PreviewStatusSummary {
  ready: number;
  loading: number;
  unavailable: number;
  total: number;
}

export function summarizePreviewStatuses(
  viewportIds: string[],
  statuses: Record<string, PreviewStatusPayload>,
): PreviewStatusSummary {
  return viewportIds.reduce<PreviewStatusSummary>(
    (summary, id) => {
      const state = statuses[id]?.state ?? 'loading';
      if (state === 'ready') {
        summary.ready += 1;
      } else if (state === 'error') {
        summary.unavailable += 1;
      } else {
        summary.loading += 1;
      }
      summary.total += 1;
      return summary;
    },
    { ready: 0, loading: 0, unavailable: 0, total: 0 },
  );
}

export function getFriendlyPreviewError(message?: string): string {
  if (!message) {
    return 'The development server could not be reached.';
  }

  const normalized = message.toLowerCase();
  if (
    normalized.includes('connection_aborted') ||
    normalized.includes('connection_refused') ||
    normalized.includes('connectionrefused') ||
    normalized.includes('cannotconnect') ||
    normalized.includes('could not be reached')
  ) {
    return 'The development server is not accepting connections.';
  }
  if (normalized.includes('namenotresolved') || normalized.includes('name_not_resolved')) {
    return 'The host name could not be resolved.';
  }
  if (normalized.includes('timeout')) {
    return 'The development server took too long to respond.';
  }
  if (normalized.includes('certificate')) {
    return 'The site certificate could not be verified.';
  }
  if (normalized.includes('offline')) {
    return 'This preview is using the offline network profile.';
  }
  return 'The preview could not load this address.';
}
