import type {BaseLayoutProps} from 'fumadocs-ui/layouts/shared';
import {AppWindowIcon} from 'lucide-react';
import React from 'react';

/**
 * Shared layout configurations
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */
export const baseOptions: BaseLayoutProps = {
  themeSwitch: {
    enabled: false,
  },
  nav: {
    title: 'Plunk',
  },
  links: [
    {
      icon: <AppWindowIcon />,
      text: 'Dashboard',
      url: 'https://app.useplunk.com',
    },
  ],
};
