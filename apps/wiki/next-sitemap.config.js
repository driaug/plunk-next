/** @type {import('next-sitemap').IConfig} */

module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_WIKI || 'https://wiki.swyp.be',
  generateRobotsTxt: true,
};
