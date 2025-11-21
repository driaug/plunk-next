import {Controller, Delete, Get, Middleware, Patch, Post} from '@overnightjs/core';
import type {Request, Response} from 'express';
import multer from 'multer';

import type {AuthResponse} from '../middleware/auth.js';
import {requireAuth} from '../middleware/auth.js';
import {ContactService} from '../services/ContactService.js';
import {QueueService} from '../services/QueueService.js';

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
  fileFilter: (_req, file, cb) => {
    // Only accept CSV files
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

@Controller('contacts')
export class Contacts {
  /**
   * GET /contacts
   * List all contacts for the authenticated project with cursor-based pagination
   */
  @Get('')
  @Middleware([requireAuth])
  public async list(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const cursor = req.query.cursor as string | undefined;
    const search = req.query.search as string | undefined;

    const result = await ContactService.list(auth.projectId!, limit, cursor, search);

    return res.status(200).json(result);
  }

  /**
   * GET /contacts/fields
   * Get all available contact fields (both standard and custom fields from data JSON)
   */
  @Get('fields')
  @Middleware([requireAuth])
  public async getAvailableFields(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;

    try {
      const fields = await ContactService.getAvailableFields(auth.projectId!);

      return res.status(200).json({
        fields,
        count: fields.length,
      });
    } catch (error) {
      console.error('[CONTACTS] Failed to get available fields:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get available fields',
      });
    }
  }

  /**
   * GET /contacts/fields/:field/values
   * Get unique values for a contact field (for workflow conditions, segment filters, etc.)
   * Example: /contacts/fields/data.plan/values or /contacts/fields/subscribed/values
   */
  @Get('fields/:field/values')
  @Middleware([requireAuth])
  public async getFieldValues(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const field = req.params.field;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);

    if (!field) {
      return res.status(400).json({error: 'Field is required'});
    }

    try {
      const values = await ContactService.getUniqueFieldValues(auth.projectId!, field, limit);

      return res.status(200).json({
        field,
        values,
        count: values.length,
        limit,
      });
    } catch (error) {
      console.error('[CONTACTS] Failed to get field values:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get field values',
      });
    }
  }

  /**
   * GET /contacts/:id
   * Get a specific contact by ID
   */
  @Get(':id')
  @Middleware([requireAuth])
  public async get(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const contactId = req.params.id;

    if (!contactId) {
      return res.status(400).json({error: 'Contact ID is required'});
    }

    const contact = await ContactService.get(auth.projectId!, contactId);

    return res.status(200).json(contact);
  }

  /**
   * POST /contacts
   * Create or update a contact (upsert)
   */
  @Post('')
  @Middleware([requireAuth])
  public async create(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const {email, data, subscribed} = req.body;

    if (!email) {
      return res.status(400).json({error: 'Email is required'});
    }

    // Check if contact exists before upserting
    const existingContact = await ContactService.findByEmail(auth.projectId!, email);
    const isUpdate = !!existingContact;

    const contact = await ContactService.upsert(auth.projectId!, email, data, subscribed);

    return res.status(isUpdate ? 200 : 201).json({
      ...contact,
      _meta: {
        isNew: !isUpdate,
        isUpdate,
      },
    });
  }

  /**
   * PATCH /contacts/:id
   * Update a contact
   */
  @Patch(':id')
  @Middleware([requireAuth])
  public async update(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const contactId = req.params.id;
    const {email, data, subscribed} = req.body;

    if (!contactId) {
      return res.status(400).json({error: 'Contact ID is required'});
    }

    const contact = await ContactService.update(auth.projectId!, contactId, {email, data, subscribed});

    return res.status(200).json(contact);
  }

  /**
   * DELETE /contacts/:id
   * Delete a contact
   */
  @Delete(':id')
  @Middleware([requireAuth])
  public async delete(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const contactId = req.params.id;

    if (!contactId) {
      return res.status(400).json({error: 'Contact ID is required'});
    }

    await ContactService.delete(auth.projectId!, contactId);

    return res.status(204).send();
  }

  /**
   * GET /contacts/public/:id
   * PUBLIC: Get contact information (no auth required)
   */
  @Get('public/:id')
  public async getPublic(req: Request, res: Response) {
    const contactId = req.params.id;

    if (!contactId) {
      return res.status(400).json({error: 'Contact ID is required'});
    }

    const contact = await ContactService.getById(contactId);

    // Return only safe information
    return res.status(200).json({
      id: contact.id,
      email: contact.email,
      subscribed: contact.subscribed,
    });
  }

  /**
   * POST /contacts/public/:id/subscribe
   * PUBLIC: Subscribe a contact (no auth required)
   */
  @Post('public/:id/subscribe')
  public async subscribePublic(req: Request, res: Response) {
    const contactId = req.params.id;

    if (!contactId) {
      return res.status(400).json({error: 'Contact ID is required'});
    }

    const contact = await ContactService.subscribe(contactId);

    return res.status(200).json({
      id: contact.id,
      email: contact.email,
      subscribed: contact.subscribed,
    });
  }

  /**
   * POST /contacts/public/:id/unsubscribe
   * PUBLIC: Unsubscribe a contact (no auth required)
   */
  @Post('public/:id/unsubscribe')
  public async unsubscribePublic(req: Request, res: Response) {
    const contactId = req.params.id;

    if (!contactId) {
      return res.status(400).json({error: 'Contact ID is required'});
    }

    const contact = await ContactService.unsubscribe(contactId);

    return res.status(200).json({
      id: contact.id,
      email: contact.email,
      subscribed: contact.subscribed,
    });
  }

  /**
   * POST /contacts/import
   * Import contacts from CSV file
   */
  @Post('import')
  @Middleware([requireAuth, upload.single('file')])
  public async importCsv(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;

    if (!req.file) {
      return res.status(400).json({error: 'CSV file is required'});
    }

    try {
      // Convert file buffer to base64 for storage in queue
      const csvData = req.file.buffer.toString('base64');
      const filename = req.file.originalname;

      // Queue import job
      const job = await QueueService.queueImport(auth.projectId!, csvData, filename);

      return res.status(202).json({
        message: 'Import queued successfully',
        jobId: job.id,
      });
    } catch (error) {
      console.error('[CONTACTS] Failed to queue import:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to queue import',
      });
    }
  }

  /**
   * GET /contacts/import/:jobId
   * Get import job status
   */
  @Get('import/:jobId')
  @Middleware([requireAuth])
  public async getImportStatus(req: Request, res: Response) {
    const jobId = req.params.jobId;

    if (!jobId) {
      return res.status(400).json({error: 'Job ID is required'});
    }

    try {
      const status = await QueueService.getImportJobStatus(jobId);

      if (!status) {
        return res.status(404).json({error: 'Import job not found'});
      }

      return res.status(200).json(status);
    } catch (error) {
      console.error('[CONTACTS] Failed to get import status:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get import status',
      });
    }
  }
}
