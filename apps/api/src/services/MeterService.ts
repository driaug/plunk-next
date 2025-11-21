import signale from 'signale';

import {stripe} from '../app/stripe.js';
import {STRIPE_ENABLED, STRIPE_METER_EVENT_NAME} from '../app/constants.js';

/**
 * Meter Service
 * Handles recording usage events to Stripe billing meters for pay-as-you-go pricing
 */
export class MeterService {
  /**
   * Record an email sent event to Stripe meter
   * This is used for usage-based billing where customers pay per email sent
   *
   * @param customerId - Stripe customer ID
   * @param value - Number of emails sent (default: 1)
   * @param idempotencyKey - Optional unique identifier to prevent duplicate recording
   */
  public static async recordEmailSent(
    customerId: string,
    value: number = 1,
    idempotencyKey?: string,
  ): Promise<void> {
    // Skip if billing is disabled (self-hosted mode)
    if (!STRIPE_ENABLED || !stripe) {
      return;
    }

    // Skip if no customer ID (not subscribed)
    if (!customerId) {
      return;
    }

    try {
      await stripe.billing.meterEvents.create({
        event_name: STRIPE_METER_EVENT_NAME,
        payload: {
          stripe_customer_id: customerId,
          value: value.toString(), // Must be a string
        },
        ...(idempotencyKey && {identifier: idempotencyKey}),
      });

      signale.debug(`[METER] Recorded ${value} email(s) sent for customer ${customerId}`);
    } catch (error) {
      // Log error but don't throw - we don't want billing issues to break email sending
      signale.error('[METER] Failed to record email sent event:', error);

      // If it's a rate limit error, we might want to retry
      if (error instanceof Error && error.message.includes('429')) {
        signale.warn('[METER] Rate limited - consider implementing queue-based meter recording');
      }
    }
  }

  /**
   * Record multiple emails in a single batch (for campaign sending)
   * More efficient than individual calls when sending bulk emails
   *
   * @param customerId - Stripe customer ID
   * @param count - Number of emails sent in this batch
   * @param batchId - Unique identifier for this batch
   */
  public static async recordEmailBatch(customerId: string, count: number, batchId: string): Promise<void> {
    if (count <= 0) return;

    await this.recordEmailSent(customerId, count, `batch_${batchId}`);
  }

  /**
   * Get current usage for a customer in the current billing period
   * Useful for displaying usage dashboards or implementing soft limits
   *
   * @param customerId - Stripe customer ID
   * @param meterId - The meter ID from Stripe dashboard
   * @param startTime - Start of period (Unix timestamp)
   * @param endTime - End of period (Unix timestamp)
   */
  public static async getUsageSummary(
    meterId: string,
    customerId: string,
    startTime: number,
    endTime: number,
  ): Promise<any> {
    if (!STRIPE_ENABLED || !stripe) {
      return null;
    }

    try {
      const summaries = await stripe.billing.meters.listEventSummaries(meterId, {
        customer: customerId,
        start_time: startTime,
        end_time: endTime,
      });

      return summaries;
    } catch (error) {
      signale.error('[METER] Failed to get usage summary:', error);
      return null;
    }
  }
}
