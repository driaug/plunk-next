/**
 * Background Job: Scheduled Campaign Processor
 * Processes scheduled campaigns when their time arrives
 */

import {CampaignStatus} from '@repo/db';
import {type Job, Worker} from 'bullmq';

import {prisma} from '../database/prisma.js';
import {CampaignService} from '../services/CampaignService.js';
import {type ScheduledCampaignJobData, scheduledQueue} from '../services/QueueService.js';

export function createScheduledCampaignWorker() {
  const worker = new Worker<ScheduledCampaignJobData>(
    scheduledQueue.name,
    async (job: Job<ScheduledCampaignJobData>) => {
      const {campaignId} = job.data;

      console.log(`[SCHEDULED-PROCESSOR] Processing scheduled campaign ${campaignId}`);

      // Get campaign
      const campaign = await prisma.campaign.findUnique({
        where: {id: campaignId},
      });

      if (!campaign) {
        console.warn(`[SCHEDULED-PROCESSOR] Campaign ${campaignId} not found, skipping`);
        return;
      }

      // Verify campaign is still in SCHEDULED status
      if (campaign.status !== CampaignStatus.SCHEDULED) {
        console.warn(
          `[SCHEDULED-PROCESSOR] Campaign ${campaignId} is not in SCHEDULED status (${campaign.status}), skipping`,
        );
        return;
      }

      // Start sending the campaign
      await CampaignService.startSending(campaign.projectId, campaignId);

      console.log(`[SCHEDULED-PROCESSOR] Started sending campaign ${campaignId}`);
    },
    {
      connection: scheduledQueue.opts.connection,
      concurrency: 2, // Process up to 2 scheduled campaigns concurrently
    },
  );

  worker.on('completed', job => {
    console.log(`[SCHEDULED-PROCESSOR] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[SCHEDULED-PROCESSOR] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', err => {
    console.error('[SCHEDULED-PROCESSOR] Worker error:', err);
  });

  return worker;
}
