const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const HOST_WITH_PORT_PATTERN = /^[^/?#\s]+:\d+(?:[/?#]|$)/;

export function normalizePreviewUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Enter a URL to preview.');
  }

  const hasExplicitScheme = SCHEME_PATTERN.test(trimmed) && !HOST_WITH_PORT_PATTERN.test(trimmed);
  const candidate = hasExplicitScheme ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Enter a valid web address.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS addresses can be previewed.');
  }

  if (!url.hostname) {
    throw new Error('The address must include a host.');
  }

  return url.href;
}

export function areUrlsEqual(left: string, right: string): boolean {
  try {
    return normalizePreviewUrl(left) === normalizePreviewUrl(right);
  } catch {
    return left === right;
  }
}
