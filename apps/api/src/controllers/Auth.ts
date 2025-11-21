import {Controller, Get, Post} from '@overnightjs/core';
import {AuthenticationSchemas} from '@repo/shared';
import type {Request, Response} from 'express';

import {prisma} from '../database/prisma.js';
import {redis, REDIS_ONE_MINUTE} from '../database/redis.js';
import {jwt} from '../middleware/auth.js';
import {AuthService} from '../services/AuthService.js';
import {UserService} from '../services/UserService.js';
import {Keys} from '../services/keys.js';

@Controller('auth')
export class Auth {
  @Post('login')
  public async login(req: Request, res: Response) {
    const {email, password} = AuthenticationSchemas.login.parse(req.body);

    const user = await UserService.email(email);

    if (!user) {
      return res.json({success: false, data: 'Incorrect email or password'});
    }

    if (user.type === 'PASSWORD' && !user.password) {
      return res.json({success: 'redirect', redirect: `/auth/reset?id=${user.id}`});
    }

    const verified = await AuthService.verifyCredentials(email, password);

    if (!verified) {
      return res.json({success: false, data: 'Incorrect email or password'});
    }

    await redis.set(Keys.User.id(user.id), JSON.stringify(user), 'EX', REDIS_ONE_MINUTE * 60);

    const token = jwt.sign(user.id);
    const cookie = UserService.cookieOptions();

    return res
      .cookie(UserService.COOKIE_NAME, token, cookie)
      .json({success: true, data: {id: user.id, email: user.email}});
  }

  @Post('signup')
  public async signup(req: Request, res: Response) {
    const {email, password} = AuthenticationSchemas.login.parse(req.body);

    const user = await UserService.email(email);

    if (user) {
      return res.json({
        success: false,
        data: 'That email is already associated with another user',
      });
    }

    const created_user = await prisma.user.create({
      data: {
        email,
        password: await AuthService.generateHash(password),
        type: 'PASSWORD',
      },
    });

    await redis.set(Keys.User.id(created_user.id), JSON.stringify(created_user), 'EX', REDIS_ONE_MINUTE * 60);

    const token = jwt.sign(created_user.id);
    const cookie = UserService.cookieOptions();

    return res.cookie(UserService.COOKIE_NAME, token, cookie).json({
      success: true,
      data: {id: created_user.id, email: created_user.email},
    });
  }

  @Get('logout')
  public logout(req: Request, res: Response) {
    res.cookie(UserService.COOKIE_NAME, '', UserService.cookieOptions(new Date()));
    return res.json(true);
  }
}
