import {Controller, Get, Middleware, Post} from '@overnightjs/core';
import type {Request, Response} from 'express';

import type {AuthResponse} from '../middleware/auth.js';
import {requireProjectAccess} from '../middleware/auth.js';
import {EventService} from '../services/EventService.js';

@Controller('events')
export class Events {
  /**
   * POST /events/track
   * Track a custom event (can trigger workflows)
   */
  @Post('track')
  @Middleware([requireProjectAccess])
  public async track(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const {name, contactId, emailId, data} = req.body;

    if (!name) {
      return res.status(400).json({error: 'Event name is required'});
    }

    const event = await EventService.trackEvent(auth.projectId!, name, contactId, emailId, data);

    return res.status(201).json(event);
  }

  /**
   * GET /events
   * List events for the project
   */
  @Get('')
  @Middleware([requireProjectAccess])
  public async list(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const eventName = req.query.eventName as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;

    const events = await EventService.getProjectEvents(auth.projectId!, eventName, limit);

    return res.status(200).json({events});
  }

  /**
   * GET /events/stats
   * Get event statistics
   */
  @Get('stats')
  @Middleware([requireProjectAccess])
  public async stats(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const stats = await EventService.getEventStats(auth.projectId!, startDate, endDate);

    return res.status(200).json(stats);
  }

  /**
   * GET /events/contact/:contactId
   * Get events for a specific contact
   */
  @Get('contact/:contactId')
  @Middleware([requireProjectAccess])
  public async getContactEvents(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;
    const contactId = req.params.contactId;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!contactId) {
      return res.status(400).json({error: 'Contact ID is required'});
    }

    const events = await EventService.getContactEvents(auth.projectId!, contactId, limit);

    return res.status(200).json({events});
  }

  /**
   * GET /events/names
   * Get unique event names for the project
   */
  @Get('names')
  @Middleware([requireProjectAccess])
  public async getEventNames(req: Request, res: Response) {
    const auth = res.locals.auth as AuthResponse;

    const eventNames = await EventService.getUniqueEventNames(auth.projectId!);

    return res.status(200).json({eventNames});
  }
}
