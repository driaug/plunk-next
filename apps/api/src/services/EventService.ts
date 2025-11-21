import type {Event} from '@repo/db';
import type {Prisma} from '@repo/db';

import {prisma} from '../database/prisma.js';
import {redis} from '../database/redis.js';

import {WorkflowExecutionService} from './WorkflowExecutionService.js';

/**
 * Event Service
 * Handles event tracking and workflow triggering
 */
export class EventService {
  /**
   * Track an event
   * This can trigger workflows that are listening for this event
   */
  public static async trackEvent(
    projectId: string,
    eventName: string,
    contactId?: string,
    emailId?: string,
    data?: any,
  ): Promise<Event> {
    // Create event record
    const event = await prisma.event.create({
      data: {
        projectId,
        contactId,
        emailId,
        name: eventName,
        data: data || undefined,
      },
    });

    console.log(`[EVENT] Tracked: ${eventName} for project ${projectId}`);

    // Trigger workflows that are listening for this event
    await this.triggerWorkflows(projectId, eventName, contactId, data);

    // Resume workflows waiting for this event
    await WorkflowExecutionService.handleEvent(projectId, eventName, contactId, data);

    return event;
  }

  /**
   * Invalidate the workflow cache for a project
   * Should be called when workflows are enabled/disabled or updated
   */
  public static async invalidateWorkflowCache(projectId: string): Promise<void> {
    const cacheKey = `workflows:enabled:${projectId}`;
    try {
      await redis.del(cacheKey);
    } catch (error) {
      console.warn('[EVENT] Failed to invalidate workflow cache:', error);
    }
  }

  /**
   * Get events for a contact
   */
  public static async getContactEvents(projectId: string, contactId: string, limit = 50): Promise<Event[]> {
    return prisma.event.findMany({
      where: {
        projectId,
        contactId,
      },
      orderBy: {createdAt: 'desc'},
      take: limit,
    });
  }

  /**
   * Get events for a project
   */
  public static async getProjectEvents(projectId: string, eventName?: string, limit = 100): Promise<Event[]> {
    return prisma.event.findMany({
      where: {
        projectId,
        ...(eventName ? {name: eventName} : {}),
      },
      orderBy: {createdAt: 'desc'},
      take: limit,
      include: {
        contact: {
          select: {
            email: true,
          },
        },
      },
    });
  }

  /**
   * Get event counts by type
   */
  public static async getEventStats(projectId: string, startDate?: Date, endDate?: Date) {
    const where: Prisma.EventWhereInput = {
      projectId,
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? {gte: startDate} : {}),
              ...(endDate ? {lte: endDate} : {}),
            },
          }
        : {}),
    };

    const events = await prisma.event.groupBy({
      by: ['name'],
      where,
      _count: true,
      orderBy: {
        _count: {
          name: 'desc',
        },
      },
    });

    return events.map(e => ({
      name: e.name,
      count: e._count,
    }));
  }

  /**
   * Get unique event names for a project
   */
  public static async getUniqueEventNames(projectId: string): Promise<string[]> {
    const events = await prisma.event.groupBy({
      by: ['name'],
      where: {projectId},
      orderBy: {
        _count: {
          name: 'desc',
        },
      },
    });

    return events.map(e => e.name);
  }

  /**
   * Trigger workflows based on an event
   * Uses Redis caching for enabled workflows to improve performance
   */
  private static async triggerWorkflows(
    projectId: string,
    eventName: string,
    contactId?: string,
    data?: any,
  ): Promise<void> {
    // Try to get workflows from cache
    const cacheKey = `workflows:enabled:${projectId}`;
    let workflows;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        workflows = JSON.parse(cached);
      }
    } catch (error) {
      console.warn('[EVENT] Failed to get workflows from cache:', error);
    }

    // If not in cache, fetch from database
    if (!workflows) {
      workflows = await prisma.workflow.findMany({
        where: {
          projectId,
          enabled: true,
          triggerType: 'EVENT',
        },
        include: {
          steps: {
            where: {type: 'TRIGGER'},
          },
        },
      });

      // Cache for 5 minutes
      try {
        await redis.setex(cacheKey, 300, JSON.stringify(workflows));
      } catch (error) {
        console.warn('[EVENT] Failed to cache workflows:', error);
      }
    }

    for (const workflow of workflows) {
      const triggerConfig = workflow.triggerConfig;

      // Check if this workflow is triggered by this event
      if (triggerConfig?.eventName === eventName) {
        // If event is for a specific contact, start workflow for that contact
        if (contactId) {
          await this.startWorkflowForContact(workflow.id, contactId, data);
        } else {
          // If event is not contact-specific, you might want different logic
          // For example, trigger for all contacts, or skip
          console.log(`[EVENT] Event ${eventName} triggered workflow ${workflow.id}, but no contact specified`);
        }
      }
    }
  }

  /**
   * Start a workflow execution for a contact
   */
  private static async startWorkflowForContact(workflowId: string, contactId: string, context?: any): Promise<void> {
    try {
      // Get workflow with steps and configuration
      const workflow = await prisma.workflow.findUnique({
        where: {id: workflowId},
        include: {
          steps: {
            where: {type: 'TRIGGER'},
          },
        },
      });

      if (!workflow || workflow.steps.length === 0) {
        console.error(`[EVENT] Workflow ${workflowId} has no trigger step`);
        return;
      }

      // Check re-entry rules
      if (!workflow.allowReentry) {
        // If re-entry is not allowed, check if contact has ANY execution (regardless of status)
        const existingExecution = await prisma.workflowExecution.findFirst({
          where: {
            workflowId,
            contactId,
          },
        });

        if (existingExecution) {
          console.log(
            `[EVENT] Workflow ${workflowId} does not allow re-entry. Contact ${contactId} already has execution ${existingExecution.id} (${existingExecution.status})`,
          );
          return;
        }
      } else {
        // If re-entry is allowed, only check if there's a currently RUNNING execution
        const runningExecution = await prisma.workflowExecution.findFirst({
          where: {
            workflowId,
            contactId,
            status: 'RUNNING',
          },
        });

        if (runningExecution) {
          console.log(
            `[EVENT] Workflow ${workflowId} already running for contact ${contactId} (execution ${runningExecution.id})`,
          );
          return;
        }
      }

      const triggerStep = workflow.steps[0];

      if (!triggerStep) {
        console.error(`[EVENT] Workflow ${workflowId} trigger step not found`);
        return;
      }

      // Create workflow execution
      const execution = await prisma.workflowExecution.create({
        data: {
          workflowId,
          contactId,
          status: 'RUNNING',
          currentStepId: triggerStep.id,
          context: context || undefined,
        },
      });

      console.log(
        `[EVENT] Started workflow ${workflowId} execution ${execution.id} for contact ${contactId}${workflow.allowReentry ? ' (re-entry allowed)' : ''}`,
      );

      // Start executing the workflow
      await WorkflowExecutionService.processStepExecution(execution.id, triggerStep.id);
    } catch (error) {
      console.error(`[EVENT] Error starting workflow ${workflowId}:`, error);
    }
  }
}
