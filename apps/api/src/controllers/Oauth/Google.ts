import {Controller, Get} from '@overnightjs/core';
import type {Request, Response} from 'express';

import {
  API_URI,
  DASHBOARD_URI,
  GOOGLE_OAUTH_CLIENT,
  GOOGLE_OAUTH_ENABLED,
  GOOGLE_OAUTH_SECRET,
} from '../../app/constants.js';
import {prisma} from '../../database/prisma.js';
import {jwt} from '../../middleware/auth.js';
import {UserService} from '../../services/UserService.js';

@Controller('google')
export class Google {
  @Get('outbound')
  public sendToOutbound(req: Request, res: Response) {
    if (!GOOGLE_OAUTH_ENABLED) {
      return res.status(404).json({error: 'Google OAuth is not configured'});
    }

    return res.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?scope=https://www.googleapis.com/auth/userinfo.email&access_type=offline&include_granted_scopes=true&prompt=select_account&response_type=code&redirect_uri=${API_URI}/oauth/google/callback&client_id=${GOOGLE_OAUTH_CLIENT}`,
    );
  }

  @Get('callback')
  public async callback(req: Request, res: Response) {
    if (!GOOGLE_OAUTH_ENABLED) {
      return res.status(404).json({error: 'Google OAuth is not configured'});
    }
    const {code} = req.query;

    const data = new URLSearchParams({
      client_id: GOOGLE_OAUTH_CLIENT,
      client_secret: GOOGLE_OAUTH_SECRET,
      code: code as string,
      redirect_uri: `${API_URI}/oauth/google/callback`,
      grant_type: 'authorization_code',
    });

    const {access_token} = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {'Content-type': 'application/x-www-form-urlencoded'},
      body: data,
    }).then(res => res.json());

    const {email} = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${access_token}`).then(
      res => res.json(),
    );

    let user = await UserService.email(email);

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          type: 'GOOGLE_OAUTH',
        },
      });
    }

    if (user.type !== 'GOOGLE_OAUTH') {
      return res.redirect(DASHBOARD_URI + '/auth/login?message=You used another form of authentication');
    }

    const token = jwt.sign(user.id);
    const cookie = UserService.cookieOptions();

    res.cookie(UserService.COOKIE_NAME, token, cookie).redirect(DASHBOARD_URI);
  }
}
