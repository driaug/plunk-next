import {STATUS_CODES} from 'node:http';

import {Server} from '@overnightjs/core';
import cookies from 'cookie-parser';
import cors from 'cors';
import type {NextFunction, Request, Response} from 'express';
import {json, raw} from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import signale from 'signale';

import {LANDING_URI, NODE_ENV, PORT, STRIPE_ENABLED} from './app/constants.js';
import {Actions} from './controllers/Actions.js';
import {Activity} from './controllers/Activity.js';
import {Analytics} from './controllers/Analytics.js';
import {Auth} from './controllers/Auth.js';
import {Campaigns} from './controllers/Campaigns.js';
import {Contacts} from './controllers/Contacts.js';
import {Domains} from './controllers/Domains.js';
import {Events} from './controllers/Events.js';
import {Oauth} from './controllers/Oauth/index.js';
import {Segments} from './controllers/Segments.js';
import {Templates} from './controllers/Templates.js';
import {Users} from './controllers/Users.js';
import {Webhooks} from './controllers/Webhooks.js';
import {Workflows} from './controllers/Workflows.js';
import {prisma} from './database/prisma.js';
import {HttpException} from './exceptions/index.js';
import {domainVerificationQueue, segmentCountQueue} from './services/QueueService.js';

const server = new (class extends Server {
  public constructor() {
    super();

    // Specify that we need raw json for the webhook
    this.app.use('/webhooks/incoming/stripe', raw({type: 'application/json'}));

    // Set the content-type to JSON for any request coming from AWS SNS
    this.app.use(function (req, res, next) {
      if (req.get('x-amz-sns-message-type')) {
        req.headers['content-type'] = 'application/json';
      }
      next();
    });

    // Parse the rest of our application as json
    this.app.use(json({limit: '50mb'}));
    this.app.use(cookies());
    this.app.use(helmet());

    this.app.use(['/v1', '/v1/track', '/v1/send'], (req, res, next) => {
      res.set({'Access-Control-Allow-Origin': '*'});
      next();
    });

    this.app.use(
      cors({
        origin:
          NODE_ENV === 'development'
            ? [/.*\.localhost:1000/, 'http://localhost:2000', 'http://localhost:3000', 'http://localhost:4000']
            : [/.*\.useplunk.com/],
        credentials: true,
      }),
    );

    this.app.use(morgan(NODE_ENV === 'development' ? 'dev' : 'short'));

    this.addControllers([
      new Actions(),
      new Activity(),
      new Analytics(),
      new Auth(),
      new Campaigns(),
      new Oauth(),
      new Users(),
      new Contacts(),
      new Domains(),
      new Segments(),
      new Templates(),
      new Webhooks(),
      new Workflows(),
      new Events(),
    ]);

    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'ok',
        time: Date.now(),
        environment: NODE_ENV,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      });
    });

    this.app.get('/', (_, res) => res.redirect(LANDING_URI));

    this.app.use('*', () => {
      throw new HttpException(404, 'Unknown route');
    });
  }
})();

server.app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
  const code = error instanceof HttpException ? error.code : 500;

  // Log errors for debugging (only log 500s as errors, others as warnings)
  if (code >= 500) {
    signale.error(`[${req.method}] ${req.path}:`, error);
  } else if (code >= 400) {
    signale.warn(`[${req.method}] ${req.path}: ${error.message}`);
  }

  res.status(code).json({
    code,
    error: STATUS_CODES[code],
    message: error.message,
    time: Date.now(),
  });
});

// Global error handlers to prevent server crashes
process.on('unhandledRejection', (reason, promise) => {
  signale.error('Unhandled Promise Rejection:', reason);
  console.error('Promise:', promise);
  // Don't exit the process - just log the error
});

process.on('uncaughtException', error => {
  signale.error('Uncaught Exception:', error);
  // Don't exit the process - just log the error
});

void prisma.$connect().then(async () => {
  server.app.listen(PORT, '0.0.0.0', () => signale.success('[HTTPS] Ready on', PORT));

  // Check if billing is enabled
  if (!STRIPE_ENABLED) {
    signale.warn('[BILLING] Billing is disabled - STRIPE_SK and STRIPE_WEBHOOK_SECRET not configured');
    signale.info('[BILLING] Running in self-hosted mode without subscription features');
  } else {
    signale.success('[BILLING] Billing is enabled and configured');
  }

  // Set up repeatable job for domain verification (BullMQ)
  // Run every 5 minutes to check domain verification status with AWS SES
  await domainVerificationQueue.add(
    'check-domain-verification',
    {}, // No specific data needed
    {
      repeat: {
        pattern: '*/5 * * * *', // Every 5 minutes (cron format)
      },
      jobId: 'domain-verification-repeatable', // Fixed ID to prevent duplicates
    },
  );

  signale.info('[BACKGROUND-JOB] Domain verification scheduled (BullMQ repeatable job, runs every 5 minutes)');

  // Set up repeatable job for segment count updates (BullMQ)
  // Run every 15 minutes to update cached segment member counts
  await segmentCountQueue.add(
    'update-segment-counts',
    {}, // No specific projectId = update all projects
    {
      repeat: {
        pattern: '*/15 * * * *', // Every 15 minutes (cron format)
      },
      jobId: 'segment-count-repeatable', // Fixed ID to prevent duplicates
    },
  );

  signale.info('[BACKGROUND-JOB] Segment count updater scheduled (BullMQ repeatable job, runs every 15 minutes)');
});
