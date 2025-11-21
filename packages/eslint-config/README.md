# @repo/eslint-config

Shared ESLint configurations for the Swyp monorepo.

## Configurations

### Next.js Config

For Next.js applications using the flat config format (ESLint 9+).

**Usage:**

```js
// eslint.config.mjs
import config from "@repo/eslint-config/next";

export default config;
```

**Features:**

- Next.js core web vitals rules
- TypeScript support
- Automatic ignores for build artifacts

## Adding to a new app

1. Install dependencies:

```json
{
  "devDependencies": {
    "@repo/eslint-config": "*",
    "eslint": "^9",
    "eslint-config-next": "16.0.1"
  }
}
```

2. Create `eslint.config.mjs`:

```js
import config from "@repo/eslint-config/next";

export default config;
```

3. Add lint script to `package.json`:

```json
{
  "scripts": {
    "lint": "eslint ."
  }
}
```
