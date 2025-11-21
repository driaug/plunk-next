import dotenv from 'dotenv';
dotenv.config({quiet: true});

/**
 * Safely parse environment variables
 * @param key The key
 * @param defaultValue An optional default value if the environment variable does not exist
 */
export function validateEnv<T extends string = string>(key: keyof NodeJS.ProcessEnv, defaultValue?: T): T {
  const value = process.env[key] as T | undefined;

  if (!value) {
    if (typeof defaultValue !== 'undefined') {
      return defaultValue;
    } else {
      throw new Error(`${key} is not defined in environment variables`);
    }
  }

  return value;
}

// Environment
export const NODE_ENV = validateEnv('NODE_ENV', 'development');
export const JWT_SECRET = validateEnv('JWT_SECRET');
export const PORT = Number(validateEnv('PORT', '8080'));

// URLs
export const API_URI = validateEnv('API_URI');
export const DASHBOARD_URI = validateEnv('DASHBOARD_URI');
export const LANDING_URI = validateEnv('LANDING_URI');

// AWS
export const AWS_CLOUDFRONT_DISTRIBUTION_ID = validateEnv('AWS_CLOUDFRONT_DISTRIBUTION_ID');
export const AWS_S3_ACCESS_KEY_ID = validateEnv('AWS_S3_ACCESS_KEY_ID');
export const AWS_S3_ACCESS_KEY_SECRET = validateEnv('AWS_S3_ACCESS_KEY_SECRET');
export const AWS_S3_BUCKET = validateEnv('AWS_S3_BUCKET');
export const AWS_SES_REGION = validateEnv('AWS_SES_REGION');
export const AWS_SES_ACCESS_KEY_ID = validateEnv('AWS_SES_ACCESS_KEY_ID');
export const AWS_SES_SECRET_ACCESS_KEY = validateEnv('AWS_SES_SECRET_ACCESS_KEY');

// Storage
export const REDIS_URL = validateEnv('REDIS_URL');
export const DATABASE_URL = validateEnv('DATABASE_URL');
export const DIRECT_DATABASE_URL = validateEnv('DIRECT_DATABASE_URL');

// OAuth
export const GITHUB_OAUTH_CLIENT = validateEnv('GITHUB_OAUTH_CLIENT');
export const GITHUB_OAUTH_SECRET = validateEnv('GITHUB_OAUTH_SECRET');
export const GOOGLE_OAUTH_CLIENT = validateEnv('GOOGLE_OAUTH_CLIENT');
export const GOOGLE_OAUTH_SECRET = validateEnv('GOOGLE_OAUTH_SECRET');

// Stripe (optional - if not set, billing features are disabled)
export const STRIPE_SK = validateEnv('STRIPE_SK', '');
export const STRIPE_WEBHOOK_SECRET = validateEnv('STRIPE_WEBHOOK_SECRET', '');
export const STRIPE_ENABLED = STRIPE_SK !== '' && STRIPE_WEBHOOK_SECRET !== '';

// Stripe Pricing Configuration
export const STRIPE_PRICE_ONBOARDING = validateEnv('STRIPE_PRICE_ONBOARDING', ''); // One-time onboarding fee
export const STRIPE_PRICE_EMAIL_USAGE = validateEnv('STRIPE_PRICE_EMAIL_USAGE', ''); // Metered usage price for pay-per-email
export const STRIPE_METER_EVENT_NAME = validateEnv('STRIPE_METER_EVENT_NAME', 'emails'); // Meter event name (API key in Stripe)

// Email Tracking
export const SES_CONFIGURATION_SET = validateEnv('SES_CONFIGURATION_SET', 'plunk-configuration-set');
export const SES_CONFIGURATION_SET_NO_TRACKING = validateEnv(
  'SES_CONFIGURATION_SET_NO_TRACKING',
  'plunk-configuration-set-no-tracking',
);
