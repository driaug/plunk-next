/**
 * Background Job: Campaign Processor
 * Processes campaign batches (queues emails for each contact in the batch)
 */

import {type Job, Worker} from 'bullmq';

import {CampaignService} from '../services/CampaignService.js';
import {type CampaignBatchJobData, campaignQueue} from '../services/QueueService.js';

export function createCampaignWorker() {
  const worker = new Worker<CampaignBatchJobData>(
    campaignQueue.name,
    async (job: Job<CampaignBatchJobData>) => {
      const {campaignId, batchNumber, offset, limit, cursor} = job.data;

      console.log(`[CAMPAIGN-PROCESSOR] Processing batch ${batchNumber} for campaign ${campaignId}`);

      await CampaignService.processBatch(campaignId, batchNumber, offset, limit, cursor);

      console.log(`[CAMPAIGN-PROCESSOR] Completed batch ${batchNumber} for campaign ${campaignId}`);
    },
    {
      connection: campaignQueue.opts.connection,
      concurrency: 5, // Process up to 5 batches concurrently
    },
  );

  worker.on('completed', job => {
    console.log(`[CAMPAIGN-PROCESSOR] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[CAMPAIGN-PROCESSOR] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', err => {
    console.error('[CAMPAIGN-PROCESSOR] Worker error:', err);
  });

  return worker;
}
