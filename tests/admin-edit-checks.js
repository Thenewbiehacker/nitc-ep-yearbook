import assert from "node:assert/strict";

// Exercise the same editing contract against Node and the production Worker.
export async function checkAdminEdits(call, id, auth, setBirthday) {
  const route = `/api/admin/submissions/${id}`;
  const patch = (body, headers = auth, target = `${route}/details`) => call(target, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const row = async (status) => {
    const response = await call(`/api/admin/submissions?status=${status}`, { headers: auth });
    return (await response.json()).submissions.find(person => person.id === id);
  };
  const original = await row("approved");
  const photo = Buffer.from(await (await call(`/api/admin/photos/${id}`, { headers: auth })).arrayBuffer());
  assert.equal((await patch({ quote: "Forbidden" }, {})).status, 401);
  assert.equal((await call(route, { method: "DELETE" })).status, 401);
  assert.equal((await patch({ quote: "Forbidden" }, { ...auth, Origin: "https://evil.test" })).status, 403);
  assert.equal((await patch({ quote: "Missing" }, auth, "/api/admin/submissions/999999/details")).status, 404);
  for (const body of [
    {}, [], null, { name: " " }, { quote: "" }, { property: "x".repeat(61) },
    { initials: "ABCDE" }, { birthday: "29-02-2007" }, { birthday: "02-29" },
    { photo: "replacement" }, { status: "approved" }, { consent_version: "fake" },
    { name: "Changed", withdrawal_hash: "fake" }, { name: 5 },
  ]) assert.equal((await patch(body)).status, 400, JSON.stringify(body));
  assert.deepEqual(await row("approved"), original, "Rejected edits must not change a record");

  for (const state of ["pending", "rejected", "approved"]) {
    assert.equal((await patch({ status: state }, auth, route)).status, 200);
    const before = await row(state);
    assert.equal((await patch({
      name: " Edited Student ", initials: "", quote: `Corrected ${state} quote <text>`,
      property: "Updated description", birthday: "31-12-2005",
    })).status, 200);
    const after = await row(state);
    assert.equal(after.name, "Edited Student");
    assert.equal(after.initials, "ES");
    assert.equal(after.quote, `Corrected ${state} quote <text>`);
    assert.equal(after.property, "Updated description");
    assert.equal(after.birthday, "31-12-2005");
    for (const key of ["status", "consent_at", "consent_version", "created_at", "reviewed_at", "has_photo"])
      assert.equal(after[key], before[key], key + " must be preserved");
    const publicRow = (await (await call("/api/profiles")).json()).profiles.find(person => person.id === id);
    if (state === "approved") assert.equal(publicRow.quote, after.quote);
    else assert.equal(publicRow, undefined, "Editing must not publish private profiles");
  }
  for (const birthday of [null, "02-29"]) {
    await setBirthday(birthday);
    assert.equal((await patch({ quote: "Corrected older profile" })).status, 200);
    assert.equal((await row("approved")).birthday, birthday);
  }
  assert.equal((await patch({ birthday: "29-02-2004" })).status, 200);
  const photoAfter = Buffer.from(await (await call(`/api/admin/photos/${id}`, { headers: auth })).arrayBuffer());
  assert.deepEqual(photoAfter, photo, "Editing must leave the existing photo bytes intact");
}
