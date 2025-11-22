// Runtime environment configuration
// Reads from window.__ENV__ (set by /__env.js at runtime in Docker)
// Falls back to process.env.NEXT_PUBLIC_* (for development)
// Finally falls back to localhost defaults

declare global {
  interface Window {
    __ENV__?: {
      API_URI?: string;
      DASHBOARD_URI?: string;
      LANDING_URI?: string;
    };
  }
}

const getRuntimeEnv = (key: keyof NonNullable<typeof window.__ENV__>) => {
  if (typeof window !== 'undefined' && window.__ENV__) {
    return window.__ENV__[key];
  }
  return undefined;
};

export const API_URI =
  getRuntimeEnv('API_URI') || process.env.NEXT_PUBLIC_API_URI || 'http://localhost:8080';

export const DASHBOARD_URI =
  getRuntimeEnv('DASHBOARD_URI') || process.env.NEXT_PUBLIC_DASHBOARD_URI || 'http://localhost:3000';

export const LANDING_URI =
  getRuntimeEnv('LANDING_URI') || process.env.NEXT_PUBLIC_LANDING_URI || 'http://localhost:4000';
