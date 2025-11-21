import {loader} from 'fumadocs-core/source';
import {icons} from 'lucide-react';
import {createElement} from 'react';
import { openapiPlugin } from 'fumadocs-openapi/server';
import { openapi } from './openapi';

import {docs} from '@/.source';

// See https://fumadocs.vercel.app/docs/headless/source-api for more info
export const source = loader({
  // it assigns a URL to your pages
  baseUrl: '/',
  source: docs.toFumadocsSource(),
  plugins: [
    openapiPlugin({
      openapi,
      generateTags: true,
    }),
  ],
  icon(icon) {
    if (!icon) {
      // You may set a default icon
      return;
    }
    if (icon in icons) return createElement(icons[icon as keyof typeof icons]);
  },
});
