const baseUrl = process.env.BASE_URL || "http://127.0.0.1:8787";
const password = process.env.ADMIN_PASSWORD;

if (!password) throw new Error("Set ADMIN_PASSWORD before running the smoke test");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const unauthenticated = await fetch(`${baseUrl}/api/admin/session`);
assert(unauthenticated.status === 401, `Expected unauthenticated 401, got ${unauthenticated.status}`);

const login = await fetch(`${baseUrl}/api/admin/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password })
});
assert(login.ok, `Login failed with ${login.status}: ${await login.text()}`);
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert(cookie, "Login did not return a session cookie");

const session = await fetch(`${baseUrl}/api/admin/session`, { headers: { cookie } });
const sessionBody = await session.json();
assert(session.ok && sessionBody.database === true, "Authenticated session or D1 binding is unavailable");

const create = await fetch(`${baseUrl}/api/leads`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Smoke Test",
    contact: "smoke@example.test",
    task: "Automated admin smoke test",
    projectType: "start",
    extras: ["crm"],
    estimate: 117,
    source: "smoke-test"
  })
});
const created = await create.json();
assert(create.status === 201 && created.leadId, `Lead creation failed: ${JSON.stringify(created)}`);

const list = await fetch(`${baseUrl}/api/admin/leads?q=smoke%40example.test`, { headers: { cookie } });
const listed = await list.json();
assert(list.ok && listed.leads.some((lead) => lead.id === created.leadId), "Created lead is missing from admin list");

const update = await fetch(`${baseUrl}/api/admin/leads/${created.leadId}`, {
  method: "PATCH",
  headers: { cookie, "content-type": "application/json", "x-tkeep-admin": "1" },
  body: JSON.stringify({ status: "in_progress", notes: "Smoke test note" })
});
const updated = await update.json();
assert(update.ok && updated.lead.status === "in_progress", `Lead update failed: ${JSON.stringify(updated)}`);

const csv = await fetch(`${baseUrl}/api/admin/export`, { headers: { cookie } });
const csvBody = await csv.text();
assert(csv.ok && csvBody.includes("smoke@example.test"), "CSV export does not include the created lead");

const remove = await fetch(`${baseUrl}/api/admin/leads/${created.leadId}`, {
  method: "DELETE",
  headers: { cookie, "x-tkeep-admin": "1" }
});
assert(remove.ok, `Lead cleanup failed with ${remove.status}`);

console.log("Admin smoke test passed: auth, D1, list, update, CSV and delete are working.");
