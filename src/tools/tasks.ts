import { z } from "zod";

export function registerTaskTools(server, api) {
  server.tool(
    "get_task",
    "Look up the status and result of a Paperless-NGX background task by its Celery task UUID. Use this to poll the outcome of post_document, which returns only a task UUID: a finished consumption task reports status (PENDING/STARTED/SUCCESS/FAILURE), a result message, and (on success) related_document — the ID of the newly created document. Without a task_id, returns recent tasks.",
    {
      task_id: z
        .string()
        .optional()
        .describe("The Celery task UUID to look up (the value returned by post_document). If omitted, returns the list of recent tasks. Returns task objects with status, result, related_document (the created document's ID on success), and timestamps."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return api.getTasks(args.task_id);
    }
  );
}
