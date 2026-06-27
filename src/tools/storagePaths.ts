import { z } from "zod";
import {
  matchingAlgorithmSchema,
  resolveMatchingAlgorithm,
} from "../utils/matching";

export function registerStoragePathTools(server, api) {
  server.tool(
    "list_storage_paths",
    "Retrieve all storage paths. Storage paths control where a document's files are stored on disk using a path template (e.g. '{correspondent}/{created_year}'). Returns each path's ID, name, template, and matching rules. Use the returned IDs with post_document, update_document, or bulk_edit_documents (set_storage_path).",
    {
      // No parameters - returns all storage paths
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return api.getStoragePaths();
    }
  );

  server.tool(
    "create_storage_path",
    "Create a new storage path. A storage path defines, via a template, where Paperless stores a document's files (and optionally an automatic matching rule so documents are filed there automatically).",
    {
      name: z.string().describe("Human-readable name for the storage path (e.g. 'By correspondent and year'). Must be unique."),
      path: z.string().describe("Path template controlling the on-disk location, using Paperless placeholders such as {correspondent}, {document_type}, {created_year}, {title}, {asn}. Example: '{correspondent}/{created_year}/{title}'. Do not include a leading slash or file extension."),
      match: z.string().optional().describe("Text pattern used to automatically assign this storage path to matching documents. Interpreted according to matching_algorithm."),
      matching_algorithm: matchingAlgorithmSchema.optional(),
      is_insensitive: z.boolean().optional().describe("Whether text matching is case-insensitive. Defaults to true in Paperless."),
      owner: z.number().nullable().optional().describe("User ID to set as the owner of this storage path, or null for no owner. Defaults to the requesting user."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return api.createStoragePath({
        ...args,
        matching_algorithm: resolveMatchingAlgorithm(args.matching_algorithm),
      });
    }
  );
}
