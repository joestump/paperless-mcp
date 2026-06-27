import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { PaperlessAPI } from "../src/api/PaperlessAPI";

describe("PaperlessAPI.request", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null on 204 No Content (e.g. DELETE)", async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 204 })) as any;
    const api = new PaperlessAPI("http://x", "t");
    expect(await api.request("/documents/1/", { method: "DELETE" })).toBeNull();
  });

  it("returns null on an empty 200 body instead of throwing", async () => {
    global.fetch = vi.fn(async () => new Response("", { status: 200 })) as any;
    const api = new PaperlessAPI("http://x", "t");
    expect(await api.request("/x/")).toBeNull();
  });

  it("parses a JSON body", async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ a: 1 }), { status: 200 })
    ) as any;
    const api = new PaperlessAPI("http://x", "t");
    expect(await api.request("/x/")).toEqual({ a: 1 });
  });

  it("throws on a non-ok status, surfacing the code", async () => {
    global.fetch = vi.fn(
      async () => new Response("<html>nope</html>", { status: 500 })
    ) as any;
    const api = new PaperlessAPI("http://x", "t");
    await expect(api.request("/x/")).rejects.toThrow(/500/);
  });

  it("sends the Accept header pinned to API version 7 and a token", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    global.fetch = f as any;
    const api = new PaperlessAPI("http://x", "tok");
    await api.request("/x/");
    const opts: any = f.mock.calls[0][1];
    expect(opts.headers.Accept).toContain("version=7");
    expect(opts.headers.Authorization).toBe("Token tok");
  });
});

describe("PaperlessAPI query construction", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  function captureUrl() {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    global.fetch = f as any;
    return () => String(f.mock.calls[0][0]);
  }

  it("appends full_perms=true only when requested", async () => {
    let url = captureUrl();
    let api = new PaperlessAPI("http://x", "t");
    await api.getTags(true);
    expect(url()).toContain("/tags/?full_perms=true");

    url = captureUrl();
    api = new PaperlessAPI("http://x", "t");
    await api.getTags();
    expect(url()).toMatch(/\/tags\/$/);
  });

  it("builds search params and passes custom_field_query through", async () => {
    const url = captureUrl();
    const api = new PaperlessAPI("http://x", "t");
    await api.searchDocuments("invoice", 2, 10, '["x","exact","y"]', true);
    const u = url();
    expect(u).toContain("query=invoice");
    expect(u).toContain("page=2");
    expect(u).toContain("page_size=10");
    expect(u).toContain("custom_field_query=");
    expect(u).toContain("full_perms=true");
  });

  it("omits the query param when no full-text query is given", async () => {
    const url = captureUrl();
    const api = new PaperlessAPI("http://x", "t");
    await api.searchDocuments(undefined, undefined, undefined, '["x","exists",true]');
    const params = new URL(url()).searchParams;
    expect(params.has("query")).toBe(false);
    expect(params.has("custom_field_query")).toBe(true);
  });

  it("encodes the more_like_id similarity query", async () => {
    const url = captureUrl();
    const api = new PaperlessAPI("http://x", "t");
    await api.getSimilarDocuments(42);
    expect(url()).toContain("more_like_id=42");
  });
});

describe("PaperlessAPI.postDocument custom_fields encoding", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends custom_fields as a single JSON field, not repeated scalars", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    global.fetch = f as any;
    const api = new PaperlessAPI("http://x", "t");
    const file = new File([new Blob(["hi"])], "a.txt");
    await api.postDocument(file, { custom_fields: { "3": "2024-01-01", "4": 42 } });

    const body: FormData = f.mock.calls[0][1].body;
    const values = body.getAll("custom_fields");
    expect(values).toHaveLength(1);
    expect(JSON.parse(values[0] as string)).toEqual({ "3": "2024-01-01", "4": 42 });
  });
});
