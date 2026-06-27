# Paperless-NGX MCP Server

An MCP (Model Context Protocol) server for interacting with a Paperless-NGX API server. This server provides tools for managing documents, tags, correspondents, document types, storage paths, and custom fields in your Paperless-NGX instance, plus polling background tasks.

## Quick Start

### Installation
1. Install the MCP server:
```bash
npm install -g paperless-mcp
```

2. Add it to your Claude's MCP configuration:

For VSCode extension, edit `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`:
```json
{
  "mcpServers": {
    "paperless": {
      "command": "npx",
      "args": ["paperless-mcp", "http://your-paperless-instance:8000", "your-api-token"]
    }
  }
}
```

For Claude desktop app, edit `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "paperless": {
      "command": "npx",
      "args": ["paperless-mcp", "http://your-paperless-instance:8000", "your-api-token"]
    }
  }
}
```

3. Get your API token:
   1. Log into your Paperless-NGX instance
   2. Click your username in the top right
   3. Select "My Profile"
   4. Click the circular arrow button to generate a new token

4. Replace the placeholders in your MCP config:
   - `http://your-paperless-instance:8000` with your Paperless-NGX URL
   - `your-api-token` with the token you just generated

That's it! Now you can ask Claude to help you manage your Paperless-NGX documents.

## Example Usage

Here are some things you can ask Claude to do:

- "Show me all documents tagged as 'Invoice'"
- "Search for documents containing 'tax return'"
- "Create a new tag called 'Receipts' with color #FF0000"
- "Download document #123"
- "List all correspondents"
- "Create a new document type called 'Bank Statement'"

## Available Tools

### Document Operations

#### list_documents
Get a paginated list of all documents.

Parameters:
- page (optional): Page number
- page_size (optional): Number of documents per page

```typescript
list_documents({
  page: 1,
  page_size: 25
})
```

#### get_document
Get a specific document by ID.

Parameters:
- id: Document ID

```typescript
get_document({
  id: 123
})
```

#### search_documents
Full-text search across documents.

Parameters:
- query: Search query string

```typescript
search_documents({
  query: "invoice 2024"
})
```

#### download_document
Download a document file by ID.

Parameters:
- id: Document ID
- original (optional): If true, downloads original file instead of archived version

```typescript
download_document({
  id: 123,
  original: false
})
```

#### bulk_edit_documents
Perform bulk operations on multiple documents.

Parameters:
- documents: Array of document IDs
- method: One of:
  - set_correspondent: Set correspondent for documents
  - set_document_type: Set document type for documents
  - set_storage_path: Set storage path for documents
  - add_tag: Add a tag to documents
  - remove_tag: Remove a tag from documents
  - modify_tags: Add and/or remove multiple tags
  - delete: Delete documents
  - reprocess: Reprocess documents
  - set_permissions: Set document permissions
  - merge: Merge multiple documents
  - split: Split a document into multiple documents
  - rotate: Rotate document pages
  - delete_pages: Delete specific pages from a document
  - modify_custom_fields: Add/remove custom field values on documents
- Additional parameters based on method:
  - correspondent: ID for set_correspondent
  - document_type: ID for set_document_type
  - storage_path: ID for set_storage_path
  - tag: ID for add_tag/remove_tag
  - add_tags: Array of tag IDs for modify_tags
  - remove_tags: Array of tag IDs for modify_tags
  - permissions: Object for set_permissions with owner, permissions, merge flag
  - metadata_document_id: ID for merge to specify metadata source
  - delete_originals: Boolean for merge/split
  - pages: Page spec (1-indexed). For split: comma-separated split points with ranges, e.g. "1,3,5-7" → three docs [1],[3],[5,6,7]. For delete_pages: comma-separated individual page numbers, e.g. "2,3,4" (ranges not allowed). Required for both methods.
  - degrees: Number for rotate (90, 180, or 270)
  - add_custom_fields: For modify_custom_fields — array of custom field IDs ([1,2]) or an object mapping field ID to value ({"3": "2024-01-01"})
  - remove_custom_fields: For modify_custom_fields — array of custom field IDs to remove

Examples:
```typescript
// Add a tag to multiple documents
bulk_edit_documents({
  documents: [1, 2, 3],
  method: "add_tag",
  tag: 5
})

// Set correspondent and document type
bulk_edit_documents({
  documents: [4, 5],
  method: "set_correspondent",
  correspondent: 2
})

// Merge documents
bulk_edit_documents({
  documents: [6, 7, 8],
  method: "merge",
  metadata_document_id: 6,
  delete_originals: true
})

// Split document into parts
bulk_edit_documents({
  documents: [9],
  method: "split",
  pages: "[1-2,3-4,5]"
})

// Modify multiple tags at once
bulk_edit_documents({
  documents: [10, 11],
  method: "modify_tags",
  add_tags: [1, 2],
  remove_tags: [3, 4]
})
```

#### post_document
Upload a new document to Paperless-NGX.

Parameters:
- file: Base64 encoded file content
- filename: Name of the file
- title (optional): Title for the document
- created (optional): DateTime when the document was created (e.g. "2024-01-19" or "2024-01-19 06:15:00+02:00")
- correspondent (optional): ID of a correspondent
- document_type (optional): ID of a document type
- storage_path (optional): ID of a storage path
- tags (optional): Array of tag IDs
- archive_serial_number (optional): Archive serial number
- custom_fields (optional): Either an array of custom field IDs ([1,2]) or an object mapping field ID to value ({"3": "2024-01-01", "4": 42})

```typescript
post_document({
  file: "base64_encoded_content",
  filename: "invoice.pdf",
  title: "January Invoice",
  created: "2024-01-19",
  correspondent: 1,
  document_type: 2,
  tags: [1, 3],
  archive_serial_number: "2024-001"
})
```

#### update_document
Update a single document's metadata (PATCH — only the fields you pass are changed). Use bulk_edit_documents for many documents at once.

Parameters:
- id: Document ID
- title (optional): New title
- created (optional): Creation date (ISO date or datetime)
- correspondent (optional): Correspondent ID, or null to clear
- document_type (optional): Document type ID, or null to clear
- storage_path (optional): Storage path ID, or null to clear
- tags (optional): Full array of tag IDs (replaces existing tags)
- archive_serial_number (optional): Integer ASN, or null to clear
- owner (optional): User ID, or null to remove ownership
- custom_fields (optional): Array of {field: id, value: ...} (replaces existing custom-field set)
- add_note (optional): Text of a note to append (notes are a separate sub-resource)

```typescript
update_document({
  id: 123,
  title: "Corrected Title",
  correspondent: 5,
  custom_fields: [{ field: 3, value: "2024-01-19" }],
  add_note: "Reviewed and reclassified"
})
```

#### delete_document
Permanently delete a single document (may move to trash depending on instance settings).

Parameters:
- id: Document ID

```typescript
delete_document({ id: 123 })
```

#### get_task
Look up a background task by its Celery UUID — used to poll the result of `post_document` (which returns only a task UUID).

Parameters:
- task_id (optional): The task UUID returned by post_document. Omit to list recent tasks.

```typescript
get_task({ task_id: "a1b2c3d4-...." })
// Returns status (PENDING/STARTED/SUCCESS/FAILURE), result, and
// related_document (the new document's ID on success).
```

### Tag Operations

#### list_tags
Get all tags.

```typescript
list_tags()
```

#### create_tag
Create a new tag.

Parameters:
- name: Tag name
- color (optional): Hex color code (e.g. "#ff0000")
- match (optional): Text pattern to match
- matching_algorithm (optional): One of "none", "any", "all", "exact", "regular expression", "fuzzy", "auto". Mapped to the Paperless integer codes (none=0, any=1, all=2, exact=3, regular expression=4, fuzzy=5, auto=6) before sending. Default is "any".

```typescript
create_tag({
  name: "Invoice",
  color: "#ff0000",
  match: "invoice",
  matching_algorithm: "fuzzy"
})
```

### Correspondent Operations

#### list_correspondents
Get all correspondents.

```typescript
list_correspondents()
```

#### create_correspondent
Create a new correspondent.

Parameters:
- name: Correspondent name
- match (optional): Text pattern to match
- matching_algorithm (optional): One of "none", "any", "all", "exact", "regular expression", "fuzzy", "auto" (mapped to Paperless integer codes before sending). Default is "any".

```typescript
create_correspondent({
  name: "ACME Corp",
  match: "ACME",
  matching_algorithm: "fuzzy"
})
```

### Document Type Operations

#### list_document_types
Get all document types.

```typescript
list_document_types()
```

#### create_document_type
Create a new document type.

Parameters:
- name: Document type name
- match (optional): Text pattern to match
- matching_algorithm (optional): One of "none", "any", "all", "exact", "regular expression", "fuzzy", "auto" (mapped to Paperless integer codes before sending). Default is "any".

```typescript
create_document_type({
  name: "Invoice",
  match: "invoice total amount due",
  matching_algorithm: "any"
})
```

### Storage Path Operations

#### list_storage_paths
Get all storage paths. Use the IDs with post_document, update_document, or bulk_edit_documents (set_storage_path).

```typescript
list_storage_paths()
```

#### create_storage_path
Create a new storage path (a path template controlling where document files are stored on disk).

Parameters:
- name: Unique name
- path: Path template using placeholders, e.g. "{correspondent}/{created_year}/{title}"
- match (optional): Text pattern for automatic assignment
- matching_algorithm (optional): One of "none", "any", "all", "exact", "regular expression", "fuzzy", "auto"
- is_insensitive (optional): Case-insensitive matching (default true)
- owner (optional): User ID, or null

```typescript
create_storage_path({
  name: "By correspondent and year",
  path: "{correspondent}/{created_year}/{title}",
  matching_algorithm: "any"
})
```

### Custom Field Operations

#### list_custom_fields
Get all custom fields. Use the IDs with post_document, update_document, or bulk_edit_documents (modify_custom_fields).

```typescript
list_custom_fields()
```

#### create_custom_field
Create a new custom field for storing typed metadata on documents.

Parameters:
- name: Unique field name
- data_type: One of "string", "longtext", "url", "date", "boolean", "integer", "float", "monetary", "documentlink", "select"
- select_options (optional): Required for data_type "select" — array of option labels (IDs assigned automatically)
- default_currency (optional): For data_type "monetary" — 3-letter ISO code (e.g. "USD")
- extra_data (optional): Raw extra_data escape hatch (rarely needed)

```typescript
create_custom_field({
  name: "Priority",
  data_type: "select",
  select_options: ["Low", "Medium", "High"]
})
```

## Error Handling

The server will show clear error messages if:
- The Paperless-NGX URL or API token is incorrect
- The Paperless-NGX server is unreachable
- The requested operation fails
- The provided parameters are invalid

## Development

Want to contribute or modify the server? Here's what you need to know:

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Make your changes to server.js
4. Test locally:
```bash
node server.js http://localhost:8000 your-test-token
```

The server is built with:
- [litemcp](https://github.com/wong2/litemcp): A TypeScript framework for building MCP servers
- [zod](https://github.com/colinhacks/zod): TypeScript-first schema validation

## API Documentation

This MCP server implements endpoints from the Paperless-NGX REST API. For more details about the underlying API, see the [official documentation](https://docs.paperless-ngx.com/api/).

## Running the MCP Server

The MCP server can be run in two modes:

### 1. stdio (default)

This is the default mode. The server communicates over stdio, suitable for CLI and direct integrations.

```
npm run start -- <baseUrl> <token>
```

### 2. HTTP (Streamable HTTP Transport)

To run the server as an HTTP service, use the `--http` flag. You can also specify the port with `--port` (default: 3000). This mode requires [Express](https://expressjs.com/) to be installed (it is included as a dependency).

```
npm run start -- <baseUrl> <token> --http --port 3000
```

- The MCP API will be available at `POST /mcp` on the specified port.
- Each request is handled statelessly, following the [StreamableHTTPServerTransport](https://github.com/modelcontextprotocol/typescript-sdk) pattern.
- GET and DELETE requests to `/mcp` will return 405 Method Not Allowed.
