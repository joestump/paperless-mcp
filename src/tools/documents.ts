import { z } from "zod";

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
      ]).describe("The bulk operation to perform: set_correspondent (assign sender/receiver), set_document_type (categorize documents), set_storage_path (organize file location), add_tag/remove_tag/modify_tags (manage labels), delete (permanently remove), reprocess (re-run OCR/indexing), set_permissions (control access), merge (combine documents), split (separate into multiple), rotate (adjust orientation), delete_pages (remove specific pages)"),
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
      custom_fields: z.array(z.number()).optional().describe("Array of custom field IDs to associate with this document. Custom fields store additional metadata."),
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
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return api.getDocument(args.id);
    }
  );

  server.tool(
    "search_documents",
    "Search through documents using full-text search across content, titles, tags, and metadata. Returns document metadata WITHOUT the full OCR content field to prevent token overflow. Use get_document to retrieve full details for specific documents of interest. Supports Paperless-NGX advanced query syntax.",
    {
      query: z.string().describe("Search query using Paperless-NGX syntax. By default, matches documents containing ALL words. Advanced syntax: Field searches: 'tag:unpaid', 'type:invoice', 'correspondent:university'. Logical operators: 'term1 AND (term2 OR term3)'. Date ranges: 'created:[2020 to 2024]', 'added:yesterday', 'modified:today'. Wildcards: 'prod*name'. Combine multiple criteria as needed. Search looks through document content, title, correspondent, type, and tags."),
      page: z.number().optional().describe("Page number for pagination (starts at 1). Use to browse through large result sets without hitting token limits."),
      page_size: z.number().optional().describe("Number of documents per page (default 25, max 100). Smaller page sizes help avoid token limits when many documents match."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return api.searchDocuments(args.query, args.page, args.page_size);
    }
  );

  server.tool(
    "download_document",
    "Download a document file as base64-encoded data. Choose between original uploaded file or processed/archived version with OCR improvements.",
    {
      id: z.number().describe("Document ID to download. Get this from search_documents or get_document results."),
      original: z.boolean().optional().describe("Whether to download the original uploaded file (true) or the processed/archived version (false, default). Original files preserve exact formatting but may not include OCR improvements."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const response = await api.downloadDocument(args.id, args.original);
      return {
        blob: Buffer.from(await response.arrayBuffer()).toString("base64"),
        filename: parseContentDispositionFilename(
          response.headers.get("content-disposition"),
          `document-${args.id}`
        ),
      };
    }
  );
}
