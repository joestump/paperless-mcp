# paperless-mcp — contributor guide

An MCP server wrapping the Paperless-NGX REST API. One `registerXTools(server, api)`
function per domain in `src/tools/`, a matching method per endpoint on
`src/api/PaperlessAPI.ts`, wired together in `src/index.ts`.

## Test-Driven Development (MUST)

All code changes follow TDD: write a failing test first, make it pass, then
refactor. Do not add or change behavior without a test that covers it. When
fixing a bug, add a failing test that reproduces it before the fix.

- `npm test` runs the type-check (`tsc --noEmit`) **and** the unit tests
  (`vitest run`). Both must be green before committing.
- `npm run test:watch` for the red/green loop while developing.
- Tests live in `test/` as `*.test.ts`. Mock the network: stub `global.fetch`
  for `PaperlessAPI` tests, and pass a fake `api` + a capturing `server` stub
  for tool-registration tests (see existing tests for the pattern).

## Conventions

- Every tool field has a zod schema with a descriptive `.describe()`.
- `matching_algorithm` is a friendly enum mapped to Paperless integer codes via
  `src/utils/matching.ts` — never send the raw string or a guessed integer.
- Verify field shapes against the real Paperless-NGX API/serializers before
  implementing; do not assume.
- Keep the README tool list in sync with the registered tools.
