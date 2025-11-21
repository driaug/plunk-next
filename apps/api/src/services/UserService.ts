import dayjs from 'dayjs';

import {NODE_ENV} from '../app/constants.js';
import {prisma} from '../database/prisma.js';
import {wrapRedis} from '../database/redis.js';

import {Keys} from './keys.js';

export class UserService {
  public static readonly COOKIE_NAME = 'token';

  public static async id(id: string) {
    return wrapRedis(Keys.User.id(id), async () => {
      return prisma.user.findUnique({where: {id}});
    });
  }

  public static async email(email: string) {
    return wrapRedis(Keys.User.email(email), async () => {
      return prisma.user.findFirst({
        where: {
          email: {
            equals: email,
            mode: 'insensitive',
          },
        },
      });
    });
  }

  public static async projects(userId: string) {
    const memberships = await prisma.user.findUnique({where: {id: userId}}).memberships({
      include: {
        project: true,
      },
    });

    return memberships ? memberships.map(({project}) => project) : [];
  }

  /**
   * Generates cookie options
   * @param expires An optional expiry for this cookie (useful for a logout)
   */
  public static cookieOptions(expires?: Date) {
    return {
      httpOnly: true,
      expires: expires ?? dayjs().add(7, 'days').toDate(),
      secure: NODE_ENV !== 'development',
      sameSite: NODE_ENV === 'development' ? 'lax' : 'none',
      path: '/',
      domain: NODE_ENV === 'development' ? undefined : '.swyp.be',
    } as const;
  }
}
