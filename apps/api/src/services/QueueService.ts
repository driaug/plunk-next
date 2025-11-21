import {type Job, Queue} from 'bullmq';
import type {RedisOptions} from 'ioredis';

import {REDIS_URL} from '../app/constants.js';

/**
 * Queue Job Data Types
 */

export interface SendEmailJobData {
  emailId: string;
}

export interface CampaignBatchJobData {
  campaignId: string;
  batchNumber: number;
  offset: number;
  limit: number;
  cursor?: string; // For cursor-based pagination
}

export interface WorkflowStepJobData {
  executionId: string;
  stepId: string;
  type?: 'process-step' | 'timeout'; // Job type for different handling
  stepExecutionId?: string; // For timeout jobs, reference to the step execution
}

export interface ScheduledCampaignJobData {
  campaignId: string;
}

export interface ContactImportJobData {
  projectId: string;
  csvData: string; // Base64 encoded CSV content
  filename: string;
}

export interface SegmentCountJobData {
  projectId?: string; // Optional: if provided, only update this project's segments
}

export interface DomainVerificationJobData {
  // Empty for now - processes all domains
}

/**
 * Queue Configuration
 */

const redisConnection: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  // Parse Redis URL
  ...parseRedisUrl(REDIS_URL),
};

function parseRedisUrl(url: string): {host: string; port: number; password?: string; db?: number} {
  const urlObj = new URL(url);
  return {
    host: urlObj.hostname,
    port: parseInt(urlObj.port || '6379', 10),
    password: urlObj.password || undefined,
    db: parseInt(urlObj.pathname.slice(1) || '0', 10),
  };
}

/**
 * Queue Instances
 */

export const emailQueue = new Queue<SendEmailJobData>('email', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 1000, // Keep last 1000 completed jobs
    removeOnFail: 5000, // Keep last 5000 failed jobs
  },
});

export const campaignQueue = new Queue<CampaignBatchJobData>('campaign', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export const workflowQueue = new Queue<WorkflowStepJobData>('workflow', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export const scheduledQueue = new Queue<ScheduledCampaignJobData>('scheduled', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export const importQueue = new Queue<ContactImportJobData>('import', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2, // Limited retries for imports
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 50, // Keep last 50 completed imports
    removeOnFail: 100, // Keep last 100 failed imports
  },
});

export const segmentCountQueue = new Queue<SegmentCountJobData>('segment-count', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: 10, // Keep last 10 completed jobs
    removeOnFail: 50, // Keep last 50 failed jobs
  },
});

export const domainVerificationQueue = new Queue<DomainVerificationJobData>('domain-verification', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: 10, // Keep last 10 completed jobs
    removeOnFail: 50, // Keep last 50 failed jobs
  },
});

/**
 * Queue Service - Centralized queue management
 */
export class QueueService {
  /**
   * Add email to queue for sending
   */
  public static async queueEmail(emailId: string, delay?: number): Promise<Job<SendEmailJobData>> {
    return emailQueue.add(
      'send-email',
      {emailId},
      {
        delay, // Optional delay in milliseconds
        jobId: `email-${emailId}`, // Prevent duplicate jobs
      },
    );
  }

  /**
   * Add campaign batch to queue for processing
   */
  public static async queueCampaignBatch(data: CampaignBatchJobData): Promise<Job<CampaignBatchJobData>> {
    return campaignQueue.add('process-batch', data, {
      jobId: `campaign-${data.campaignId}-batch-${data.batchNumber}`,
    });
  }

  /**
   * Add workflow step to queue for execution
   */
  public static async queueWorkflowStep(
    executionId: string,
    stepId: string,
    delay?: number,
  ): Promise<Job<WorkflowStepJobData>> {
    return workflowQueue.add(
      'process-step',
      {executionId, stepId, type: 'process-step'},
      {
        delay,
        jobId: `workflow-${executionId}-${stepId}`,
      },
    );
  }

  /**
   * Queue a timeout handler for WAIT_FOR_EVENT steps
   */
  public static async queueWorkflowTimeout(
    executionId: string,
    stepId: string,
    stepExecutionId: string,
    timeoutMs: number,
  ): Promise<Job<WorkflowStepJobData>> {
    return workflowQueue.add(
      'timeout',
      {executionId, stepId, stepExecutionId, type: 'timeout'},
      {
        delay: timeoutMs,
        jobId: `workflow-timeout-${stepExecutionId}`,
      },
    );
  }

  /**
   * Cancel a queued timeout job
   */
  public static async cancelWorkflowTimeout(stepExecutionId: string): Promise<void> {
    const jobId = `workflow-timeout-${stepExecutionId}`;
    const job = await workflowQueue.getJob(jobId);

    if (job) {
      await job.remove();
      console.log(`[QUEUE] Cancelled timeout job ${jobId}`);
    }
  }

  /**
   * Schedule campaign for future sending
   */
  public static async scheduleCampaign(campaignId: string, scheduledFor: Date): Promise<Job<ScheduledCampaignJobData>> {
    const delay = scheduledFor.getTime() - Date.now();

    return scheduledQueue.add(
      'send-scheduled-campaign',
      {campaignId},
      {
        delay: Math.max(0, delay),
        jobId: `scheduled-campaign-${campaignId}`,
      },
    );
  }

  /**
   * Cancel scheduled campaign
   */
  public static async cancelScheduledCampaign(campaignId: string): Promise<void> {
    const jobId = `scheduled-campaign-${campaignId}`;
    const job = await scheduledQueue.getJob(jobId);

    if (job) {
      await job.remove();
    }
  }

  /**
   * Queue contact import job
   */
  public static async queueImport(
    projectId: string,
    csvData: string,
    filename: string,
  ): Promise<Job<ContactImportJobData>> {
    return importQueue.add(
      'import-contacts',
      {projectId, csvData, filename},
      {
        jobId: `import-${projectId}-${Date.now()}`,
      },
    );
  }

  /**
   * Get import job status and progress
   */
  public static async getImportJobStatus(jobId: string) {
    const job = await importQueue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress;
    const returnValue = job.returnvalue;

    return {
      id: job.id,
      state,
      progress,
      result: returnValue,
      data: job.data,
    };
  }

  /**
   * Queue segment count update job
   */
  public static async queueSegmentCountUpdate(projectId?: string): Promise<Job<SegmentCountJobData>> {
    return segmentCountQueue.add(
      'update-segment-counts',
      {projectId},
      {
        jobId: projectId ? `segment-count-${projectId}-${Date.now()}` : `segment-count-all-${Date.now()}`,
      },
    );
  }

  /**
   * Get queue statistics
   */
  public static async getStats() {
    const [
      emailCounts,
      campaignCounts,
      workflowCounts,
      scheduledCounts,
      importCounts,
      segmentCountCounts,
      domainVerificationCounts,
    ] = await Promise.all([
      emailQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      campaignQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      workflowQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      scheduledQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      importQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      segmentCountQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      domainVerificationQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    ]);

    return {
      email: emailCounts,
      campaign: campaignCounts,
      workflow: workflowCounts,
      scheduled: scheduledCounts,
      import: importCounts,
      segmentCount: segmentCountCounts,
      domainVerification: domainVerificationCounts,
    };
  }

  /**
   * Pause all queues (for maintenance)
   */
  public static async pauseAll(): Promise<void> {
    await Promise.all([
      emailQueue.pause(),
      campaignQueue.pause(),
      workflowQueue.pause(),
      scheduledQueue.pause(),
      importQueue.pause(),
      segmentCountQueue.pause(),
      domainVerificationQueue.pause(),
    ]);
  }

  /**
   * Resume all queues
   */
  public static async resumeAll(): Promise<void> {
    await Promise.all([
      emailQueue.resume(),
      campaignQueue.resume(),
      workflowQueue.resume(),
      scheduledQueue.resume(),
      importQueue.resume(),
      segmentCountQueue.resume(),
      domainVerificationQueue.resume(),
    ]);
  }

  /**
   * Clean old jobs (should be run periodically)
   */
  public static async cleanOldJobs(): Promise<void> {
    const gracePeriod = 24 * 60 * 60 * 1000; // 24 hours

    await Promise.all([
      emailQueue.clean(gracePeriod, 1000, 'completed'),
      emailQueue.clean(gracePeriod * 7, 1000, 'failed'), // Keep failed jobs for 7 days
      campaignQueue.clean(gracePeriod, 100, 'completed'),
      campaignQueue.clean(gracePeriod * 7, 500, 'failed'),
      workflowQueue.clean(gracePeriod, 1000, 'completed'),
      workflowQueue.clean(gracePeriod * 7, 1000, 'failed'),
      scheduledQueue.clean(gracePeriod, 100, 'completed'),
      scheduledQueue.clean(gracePeriod * 7, 500, 'failed'),
      importQueue.clean(gracePeriod, 50, 'completed'),
      importQueue.clean(gracePeriod * 7, 100, 'failed'),
      segmentCountQueue.clean(gracePeriod, 10, 'completed'),
      segmentCountQueue.clean(gracePeriod * 7, 50, 'failed'),
      domainVerificationQueue.clean(gracePeriod, 10, 'completed'),
      domainVerificationQueue.clean(gracePeriod * 7, 50, 'failed'),
    ]);
  }

  /**
   * Close all queue connections
   */
  public static async closeAll(): Promise<void> {
    await Promise.all([
      emailQueue.close(),
      campaignQueue.close(),
      workflowQueue.close(),
      scheduledQueue.close(),
      importQueue.close(),
      segmentCountQueue.close(),
      domainVerificationQueue.close(),
    ]);
  }
}
