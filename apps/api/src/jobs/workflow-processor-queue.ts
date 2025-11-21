/**
 * Background Job: Workflow Queue Processor
 * Processes workflow steps from the queue (for delayed steps)
 */

import {type Job, Worker} from 'bullmq';

import {workflowQueue, type WorkflowStepJobData} from '../services/QueueService.js';
import {WorkflowExecutionService} from '../services/WorkflowExecutionService.js';

export function createWorkflowWorker() {
  const worker = new Worker<WorkflowStepJobData>(
    workflowQueue.name,
    async (job: Job<WorkflowStepJobData>) => {
      const {executionId, stepId, type, stepExecutionId} = job.data;

      if (type === 'timeout') {
        // Handle timeout for WAIT_FOR_EVENT steps
        console.log(`[WORKFLOW-PROCESSOR] Processing timeout for step execution ${stepExecutionId}`);

        if (!stepExecutionId) {
          throw new Error('stepExecutionId is required for timeout jobs');
        }

        await WorkflowExecutionService.processTimeout(executionId, stepId, stepExecutionId);

        console.log(`[WORKFLOW-PROCESSOR] Completed timeout processing for step execution ${stepExecutionId}`);
      } else {
        // Handle regular step execution
        console.log(`[WORKFLOW-PROCESSOR] Processing step ${stepId} for execution ${executionId}`);

        await WorkflowExecutionService.processStepExecution(executionId, stepId);

        console.log(`[WORKFLOW-PROCESSOR] Completed step ${stepId} for execution ${executionId}`);
      }
    },
    {
      connection: workflowQueue.opts.connection,
      concurrency: 10, // Process up to 10 workflow steps concurrently
    },
  );

  worker.on('completed', job => {
    console.log(`[WORKFLOW-PROCESSOR] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[WORKFLOW-PROCESSOR] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', err => {
    console.error('[WORKFLOW-PROCESSOR] Worker error:', err);
  });

  return worker;
}
