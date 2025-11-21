import dayjs from 'dayjs';
import type {NextFunction, Request, Response} from 'express';
import jsonwebtoken from 'jsonwebtoken';

import {JWT_SECRET} from '../app/constants.js';
import {prisma} from '../database/prisma.js';
import {HttpException, NotAuthenticated} from '../exceptions/index.js';

export interface AuthResponse {
  type: 'jwt' | 'apiKey';
  userId?: string;
  projectId: string;
}

/**
 * Middleware to check if this unsubscribe is authenticated on the dashboard
 * @param req
 * @param res
 * @param next
 */
export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  res.locals.auth = {type: 'jwt', userId: parseJwt(req)};

  next();
};

export const jwt = {
  /**
   * Extracts a unsubscribe id from a jwt
   * @param token The JWT token
   */
  verify(token: string): string | null {
    try {
      const verified = jsonwebtoken.verify(token, JWT_SECRET) as {
        id: string;
      };
      return verified.id;
    } catch (e) {
      return null;
    }
  },
  /**
   * Signs a JWT token
   * @param id The user's ID to sign into a jwt token
   */
  sign(id: string): string {
    return jsonwebtoken.sign({id}, JWT_SECRET, {
      expiresIn: '168h',
    });
  },
  /**
   * Find out when a JWT expires
   * @param token The user's jwt token
   */
  expires(token: string): dayjs.Dayjs {
    const {exp} = jsonwebtoken.verify(token, JWT_SECRET) as {
      exp?: number;
    };
    return dayjs(exp);
  },
};

/**
 * Parse a user's ID from the request JWT token
 * @param request The express request object
 */
export function parseJwt(request: Request): string {
  const token: string | undefined = request.cookies.token;

  if (!token) {
    throw new NotAuthenticated();
  }

  const id = jwt.verify(token);

  if (!id) {
    throw new NotAuthenticated();
  }

  return id;
}

/**
 * Middleware to require project access
 * Validates that the user is authenticated and has access to the project specified in X-Project-Id header
 * @param req
 * @param res
 * @param next
 */
export const requireProjectAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // First authenticate the user
    const userId = parseJwt(req);

    // Get project ID from header
    const projectId = req.headers['x-project-id'] as string | undefined;

    if (!projectId) {
      throw new HttpException(400, 'Project ID is required');
    }

    // Verify user has access to this project
    const membership = await prisma.membership.findUnique({
      where: {
        userId_projectId: {
          userId,
          projectId,
        },
      },
    });

    if (!membership) {
      throw new HttpException(403, 'You do not have access to this project');
    }

    // Set auth response with project ID
    res.locals.auth = {
      type: 'jwt',
      userId,
      projectId,
    } as AuthResponse;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to require API key authentication (for public API endpoints)
 * Validates that the request has a valid API key (public or secret) and sets the project
 * @param req
 * @param res
 * @param next
 */
export const requireApiKey = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get API key from Authorization header or X-API-Key header
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

    let apiKey: string | undefined;

    if (authHeader) {
      // Support "Bearer <key>" format
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        apiKey = parts[1];
      } else {
        apiKey = authHeader;
      }
    } else if (apiKeyHeader) {
      apiKey = apiKeyHeader;
    }

    if (!apiKey) {
      throw new HttpException(401, 'API key is required');
    }

    // Look up project by public or secret key
    const project = await prisma.project.findFirst({
      where: {
        OR: [{public: apiKey}, {secret: apiKey}],
      },
    });

    if (!project) {
      throw new HttpException(401, 'Invalid API key');
    }

    if (project.disabled) {
      throw new HttpException(403, 'Project is disabled');
    }

    // Set auth response with project ID
    res.locals.auth = {
      type: 'apiKey',
      projectId: project.id,
    } as AuthResponse;

    next();
  } catch (error) {
    next(error);
  }
};
