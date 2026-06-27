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

    return response.json();
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
    metadata: Record<string, string | string[]> = {}
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
      (metadata.custom_fields as string[]).forEach((field) =>
        formData.append("custom_fields", field)
      );
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

  async getDocument(id) {
    return this.request(`/documents/${id}/`);
  }

  async searchDocuments(query, page?, pageSize?) {
    const params = new URLSearchParams();
    params.set("query", query);
    if (page) params.set("page", page.toString());
    if (pageSize) params.set("page_size", pageSize.toString());
    
    const response: any = await this.request(`/documents/?${params.toString()}`);
    
    // Filter out content field and long URLs to reduce token usage
    if (response.results) {
      response.results = response.results.map((doc: any) => {
        const { content, download_url, thumbnail_url, ...rest } = doc;
        return {
          ...rest,
          // Include only document ID for constructing URLs if needed
          id: doc.id,
        };
      });
    }
    
    return response;
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
  async getTags() {
    return this.request("/tags/");
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
  async getCorrespondents() {
    return this.request("/correspondents/");
  }

  async createCorrespondent(data) {
    return this.request("/correspondents/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Document type operations
  async getDocumentTypes() {
    return this.request("/document_types/");
  }

  async createDocumentType(data) {
    return this.request("/document_types/", {
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
