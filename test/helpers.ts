import { vi } from "vitest";

export interface CapturedTool {
  description: string;
  schema: Record<string, any>;
  handler: (args: any, extra?: any) => any;
}

// Register a domain's tools against a stub MCP server that just records each
// tool's description, zod schema, and handler so tests can invoke handlers
// directly with a fake api (no network).
export function captureTools(
  register: (server: any, api: any) => void,
  api: any
): Record<string, CapturedTool> {
  const tools: Record<string, CapturedTool> = {};
  const server = {
    tool(name: string, description: string, schema: any, handler: any) {
      tools[name] = { description, schema, handler };
    },
  };
  register(server, api);
  return tools;
}

// A fake PaperlessAPI whose methods are vi.fn() spies returning benign values.
// Override individual methods per test as needed.
export function fakeApi(overrides: Record<string, any> = {}) {
  return {
    bulkEditDocuments: vi.fn(async () => ({ ok: true })),
    postDocument: vi.fn(async () => ({ task_id: "uuid-1" })),
    updateDocument: vi.fn(async () => ({ id: 1, title: "updated" })),
    addDocumentNote: vi.fn(async () => ({ id: 99 })),
    deleteDocument: vi.fn(async () => null),
    searchDocuments: vi.fn(async () => ({ results: [] })),
    getSimilarDocuments: vi.fn(async () => ({ results: [] })),
    getAutocomplete: vi.fn(async () => ["invoice"]),
    getDocument: vi.fn(async () => ({ id: 1 })),
    downloadDocument: vi.fn(),
    getTags: vi.fn(async () => []),
    createTag: vi.fn(async () => ({ id: 1 })),
    updateTag: vi.fn(async () => ({ id: 1 })),
    deleteTag: vi.fn(async () => null),
    getCorrespondents: vi.fn(async () => []),
    createCorrespondent: vi.fn(async () => ({ id: 1 })),
    updateCorrespondent: vi.fn(async () => ({ id: 1 })),
    deleteCorrespondent: vi.fn(async () => null),
    getDocumentTypes: vi.fn(async () => []),
    createDocumentType: vi.fn(async () => ({ id: 1 })),
    updateDocumentType: vi.fn(async () => ({ id: 1 })),
    deleteDocumentType: vi.fn(async () => null),
    getStoragePaths: vi.fn(async () => []),
    createStoragePath: vi.fn(async () => ({ id: 1 })),
    getCustomFields: vi.fn(async () => []),
    createCustomField: vi.fn(async () => ({ id: 1 })),
    getTasks: vi.fn(async () => []),
    bulkEditObjects: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}
