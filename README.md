# Paperless MCP

An [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server that
wraps the [Paperless-NGX](https://docs.paperless-ngx.com/) REST API, so an AI
assistant like Claude can search, organize, and manage your documents, tags,
correspondents, document types, storage paths, custom fields, and background
tasks.

This is a fork of [nloui/paperless-mcp](https://github.com/nloui/paperless-mcp).
Upstream appears unmaintained ([PRs have languished for a long
time](https://github.com/nloui/paperless-mcp/issues)), so this fork carries
substantial fixes and ~35 tools' worth of additional API coverage, a unit-test
suite, and corrected API conformance. It is **not** published to npm — install
from source (see below).

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the server](#running-the-server)
  - [Configuration](#configuration)
- [Using with Claude (MCP client setup)](#using-with-claude-mcp-client-setup)
  - [Claude Desktop](#claude-desktop)
  - [Claude Code](#claude-code)
  - [Docker](#docker)
- [Tools](#tools)
- [Development](#development)
- [Acknowledgments](#acknowledgments)
- [License](#license)

## Features

- **Documents** — full-text search, structured metadata filtering, get/list,
  upload, single-document update/delete, notes, suggestions, metadata, history,
  "find similar", search autocomplete, downloads (with a size guard), and bulk
  edits (tags, correspondent/type/storage path, merge, split, rotate,
  delete/rotate pages, edit PDF, custom fields, permissions).
- **Tags / Correspondents / Document types** — full CRUD plus bulk permission
  and delete operations.
- **Storage paths & custom fields** — list and create.
- **Tasks** — poll the status and result of a document-consumption task.
- Friendly `matching_algorithm` enum mapped to the correct Paperless integer
  codes, structured `custom_field_query` filtering, and `full_perms` support on
  get/list calls.

## Architecture

The server is intentionally small and uniform:

- `src/api/PaperlessAPI.ts` — a thin HTTP client with one method per
  Paperless-NGX endpoint.
- `src/tools/*.ts` — one `registerXTools(server, api)` function per domain
  (documents, tags, correspondents, document types, storage paths, custom
  fields, tasks). Every tool field has a zod schema with descriptive docs.
- `src/index.ts` — the server factory and transport wiring (stdio or HTTP).

The Paperless REST API version is pinned via the `Accept` header (currently
`version=7`).

## Prerequisites

- **Node.js 20+**
- A running **Paperless-NGX** instance and an **API token**:
  1. Log into Paperless-NGX.
  2. Click your username (top right) → **My Profile**.
  3. Click the circular arrow to generate an API token.

## Installation

Not on npm — clone and build from source:

```bash
git clone https://github.com/joestump/paperless-mcp.git
cd paperless-mcp
npm install
npm run build
```

This compiles the server to `build/index.js`, which is the entry point you
point your MCP client at.

## Running the server

The server speaks two transports.

**stdio** (default — what MCP clients launch):

```bash
node build/index.js <baseUrl> <token>
# e.g.
node build/index.js https://paperless.example.com YOUR_API_TOKEN
```

**HTTP** (Streamable HTTP transport, for hosting it as a service):

```bash
# Reads credentials from the environment, not the CLI:
PAPERLESS_URL=https://paperless.example.com API_KEY=YOUR_API_TOKEN \
  node build/index.js --http --port 3000
```

- `POST /mcp` serves the MCP API (each request handled statelessly).
- A legacy SSE endpoint (`GET /sse` + `POST /messages`) is also available.
- `GET`/`DELETE /mcp` return `405 Method Not Allowed`.

### Configuration

| Argument / Env var | Mode | Default | Description |
| --- | --- | --- | --- |
| `<baseUrl>` (1st arg) | stdio | — | Base URL of your Paperless-NGX instance. |
| `<token>` (2nd arg) | stdio | — | Paperless-NGX API token. |
| `PAPERLESS_URL` | HTTP | — | Base URL of your Paperless-NGX instance. |
| `API_KEY` | HTTP | — | Paperless-NGX API token. |
| `--http` | both | off | Run the HTTP transport instead of stdio. |
| `--port <n>` | HTTP | `3000` | Port for the HTTP server. |

## Using with Claude (MCP client setup)

### Claude Desktop

Edit your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

(Claude Desktop is macOS/Windows only. On Linux, use Claude Code — see below.)

```jsonc
{
  "mcpServers": {
    "paperless": {
      "command": "node",
      "args": [
        "/absolute/path/to/paperless-mcp/build/index.js",
        "https://paperless.example.com",
        "YOUR_API_TOKEN"
      ]
    }
  }
}
```

Restart Claude Desktop after editing the config.

### Claude Code

```bash
claude mcp add paperless -- \
  node /absolute/path/to/paperless-mcp/build/index.js \
  https://paperless.example.com YOUR_API_TOKEN
```

### Docker

A `Dockerfile` is included; it builds the server and runs the HTTP transport on
port 3000.

```bash
docker build -t paperless-mcp .
docker run --rm -p 3000:3000 \
  -e PAPERLESS_URL=https://paperless.example.com \
  -e API_KEY=YOUR_API_TOKEN \
  paperless-mcp
```

## Tools

`matching_algorithm`, where it appears, is one of `none`, `any`, `all`,
`exact`, `regular expression`, `fuzzy`, or `auto` (mapped to the Paperless
integer codes before sending; default `any`).

### Documents

- **`list_documents`** — structured metadata filtering (no full-text). Optional:
  `correspondent_id`, `document_type_id`, `storage_path_id`, `tags_all`,
  `tags_any`, `tags_none`, `is_tagged`, `title_contains`, `content_contains`,
  `created_after`/`created_before`, `added_after`/`added_before`,
  `archive_serial_number`, `ordering` (e.g. `-created`), `page`, `page_size`,
  `full_perms`.
- **`search_documents`** — full-text and/or structured custom-field search.
  `query` (optional), `custom_field_query` (JSON atom `[field, op, value]` or
  `["AND"|"OR", [atoms]]` / `["NOT", atom]`), `page`, `page_size`, `full_perms`.
  Returns metadata **without** the OCR content field to avoid token overflow.
- **`get_document`** — `id`, optional `full_perms`.
- **`find_similar_documents`** — `id`, `page`, `page_size` ("more like this").
- **`autocomplete_search`** — `term`, optional `limit`; search-term suggestions.
- **`post_document`** — upload a file. `file` (base64), `filename`, optional
  `title`, `created`, `correspondent`, `document_type`, `storage_path`, `tags`,
  `archive_serial_number`, `custom_fields` (array of IDs or `{id: value}` map).
  Returns a task UUID — poll it with `get_task`.
- **`update_document`** — PATCH a single document. `id` plus any of `title`,
  `created`, `correspondent`, `document_type`, `storage_path`, `tags`,
  `archive_serial_number`, `owner`, `custom_fields` (`[{field, value}]`), and
  `add_note` (appends a note).
- **`delete_document`** — `id`.
- **`download_document`** — `id`, optional `original`, `max_bytes` (default
  10 MB; larger files are rejected rather than returned as a huge base64 blob).
- **`get_document_suggestions`** — `id`; candidate correspondents/tags/types/
  storage paths/dates Paperless infers for the document.
- **`get_document_notes`** — `id`; list a document's notes.
- **`delete_document_note`** — `id`, `note_id`.
- **`get_document_metadata`** — `id`; checksums, sizes, MIME, media filenames,
  language, parser metadata.
- **`get_document_history`** — `id`; audit trail (requires audit logging
  enabled server-side).
- **`bulk_edit_documents`** — operate on many documents at once. `documents`
  (IDs) + `method`:
  - `set_correspondent` / `set_document_type` / `set_storage_path` — with
    `correspondent` / `document_type` / `storage_path`.
  - `add_tag` / `remove_tag` (`tag`); `modify_tags` (`add_tags`, `remove_tags`).
  - `modify_custom_fields` — `add_custom_fields` (IDs or `{id: value}` map),
    `remove_custom_fields` (IDs).
  - `delete`, `reprocess`.
  - `merge` — `metadata_document_id`, `delete_originals`.
  - `split` — `pages` as a range string like `"1,3,5-7"`.
  - `delete_pages` — `pages` as individual page numbers like `"2,3,4"`.
  - `rotate` — `degrees` (90/180/270).
  - `edit_pdf` — a single document; `operations` (`[{page, rotate?, doc?}]`),
    optional `update_document`, `include_metadata`, `delete_original`.
  - `set_permissions` — `permissions` (`owner`, `set_permissions`, `merge`).

### Tags

- **`list_tags`** — optional `full_perms`.
- **`create_tag`** — `name`, optional `color` (`#rrggbb`), `match`,
  `matching_algorithm`.
- **`update_tag`** — `id`, `name`, optional `color`, `match`,
  `matching_algorithm`.
- **`delete_tag`** — `id`.
- **`bulk_edit_tags`** — `tag_ids`, `operation` (`set_permissions` | `delete`),
  with `owner` / `permissions` / `merge` for permissions.

### Correspondents

- **`list_correspondents`** — optional `full_perms`.
- **`create_correspondent`** — `name`, optional `match`, `matching_algorithm`.
- **`update_correspondent`** — `id`, optional `name`, `match`,
  `matching_algorithm`, `is_insensitive`, `owner`.
- **`delete_correspondent`** — `id`.
- **`bulk_edit_correspondents`** — `correspondent_ids`, `operation`
  (`set_permissions` | `delete`), with `owner` / `permissions` / `merge`.

### Document types

- **`list_document_types`** — optional `full_perms`.
- **`create_document_type`** — `name`, optional `match`, `matching_algorithm`.
- **`update_document_type`** — `id`, optional `name`, `match`,
  `matching_algorithm`, `is_insensitive`, `owner`.
- **`delete_document_type`** — `id`.
- **`bulk_edit_document_types`** — `document_type_ids`, `operation`
  (`set_permissions` | `delete`), with `owner` / `permissions` / `merge`.

### Storage paths

- **`list_storage_paths`** — optional `full_perms`.
- **`create_storage_path`** — `name`, `path` (template, e.g.
  `{correspondent}/{created_year}/{title}`), optional `match`,
  `matching_algorithm`, `is_insensitive`, `owner`.

### Custom fields

- **`list_custom_fields`** — list typed metadata fields.
- **`create_custom_field`** — `name`, `data_type` (`string`, `longtext`, `url`,
  `date`, `boolean`, `integer`, `float`, `monetary`, `documentlink`, `select`),
  optional `select_options` (labels, for `select`), `default_currency` (for
  `monetary`), `extra_data`.

### Tasks

- **`get_task`** — optional `task_id` (the UUID from `post_document`). Returns
  status (`PENDING`/`STARTED`/`SUCCESS`/`FAILURE`), result, and
  `related_document` (the new document's ID on success). Omit `task_id` to list
  recent tasks.

## Development

```bash
npm install          # install dependencies
npm test             # tsc --noEmit + vitest run (type-check + unit tests)
npm run test:watch   # vitest in watch mode
npm run typecheck    # tsc --noEmit only
npm run build        # compile to build/
```

Tests live in `test/` and mock the network (stub `global.fetch` for
`PaperlessAPI`; pass a fake `api` and a capturing `server` stub for tool
registration). This project follows TDD — add a failing test before changing
behavior. See [`CLAUDE.md`](./CLAUDE.md) for contributor conventions.

## Acknowledgments

Forked from [nloui/paperless-mcp](https://github.com/nloui/paperless-mcp) by
Nick Loui. Built on the [Model Context Protocol
SDK](https://github.com/modelcontextprotocol/typescript-sdk) and
[zod](https://github.com/colinhacks/zod), targeting the
[Paperless-NGX REST API](https://docs.paperless-ngx.com/api/).

## License

ISC — see `package.json`.
