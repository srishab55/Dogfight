import { inject } from '@vercel/analytics';

/**
 * Visitor counts for the deployed site: Vercel Web Analytics (free on the
 * Hobby plan: 50,000 events a month across the account, a month of
 * history). Turn it on in the Vercel dashboard (the project → Analytics →
 * Enable), then deploy. Anonymous by design: no cookies, no IP addresses
 * stored; visitors are counted by a hash of the request that Vercel discards
 * after 24 hours. The dashboard shows how many visitors and page views, and
 * from which countries, referrers, devices, browsers and operating systems,
 * not who they are.
 *
 * Only the production build on a real host reports: never the dev server,
 * the automated browser tests, or a local `vite preview`.
 */
export function startAnalytics(): void {
  if (!import.meta.env.PROD) return;
  const host = location.hostname;
  if (host === '' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return;
  inject({ mode: 'production' });
}
