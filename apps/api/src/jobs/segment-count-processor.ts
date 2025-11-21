/**
 * Segment Count Update Worker
 * Processes segment count update jobs from the BullMQ queue
 */

import {type Job, Worker} from 'bullmq';
import signale from 'signale';

import {prisma} from '../database/prisma.js';
import {type SegmentCountJobData, segmentCountQueue} from '../services/QueueService.js';
import {SegmentService} from '../services/SegmentService.js';

/**
 * Process segment count update job
 */
async function processSegmentCountUpdate(job: Job<SegmentCountJobData>): Promise<void> {
  const {projectId} = job.data;

  signale.info(`[SEGMENT-COUNT-WORKER] Starting segment count update job ${job.id}`);

  try {
    if (projectId) {
      // Update counts for specific project
      signale.info(`[SEGMENT-COUNT-WORKER] Updating counts for project ${projectId}`);
      await SegmentService.refreshAllMemberCounts(projectId);
      signale.success(`[SEGMENT-COUNT-WORKER] Completed counts for project ${projectId}`);
    } else {
      // Update counts for all active projects
      const projects = await prisma.project.findMany({
        where: {disabled: false},
        select: {id: true, name: true},
      });

      signale.info(`[SEGMENT-COUNT-WORKER] Found ${projects.length} active projects`);

      // Process projects in batches
      const PROJECT_BATCH_SIZE = 10;
      for (let i = 0; i < projects.length; i += PROJECT_BATCH_SIZE) {
        const batch = projects.slice(i, i + PROJECT_BATCH_SIZE);

        await Promise.all(
          batch.map(async project => {
            try {
              signale.info(`[SEGMENT-COUNT-WORKER] Updating counts for project ${project.name} (${project.id})`);
              await SegmentService.refreshAllMemberCounts(project.id);
              signale.success(`[SEGMENT-COUNT-WORKER] Completed counts for project ${project.name}`);
            } catch (error) {
              signale.error(`[SEGMENT-COUNT-WORKER] Failed to update counts for project ${project.id}:`, error);
              // Don't throw - continue with other projects
            }
          }),
        );

        // Small delay between project batches to avoid overwhelming the database
        if (i + PROJECT_BATCH_SIZE < projects.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      signale.success(`[SEGMENT-COUNT-WORKER] Completed all segment count updates`);
    }
  } catch (error) {
    signale.error(`[SEGMENT-COUNT-WORKER] Error processing job ${job.id}:`, error);
    throw error; // Re-throw to trigger retry
  }
}

/**
 * Create and export the segment count worker
 */
export function createSegmentCountWorker(): Worker {
  const worker = new Worker<SegmentCountJobData>(
    segmentCountQueue.name,
    async (job: Job<SegmentCountJobData>) => {
      await processSegmentCountUpdate(job);
    },
    {
      connection: segmentCountQueue.opts.connection,
      concurrency: 1, // Process one segment count job at a time to avoid database overload
      limiter: {
        max: 1, // Max 1 job per duration
        duration: 60000, // Per minute (prevents rapid-fire updates)
      },
    },
  );

  worker.on('completed', job => {
    signale.success(`[SEGMENT-COUNT-WORKER] Job ${job.id} completed`);
  });

  worker.on('failed', (job, error) => {
    signale.error(`[SEGMENT-COUNT-WORKER] Job ${job?.id} failed:`, error);
  });

  worker.on('error', error => {
    signale.error('[SEGMENT-COUNT-WORKER] Worker error:', error);
  });

  return worker;
}
