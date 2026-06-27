import { describe, it, expect } from "vitest";
import { registerTagTools } from "../src/tools/tags";
import { registerCorrespondentTools } from "../src/tools/correspondents";
import { registerDocumentTypeTools } from "../src/tools/documentTypes";
import { registerStoragePathTools } from "../src/tools/storagePaths";
import { captureTools, fakeApi } from "./helpers";

describe("create_tag matching_algorithm mapping", () => {
  it("maps the friendly enum to the integer code", async () => {
    const api = fakeApi();
    const tools = captureTools(registerTagTools, api);
    await tools.create_tag.handler({ name: "Invoice", matching_algorithm: "fuzzy" });
    expect(api.createTag).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Invoice", matching_algorithm: 5 })
    );
  });

  it("keeps 'none' as 0 rather than dropping it", async () => {
    const api = fakeApi();
    const tools = captureTools(registerTagTools, api);
    await tools.create_tag.handler({ name: "X", matching_algorithm: "none" });
    expect(api.createTag.mock.calls[0][0].matching_algorithm).toBe(0);
  });

  it("omits matching_algorithm when not provided", async () => {
    const api = fakeApi();
    const tools = captureTools(registerTagTools, api);
    await tools.create_tag.handler({ name: "X" });
    expect(api.createTag.mock.calls[0][0].matching_algorithm).toBeUndefined();
  });
});

describe("correspondent CRUD matching mapping", () => {
  it("create_correspondent maps the algorithm", async () => {
    const api = fakeApi();
    const tools = captureTools(registerCorrespondentTools, api);
    await tools.create_correspondent.handler({ name: "ACME", matching_algorithm: "all" });
    expect(api.createCorrespondent).toHaveBeenCalledWith(
      expect.objectContaining({ matching_algorithm: 2 })
    );
  });

  it("update_correspondent maps the algorithm and strips id from the body", async () => {
    const api = fakeApi();
    const tools = captureTools(registerCorrespondentTools, api);
    await tools.update_correspondent.handler({ id: 4, matching_algorithm: "exact" });
    expect(api.updateCorrespondent).toHaveBeenCalledWith(4, { matching_algorithm: 3 });
  });

  it("delete_correspondent reports the deleted id", async () => {
    const api = fakeApi();
    const tools = captureTools(registerCorrespondentTools, api);
    const res = await tools.delete_correspondent.handler({ id: 4 });
    expect(api.deleteCorrespondent).toHaveBeenCalledWith(4);
    expect(res).toEqual({ deleted: true, id: 4 });
  });
});

describe("document type CRUD matching mapping", () => {
  it("create_document_type maps the algorithm", async () => {
    const api = fakeApi();
    const tools = captureTools(registerDocumentTypeTools, api);
    await tools.create_document_type.handler({ name: "Invoice", matching_algorithm: "regular expression" });
    expect(api.createDocumentType).toHaveBeenCalledWith(
      expect.objectContaining({ matching_algorithm: 4 })
    );
  });

  it("update_document_type maps the algorithm", async () => {
    const api = fakeApi();
    const tools = captureTools(registerDocumentTypeTools, api);
    await tools.update_document_type.handler({ id: 2, matching_algorithm: "auto" });
    expect(api.updateDocumentType).toHaveBeenCalledWith(2, { matching_algorithm: 6 });
  });
});

describe("create_storage_path matching mapping", () => {
  it("maps the algorithm and forwards the template", async () => {
    const api = fakeApi();
    const tools = captureTools(registerStoragePathTools, api);
    await tools.create_storage_path.handler({
      name: "By year",
      path: "{created_year}/{title}",
      matching_algorithm: "any",
    });
    expect(api.createStoragePath).toHaveBeenCalledWith(
      expect.objectContaining({ path: "{created_year}/{title}", matching_algorithm: 1 })
    );
  });
});
