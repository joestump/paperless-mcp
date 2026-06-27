import { z } from "zod";

export function registerCustomFieldTools(server, api) {
  server.tool(
    "list_custom_fields",
    "Retrieve all custom fields. Custom fields store typed extra metadata on documents (e.g. an invoice number, a due date, a monetary amount). Returns each field's ID, name, data_type, and extra_data (e.g. select options). Use the returned IDs with post_document, update_document, or bulk_edit_documents (modify_custom_fields).",
    {
      // No parameters - returns all custom fields
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");
      return api.getCustomFields();
    }
  );

  server.tool(
    "create_custom_field",
    "Create a new custom field for storing typed metadata on documents. Choose a data_type that matches the kind of value you'll store. For 'select' fields, provide the list of selectable options; for 'monetary' fields you may set a default currency.",
    {
      name: z.string().describe("Unique name for the custom field (e.g. 'Invoice Number', 'Due Date', 'Amount')."),
      data_type: z
        .enum([
          "string",
          "longtext",
          "url",
          "date",
          "boolean",
          "integer",
          "float",
          "monetary",
          "documentlink",
          "select",
        ])
        .describe("The type of value this field stores: 'string' (short text, max 128 chars), 'longtext' (multi-line text), 'url' (a URL), 'date' (a calendar date), 'boolean' (true/false), 'integer' (whole number), 'float' (decimal number), 'monetary' (currency amount), 'documentlink' (links to other documents by ID), 'select' (one choice from a fixed list of options — requires select_options)."),
      select_options: z
        .array(z.string())
        .optional()
        .describe("Required when data_type is 'select': the list of selectable option labels (e.g. ['Low', 'Medium', 'High']). Paperless assigns each option a stable ID automatically. Ignored for other data types."),
      default_currency: z
        .string()
        .optional()
        .describe("Optional 3-letter ISO currency code (e.g. 'USD', 'EUR') used as the default for a 'monetary' field. Ignored for other data types."),
      extra_data: z
        .record(z.string(), z.any())
        .optional()
        .describe("Escape hatch for raw extra_data not covered by select_options/default_currency. Merged with those when provided. Most callers do not need this."),
    },
    async (args, extra) => {
      if (!api) throw new Error("Please configure API connection first");

      // Build the extra_data object the API expects from the friendly inputs.
      // select_options -> [{label}] (Paperless fills in each option's id);
      // default_currency -> {default_currency}. A raw extra_data object can
      // still be supplied and is merged underneath.
      const extra_data: Record<string, any> = { ...(args.extra_data ?? {}) };
      if (args.select_options !== undefined) {
        extra_data.select_options = args.select_options.map((label) => ({
          label,
        }));
      }
      if (args.default_currency !== undefined) {
        extra_data.default_currency = args.default_currency;
      }

      const payload: Record<string, any> = {
        name: args.name,
        data_type: args.data_type,
      };
      if (Object.keys(extra_data).length > 0) {
        payload.extra_data = extra_data;
      }

      return api.createCustomField(payload);
    }
  );
}
