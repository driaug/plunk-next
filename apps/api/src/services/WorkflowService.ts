import type {Workflow, WorkflowExecution, WorkflowStep, WorkflowStepExecution, WorkflowTransition} from '@repo/db';
import {Prisma, WorkflowExecutionStatus} from '@repo/db';

import {prisma} from '../database/prisma.js';
import {HttpException} from '../exceptions/index.js';

import {EventService} from './EventService.js';

export interface PaginatedWorkflows {
  workflows: Workflow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface WorkflowWithDetails extends Workflow {
  steps: (WorkflowStep & {
    template?: {id: string; name: string} | null;
    outgoingTransitions: WorkflowTransition[];
    incomingTransitions: WorkflowTransition[];
  })[];
}

export interface WorkflowExecutionWithDetails extends WorkflowExecution {
  workflow: Workflow;
  contact: {id: string; email: string};
  currentStep?: WorkflowStep | null;
  stepExecutions: WorkflowStepExecution[];
}

export class WorkflowService {
  /**
   * Get all workflows for a project with pagination
   */
  public static async list(projectId: string, page = 1, pageSize = 20, search?: string): Promise<PaginatedWorkflows> {
    const skip = (page - 1) * pageSize;

    const where: Prisma.WorkflowWhereInput = {
      projectId,
      ...(search
        ? {
            OR: [
              {name: {contains: search, mode: 'insensitive' as const}},
              {description: {contains: search, mode: 'insensitive' as const}},
            ],
          }
        : {}),
    };

    const [workflows, total] = await Promise.all([
      prisma.workflow.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {createdAt: 'desc'},
        include: {
          _count: {
            select: {
              steps: true,
              executions: true,
            },
          },
        },
      }),
      prisma.workflow.count({where}),
    ]);

    return {
      workflows: workflows as Workflow[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get a single workflow by ID with all steps and transitions
   */
  public static async get(projectId: string, workflowId: string): Promise<WorkflowWithDetails> {
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        projectId,
      },
      include: {
        steps: {
          include: {
            template: {
              select: {
                id: true,
                name: true,
              },
            },
            outgoingTransitions: true,
            incomingTransitions: true,
          },
          orderBy: {createdAt: 'asc'},
        },
      },
    });

    if (!workflow) {
      throw new HttpException(404, 'Workflow not found');
    }

    return workflow;
  }

  /**
   * Create a new workflow
   */
  public static async create(
    projectId: string,
    data: {
      name: string;
      description?: string;
      eventName: string;
      enabled?: boolean;
      allowReentry?: boolean;
    },
  ): Promise<Workflow> {
    // Validate event name
    if (!data.eventName?.trim()) {
      throw new HttpException(400, 'Event name is required');
    }

    // Create workflow with a TRIGGER step in a transaction
    const workflow = await prisma.$transaction(async tx => {
      // Create the workflow (all workflows are EVENT-triggered)
      const newWorkflow = await tx.workflow.create({
        data: {
          projectId,
          name: data.name,
          description: data.description,
          triggerType: 'EVENT',
          triggerConfig: {eventName: data.eventName.trim()},
          enabled: data.enabled ?? false,
          allowReentry: data.allowReentry ?? false,
        },
      });

      // Automatically create the TRIGGER step
      await tx.workflowStep.create({
        data: {
          workflowId: newWorkflow.id,
          type: 'TRIGGER',
          name: `Trigger: ${data.eventName.trim()}`,
          position: {x: 100, y: 100},
          config: {eventName: data.eventName.trim()},
        },
      });

      return newWorkflow;
    });

    // Invalidate workflow cache if enabled
    if (workflow.enabled) {
      await EventService.invalidateWorkflowCache(projectId);
    }

    return workflow;
  }

  /**
   * Update a workflow
   */
  public static async update(
    projectId: string,
    workflowId: string,
    data: {
      name?: string;
      description?: string;
      triggerType?: Workflow['triggerType'];
      triggerConfig?: Prisma.JsonValue;
      enabled?: boolean;
      allowReentry?: boolean;
    },
  ): Promise<Workflow> {
    // Verify workflow exists and belongs to project
    await this.get(projectId, workflowId);

    const updateData: Prisma.WorkflowUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.triggerType !== undefined) updateData.triggerType = data.triggerType;
    if (data.triggerConfig !== undefined) {
      updateData.triggerConfig = data.triggerConfig === null ? Prisma.JsonNull : data.triggerConfig;
    }
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.allowReentry !== undefined) updateData.allowReentry = data.allowReentry;

    const updated = await prisma.workflow.update({
      where: {id: workflowId},
      data: updateData,
    });

    // Invalidate workflow cache if enabled status changed or workflow is enabled
    if (data.enabled !== undefined || updated.enabled) {
      await EventService.invalidateWorkflowCache(projectId);
    }

    return updated;
  }

  /**
   * Delete a workflow
   */
  public static async delete(projectId: string, workflowId: string): Promise<void> {
    // Verify workflow exists and belongs to project
    const workflow = await this.get(projectId, workflowId);

    await prisma.workflow.delete({
      where: {id: workflowId},
    });

    // Invalidate workflow cache if workflow was enabled
    if (workflow.enabled) {
      await EventService.invalidateWorkflowCache(projectId);
    }
  }

  /**
   * Add a step to a workflow
   */
  public static async addStep(
    projectId: string,
    workflowId: string,
    data: {
      type: WorkflowStep['type'];
      name: string;
      position: Prisma.JsonValue;
      config: Prisma.JsonValue;
      templateId?: string;
      autoConnect?: boolean; // If true, automatically connect from the last step
    },
  ): Promise<WorkflowStep> {
    // Verify workflow exists and belongs to project
    const workflow = await this.get(projectId, workflowId);

    // Prevent adding duplicate TRIGGER steps
    if (data.type === 'TRIGGER') {
      const existingTrigger = workflow.steps.find(step => step.type === 'TRIGGER');
      if (existingTrigger) {
        throw new HttpException(400, 'Workflow already has a trigger step. Only one trigger is allowed per workflow.');
      }
    }

    // Create the new step
    const newStep = await prisma.workflowStep.create({
      data: {
        workflowId,
        type: data.type,
        name: data.name,
        position: data.position as Prisma.InputJsonValue,
        config: data.config as Prisma.InputJsonValue,
        templateId: data.templateId,
      },
    });

    // Auto-connect: If enabled (default true), create a transition from the last step to this new step
    // This is useful for linear workflows where steps are added sequentially
    const shouldAutoConnect = data.autoConnect !== false; // Default to true

    if (shouldAutoConnect && workflow.steps.length > 0) {
      // Find the last step that doesn't have any outgoing transitions (the "leaf" step)
      // This is typically the most recently added step
      const stepsWithoutOutgoing = workflow.steps.filter(step => step.outgoingTransitions.length === 0);

      if (stepsWithoutOutgoing.length > 0) {
        // Connect from the last leaf step to the new step
        const lastStep = stepsWithoutOutgoing[stepsWithoutOutgoing.length - 1];

        if (lastStep) {
          await prisma.workflowTransition.create({
            data: {
              fromStepId: lastStep.id,
              toStepId: newStep.id,
              priority: 0,
            },
          });

          console.log(`[WORKFLOW] Auto-connected step ${lastStep.id} to ${newStep.id}`);
        }
      }
    }

    return newStep;
  }

  /**
   * Update a workflow step
   */
  public static async updateStep(
    projectId: string,
    workflowId: string,
    stepId: string,
    data: {
      name?: string;
      position?: Prisma.JsonValue;
      config?: Prisma.JsonValue;
      templateId?: string | null;
    },
  ): Promise<WorkflowStep> {
    // First verify workflow belongs to project
    await this.get(projectId, workflowId);

    // Then verify step exists and belongs to workflow
    const step = await prisma.workflowStep.findUnique({
      where: {id: stepId},
    });

    if (step?.workflowId !== workflowId) {
      throw new HttpException(404, 'Workflow step not found');
    }

    const updateData: Prisma.WorkflowStepUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.position !== undefined) updateData.position = data.position as Prisma.InputJsonValue;
    if (data.config !== undefined) updateData.config = data.config as Prisma.InputJsonValue;
    if (data.templateId !== undefined) {
      if (data.templateId === null) {
        updateData.template = {disconnect: true};
      } else {
        updateData.template = {connect: {id: data.templateId}};
      }
    }

    return prisma.workflowStep.update({
      where: {id: stepId},
      data: updateData,
    });
  }

  /**
   * Delete a workflow step
   */
  public static async deleteStep(projectId: string, workflowId: string, stepId: string): Promise<void> {
    // First verify workflow belongs to project
    await this.get(projectId, workflowId);

    // Then verify step exists and belongs to workflow
    const step = await prisma.workflowStep.findUnique({
      where: {id: stepId},
    });

    if (step?.workflowId !== workflowId) {
      throw new HttpException(404, 'Workflow step not found');
    }

    // Prevent deletion of TRIGGER steps
    if (step.type === 'TRIGGER') {
      throw new HttpException(400, 'Cannot delete the trigger step. Every workflow must have a trigger.');
    }

    await prisma.workflowStep.delete({
      where: {id: stepId},
    });
  }

  /**
   * Create a transition between two steps
   */
  public static async createTransition(
    projectId: string,
    workflowId: string,
    data: {
      fromStepId: string;
      toStepId: string;
      condition?: Prisma.JsonValue;
      priority?: number;
    },
  ): Promise<WorkflowTransition> {
    // Verify both steps belong to the workflow
    const steps = await prisma.workflowStep.findMany({
      where: {
        id: {in: [data.fromStepId, data.toStepId]},
        workflowId,
        workflow: {projectId},
      },
    });

    if (steps.length !== 2) {
      throw new HttpException(404, 'One or both steps not found');
    }

    const fromStep = steps.find(s => s.id === data.fromStepId);

    // Debug logging
    console.log('[WorkflowService.createTransition]', {
      fromStepId: data.fromStepId,
      fromStepType: fromStep?.type,
      toStepId: data.toStepId,
      condition: data.condition,
      priority: data.priority,
    });

    // For CONDITION steps, validate that this branch doesn't already have a transition
    if (fromStep?.type === 'CONDITION' && data.condition) {
      const conditionObj = data.condition as any;
      if (conditionObj?.branch) {
        // Check if a transition with this branch already exists
        const existingTransition = await prisma.workflowTransition.findFirst({
          where: {
            fromStepId: data.fromStepId,
            condition: {
              path: ['branch'],
              equals: conditionObj.branch,
            },
          },
        });

        console.log('[WorkflowService.createTransition] Checking for existing branch:', {
          branch: conditionObj.branch,
          existingTransition: existingTransition ? 'FOUND' : 'NOT FOUND',
        });

        if (existingTransition) {
          throw new HttpException(
            400,
            `A transition for the "${conditionObj.branch}" branch already exists from this step`,
          );
        }
      }
    }

    const newTransition = await prisma.workflowTransition.create({
      data: {
        fromStepId: data.fromStepId,
        toStepId: data.toStepId,
        condition: data.condition ?? Prisma.JsonNull,
        priority: data.priority ?? 0,
      },
    });

    console.log('[WorkflowService.createTransition] Created transition:', {
      id: newTransition.id,
      condition: newTransition.condition,
    });

    return newTransition;
  }

  /**
   * Delete a transition
   */
  public static async deleteTransition(projectId: string, workflowId: string, transitionId: string): Promise<void> {
    // Verify transition exists and belongs to workflow
    const transition = await prisma.workflowTransition.findFirst({
      where: {
        id: transitionId,
        fromStep: {
          workflowId,
          workflow: {projectId},
        },
      },
    });

    if (!transition) {
      throw new HttpException(404, 'Transition not found');
    }

    await prisma.workflowTransition.delete({
      where: {id: transitionId},
    });
  }

  /**
   * Start a workflow execution for a contact
   */
  public static async startExecution(
    projectId: string,
    workflowId: string,
    contactId: string,
    context?: Prisma.JsonValue,
  ): Promise<WorkflowExecution> {
    // Verify workflow exists, is enabled, and belongs to project
    const workflow = await this.get(projectId, workflowId);

    if (!workflow.enabled) {
      throw new HttpException(400, 'Workflow is not enabled');
    }

    // Verify contact belongs to project
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        projectId,
      },
    });

    if (!contact) {
      throw new HttpException(404, 'Contact not found');
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
        throw new HttpException(
          409,
          `Workflow does not allow re-entry. Contact already has execution (${existingExecution.status})`,
        );
      }
    } else {
      // If re-entry is allowed, only check if there's a currently RUNNING execution
      const runningExecution = await prisma.workflowExecution.findFirst({
        where: {
          workflowId,
          contactId,
          status: WorkflowExecutionStatus.RUNNING,
        },
      });

      if (runningExecution) {
        throw new HttpException(409, 'Workflow is already running for this contact');
      }
    }

    // Find the trigger step
    const triggerStep = workflow.steps.find(step => step.type === 'TRIGGER');

    if (!triggerStep) {
      throw new HttpException(400, 'Workflow has no trigger step');
    }

    // Create workflow execution
    const execution = await prisma.workflowExecution.create({
      data: {
        workflowId,
        contactId,
        status: WorkflowExecutionStatus.RUNNING,
        currentStepId: triggerStep.id,
        context: context ?? Prisma.JsonNull,
      },
    });

    // Start executing the workflow asynchronously
    // Don't await - let it run in background
    const {WorkflowExecutionService} = await import('./WorkflowExecutionService.js');
    WorkflowExecutionService.processStepExecution(execution.id, triggerStep.id).catch(error => {
      console.error('Error executing workflow:', error);
    });

    return execution;
  }

  /**
   * Get workflow executions with filtering
   */
  public static async listExecutions(
    projectId: string,
    workflowId: string,
    page = 1,
    pageSize = 20,
    status?: WorkflowExecutionStatus,
  ) {
    // Verify workflow belongs to project
    await this.get(projectId, workflowId);

    const skip = (page - 1) * pageSize;

    const where: Prisma.WorkflowExecutionWhereInput = {
      workflowId,
      ...(status ? {status} : {}),
    };

    const [executions, total] = await Promise.all([
      prisma.workflowExecution.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {startedAt: 'desc'},
        include: {
          contact: {
            select: {
              id: true,
              email: true,
            },
          },
          currentStep: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      }),
      prisma.workflowExecution.count({where}),
    ]);

    return {
      executions,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get a single execution with details
   */
  public static async getExecution(
    projectId: string,
    workflowId: string,
    executionId: string,
  ): Promise<WorkflowExecutionWithDetails> {
    const execution = await prisma.workflowExecution.findFirst({
      where: {
        id: executionId,
        workflowId,
        workflow: {projectId},
      },
      include: {
        workflow: true,
        contact: {
          select: {
            id: true,
            email: true,
          },
        },
        currentStep: true,
        stepExecutions: {
          include: {
            step: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
          orderBy: {createdAt: 'asc'},
        },
      },
    });

    if (!execution) {
      throw new HttpException(404, 'Workflow execution not found');
    }

    return execution;
  }

  /**
   * Cancel a workflow execution
   */
  public static async cancelExecution(
    projectId: string,
    workflowId: string,
    executionId: string,
  ): Promise<WorkflowExecution> {
    // Verify execution exists
    await this.getExecution(projectId, workflowId, executionId);

    return prisma.workflowExecution.update({
      where: {id: executionId},
      data: {
        status: WorkflowExecutionStatus.CANCELLED,
        completedAt: new Date(),
      },
    });
  }
}
