import { z } from "zod";

// Default cap for download_document. A base64 payload is ~33% larger than the
// raw bytes and is returned inline, so an unbounded download can easily blow
// the model's context window. 10 MB is a pragmatic ceiling callers can raise.
const DEFAULT_MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;

// Extract a filename from a Content-Disposition header, handling RFC 5987
// `filename*=charset''value` (preferred when present), quoted filenames, and
// bare `filename=` values with trailing parameters.
function parseContentDispositionFilename(
  header: string | null | undefined,
  fallback: string
): string {
  if (!header) return fallback;

  // RFC 5987 extended form, e.g. filename*=UTF-8''my%20file.pdf
  const ext = header.match(/filename\*=([^;]+)/i);
  if (ext) {
    let value = ext[1].trim();
    const charsetMatch = value.match(/^[^']*''(.*)$/); // strip charset'lang'
    if (charsetMatch) value = charsetMatch[1];
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  // Quoted form, e.g. filename="my file.pdf"
  const quoted = header.match(/filename="([^"]*)"/i);
  if (quoted) return quoted[1];

  // Bare form, e.g. filename=my-file.pdf; other=...
  const bare = header.match(/filename=([^;]+)/i);
  if (bare) return bare[1].trim();

  return fallback;
}

export function registerDocumentTools(server, api) {
  server.tool(
    "bulk_edit_documents",
    "Perform bulk operations on multiple documents simultaneously: set correspondent/type/tags, delete, reprocess, merge, split, rotate, or manage permissions. Efficient for managing large document collections.",
    {
      documents: z.array(z.number()).describe("Array of document IDs to perform bulk operations on. Get document IDs from search_documents first."),
      method: z.enum([
        "set_correspondent",
        "set_document_type",
        "set_storage_path",
        "add_tag",
        "remove_tag",
        "modify_tags",
        "delete",
        "reprocess",
        "set_permissions",
        "merge",
        "split",
        "rotate",
        "delete_pages",
        "modify_custom_fields",
        "edit_pdf",
      ]).describe("The bulk operation to perform: set_correspondent (assign sender/receiver), set_document_type (categorize documents), set_storage_path (organize file location), add_tag/remove_tag/modify_tags (manage labels), delete (permanently remove), reprocess (re-run OCR/indexing), set_permissions (control access), merge (combine documents), split (separate into multiple), rotate (adjust orientation), delete_pages (remove specific pages), modify_custom_fields (add/remove custom field values), edit_pdf (per-page rotate/reorder/split a SINGLE document's PDF)"),
      correspondent: z.number().optional().describe("ID of correspondent to assign when method is 'set_correspondent'. Use list_correspondents to get valid IDs."),
      document_type: z.number().optional().describe("ID of document type to assign when method is 'set_document_type'. Use list_document_types to get valid IDs."),
      storage_path: z.number().optional().describe("ID of storage path to assign when method is 'set_storage_path'. Storage paths organize documents in folder hierarchies."),
      tag: z.number().optional().describe("Single tag ID to add or remove when method is 'add_tag' or 'remove_tag'. Use list_tags to get valid IDs."),
      add_tags: z.array(z.number()).optional().describe("Array of tag IDs to add when method is 'modify_tags'. Use list_tags to get valid IDs."),
      remove_tags: z.array(z.number()).optional().describe("Array of tag IDs to remove when method is 'modify_tags'. Use list_tags to get valid IDs."),
      permissions: z
        .object({
          owner: z.number().nullable().optional().describe("User ID to set as document owner, or null to remove ownership"),
          set_permissions: z
            .object({
              view: z.object({
                users: z.array(z.number()).describe("User IDs granted view permission"),
                groups: z.array(z.number()).describe("Group IDs granted view permission"),
              }).describe("Users and groups who can view these documents"),
              change: z.object({
                users: z.array(z.number()).describe("User IDs granted edit permission"),
                groups: z.array(z.number()).describe("Group IDs granted edit permission"),
              }).describe("Users and groups who can edit these documents"),
            })
            .optional().describe("Specific permission settings for users and groups"),
          merge: z.boolean().optional().describe("Whether to merge with existing permissions (true) or replace them (false)"),
        })
        .optional().describe("Permission settings when method is 'set_permissions'. Controls who can view and edit the documents."),
      metadata_document_id: z.number().optional().describe("Source document ID when merging documents. The metadata from this document will be preserved."),
      delete_originals: z.boolean().optional().describe("Whether to delete original documents after merge/split operations. Use with caution."),
      pages: z.string().optional().describe("Page specification (1-indexed). The accepted format depends on the method. For 'split': a comma-separated list of split points where ranges define each output document, e.g. '1,3,5-7' produces three documents containing [page 1], [page 3], [pages 5,6,7]. For 'delete_pages': a comma-separated list of individual page numbers to remove, e.g. '2,3,4' (ranges are NOT supported here and will be rejected). Required for both 'split' and 'delete_pages'."),
      degrees: z.number().optional().describe("Rotation angle in degrees when method is 'rotate'. Use 90, 180, or 270 for standard rotations."),
      add_custom_fields: z
        .union([
          z.array(z.number()),
          z.record(z.string(), z.any()),
        ])
        .optional()
        .describe("Custom fields to add when method is 'modify_custom_fields'. Either an array of custom field IDs to attach with no value (e.g. [1,2]), or an object mapping custom field ID to the value to set (e.g. {\"3\": \"2024-01-01\", \"4\": 42}). Use list_custom_fields to get valid IDs."),
      remove_custom_fields: z
        .array(z.number())
        .optional()
        .describe("Array of custom field IDs to remove from the documents when method is 'modify_custom_fields'. Use list_custom_fields to get valid IDs."),
      operations: z
        .array(
          z.object({
            page: z.number().int().min(1).describe("1-indexed page number in the source document this operation applies to."),
            rotate: z.number().optional().describe("Optional rotation for this page in degrees (90, 180, or 270)."),
            doc: z.number().int().optional().describe("Optional 0-indexed output document index. Pages sharing the same 'doc' value are grouped into the same resulting document, letting you reorder pages and split into multiple documents. Omit to keep all pages in a single output document."),
          })
        )
        .optional()
        .describe("Required when method is 'edit_pdf'. An ordered list of per-page operations on a SINGLE document's PDF (the 'documents' array must contain exactly one ID). Each entry selects a source 'page' and may 'rotate' it and/or assign it to an output 'doc'. The order of entries determines the page order in the output. Pages out of bounds for the document are rejected by the API."),
      update_document: z.boolean().optional().describe("For 'edit_pdf': when true, modify the existing document in place instead of creating new document(s). Default false."),
      include_metadata: z.boolean().optional().describe("For 'edit_pdf': when true (default), copy the source document's metadata (tags, correspondent, type, custom fields, etc.) onto the resulting document(s)."),
      delete_original: z.boolean().optional().describe("For 'edit_pdf': when true, delete the original document after producing the edited output. Default false."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const { documents, method, ...rest } = args;
      let parameters: Record<string, any> = rest;
      // The Paperless bulk_edit API expects set_permissions parameters
      // (set_permissions/owner/merge) flattened at the top level of
      // `parameters`, matching the bulk_edit_objects contract — not nested
      // under a `permissions` wrapper.
      if (method === "set_permissions" && rest.permissions) {
        const { permissions, ...others } = rest;
        parameters = { ...others, ...permissions };
      }

      // The `pages` parameter is overloaded across two methods with different
      // wire shapes (verified against BulkEditSerializer in
      // src/documents/serialisers.py):
      //   - split:        the API parses the raw string "1,3,5-7" itself, so
      //                   forward it untouched.
      //   - delete_pages: the API requires a JSON list of integers (no ranges),
      //                   so expand "2,3,4" -> [2, 3, 4] before sending and
      //                   reject ranges / non-integers with a clear error.
      if (method === "split") {
        if (!rest.pages) {
          throw new Error("The 'split' method requires a 'pages' string, e.g. '1,3,5-7'.");
        }
      } else if (method === "delete_pages") {
        if (!rest.pages) {
          throw new Error("The 'delete_pages' method requires a 'pages' string of page numbers, e.g. '2,3,4'.");
        }
        const parsed = rest.pages.split(",").map((p) => p.trim());
        if (parsed.some((p) => !/^\d+$/.test(p))) {
          throw new Error(
            "The 'delete_pages' method only accepts individual page numbers (e.g. '2,3,4'); ranges like '5-7' are not supported. Use the 'split' method for ranges."
          );
        }
        parameters = { ...parameters, pages: parsed.map((p) => parseInt(p, 10)) };
      } else if (method === "edit_pdf") {
        // The API restricts edit_pdf to a single document (operations index
        // pages of one PDF), so fail fast with a clear message rather than
        // letting the request 400.
        if (documents.length !== 1) {
          throw new Error("The 'edit_pdf' method operates on exactly one document; pass a single ID in 'documents'.");
        }
        if (!rest.operations || rest.operations.length === 0) {
          throw new Error("The 'edit_pdf' method requires a non-empty 'operations' array.");
        }
      }

      return api.bulkEditDocuments(documents, method, parameters);
    }
  );

  server.tool(
    "post_document",
    "Upload a new document to Paperless-NGX with metadata. Supports PDF, images (PNG/JPG/TIFF), and text files. Automatically processes for OCR and indexing.",
    {
      file: z.string().describe("Base64 encoded file content. Convert your file to base64 before uploading. Supports PDF, images (PNG, JPG, TIFF), and text files."),
      filename: z.string().describe("Original filename with extension (e.g., 'invoice.pdf', 'receipt.png'). This helps Paperless determine file type and initial document title."),
      title: z.string().optional().describe("Custom document title. If not provided, Paperless will extract title from filename or document content."),
      created: z.string().optional().describe("Document creation date in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss). If not provided, uses current date."),
      correspondent: z.number().optional().describe("ID of the correspondent (sender/receiver) for this document. Use list_correspondents to find or create_correspondent to add new ones."),
      document_type: z.number().optional().describe("ID of document type for categorization (e.g., Invoice, Receipt, Letter). Use list_document_types to find or create_document_type to add new ones."),
      storage_path: z.number().optional().describe("ID of storage path to organize document location in folder hierarchy. Leave empty for default storage."),
      tags: z.array(z.number()).optional().describe("Array of tag IDs to label this document. Use list_tags to find existing tags or create_tag to add new ones."),
      archive_serial_number: z.string().optional().describe("Custom archive number for document organization and reference. Useful for maintaining external filing systems."),
      custom_fields: z
        .union([
          z.array(z.number()),
          z.record(z.string(), z.any()),
        ])
        .optional()
        .describe("Custom fields to associate with this document. Either an array of custom field IDs to attach with no value (e.g. [1,2]), or an object mapping custom field ID to its value (e.g. {\"3\": \"2024-01-01\", \"4\": 42}). Use list_custom_fields to get valid IDs and their data types."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const binaryData = Buffer.from(args.file, "base64");
      const blob = new Blob([binaryData]);
      const file = new File([blob], args.filename);
      const { file: _, filename: __, ...metadata } = args;
      return api.postDocument(file, metadata);
    }
  );


  server.tool(
    "get_document",
    "Get complete details for a specific document including full metadata, content preview, tags, correspondent, and document type information.",
    {
      id: z.number().describe("Unique document ID. Get this from search_documents results. Returns full document metadata, content preview, and associated tags/correspondent/type."),
      full_perms: z.boolean().optional().describe("When true, include the document's object-level permissions (owner plus per-user/per-group view and change permissions) in the response."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return api.getDocument(args.id, args.full_perms);
    }
  );

  server.tool(
    "search_documents",
    "Search through documents using full-text search across content, titles, tags, and metadata, and/or structured filtering by custom-field values. Returns document metadata WITHOUT the full OCR content field to prevent token overflow. Use get_document to retrieve full details for specific documents of interest. Supports Paperless-NGX advanced query syntax.",
    {
      query: z.string().optional().describe("Full-text search query using Paperless-NGX syntax. By default, matches documents containing ALL words. Advanced syntax: Field searches: 'tag:unpaid', 'type:invoice', 'correspondent:university'. Logical operators: 'term1 AND (term2 OR term3)'. Date ranges: 'created:[2020 to 2024]', 'added:yesterday', 'modified:today'. Wildcards: 'prod*name'. Optional when custom_field_query is provided. Search looks through document content, title, correspondent, type, and tags."),
      custom_field_query: z
        .union([z.string(), z.array(z.any())])
        .optional()
        .describe(
          "Structured filter on custom-field values, applied in addition to (or instead of) the full-text query. A JSON expression that is either an atom [field, operator, value] or a logical combination [\"AND\"|\"OR\", [atom, ...]] / [\"NOT\", atom], which may nest. 'field' is a custom field's ID or name. Operators by field type: all types support 'exact', 'in', 'isnull', 'exists'; string/url/longtext also support 'icontains', 'istartswith', 'iendswith'; integer/float/date/monetary also support 'gt', 'gte', 'lt', 'lte', 'range'; documentlink supports 'contains'. Examples: [\"Invoice Number\", \"exact\", \"INV-42\"]; [\"Amount\", \"range\", [10, 100]]; [\"AND\", [[\"Status\", \"exact\", \"Paid\"], [\"Due Date\", \"lt\", \"2024-12-31\"]]]. Accepts either the array form or a pre-stringified JSON string."
        ),
      page: z.number().optional().describe("Page number for pagination (starts at 1). Use to browse through large result sets without hitting token limits."),
      page_size: z.number().optional().describe("Number of documents per page (default 25, max 100). Smaller page sizes help avoid token limits when many documents match."),
      full_perms: z.boolean().optional().describe("When true, include each result's object-level permissions (owner plus per-user/per-group view and change permissions)."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      if (!args.query && args.custom_field_query === undefined) {
        throw new Error("search_documents requires at least one of 'query' or 'custom_field_query'.");
      }
      // The API expects custom_field_query as a JSON string; accept either the
      // structured array form (stringify it) or an already-encoded string.
      const customFieldQuery =
        args.custom_field_query === undefined
          ? undefined
          : typeof args.custom_field_query === "string"
            ? args.custom_field_query
            : JSON.stringify(args.custom_field_query);
      return api.searchDocuments(
        args.query,
        args.page,
        args.page_size,
        customFieldQuery,
        args.full_perms
      );
    }
  );

  server.tool(
    "autocomplete_search",
    "Get search term autocomplete suggestions from the Paperless-NGX full-text index. Given a partial term, returns a list of completed terms that appear in the indexed documents — useful for building or refining a search_documents query.",
    {
      term: z.string().describe("The partial search term to complete (e.g. 'inv' might suggest 'invoice', 'investment')."),
      limit: z.number().int().positive().optional().describe("Maximum number of suggestions to return. Defaults to 10 on the server."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return api.getAutocomplete(args.term, args.limit);
    }
  );

  server.tool(
    "find_similar_documents",
    "Find documents similar to a given document using Paperless-NGX's 'more like this' search (semantic/content similarity via the search index). Useful for discovering related paperwork, duplicates, or documents from the same context. Returns document metadata WITHOUT the full OCR content field to prevent token overflow.",
    {
      id: z.number().describe("ID of the reference document to find similar documents for. Get this from search_documents or get_document results."),
      page: z.number().optional().describe("Page number for pagination (starts at 1)."),
      page_size: z.number().optional().describe("Number of documents per page (default 25, max 100)."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return api.getSimilarDocuments(args.id, args.page, args.page_size);
    }
  );

  server.tool(
    "download_document",
    "Download a document file as base64-encoded data. Choose between original uploaded file or processed/archived version with OCR improvements. NOTE: the file is returned inline as base64, which consumes context proportional to file size; large files are rejected unless you raise max_bytes. For big files, prefer fetching from the Paperless UI/API directly.",
    {
      id: z.number().describe("Document ID to download. Get this from search_documents or get_document results."),
      original: z.boolean().optional().describe("Whether to download the original uploaded file (true) or the processed/archived version (false, default). Original files preserve exact formatting but may not include OCR improvements."),
      max_bytes: z.number().int().positive().optional().describe(`Maximum file size to return, in bytes. Defaults to ${DEFAULT_MAX_DOWNLOAD_BYTES} (${Math.round(DEFAULT_MAX_DOWNLOAD_BYTES / (1024 * 1024))} MB). Downloads larger than this are rejected with an error instead of returning a giant base64 blob that could overflow the context window. Raise this only if you really need the bytes inline.`),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const limit = args.max_bytes ?? DEFAULT_MAX_DOWNLOAD_BYTES;
      const response = await api.downloadDocument(args.id, args.original);

      // Fast path: reject before buffering the whole body when the server tells
      // us the size up front.
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > limit) {
        throw new Error(
          `Document ${args.id} is ${declared} bytes, which exceeds the ${limit}-byte limit for inline download. Raise max_bytes to fetch it anyway, or download it directly from Paperless.`
        );
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      // Safety net for servers that omit content-length (e.g. chunked).
      if (buffer.length > limit) {
        throw new Error(
          `Document ${args.id} is ${buffer.length} bytes, which exceeds the ${limit}-byte limit for inline download. Raise max_bytes to fetch it anyway, or download it directly from Paperless.`
        );
      }

      return {
        blob: buffer.toString("base64"),
        filename: parseContentDispositionFilename(
          response.headers.get("content-disposition"),
          `document-${args.id}`
        ),
      };
    }
  );

  server.tool(
    "update_document",
    "Update a single document's metadata: title, dates, correspondent, document type, storage path, tags, archive serial number, owner, and custom-field values. Optionally add a note. Only the fields you provide are changed (PATCH semantics). Use bulk_edit_documents for operations across many documents at once.",
    {
      id: z.number().describe("ID of the document to update. Get this from search_documents or get_document results."),
      title: z.string().optional().describe("New document title."),
      created: z.string().optional().describe("Document creation date in ISO format (YYYY-MM-DD or full datetime like '2024-01-19T06:15:00+02:00'). This is the date the document itself was created, not when it was added to Paperless."),
      correspondent: z.number().nullable().optional().describe("ID of the correspondent to assign, or null to clear it. Use list_correspondents to get valid IDs."),
      document_type: z.number().nullable().optional().describe("ID of the document type to assign, or null to clear it. Use list_document_types to get valid IDs."),
      storage_path: z.number().nullable().optional().describe("ID of the storage path to assign, or null to clear it. Use list_storage_paths to get valid IDs."),
      tags: z.array(z.number()).optional().describe("Complete array of tag IDs for the document. This REPLACES the document's existing tags (it is not additive). Use list_tags to get valid IDs, or bulk_edit_documents with add_tag/remove_tag to change tags incrementally."),
      archive_serial_number: z.number().nullable().optional().describe("Archive serial number (an integer) for external filing reference, or null to clear it."),
      owner: z.number().nullable().optional().describe("User ID to set as the document owner, or null to remove ownership."),
      custom_fields: z
        .array(
          z.object({
            field: z.number().describe("Custom field ID (from list_custom_fields)."),
            value: z.any().describe("Value for the field, matching its data_type (string/number/boolean/date string/array of document IDs for documentlink/option id for select)."),
          })
        )
        .optional()
        .describe("Custom field values to set on the document. This REPLACES the document's existing custom field set with the array provided. Each entry is {field: <id>, value: <value>}."),
      add_note: z.string().optional().describe("Text of a note to add to the document. Notes cannot be set through the regular fields; providing this appends a new note via the document's notes sub-resource. Other fields above are still applied in the same call."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const { id, add_note, ...fields } = args;

      // Only send fields that were actually provided so PATCH doesn't clobber
      // unrelated values. (undefined keys are dropped by JSON.stringify, but we
      // filter explicitly to avoid sending an empty-but-present PATCH body and
      // to know whether any document fields were supplied at all.)
      const body: Record<string, any> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) body[key] = value;
      }

      let document: any = undefined;
      if (Object.keys(body).length > 0) {
        document = await api.updateDocument(id, body);
      }

      let note: any = undefined;
      if (add_note !== undefined) {
        note = await api.addDocumentNote(id, add_note);
      }

      if (document === undefined && note === undefined) {
        throw new Error(
          "update_document requires at least one field to change or an add_note value."
        );
      }

      return { document, note };
    }
  );

  server.tool(
    "delete_document",
    "Permanently delete a single document from Paperless-NGX. Depending on your instance settings this may move it to the trash or remove it outright. This cannot be undone from this tool. Use bulk_edit_documents with method 'delete' to remove many documents at once.",
    {
      id: z.number().describe("ID of the document to permanently delete. Get this from search_documents or get_document results. Use with caution."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      await api.deleteDocument(args.id);
      return { deleted: true, id: args.id };
    }
  );

  server.tool(
    "list_documents",
    "List documents using structured metadata filters (correspondent, document type, storage path, tags, dates, archive serial number) rather than full-text search. Use this when you want documents matching exact criteria; use search_documents for free-text/content queries. Returns document metadata WITHOUT the full OCR content field to prevent token overflow.",
    {
      correspondent_id: z.number().optional().describe("Only documents with this correspondent ID. Use list_correspondents to find IDs."),
      document_type_id: z.number().optional().describe("Only documents with this document type ID. Use list_document_types to find IDs."),
      storage_path_id: z.number().optional().describe("Only documents with this storage path ID. Use list_storage_paths to find IDs."),
      tags_all: z.array(z.number()).optional().describe("Only documents that have ALL of these tag IDs."),
      tags_any: z.array(z.number()).optional().describe("Only documents that have ANY of these tag IDs."),
      tags_none: z.array(z.number()).optional().describe("Exclude documents that have any of these tag IDs."),
      is_tagged: z.boolean().optional().describe("true: only documents that have at least one tag; false: only untagged documents."),
      title_contains: z.string().optional().describe("Only documents whose title contains this text (case-insensitive)."),
      content_contains: z.string().optional().describe("Only documents whose OCR content contains this text (case-insensitive)."),
      created_after: z.string().optional().describe("Only documents created on or after this date (YYYY-MM-DD). Refers to the document's own date."),
      created_before: z.string().optional().describe("Only documents created on or before this date (YYYY-MM-DD)."),
      added_after: z.string().optional().describe("Only documents added to Paperless on or after this date (YYYY-MM-DD)."),
      added_before: z.string().optional().describe("Only documents added to Paperless on or before this date (YYYY-MM-DD)."),
      archive_serial_number: z.number().optional().describe("Only the document with this exact archive serial number."),
      ordering: z.string().optional().describe("Sort order, e.g. 'created', '-created' (descending), 'title', '-added', 'archive_serial_number'. Prefix with '-' for descending."),
      page: z.number().optional().describe("Page number for pagination (starts at 1)."),
      page_size: z.number().optional().describe("Number of documents per page (default 25, max 100)."),
      full_perms: z.boolean().optional().describe("When true, include each document's object-level permissions."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      // Map friendly argument names to the Paperless DocumentFilterSet query
      // parameters. Only provided filters are forwarded.
      const fieldMap: Record<string, string> = {
        correspondent_id: "correspondent__id",
        document_type_id: "document_type__id",
        storage_path_id: "storage_path__id",
        tags_all: "tags__id__all",
        tags_any: "tags__id__in",
        tags_none: "tags__id__none",
        is_tagged: "is_tagged",
        title_contains: "title__icontains",
        content_contains: "content__icontains",
        created_after: "created__date__gte",
        created_before: "created__date__lte",
        added_after: "added__date__gte",
        added_before: "added__date__lte",
        archive_serial_number: "archive_serial_number",
        ordering: "ordering",
        page: "page",
        page_size: "page_size",
      };
      const params: Record<string, any> = {};
      for (const [friendly, paperless] of Object.entries(fieldMap)) {
        if ((args as any)[friendly] !== undefined) {
          params[paperless] = (args as any)[friendly];
        }
      }
      if (args.full_perms) params.full_perms = true;
      return api.listDocuments(params);
    }
  );

  server.tool(
    "get_document_suggestions",
    "Get Paperless-NGX's automatic suggestions for a document: candidate correspondents, tags, document types, storage paths, and dates inferred from its content and your matching rules. Returns arrays of IDs (and date strings) you can then apply with update_document or bulk_edit_documents.",
    {
      id: z.number().describe("Document ID to get suggestions for. Get this from search_documents or list_documents."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return api.getDocumentSuggestions(args.id);
    }
  );

  server.tool(
    "get_document_notes",
    "List the notes attached to a document. Returns each note's id, text, creation time, and author. Use update_document (add_note) to add a note and delete_document_note to remove one.",
    {
      id: z.number().describe("Document ID whose notes to list."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return api.getDocumentNotes(args.id);
    }
  );

  server.tool(
    "delete_document_note",
    "Delete a single note from a document by the note's ID. Use get_document_notes to find note IDs.",
    {
      id: z.number().describe("Document ID the note belongs to."),
      note_id: z.number().describe("ID of the note to delete (from get_document_notes)."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      await api.deleteDocumentNote(args.id, args.note_id);
      return { deleted: true, id: args.id, note_id: args.note_id };
    }
  );

  server.tool(
    "get_document_metadata",
    "Get low-level file metadata for a document: original/archive checksums, file sizes, MIME type, media filenames, detected language, and parser-extracted metadata. Useful for verifying file integrity or inspecting the stored files.",
    {
      id: z.number().describe("Document ID to inspect."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return api.getDocumentMetadata(args.id);
    }
  );

  server.tool(
    "get_document_history",
    "Get the audit trail for a document: the chronological list of changes (field modifications, who made them, and when). Requires audit logging to be enabled on the Paperless-NGX server (otherwise the server returns an error).",
    {
      id: z.number().describe("Document ID whose change history to retrieve."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return api.getDocumentHistory(args.id);
    }
  );
}
