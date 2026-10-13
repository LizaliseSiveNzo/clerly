# Clérly

React, TypeScript and Vite skincare storefront with product bundles, cart, account pages and server-side Yoco checkout integration.

## Development

Use Node.js 24. Run `npm ci`, then `npm run dev`. Validate with `npm test` and `npm run build`.

## Deployment

Vercel builds with `npm run build` and serves `dist`. Configure database and payment credentials as server environment variables. Never commit credentials. Live checkout requires verified payment and fulfilment configuration.
