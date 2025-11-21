import {Controller, Delete, Get, Middleware, Patch, Post} from '@overnightjs/core';
import type {Request, Response} from 'express';

import type {AuthResponse} from '../middleware/auth.js';
import {requireAuth} from '../middleware/auth.js';
import {SegmentService} from '../services/SegmentService.js';

@Controller('segments')
export class Segments {
  /**
   * GET /segments
   * List all segments for the authenticated project
   */
  @Get('')
  @Middleware([requireAuth])
  public async list(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;

    const segments = await SegmentService.list(auth.projectId!);

    return res.status(200).json(segments);
  }

  /**
   * GET /segments/:id
   * Get a specific segment by ID with member count
   */
  @Get(':id')
  @Middleware([requireAuth])
  public async get(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const segmentId = req.params.id;

    if (!segmentId) {
      return res.status(400).json({error: 'Segment ID is required'});
    }

    const segment = await SegmentService.get(auth.projectId!, segmentId);

    return res.status(200).json(segment);
  }

  /**
   * GET /segments/:id/contacts
   * Get contacts that match a segment's filters
   */
  @Get(':id/contacts')
  @Middleware([requireAuth])
  public async getContacts(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const segmentId = req.params.id;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);

    if (!segmentId) {
      return res.status(400).json({error: 'Segment ID is required'});
    }

    const result = await SegmentService.getContacts(auth.projectId!, segmentId, page, pageSize);

    return res.status(200).json(result);
  }

  /**
   * POST /segments
   * Create a new segment
   */
  @Post('')
  @Middleware([requireAuth])
  public async create(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const {name, description, filters, trackMembership} = req.body;

    if (!name) {
      return res.status(400).json({error: 'Name is required'});
    }

    if (!filters || !Array.isArray(filters)) {
      return res.status(400).json({error: 'Filters must be an array'});
    }

    const segment = await SegmentService.create(auth.projectId!, {
      name,
      description,
      filters,
      trackMembership,
    });

    return res.status(201).json(segment);
  }

  /**
   * PATCH /segments/:id
   * Update a segment
   */
  @Patch(':id')
  @Middleware([requireAuth])
  public async update(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const segmentId = req.params.id;
    const {name, description, filters, trackMembership} = req.body;

    if (!segmentId) {
      return res.status(400).json({error: 'Segment ID is required'});
    }

    if (filters !== undefined && !Array.isArray(filters)) {
      return res.status(400).json({error: 'Filters must be an array'});
    }

    const segment = await SegmentService.update(auth.projectId!, segmentId, {
      name,
      description,
      filters,
      trackMembership,
    });

    return res.status(200).json(segment);
  }

  /**
   * DELETE /segments/:id
   * Delete a segment
   */
  @Delete(':id')
  @Middleware([requireAuth])
  public async delete(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const segmentId = req.params.id;

    if (!segmentId) {
      return res.status(400).json({error: 'Segment ID is required'});
    }

    await SegmentService.delete(auth.projectId!, segmentId);

    return res.status(204).send();
  }

  /**
   * POST /segments/:id/compute
   * Recompute segment membership for all contacts
   */
  @Post(':id/compute')
  @Middleware([requireAuth])
  public async compute(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const segmentId = req.params.id;

    if (!segmentId) {
      return res.status(400).json({error: 'Segment ID is required'});
    }

    const result = await SegmentService.computeMembership(auth.projectId!, segmentId);

    return res.status(200).json(result);
  }

  /**
   * POST /segments/:id/refresh
   * Refresh segment member count
   */
  @Post(':id/refresh')
  @Middleware([requireAuth])
  public async refresh(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const segmentId = req.params.id;

    if (!segmentId) {
      return res.status(400).json({error: 'Segment ID is required'});
    }

    const memberCount = await SegmentService.refreshMemberCount(auth.projectId!, segmentId);

    return res.status(200).json({memberCount});
  }
}
