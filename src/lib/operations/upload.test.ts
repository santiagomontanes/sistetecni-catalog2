import {test} from "node:test";
import assert from "node:assert/strict";
import {boundedFormData} from "./upload";
test("multipart tiene límite efectivo sin Content-Length", async () => {
  const form = new FormData(); form.set("unit", "sintético"); form.set("file", new Blob([new Uint8Array(1000)]), "test.png");
  const request = new Request("http://localhost", {method:"POST", body:form});
  assert.equal(request.headers.get("content-length"), null);
  await assert.rejects(() => boundedFormData(request, 100), /upload_too_large/);
});
test("multipart permitido conserva campos y bytes", async () => {
  const form = new FormData(); form.set("unit", "sintético"); form.set("file", new Blob([new Uint8Array([1,2,3])]), "test.png");
  const decoded = await boundedFormData(new Request("http://localhost", {method:"POST", body:form}));
  assert.equal(decoded.get("unit"), "sintético");
  assert.deepEqual(new Uint8Array(await (decoded.get("file") as File).arrayBuffer()), new Uint8Array([1,2,3]));
});
