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
 * Middleware to require public API key authentication (for /v1/track endpoint only)
 * Validates that the request has a valid public key and sets the project
 * @param req
 * @param res
 * @param next
 */
export const requirePublicKey = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get API key from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new HttpException(401, 'Authorization header is required');
    }

    // Support "Bearer <key>" format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new HttpException(401, 'Authorization header must use Bearer token format');
    }

    const apiKey = parts[1];

    // Look up project by public key only
    const project = await prisma.project.findFirst({
      where: {
        public: apiKey,
      },
    });

    if (!project) {
      throw new HttpException(401, 'Invalid public API key');
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

/**
 * Middleware to require secret API key authentication
 * Validates that the request has a valid secret key and sets the project
 * @param req
 * @param res
 * @param next
 */
export const requireSecretKey = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get API key from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new HttpException(401, 'Authorization header is required');
    }

    // Support "Bearer <key>" format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new HttpException(401, 'Authorization header must use Bearer token format');
    }

    const apiKey = parts[1];

    // Look up project by secret key only
    const project = await prisma.project.findFirst({
      where: {
        secret: apiKey,
      },
    });

    if (!project) {
      throw new HttpException(401, 'Invalid secret API key. This endpoint requires a secret key (sk_*).');
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

/**
 * Middleware to require authentication - supports both JWT and secret API key
 * For JWT: requires X-Project-Id header and validates user has access to the project
 * For API key: only accepts secret keys (sk_*), derives project from the key
 * @param req
 * @param res
 * @param next
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check for API key first (Authorization header with Bearer token)
    const authHeader = req.headers.authorization;

    // If Authorization header is provided, use secret key authentication
    if (authHeader) {
      // Support "Bearer <key>" format
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        throw new HttpException(401, 'Authorization header must use Bearer token format');
      }

      const apiKey = parts[1];
      // Look up project by secret key only (public keys not allowed)
      const project = await prisma.project.findFirst({
        where: {
          secret: apiKey,
        },
      });

      if (!project) {
        throw new HttpException(401, 'Invalid secret API key. This endpoint requires a secret key (sk_*).');
      }

      if (project.disabled) {
        throw new HttpException(403, 'Project is disabled');
      }

      // Set auth response with project ID
      res.locals.auth = {
        type: 'apiKey',
        projectId: project.id,
      } as AuthResponse;

      return next();
    }

    // Otherwise, use JWT authentication
    const userId = parseJwt(req);

    // Get project ID from header (required for JWT auth)
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
