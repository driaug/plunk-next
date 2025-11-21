import type {Contact, WorkflowExecution, WorkflowStep} from '@repo/db';
import {StepExecutionStatus, WorkflowExecutionStatus} from '@repo/db';

import {prisma} from '../database/prisma.js';
import {HttpException} from '../exceptions/index.js';

import {EmailService} from './EmailService.js';
import {QueueService} from './QueueService.js';

/**
 * Core Workflow Execution Engine
 * Handles the execution of workflows step by step
 */
export class WorkflowExecutionService {
  /**
   * Process a single step execution
   * This is the main entry point for executing workflow steps
   */
  public static async processStepExecution(executionId: string, stepId: string): Promise<void> {
    console.log(`[WORKFLOW] Processing step ${stepId} for execution ${executionId}`);

    const execution = await prisma.workflowExecution.findUnique({
      where: {id: executionId},
      include: {
        workflow: {
          include: {
            steps: {
              include: {
                template: true,
                outgoingTransitions: {
                  orderBy: {priority: 'asc'},
                  include: {toStep: true},
                },
              },
            },
          },
        },
        contact: true,
      },
    });

    if (!execution) {
      throw new HttpException(404, 'Workflow execution not found');
    }

    if (execution.status !== WorkflowExecutionStatus.RUNNING) {
      console.log(`[WORKFLOW] Execution ${executionId} has status ${execution.status}, skipping step processing`);
      return; // Already completed or cancelled
    }

    const step = execution.workflow.steps.find(s => s.id === stepId);
    if (!step) {
      throw new HttpException(404, 'Step not found in workflow');
    }

    console.log(`[WORKFLOW] Executing step ${step.id} (type: ${step.type}, name: ${step.name})`);

    // Create or get step execution record
    let stepExecution = await prisma.workflowStepExecution.findFirst({
      where: {
        executionId,
        stepId,
        status: {in: [StepExecutionStatus.PENDING, StepExecutionStatus.RUNNING]},
      },
    });

    if (!stepExecution) {
      stepExecution = await prisma.workflowStepExecution.create({
        data: {
          executionId,
          stepId,
          status: StepExecutionStatus.RUNNING,
          startedAt: new Date(),
        },
      });
    } else {
      stepExecution = await prisma.workflowStepExecution.update({
        where: {id: stepExecution.id},
        data: {
          status: StepExecutionStatus.RUNNING,
          startedAt: stepExecution.startedAt || new Date(),
        },
      });
    }

    try {
      // Execute the step based on its type
      const result = await this.executeStep(step, execution, stepExecution);

      console.log(`[WORKFLOW] Step ${step.id} executed successfully with result:`, JSON.stringify(result));

      // Check if step is in a waiting state (WAIT_FOR_EVENT steps only)
      // DELAY steps now mark themselves as COMPLETED and queue the next step
      const updatedStepExecution = await prisma.workflowStepExecution.findUnique({
        where: {id: stepExecution.id},
      });

      if (updatedStepExecution?.status === StepExecutionStatus.WAITING) {
        console.log(`[WORKFLOW] Step ${step.id} is in WAITING state, not processing next steps yet`);
        // Don't mark as completed or process next steps - the step will be resumed later
        return;
      }

      // Mark step as completed (for normal steps that complete immediately)
      await prisma.workflowStepExecution.update({
        where: {id: stepExecution.id},
        data: {
          status: StepExecutionStatus.COMPLETED,
          completedAt: new Date(),
          output: result || undefined,
        },
      });

      console.log(`[WORKFLOW] Step ${step.id} marked as completed, processing next steps`);

      // Determine next step(s) based on transitions and conditions
      await this.processNextSteps(execution, step, result);
    } catch (error) {
      console.error(`[WORKFLOW] Error executing step ${step.id}:`, error);
      // Mark step as failed
      await prisma.workflowStepExecution.update({
        where: {id: stepExecution.id},
        data: {
          status: StepExecutionStatus.FAILED,
          completedAt: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      // Mark workflow execution as failed
      await prisma.workflowExecution.update({
        where: {id: executionId},
        data: {
          status: WorkflowExecutionStatus.FAILED,
          completedAt: new Date(),
        },
      });

      throw error;
    }
  }

  /**
   * Process timeout for a WAIT_FOR_EVENT step
   * Called by BullMQ worker when timeout job executes
   */
  public static async processTimeout(executionId: string, stepId: string, stepExecutionId: string): Promise<void> {
    console.log(`[WORKFLOW] Processing timeout for step execution ${stepExecutionId}`);

    // Fetch the step execution
    const stepExecution = await prisma.workflowStepExecution.findUnique({
      where: {id: stepExecutionId},
      include: {
        execution: true,
        step: {
          include: {
            outgoingTransitions: {
              include: {toStep: true},
              orderBy: {priority: 'asc'},
            },
          },
        },
      },
    });

    if (!stepExecution) {
      console.log(`[WORKFLOW] Step execution ${stepExecutionId} not found, skipping timeout`);
      return;
    }

    // Only process if step is still waiting (event might have arrived before timeout)
    if (stepExecution.status !== StepExecutionStatus.WAITING) {
      console.log(
        `[WORKFLOW] Step execution ${stepExecutionId} is no longer waiting (status: ${stepExecution.status}), skipping timeout`,
      );
      return;
    }

    console.log(`[WORKFLOW] Timeout occurred for step ${stepId}, processing timeout branch`);

    // Mark step as completed with timeout
    await prisma.workflowStepExecution.update({
      where: {id: stepExecution.id},
      data: {
        status: StepExecutionStatus.COMPLETED,
        completedAt: new Date(),
        output: {
          timedOut: true,
          eventName: (stepExecution.step.config as any)?.eventName,
        },
      },
    });

    // Continue workflow - find transitions with timeout/fallback logic
    const transitions = stepExecution.step.outgoingTransitions || [];
    const fallbackTransition = transitions.find(
      (t: any) => t.condition?.branch === 'timeout' || t.condition?.fallback === true,
    );

    if (fallbackTransition) {
      // Follow timeout branch
      await prisma.workflowExecution.update({
        where: {id: stepExecution.executionId},
        data: {
          status: WorkflowExecutionStatus.RUNNING,
          currentStepId: fallbackTransition.toStep.id,
        },
      });

      await this.processStepExecution(stepExecution.executionId, fallbackTransition.toStep.id);
    } else if (transitions.length > 0) {
      // No timeout branch, follow first transition
      const firstTransition = transitions[0];
      if (firstTransition?.toStep) {
        const nextStep = firstTransition.toStep;
        await prisma.workflowExecution.update({
          where: {id: stepExecution.executionId},
          data: {
            status: WorkflowExecutionStatus.RUNNING,
            currentStepId: nextStep.id,
          },
        });

        await this.processStepExecution(stepExecution.executionId, nextStep.id);
      }
    } else {
      // No transitions, complete workflow
      await prisma.workflowExecution.update({
        where: {id: stepExecution.executionId},
        data: {
          status: WorkflowExecutionStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    }
  }

  /**
   * Handle event occurrence and resume waiting workflows
   */
  public static async handleEvent(projectId: string, eventName: string, contactId?: string, data?: any): Promise<void> {
    // Find workflows waiting for this event
    const waitingExecutions = await prisma.workflowStepExecution.findMany({
      where: {
        status: StepExecutionStatus.WAITING,
        execution: {
          workflow: {projectId},
          ...(contactId ? {contactId} : {}),
        },
        step: {
          type: 'WAIT_FOR_EVENT',
        },
      },
      include: {
        execution: true,
        step: {
          include: {
            outgoingTransitions: {
              orderBy: {priority: 'asc'},
              include: {toStep: true},
            },
          },
        },
      },
    });

    for (const stepExecution of waitingExecutions) {
      const config = stepExecution.step.config as any;

      if (config.eventName === eventName) {
        // Event matches, resume execution
        await prisma.workflowStepExecution.update({
          where: {id: stepExecution.id},
          data: {
            status: StepExecutionStatus.COMPLETED,
            completedAt: new Date(),
            output: {
              eventName,
              eventData: data,
              receivedAt: new Date().toISOString(),
            },
          },
        });

        // Cancel any pending timeout job
        await QueueService.cancelWorkflowTimeout(stepExecution.id);

        // Continue workflow
        await this.processNextSteps(stepExecution.execution, stepExecution.step, {eventReceived: true});
      }
    }
  }

  /**
   * Execute a specific step based on its type
   */
  private static async executeStep(
    step: WorkflowStep & {template?: any},
    execution: WorkflowExecution & {contact: Contact; workflow: any},
    stepExecution: any,
  ): Promise<any> {
    const config = step.config as any;

    switch (step.type) {
      case 'TRIGGER':
        return await this.executeTrigger(step, execution, stepExecution, config);

      case 'SEND_EMAIL':
        return await this.executeSendEmail(step, execution, stepExecution, config);

      case 'DELAY':
        return await this.executeDelay(step, execution, stepExecution, config);

      case 'WAIT_FOR_EVENT':
        return await this.executeWaitForEvent(step, execution, stepExecution, config);

      case 'CONDITION':
        return await this.executeCondition(step, execution, stepExecution, config);

      case 'EXIT':
        return await this.executeExit(step, execution, stepExecution, config);

      case 'WEBHOOK':
        return await this.executeWebhook(step, execution, stepExecution, config);

      case 'UPDATE_CONTACT':
        return await this.executeUpdateContact(step, execution, stepExecution, config);

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  /**
   * TRIGGER step - Entry point of workflow
   */
  private static async executeTrigger(
    step: WorkflowStep,
    execution: any,
    stepExecution: any,
    config: any,
  ): Promise<any> {
    // Trigger step is just the entry point, it doesn't do anything
    // But we can log or track that the workflow started
    return {
      triggered: true,
      eventName: config.eventName || 'manual',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * SEND_EMAIL step - Send an email to the contact
   */
  private static async executeSendEmail(
    step: WorkflowStep & {template?: any},
    execution: any,
    stepExecution: any,
    config: any,
  ): Promise<any> {
    if (!step.template) {
      throw new Error('No template configured for SEND_EMAIL step');
    }

    // Get contact data for variable substitution
    const contact = execution.contact;
    const contactData = contact.data || {};

    // Render template with contact data
    const variables = {
      email: contact.email,
      ...contactData,
      ...execution.context,
    };

    const renderedSubject = this.renderTemplate(step.template.subject, variables);
    const renderedBody = this.renderTemplate(step.template.body, variables);

    // Send email via EmailService
    const email = await EmailService.sendWorkflowEmail({
      projectId: execution.workflow.projectId,
      contactId: contact.id,
      workflowExecutionId: execution.id,
      workflowStepExecutionId: stepExecution.id, // Use stepExecution.id, not step.id
      templateId: step.template.id,
      subject: renderedSubject,
      body: renderedBody,
      from: step.template.from,
      replyTo: step.template.replyTo,
    });

    return {
      emailId: email.id,
      sentAt: email.createdAt,
    };
  }

  /**
   * DELAY step - Wait for a specified duration
   */
  private static async executeDelay(step: WorkflowStep, execution: any, stepExecution: any, config: any): Promise<any> {
    const {amount, unit} = config;

    if (!amount || !unit) {
      throw new Error('Delay step requires amount and unit in config');
    }

    // Calculate delay in milliseconds
    let delayMs = 0;

    switch (unit) {
      case 'minutes':
        delayMs = amount * 60 * 1000;
        break;
      case 'hours':
        delayMs = amount * 60 * 60 * 1000;
        break;
      case 'days':
        delayMs = amount * 24 * 60 * 60 * 1000;
        break;
      default:
        throw new Error(`Unknown delay unit: ${unit}`);
    }

    const resumeAt = new Date(Date.now() + delayMs);

    // Mark step as completed immediately (BullMQ handles the delay)
    await prisma.workflowStepExecution.update({
      where: {id: stepExecution.id},
      data: {
        status: StepExecutionStatus.COMPLETED,
        completedAt: new Date(),
        output: {
          delayAmount: amount,
          delayUnit: unit,
          resumeAt: resumeAt.toISOString(),
        },
      },
    });

    // Update workflow execution to waiting
    await prisma.workflowExecution.update({
      where: {id: execution.id},
      data: {
        status: WorkflowExecutionStatus.WAITING,
      },
    });

    // Find next steps to queue
    const transitions = await prisma.workflowTransition.findMany({
      where: {fromStepId: step.id},
      include: {toStep: true},
      orderBy: {priority: 'asc'},
    });

    if (transitions.length > 0) {
      const firstTransition = transitions[0];
      if (firstTransition?.toStep) {
        const nextStep = firstTransition.toStep;
        await QueueService.queueWorkflowStep(execution.id, nextStep.id, Math.max(0, delayMs));
      }
    }

    return {
      delayAmount: amount,
      delayUnit: unit,
      resumeAt: resumeAt.toISOString(),
      queued: true,
    };
  }

  /**
   * WAIT_FOR_EVENT step - Wait for a specific event to occur
   */
  private static async executeWaitForEvent(
    step: WorkflowStep,
    execution: any,
    stepExecution: any,
    config: any,
  ): Promise<any> {
    const {eventName, timeout} = config;

    if (!eventName) {
      throw new Error('WAIT_FOR_EVENT step requires eventName in config');
    }

    // Calculate timeout
    const timeoutDate = timeout
      ? new Date(Date.now() + timeout * 1000) // timeout is in seconds
      : null;

    // Update step execution to waiting
    await prisma.workflowStepExecution.update({
      where: {id: stepExecution.id},
      data: {
        status: StepExecutionStatus.WAITING,
        executeAfter: timeoutDate,
      },
    });

    // Update workflow execution to waiting
    await prisma.workflowExecution.update({
      where: {id: execution.id},
      data: {
        status: WorkflowExecutionStatus.WAITING,
      },
    });

    // Queue timeout handler if timeout is specified
    if (timeout && timeout > 0) {
      const timeoutMs = timeout * 1000;
      await QueueService.queueWorkflowTimeout(execution.id, step.id, stepExecution.id, timeoutMs);
      console.log(`[WORKFLOW] Queued timeout handler for step ${step.id} (${timeout}s)`);
    }

    return {
      eventName,
      timeout: timeout || null,
      waitingUntil: timeoutDate?.toISOString() || 'indefinite',
    };
  }

  /**
   * CONDITION step - Evaluate a condition and determine branching
   */
  private static async executeCondition(
    step: WorkflowStep,
    execution: any,
    stepExecution: any,
    config: any,
  ): Promise<any> {
    const {field, operator, value} = config;

    if (!field || !operator) {
      throw new Error('CONDITION step requires field and operator in config');
    }

    // Get the value to evaluate
    const contact = execution.contact;
    const contactData = contact.data || {};
    const context = execution.context || {};

    // Resolve the field value (support dot notation)
    // Structure allows access to:
    // - contact.email, contact.subscribed
    // - data.firstName, data.lastName, etc.
    // - workflow.* (execution context)
    const actualValue = this.resolveField(field, {
      contact: {
        email: contact.email,
        subscribed: contact.subscribed,
      },
      data: contactData,
      workflow: context,
    });

    // Evaluate the condition
    const result = this.evaluateCondition(actualValue, operator, value);

    return {
      field,
      operator,
      expectedValue: value,
      actualValue,
      result,
      branch: result ? 'yes' : 'no',
    };
  }

  /**
   * EXIT step - Terminate the workflow
   */
  private static async executeExit(step: WorkflowStep, execution: any, stepExecution: any, config: any): Promise<any> {
    const reason = config.reason || 'exit_step';

    // Mark workflow as exited
    await prisma.workflowExecution.update({
      where: {id: execution.id},
      data: {
        status: WorkflowExecutionStatus.EXITED,
        exitReason: reason,
        completedAt: new Date(),
      },
    });

    return {
      exited: true,
      reason,
    };
  }

  /**
   * WEBHOOK step - Call an external webhook
   */
  private static async executeWebhook(
    step: WorkflowStep,
    execution: any,
    stepExecution: any,
    config: any,
  ): Promise<any> {
    const {url, method = 'POST', headers = {}, body} = config;

    if (!url) {
      throw new Error('WEBHOOK step requires url in config');
    }

    // Prepare webhook payload
    const contact = execution.contact;
    const contactData = contact.data || {};

    const payload = body || {
      contact: {
        email: contact.email,
        subscribed: contact.subscribed,
        data: contactData,
      },
      workflow: {
        id: execution.workflow.id,
        name: execution.workflow.name,
      },
      execution: {
        id: execution.id,
        startedAt: execution.startedAt,
      },
    };

    // Make HTTP request
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: method !== 'GET' ? JSON.stringify(payload) : undefined,
    });

    const responseData = await response.text();
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseData);
    } catch {
      parsedResponse = responseData;
    }

    return {
      url,
      method,
      statusCode: response.status,
      success: response.ok,
      response: parsedResponse,
    };
  }

  /**
   * UPDATE_CONTACT step - Update contact data
   */
  private static async executeUpdateContact(
    step: WorkflowStep,
    execution: any,
    stepExecution: any,
    config: any,
  ): Promise<any> {
    const {updates} = config;

    if (!updates || typeof updates !== 'object') {
      throw new Error('UPDATE_CONTACT step requires updates object in config');
    }

    const contact = execution.contact;
    const currentData = contact.data || {};

    // Merge updates with current data
    const newData = {
      ...currentData,
      ...updates,
    };

    // Update contact in database
    await prisma.contact.update({
      where: {id: contact.id},
      data: {
        data: newData || undefined,
      },
    });

    return {
      updated: true,
      updates,
      newData,
    };
  }

  /**
   * Process next steps based on transitions
   */
  private static async processNextSteps(execution: any, currentStep: any, stepResult: any): Promise<void> {
    const transitions = currentStep.outgoingTransitions || [];

    console.log(
      `[WORKFLOW] Processing next steps for execution ${execution.id}, current step ${currentStep.id} (${currentStep.type}), found ${transitions.length} transitions`,
    );

    if (transitions.length === 0) {
      // No more steps, complete the workflow
      console.log(`[WORKFLOW] No transitions found, completing workflow execution ${execution.id}`);
      await prisma.workflowExecution.update({
        where: {id: execution.id},
        data: {
          status: WorkflowExecutionStatus.COMPLETED,
          completedAt: new Date(),
          currentStepId: null,
        },
      });
      return;
    }

    // Find the appropriate transition based on conditions
    let nextStep = null;

    for (const transition of transitions) {
      const condition = transition.condition;

      // If no condition, always follow
      if (!condition) {
        nextStep = transition.toStep;
        break;
      }

      // If condition exists, evaluate it
      // For CONDITION steps, check the branch
      if (stepResult.branch && condition.branch === stepResult.branch) {
        nextStep = transition.toStep;
        break;
      }

      // For other conditional logic
      if (this.evaluateTransitionCondition(condition, stepResult, execution)) {
        nextStep = transition.toStep;
        break;
      }
    }

    if (!nextStep) {
      // No valid transition found, complete workflow
      console.log(`[WORKFLOW] No valid transition found for execution ${execution.id}, completing workflow`);
      await prisma.workflowExecution.update({
        where: {id: execution.id},
        data: {
          status: WorkflowExecutionStatus.COMPLETED,
          completedAt: new Date(),
          currentStepId: null,
        },
      });
      return;
    }

    console.log(`[WORKFLOW] Moving to next step: ${nextStep.id} (${nextStep.type}) for execution ${execution.id}`);

    // Update current step and continue execution
    await prisma.workflowExecution.update({
      where: {id: execution.id},
      data: {
        currentStepId: nextStep.id,
        status: WorkflowExecutionStatus.RUNNING,
      },
    });

    // Process the next step
    // All steps are processed immediately - DELAY and WAIT_FOR_EVENT will pause the workflow internally
    console.log(`[WORKFLOW] Processing next step ${nextStep.id} (${nextStep.type})`);
    await this.processStepExecution(execution.id, nextStep.id);
  }

  /**
   * Helper: Render template with variables
   */
  private static renderTemplate(template: string, variables: Record<string, any>): string {
    let rendered = template;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      rendered = rendered.replace(regex, String(value || ''));
    }

    return rendered;
  }

  /**
   * Helper: Resolve field value from object using dot notation
   */
  private static resolveField(field: string, data: any): any {
    const parts = field.split('.');
    let value = data;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Helper: Evaluate condition
   */
  private static evaluateCondition(actualValue: any, operator: string, expectedValue: any): boolean {
    switch (operator) {
      case 'equals':
        return actualValue === expectedValue;
      case 'notEquals':
        return actualValue !== expectedValue;
      case 'contains':
        // Return false if the value doesn't exist (undefined/null)
        if (actualValue === undefined || actualValue === null) {
          return false;
        }
        return String(actualValue).includes(String(expectedValue));
      case 'notContains':
        // Return true if the value doesn't exist (it doesn't contain anything)
        if (actualValue === undefined || actualValue === null) {
          return true;
        }
        return !String(actualValue).includes(String(expectedValue));
      case 'greaterThan':
        return Number(actualValue) > Number(expectedValue);
      case 'lessThan':
        return Number(actualValue) < Number(expectedValue);
      case 'greaterThanOrEqual':
        return Number(actualValue) >= Number(expectedValue);
      case 'lessThanOrEqual':
        return Number(actualValue) <= Number(expectedValue);
      case 'exists':
        return actualValue !== undefined && actualValue !== null;
      case 'notExists':
        return actualValue === undefined || actualValue === null;
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  /**
   * Helper: Evaluate transition condition
   */
  private static evaluateTransitionCondition(condition: any, stepResult: any, execution: any): boolean {
    // Implement custom transition condition logic here
    // For now, return false as default
    return false;
  }
}
