import {Controller, Get} from '@overnightjs/core';
import type {Request, Response} from 'express';

import {
  API_URI,
  DASHBOARD_URI,
  GITHUB_OAUTH_CLIENT,
  GITHUB_OAUTH_ENABLED,
  GITHUB_OAUTH_SECRET,
} from '../../app/constants.js';
import {prisma} from '../../database/prisma.js';
import {jwt} from '../../middleware/auth.js';
import {UserService} from '../../services/UserService.js';

@Controller('github')
export class Github {
  @Get('outbound')
  public sendToOutbound(req: Request, res: Response) {
    if (!GITHUB_OAUTH_ENABLED) {
      return res.status(404).json({error: 'GitHub OAuth is not configured'});
    }

    const OAUTH_QS = new URLSearchParams({
      client_id: GITHUB_OAUTH_CLIENT,
      redirect_uri: `${API_URI}/oauth/github/callback`,
      response_type: 'code',
      scope: 'user:email',
    });

    return res.redirect(`https://github.com/login/oauth/authorize?${OAUTH_QS.toString()}`);
  }

  @Get('callback')
  public async callback(req: Request, res: Response) {
    if (!GITHUB_OAUTH_ENABLED) {
      return res.status(404).json({error: 'GitHub OAuth is not configured'});
    }
    const {code} = req.query;

    const data = new URLSearchParams({
      client_id: GITHUB_OAUTH_CLIENT,
      client_secret: GITHUB_OAUTH_SECRET,
      code: code as string,
      redirect_uri: `${API_URI}/oauth/github/callback`,
    });

    const {access_token, token_type} = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {'Content-type': 'application/x-www-form-urlencoded', 'Accept': 'application/json'},
      body: data,
    }).then(res => res.json());

    const emails = await fetch(`https://api.github.com/user/emails`, {
      headers: {Authorization: `${token_type} ${access_token}`},
    }).then(res => res.json());

    const email = emails.find((e: {primary: any; email: string}) => e.primary).email;

    let user = await UserService.email(email as string);

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          type: 'GITHUB_OAUTH',
        },
      });
    }

    if (user.type !== 'GITHUB_OAUTH') {
      return res.redirect(DASHBOARD_URI + '/auth/login?message=You used another form of authentication');
    }

    const token = jwt.sign(user.id);
    const cookie = UserService.cookieOptions();

    res.cookie(UserService.COOKIE_NAME, token, cookie).redirect(DASHBOARD_URI);
  }
}
