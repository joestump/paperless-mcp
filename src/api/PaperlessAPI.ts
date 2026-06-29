export class PaperlessAPI {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  // Pinned Paperless-NGX REST API version, sent via the Accept header.
  //
  // The API is versioned through `Accept: application/json; version=N`. We pin
  // to 7 rather than the previous 5 because:
  //   - v7 introduced the current custom-field "select" format (options became
  //     objects with stable ids instead of bare strings); the custom-field
  //     tools in this server assume that shape.
  //   - Everything used by the pre-existing tools is stable across 5→7 (hex
  //     `color` on tags, FTS query params, download params, bulk_edit
  //     contracts), so the bump is backwards compatible for them.
  // The server changelog currently advertises up to v9; we pin to the lowest
  // version that supports every feature here so older Paperless instances that
  // don't yet speak v8/v9 still work.
  private static readonly API_VERSION = 7;

  async request(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}/api${path}`;
    const headers = {
      Authorization: `Token ${this.token}`,
      Accept: `application/json; version=${PaperlessAPI.API_VERSION}`,
      "Content-Type": "application/json",
      "Accept-Language": "en-US,en;q=0.9",
    };

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      // The error body is not guaranteed to be JSON (e.g. a gateway HTML page
      // or an empty body), so read it as text once and parse defensively.
      // This never lets the diagnostic logging mask the underlying HTTP status.
      const raw = await response.text().catch(() => "");
      let body: unknown = raw;
      try {
        body = JSON.parse(raw);
      } catch {
        // Not JSON — keep the raw text for the log.
      }
      console.error({
        error: "Error executing request",
        url,
        options,
        status: response.status,
        response: body,
      });
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // DELETE and some actions return 204 No Content (or an otherwise empty
    // body); calling response.json() on those throws a SyntaxError. Read the
    // body as text once and only parse when there's something to parse.
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  // Document operations
  async bulkEditDocuments(documents, method, parameters = {}) {
    return this.request("/documents/bulk_edit/", {
      method: "POST",
      body: JSON.stringify({
        documents,
        method,
        parameters,
      }),
    });
  }

  async postDocument(
    file: File,
    metadata: Record<string, any> = {}
  ) {
    const formData = new FormData();
    formData.append("document", file);

    // Add optional metadata fields
    if (metadata.title) formData.append("title", metadata.title);
    if (metadata.created) formData.append("created", metadata.created);
    if (metadata.correspondent)
      formData.append("correspondent", metadata.correspondent);
    if (metadata.document_type)
      formData.append("document_type", metadata.document_type);
    if (metadata.storage_path)
      formData.append("storage_path", metadata.storage_path);
    if (metadata.tags) {
      (metadata.tags as string[]).forEach((tag) =>
        formData.append("tags", tag)
      );
    }
    if (metadata.archive_serial_number) {
      formData.append("archive_serial_number", metadata.archive_serial_number);
    }
    if (metadata.custom_fields) {
      // PostDocumentSerializer.custom_fields is a JSONField. A multipart
      // QueryDict only keeps the last value for a non-relational key, so
      // appending each id as a separate field silently drops all but one.
      // Send the whole value as a single JSON-encoded field instead. The
      // serializer accepts a list of ids ([1,2]) or a {field_id: value} map.
      formData.append("custom_fields", JSON.stringify(metadata.custom_fields));
    }

    const response = await fetch(
      `${this.baseUrl}/api/documents/post_document/`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${this.token}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async getDocuments(query = "") {
    return this.request(`/documents/${query}`);
  }

  async getDocument(id, fullPerms = false) {
    const query = fullPerms ? "?full_perms=true" : "";
    return this.request(`/documents/${id}/${query}`);
  }

  // List documents with structured filtering (correspondent/type/tags/dates/
  // ASN/ordering), as opposed to the full-text searchDocuments path. Each
  // key in `params` is a Paperless filter query parameter; array values are
  // sent comma-separated and undefined/null values are omitted.
  async listDocuments(params: Record<string, any> = {}) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      search.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    const qs = search.toString();
    const response: any = await this.request(
      `/documents/${qs ? `?${qs}` : ""}`
    );
    return this.stripDocumentListResponse(response);
  }

  // Document detail sub-resources.
  async getDocumentSuggestions(id) {
    return this.request(`/documents/${id}/suggestions/`);
  }

  async getDocumentMetadata(id) {
    return this.request(`/documents/${id}/metadata/`);
  }

  async getDocumentHistory(id) {
    return this.request(`/documents/${id}/history/`);
  }

  async getDocumentNotes(id) {
    return this.request(`/documents/${id}/notes/`);
  }

  // Strip the bulky/duplicative fields (full OCR content, long URLs) from a
  // documents list response so results don't blow the context window. Shared
  // by every list path that returns whole documents.
  private stripDocumentListResponse(response: any) {
    if (response && response.results) {
      response.results = response.results.map((doc: any) => {
        const { content, download_url, thumbnail_url, ...rest } = doc;
        return { ...rest, id: doc.id };
      });
    }
    return response;
  }

  async searchDocuments(
    query?: string,
    page?: number,
    pageSize?: number,
    customFieldQuery?: string,
    fullPerms = false
  ) {
    const params = new URLSearchParams();
    // Both query and custom_field_query are optional individually; the documents
    // endpoint accepts either or both. An empty query string is omitted so we
    // don't send a meaningless empty full-text search.
    if (query) params.set("query", query);
    if (customFieldQuery) params.set("custom_field_query", customFieldQuery);
    if (page) params.set("page", page.toString());
    if (pageSize) params.set("page_size", pageSize.toString());
    if (fullPerms) params.set("full_perms", "true");

    const response: any = await this.request(`/documents/?${params.toString()}`);
    return this.stripDocumentListResponse(response);
  }

  // Find documents similar to a given document using the search backend's
  // "more like this" feature (/api/documents/?more_like_id=<id>).
  async getSimilarDocuments(id: number, page?: number, pageSize?: number) {
    const params = new URLSearchParams();
    params.set("more_like_id", id.toString());
    if (page) params.set("page", page.toString());
    if (pageSize) params.set("page_size", pageSize.toString());

    const response: any = await this.request(`/documents/?${params.toString()}`);
    return this.stripDocumentListResponse(response);
  }

  async downloadDocument(id, asOriginal = false) {
    const query = asOriginal ? "?original=true" : "";
    const response = await fetch(
      `${this.baseUrl}/api/documents/${id}/download/${query}`,
      {
        headers: {
          Authorization: `Token ${this.token}`,
        },
      }
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response;
  }

  // Tag operations
  async getTags(fullPerms = false) {
    return this.request(`/tags/${fullPerms ? "?full_perms=true" : ""}`);
  }

  async createTag(data) {
    return this.request("/tags/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateTag(id, data) {
    return this.request(`/tags/${id}/`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteTag(id) {
    return this.request(`/tags/${id}/`, {
      method: "DELETE",
    });
  }

  // Correspondent operations
  async getCorrespondents(fullPerms = false) {
    return this.request(
      `/correspondents/${fullPerms ? "?full_perms=true" : ""}`
    );
  }

  async createCorrespondent(data) {
    return this.request("/correspondents/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateCorrespondent(id, data) {
    return this.request(`/correspondents/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteCorrespondent(id) {
    return this.request(`/correspondents/${id}/`, {
      method: "DELETE",
    });
  }

  // Document type operations
  async getDocumentTypes(fullPerms = false) {
    return this.request(
      `/document_types/${fullPerms ? "?full_perms=true" : ""}`
    );
  }

  async createDocumentType(data) {
    return this.request("/document_types/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateDocumentType(id, data) {
    return this.request(`/document_types/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteDocumentType(id) {
    return this.request(`/document_types/${id}/`, {
      method: "DELETE",
    });
  }

  // Search autocomplete
  async getAutocomplete(term: string, limit?: number) {
    const params = new URLSearchParams();
    params.set("term", term);
    if (limit) params.set("limit", limit.toString());
    return this.request(`/search/autocomplete/?${params.toString()}`);
  }

  // Single-document update/delete
  async updateDocument(id, data) {
    return this.request(`/documents/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteDocument(id) {
    return this.request(`/documents/${id}/`, {
      method: "DELETE",
    });
  }

  // Document notes (the `notes` field is read-only on the document serializer;
  // notes are managed through this dedicated sub-resource).
  async addDocumentNote(id, note: string) {
    return this.request(`/documents/${id}/notes/`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
  }

  async deleteDocumentNote(id, noteId) {
    return this.request(`/documents/${id}/notes/?id=${noteId}`, {
      method: "DELETE",
    });
  }

  // Task operations
  async getTasks(taskId?: string) {
    const query = taskId
      ? `?task_id=${encodeURIComponent(taskId)}`
      : "";
    return this.request(`/tasks/${query}`);
  }

  // Storage path operations
  async getStoragePaths(fullPerms = false) {
    return this.request(
      `/storage_paths/${fullPerms ? "?full_perms=true" : ""}`
    );
  }

  async createStoragePath(data) {
    return this.request("/storage_paths/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Custom field operations
  async getCustomFields() {
    return this.request("/custom_fields/");
  }

  async createCustomField(data) {
    return this.request("/custom_fields/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Bulk object operations
  async bulkEditObjects(objects, objectType, operation, parameters = {}) {
    return this.request("/bulk_edit_objects/", {
      method: "POST",
      body: JSON.stringify({
        objects,
        object_type: objectType,
        operation,
        ...parameters,
      }),
    });
  }
}
