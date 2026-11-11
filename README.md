# Razorpay Interview

React + TypeScript app built with Vite, styled with Tailwind CSS, and tested with Vitest, React Testing Library and Playwright.

## Getting started

```bash
npm install
npx playwright install chromium   # one-time, for E2E tests
npm run dev
```

## Scripts

| Script                  | What it does                                      |
| ----------------------- | ------------------------------------------------- |
| `npm run dev`           | Start the Vite dev server                         |
| `npm run build`         | Type-check and build for production               |
| `npm run preview`       | Serve the production build                        |
| `npm run typecheck`     | Type-check only                                   |
| `npm run lint`          | Lint with oxlint                                  |
| `npm test`              | Run unit/component tests in watch mode (Vitest)   |
| `npm run test:run`      | Run unit/component tests once                     |
| `npm run test:coverage` | Run unit tests with V8 coverage                   |
| `npm run test:e2e`      | Run Playwright E2E tests (builds + previews app)  |
| `npm run test:e2e:ui`   | Open the Playwright UI runner                     |

## Layout

- `src/` – application code; unit/component tests live next to the code as `*.test.tsx`
- `src/test/setup.ts` – Vitest setup (jest-dom matchers, RTL cleanup)
- `e2e/` – Playwright specs (`*.spec.ts`)
- `vite.config.ts` – Vite, Tailwind and Vitest config
- `playwright.config.ts` – Playwright config
