import { z } from "zod";
import {
  matchingAlgorithmSchema,
  resolveMatchingAlgorithm,
} from "../utils/matching";

export function registerCorrespondentTools(server, api) {
  server.tool(
    "list_correspondents",
    "Retrieve all available correspondents (people, companies, organizations that send/receive documents). Returns names and automatic matching patterns for document assignment.",
    {
      full_perms: z.boolean().optional().describe("When true, include each correspondent's object-level permissions (owner plus per-user/per-group view and change permissions)."),
    }, async (args, extra) => {
    if (!api) throw new Error("Please configure API connection first");
    return api.getCorrespondents(args.full_perms);
  });

  server.tool(
    "create_correspondent",
    "Create a new correspondent (person, company, or organization) for tracking document senders and receivers. Can include automatic matching patterns for smart assignment to incoming documents.",
    {
      name: z.string().describe("Name of the correspondent (person, company, or organization that sends/receives documents). Examples: 'Bank of America', 'John Smith', 'Electric Company'."),
      match: z.string().optional().describe("Text pattern to automatically assign this correspondent to matching documents. Use names, email addresses, or keywords that appear in documents from this correspondent."),
      matching_algorithm: matchingAlgorithmSchema.optional(),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return api.createCorrespondent({
        ...args,
        matching_algorithm: resolveMatchingAlgorithm(args.matching_algorithm),
      });
    }
  );

  server.tool(
    "update_correspondent",
    "Update an existing correspondent's name, matching rule, or owner. Only the fields you provide are changed (PATCH semantics).",
    {
      id: z.number().describe("ID of the correspondent to update. Use list_correspondents to find valid IDs."),
      name: z.string().optional().describe("New name for the correspondent. Must be unique."),
      match: z.string().optional().describe("New text pattern for automatic assignment. Empty string removes auto-matching."),
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
      return api.updateCorrespondent(id, data);
    }
  );

  server.tool(
    "delete_correspondent",
    "Permanently delete a correspondent. This removes the correspondent from all documents that currently reference it. Use with caution.",
    {
      id: z.number().describe("ID of the correspondent to permanently delete. Use list_correspondents to find valid IDs."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      await api.deleteCorrespondent(args.id);
      return { deleted: true, id: args.id };
    }
  );

  server.tool(
    "bulk_edit_correspondents",
    "Perform bulk operations on multiple correspondents: set permissions to control who can assign them to documents, or permanently delete multiple correspondents. Use with caution as deletion affects all associated documents.",
    {
      correspondent_ids: z.array(z.number()).describe("Array of correspondent IDs to perform bulk operations on. Use list_correspondents to get valid correspondent IDs."),
      operation: z.enum(["set_permissions", "delete"]).describe("Bulk operation: 'set_permissions' to control who can assign these correspondents to documents, 'delete' to permanently remove correspondents from the system. Warning: Deleting correspondents will remove them from all associated documents."),
      owner: z.number().optional().describe("User ID to set as owner when operation is 'set_permissions'. The owner has full control over these correspondents."),
      permissions: z
        .object({
          view: z.object({
            users: z.array(z.number()).optional().describe("User IDs who can see and assign these correspondents to documents"),
            groups: z.array(z.number()).optional().describe("Group IDs who can see and assign these correspondents to documents"),
          }).describe("Users and groups with permission to view and use these correspondents"),
          change: z.object({
            users: z.array(z.number()).optional().describe("User IDs who can modify correspondent details (name, matching rules)"),
            groups: z.array(z.number()).optional().describe("Group IDs who can modify correspondent details"),
          }).describe("Users and groups with permission to edit these correspondent settings"),
        })
        .optional().describe("Permission settings when operation is 'set_permissions'. Defines who can view/assign and modify these correspondents."),
      merge: z.boolean().optional().describe("Whether to merge with existing permissions (true) or replace them entirely (false). Default is false."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return api.bulkEditObjects(
        args.correspondent_ids,
        "correspondents",
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
