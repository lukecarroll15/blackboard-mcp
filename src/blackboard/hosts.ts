/**
 * Trinity College Dublin serves Blackboard Ultra from a single hostname.
 * Override with BB_BASE_URL for another institution.
 */
export const BLACKBOARD_HOSTS = process.env.BB_BASE_URL
  ? [new URL(process.env.BB_BASE_URL).hostname]
  : ['tcd.blackboard.com'];

/** Origin used for user-facing links back into Ultra. */
export const BLACKBOARD_ORIGIN = `https://${BLACKBOARD_HOSTS[0]}`;

export function isBlackboardHost(url: URL): boolean {
  return BLACKBOARD_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
}

/**
 * Attachment bytes come from Blackboard's content CDN (Xythos), not from the
 * Blackboard hostname itself — a download link resolves to something like
 * learn-us-east-1-prod-...content.blackboardcdn.com. Refetching a resolved
 * link has to accept those hosts, but ONLY those: a page that wanders
 * somewhere unexpected must never make us fetch an arbitrary URL.
 */
const CONTENT_HOSTS = ['blackboardcdn.com', 'bbcdn.com'];

export function isDownloadHost(url: URL): boolean {
  if (url.protocol !== 'https:') return false;
  if (isBlackboardHost(url)) return true;
  return CONTENT_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
}
