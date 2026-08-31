# AGENTS.md

- always enable caveman

## Architecture

- Dual `src/client/` (React frontend) and `src/server/` (Express API proxy) with separate import aliases.
- `@/` resolves to `src/client/` — used for UI components, features, shared lib, hooks, and routes.
- `~/` resolves to `src/server/` — used for server config, services, utils, and routes.
- The Express server proxies API requests to a Django backend (`DJANGO_BASE_URL`). All server-side routes live under `/api` and delegate to service functions that call `forwardRequest()`.
- `forwardRequest()` in `src/server/utils/forwardRequest.js` builds the URL as `${DJANGO_BASE_URL}/api${path}` and forwards the HTTP method, body, query params, and auth header.

## Commands

| Command            | Purpose                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| `npm run dev`      | Start dev server (Vite + Express via vite-express). Reads `.env.development`. |
| `npm run build`    | Production build (`vite build` → `dist/`).                                    |
| `npm start`        | Start production server. Reads `.env.production`.                             |
| `npx vite preview` | Preview the production build locally.                                         |

There is no `npm test`, `npm run lint`, or `npm run typecheck` script defined. There are no test files in the repo.

## Path Aliases & Imports

- `@/` → `src/client/` (vite.config.js alias + jsconfig.json)
- `~/` → `src/server/` (vite.config.js alias + jsconfig.json)

When importing from the client side, use `@/`-prefixed paths. The shadcn/ui component import path is `@/shared/components/ui/<component>`.

## State Management

- Redux Toolkit Query (`@reduxjs/toolkit/query/react`) is used for all API data fetching.
- APIs are defined in `src/client/app/api/` using `apiSlice.injectEndpoints()`.
- The store (`src/client/app/store.js`) only includes the apiSlice reducer and middleware.
- Each endpoint declares `providesTags` / `invalidatesTags` for automatic cache invalidation — follow the existing pattern when adding new APIs.

## shadcn/ui

- Component library is shadcn/ui (New York style) with Tailwind CSS variables.
- Use `npx shadcn@latest add <component>` to add components.
- Components are stored in `src/client/shared/components/ui/`.
- The `cn()` utility is at `@/shared/lib/utils` (re-exported as `@/lib/utils` per shadcn conventions via `components.json` aliases).

## Routing

- Route definitions in `src/client/routes/routes.js` use `react-router-dom` lazy imports.
- Features follow a `src/client/features/<featureName>/pages/<PageName>.jsx` structure.
- The `AppLayout` (`src/client/shared/layout/AppLayout.jsx`) wraps all routes with a sidebar.

## Environment

- `.env.development` is loaded automatically by the server (`src/server/config/env.js`).
- `DJANGO_BASE_URL` must point to the backend Django server.
- `PORT` sets the Express server port (defaults in `.env.development`: 5173).

## Code Style

- Prettier: 4-space tabs, single quotes, trailing commas, 80 char print width.
- ESLint: flat config with React + hooks plugins. `react/prop-types` is off.
- File extensions: `.jsx` for React components, `.js` for plain modules.

## Forms

- React Hook Form + Zod for form state and validation.
- Use shadcn/ui `Form` component (`@/shared/components/ui/form`) which wraps React Hook Form.
- Pattern: define a Zod schema, call `useForm({ resolver: zodResolver(schema) })`, render with `<FormField>` / `<FormItem>` / `<FormControl>`.
- See `src/client/features/loop/components/LoopForm.jsx` for a representative example.

## Data Tables

- TanStack React Table (`@tanstack/react-table`) for all data tables.
- Reusable `DataTable` component in `src/client/shared/components/data-table/`.
- Define column definitions in a `columns.jsx` file alongside the page, then pass them to `<DataTable>`.
- See `src/client/features/simulator/` for a representative example.

## Adding a New Feature

1. Create `src/client/features/<featureName>/pages/<PageName>.jsx` and optional `components/` folder.
2. Add an API slice in `src/client/app/api/<featureName>Api.js` using `apiSlice.injectEndpoints()`.
3. Register the route in `src/client/routes/routes.js` with `React.lazy()` and add the path constant to `src/client/routes/constants.js`.
4. If the feature needs a server proxy endpoint, add a route file in `src/server/routes/api/` and a service in `src/server/services/`, following the `forwardRequest()` pattern.
5. Wire the server route in `src/server/routes/api.js`.

## Key Dependencies

- `vite-express` bridges Vite dev server with Express in development.
- `agentation` is loaded in dev mode in `App.jsx` at `localhost:4747`.
- `ioredis` is a dependency but may not be used in this frontend (server-side only).

## Existing Instruction Sources

- [`.github/instructions/copilot.instructions.md`](.github/instructions/copilot.instructions.md) — general coding standards.
- [`.github/instructions/shadcn-ui.instructions.md`](.github/instructions/shadcn-ui.instructions.md) — always fetch latest shadcn/ui docs; do not rely on training data.
- [`.vscode/copilot-instructions.md`](.vscode/copilot-instructions.md) — `rtk` CLI proxy for token-optimized shell commands.
