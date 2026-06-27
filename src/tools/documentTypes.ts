import { z } from "zod";
import {
  matchingAlgorithmSchema,
  resolveMatchingAlgorithm,
} from "../utils/matching";

export function registerDocumentTypeTools(server, api) {
  server.tool(
    "list_document_types",
    "Retrieve all available document types for categorizing documents by purpose or format (Invoice, Receipt, Contract, etc.). Returns names and automatic matching rules.",
    {
      full_perms: z.boolean().optional().describe("When true, include each document type's object-level permissions (owner plus per-user/per-group view and change permissions)."),
    }, async (args, extra) => {
    if (!api) throw new Error("Please configure API connection first");
    return api.getDocumentTypes(args.full_perms);
  });

  server.tool(
    "create_document_type",
    "Create a new document type for categorizing documents by their purpose or format (e.g., Invoice, Receipt, Contract). Can include automatic matching rules for smart classification.",
    {
      name: z.string().describe("Name of the document type for categorizing documents by their purpose or format. Examples: 'Invoice', 'Receipt', 'Contract', 'Letter', 'Bank Statement', 'Tax Document'."),
      match: z.string().optional().describe("Text pattern to automatically assign this document type to matching documents. Use keywords that commonly appear in this type of document (e.g., 'invoice', 'receipt', 'contract terms')."),
      matching_algorithm: matchingAlgorithmSchema.optional(),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return api.createDocumentType({
        ...args,
        matching_algorithm: resolveMatchingAlgorithm(args.matching_algorithm),
      });
    }
  );

  server.tool(
    "update_document_type",
    "Update an existing document type's name, matching rule, or owner. Only the fields you provide are changed (PATCH semantics).",
    {
      id: z.number().describe("ID of the document type to update. Use list_document_types to find valid IDs."),
      name: z.string().optional().describe("New name for the document type. Must be unique."),
      match: z.string().optional().describe("New text pattern for automatic classification. Empty string removes auto-matching."),
      matching_algorithm: matchingAlgorithmSchema.optional(),
      is_insensitive: z.boolean().optional().describe("Whether text matching is case-insensitive."),
      owner: z.number().nullable().optional().describe("User ID to set as owner, or null to remove ownership."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      const { id, matching_algorithm, ...rest } = args;
      const data: Record<string, any> = { ...rest };
      if (matching_algorithm !== undefined) {
        data.matching_algorithm = resolveMatchingAlgorithm(matching_algorithm);
      }
      return api.updateDocumentType(id, data);
    }
  );

  server.tool(
    "delete_document_type",
    "Permanently delete a document type. This removes the type classification from all documents that currently use it. Use with caution.",
    {
      id: z.number().describe("ID of the document type to permanently delete. Use list_document_types to find valid IDs."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      await api.deleteDocumentType(args.id);
      return { deleted: true, id: args.id };
    }
  );

  server.tool(
    "bulk_edit_document_types",
    "Perform bulk operations on multiple document types: set permissions to control who can assign them to documents, or permanently delete multiple types. Use with caution as deletion affects all associated documents.",
    {
      document_type_ids: z.array(z.number()).describe("Array of document type IDs to perform bulk operations on. Use list_document_types to get valid document type IDs."),
      operation: z.enum(["set_permissions", "delete"]).describe("Bulk operation: 'set_permissions' to control who can assign these document types to documents, 'delete' to permanently remove document types from the system. Warning: Deleting document types will remove the classification from all associated documents."),
      owner: z.number().optional().describe("User ID to set as owner when operation is 'set_permissions'. The owner has full control over these document types."),
      permissions: z
        .object({
          view: z.object({
            users: z.array(z.number()).optional().describe("User IDs who can see and assign these document types to documents"),
            groups: z.array(z.number()).optional().describe("Group IDs who can see and assign these document types to documents"),
          }).describe("Users and groups with permission to view and use these document types for categorization"),
          change: z.object({
            users: z.array(z.number()).optional().describe("User IDs who can modify document type details (name, matching rules)"),
            groups: z.array(z.number()).optional().describe("Group IDs who can modify document type details"),
          }).describe("Users and groups with permission to edit these document type settings"),
        })
        .optional().describe("Permission settings when operation is 'set_permissions'. Defines who can view/assign and modify these document types."),
      merge: z.boolean().optional().describe("Whether to merge with existing permissions (true) or replace them entirely (false). Default is false."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return api.bulkEditObjects(
        args.document_type_ids,
        "document_types",
        args.operation,
        args.operation === "set_permissions"
          ? {
              owner: args.owner,
              permissions: args.permissions,
              merge: args.merge,
            }
          : {}
      );
    }
  );
}
