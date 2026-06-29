import { describe, it, expect, vi } from "vitest";
import { registerDocumentTools } from "../src/tools/documents";
import { captureTools, fakeApi } from "./helpers";

function docTools(api = fakeApi()) {
  return { tools: captureTools(registerDocumentTools, api), api };
}

describe("bulk_edit_documents pages handling", () => {
  it("expands a delete_pages list into integers", async () => {
    const { tools, api } = docTools();
    await tools.bulk_edit_documents.handler({
      documents: [1],
      method: "delete_pages",
      pages: "2, 3, 4",
    });
    expect(api.bulkEditDocuments).toHaveBeenCalledWith([1], "delete_pages", {
      pages: [2, 3, 4],
    });
  });

  it("rejects ranges for delete_pages", async () => {
    const { tools } = docTools();
    await expect(
      tools.bulk_edit_documents.handler({
        documents: [1],
        method: "delete_pages",
        pages: "5-7",
      })
    ).rejects.toThrow(/ranges/i);
  });

  it("requires pages for delete_pages", async () => {
    const { tools } = docTools();
    await expect(
      tools.bulk_edit_documents.handler({ documents: [1], method: "delete_pages" })
    ).rejects.toThrow(/requires/i);
  });

  it("forwards the raw page string untouched for split", async () => {
    const { tools, api } = docTools();
    await tools.bulk_edit_documents.handler({
      documents: [1],
      method: "split",
      pages: "1,3,5-7",
    });
    expect(api.bulkEditDocuments).toHaveBeenCalledWith([1], "split", {
      pages: "1,3,5-7",
    });
  });
});

describe("bulk_edit_documents edit_pdf validation", () => {
  it("requires exactly one document", async () => {
    const { tools } = docTools();
    await expect(
      tools.bulk_edit_documents.handler({
        documents: [1, 2],
        method: "edit_pdf",
        operations: [{ page: 1 }],
      })
    ).rejects.toThrow(/one document/i);
  });

  it("requires a non-empty operations array", async () => {
    const { tools } = docTools();
    await expect(
      tools.bulk_edit_documents.handler({
        documents: [1],
        method: "edit_pdf",
        operations: [],
      })
    ).rejects.toThrow(/operations/i);
  });

  it("passes a valid edit_pdf request through", async () => {
    const { tools, api } = docTools();
    const operations = [{ page: 1, doc: 0 }, { page: 2, rotate: 90, doc: 1 }];
    await tools.bulk_edit_documents.handler({
      documents: [1],
      method: "edit_pdf",
      operations,
    });
    expect(api.bulkEditDocuments).toHaveBeenCalledWith(
      [1],
      "edit_pdf",
      expect.objectContaining({ operations })
    );
  });
});

describe("bulk_edit_documents set_permissions", () => {
  it("flattens permissions to the top level of parameters", async () => {
    const { tools, api } = docTools();
    await tools.bulk_edit_documents.handler({
      documents: [1],
      method: "set_permissions",
      permissions: { owner: 5, merge: true },
    });
    const params = api.bulkEditDocuments.mock.calls[0][2];
    expect(params).toMatchObject({ owner: 5, merge: true });
    expect(params).not.toHaveProperty("permissions");
  });
});

describe("post_document custom_fields", () => {
  it("passes the object form through to the api unchanged", async () => {
    const { tools, api } = docTools();
    await tools.post_document.handler({
      file: Buffer.from("data").toString("base64"),
      filename: "a.pdf",
      custom_fields: { "3": "v" },
    });
    const metadata = api.postDocument.mock.calls[0][1];
    expect(metadata.custom_fields).toEqual({ "3": "v" });
  });
});

describe("update_document", () => {
  it("PATCHes only the provided fields", async () => {
    const { tools, api } = docTools();
    await tools.update_document.handler({ id: 7, title: "New" });
    expect(api.updateDocument).toHaveBeenCalledWith(7, { title: "New" });
    expect(api.addDocumentNote).not.toHaveBeenCalled();
  });

  it("adds a note via the notes sub-resource without a PATCH when only add_note is given", async () => {
    const { tools, api } = docTools();
    await tools.update_document.handler({ id: 7, add_note: "hello" });
    expect(api.addDocumentNote).toHaveBeenCalledWith(7, "hello");
    expect(api.updateDocument).not.toHaveBeenCalled();
  });

  it("applies fields and adds a note in one call", async () => {
    const { tools, api } = docTools();
    await tools.update_document.handler({ id: 7, title: "T", add_note: "n" });
    expect(api.updateDocument).toHaveBeenCalledWith(7, { title: "T" });
    expect(api.addDocumentNote).toHaveBeenCalledWith(7, "n");
  });

  it("throws when neither a field nor a note is supplied", async () => {
    const { tools } = docTools();
    await expect(tools.update_document.handler({ id: 7 })).rejects.toThrow(
      /at least one/i
    );
  });

  it("does NOT throw when a real update returns an empty (204) body", async () => {
    // Regression guard: the 'at least one change' check keys off whether an
    // operation was *requested* (body had fields), not the response value.
    // A successful PATCH that returns null must still resolve, so the guard
    // must use === undefined, not == null.
    const api = fakeApi({ updateDocument: vi.fn(async () => null) });
    const { tools } = docTools(api);
    const res = await tools.update_document.handler({ id: 7, title: "New" });
    expect(api.updateDocument).toHaveBeenCalledWith(7, { title: "New" });
    expect(res).toEqual({ document: null, note: undefined });
  });
});

describe("search_documents", () => {
  it("requires query or custom_field_query", async () => {
    const { tools } = docTools();
    await expect(tools.search_documents.handler({})).rejects.toThrow(
      /at least one/i
    );
  });

  it("stringifies an array custom_field_query", async () => {
    const { tools, api } = docTools();
    await tools.search_documents.handler({
      custom_field_query: ["Status", "exact", "Paid"],
    });
    expect(api.searchDocuments).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      JSON.stringify(["Status", "exact", "Paid"]),
      undefined
    );
  });

  it("passes a pre-stringified custom_field_query unchanged", async () => {
    const { tools, api } = docTools();
    await tools.search_documents.handler({
      query: "x",
      custom_field_query: '["a","exists",true]',
    });
    expect(api.searchDocuments).toHaveBeenCalledWith(
      "x",
      undefined,
      undefined,
      '["a","exists",true]',
      undefined
    );
  });
});

describe("download_document size guard", () => {
  function responseWith(contentLength: string | null, bytes: number) {
    return {
      headers: {
        get: (k: string) =>
          k.toLowerCase() === "content-length" ? contentLength : null,
      },
      arrayBuffer: async () => new ArrayBuffer(bytes),
    };
  }

  it("rejects when content-length exceeds the limit", async () => {
    const api = fakeApi({
      downloadDocument: async () => responseWith("99999999", 8),
    });
    const { tools } = docTools(api);
    await expect(
      tools.download_document.handler({ id: 1, max_bytes: 1000 })
    ).rejects.toThrow(/exceeds/i);
  });

  it("rejects oversized bodies even without content-length", async () => {
    const api = fakeApi({
      downloadDocument: async () => responseWith(null, 5000),
    });
    const { tools } = docTools(api);
    await expect(
      tools.download_document.handler({ id: 1, max_bytes: 1000 })
    ).rejects.toThrow(/exceeds/i);
  });

  it("returns base64 for files within the limit", async () => {
    const api = fakeApi({
      downloadDocument: async () => responseWith("4", 4),
    });
    const { tools } = docTools(api);
    const res = await tools.download_document.handler({ id: 1 });
    expect(res.blob).toBe(Buffer.from(new ArrayBuffer(4)).toString("base64"));
    expect(res.filename).toBe("document-1");
  });
});

describe("list_documents structured filtering", () => {
  it("maps friendly args to Paperless filter query params", async () => {
    const { tools, api } = docTools();
    await tools.list_documents.handler({
      correspondent_id: 2,
      document_type_id: 3,
      storage_path_id: 4,
      tags_all: [1, 2],
      tags_any: [5],
      tags_none: [9],
      is_tagged: true,
      title_contains: "invoice",
      content_contains: "total",
      created_after: "2024-01-01",
      created_before: "2024-12-31",
      added_after: "2024-02-01",
      added_before: "2024-11-30",
      archive_serial_number: 42,
      ordering: "-created",
      page: 2,
      page_size: 50,
      full_perms: true,
    });
    expect(api.listDocuments).toHaveBeenCalledWith({
      correspondent__id: 2,
      document_type__id: 3,
      storage_path__id: 4,
      tags__id__all: [1, 2],
      tags__id__in: [5],
      tags__id__none: [9],
      is_tagged: true,
      title__icontains: "invoice",
      content__icontains: "total",
      created__date__gte: "2024-01-01",
      created__date__lte: "2024-12-31",
      added__date__gte: "2024-02-01",
      added__date__lte: "2024-11-30",
      archive_serial_number: 42,
      ordering: "-created",
      page: 2,
      page_size: 50,
      full_perms: true,
    });
  });

  it("omits unspecified filters", async () => {
    const { tools, api } = docTools();
    await tools.list_documents.handler({ correspondent_id: 7 });
    expect(api.listDocuments).toHaveBeenCalledWith({ correspondent__id: 7 });
  });
});

describe("Tier 2 document detail tools", () => {
  it("get_document_suggestions forwards the id", async () => {
    const { tools, api } = docTools();
    await tools.get_document_suggestions.handler({ id: 5 });
    expect(api.getDocumentSuggestions).toHaveBeenCalledWith(5);
  });

  it("get_document_notes forwards the id", async () => {
    const { tools, api } = docTools();
    await tools.get_document_notes.handler({ id: 5 });
    expect(api.getDocumentNotes).toHaveBeenCalledWith(5);
  });

  it("delete_document_note forwards id and note_id and reports deletion", async () => {
    const { tools, api } = docTools();
    const res = await tools.delete_document_note.handler({ id: 5, note_id: 8 });
    expect(api.deleteDocumentNote).toHaveBeenCalledWith(5, 8);
    expect(res).toEqual({ deleted: true, id: 5, note_id: 8 });
  });

  it("get_document_metadata forwards the id", async () => {
    const { tools, api } = docTools();
    await tools.get_document_metadata.handler({ id: 5 });
    expect(api.getDocumentMetadata).toHaveBeenCalledWith(5);
  });

  it("get_document_history forwards the id", async () => {
    const { tools, api } = docTools();
    await tools.get_document_history.handler({ id: 5 });
    expect(api.getDocumentHistory).toHaveBeenCalledWith(5);
  });
});

describe("get_document and search helpers pass full_perms", () => {
  it("threads full_perms into get_document", async () => {
    const { tools, api } = docTools();
    await tools.get_document.handler({ id: 3, full_perms: true });
    expect(api.getDocument).toHaveBeenCalledWith(3, true);
  });

  it("find_similar_documents forwards id/page/page_size", async () => {
    const { tools, api } = docTools();
    await tools.find_similar_documents.handler({ id: 9, page: 2, page_size: 5 });
    expect(api.getSimilarDocuments).toHaveBeenCalledWith(9, 2, 5);
  });

  it("autocomplete_search forwards term and limit", async () => {
    const { tools, api } = docTools();
    await tools.autocomplete_search.handler({ term: "inv", limit: 3 });
    expect(api.getAutocomplete).toHaveBeenCalledWith("inv", 3);
  });
});
