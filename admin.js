const statusBox = document.querySelector("#adminStatus");
const loginPanel = document.querySelector("#loginPanel");
const reviewPanel = document.querySelector("#reviewPanel");
const filter = document.querySelector("#statusFilter");
const list = document.querySelector("#reviewList");
let page = 0;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function status(text, error = false) {
  statusBox.textContent = text;
  statusBox.classList.toggle("error", error);
}
function signedIn(value) {
  loginPanel.hidden = value;
  reviewPanel.hidden = !value;
  document.querySelector("#logout").hidden = !value;
  if (!value) list.replaceChildren();
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) signedIn(false);
    throw new Error(result.error || "Request failed.");
  }
  return result;
}
async function load() {
  status("Loading submissions…");
  try {
    const result = await api(
      `/api/admin/submissions?status=${filter.value}&page=${page}`,
    );
    list.replaceChildren();
    for (const person of result.submissions) {
      const card = document.createElement("article");
      card.className = "review-card";
      card.innerHTML = `<div>${person.has_photo ? `<img class="review-photo" src="/api/admin/photos/${person.id}" alt="Submitted portrait of ${esc(person.name)}">` : `<span class="review-photo" aria-hidden="true">${esc(person.initials)}</span>`}</div><div><p class="review-meta">Submission ${person.id} · ${esc(person.status)}</p><h2>${esc(person.name)}</h2><p>${esc(person.property)}</p>${person.birthday ? `<p>Birthday: ${esc(person.birthday)} (month-day)</p>` : ""}<blockquote>“${esc(person.quote)}”</blockquote><p class="review-meta">Consent recorded ${esc(new Date(person.consent_at).toLocaleString())}<br>Consent version: ${esc(person.consent_version)}</p><div class="action-row">${person.status !== "approved" ? `<button class="solid-button" data-action="approved" data-id="${person.id}">Approve & publish</button>` : ""}${person.status !== "rejected" ? `<button class="outline-button" data-action="rejected" data-id="${person.id}">${person.status === "approved" ? "Unpublish & reject" : "Reject"}</button>` : ""}${person.status === "rejected" ? `<button class="outline-button" data-action="pending" data-id="${person.id}">Return to review</button>` : ""}<button class="outline-button danger" data-action="delete" data-id="${person.id}">Delete permanently</button></div></div>`;
      list.append(card);
    }
    if (!result.submissions.length) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No submissions in this view.";
      list.append(p);
    }
    document.querySelector("#pageInfo").textContent =
      `${result.total} submissions · Page ${page + 1}`;
    document.querySelector("#previousPage").disabled = page === 0;
    document.querySelector("#nextPage").disabled =
      (page + 1) * 50 >= result.total;
    status("");
  } catch (error) {
    status(error.message, true);
  }
}
document
  .querySelector("#loginForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("button");
    button.disabled = true;
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          password: new FormData(event.target).get("password"),
        }),
      });
      event.target.reset();
      signedIn(true);
      await load();
    } catch (error) {
      status(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
document.querySelector("#logout").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST" });
    signedIn(false);
    status("Signed out.");
  } catch (error) {
    status(error.message, true);
  }
});
filter.addEventListener("change", () => {
  page = 0;
  load();
});
document.querySelector("#previousPage").addEventListener("click", () => {
  page = Math.max(0, page - 1);
  load();
});
document.querySelector("#nextPage").addEventListener("click", () => {
  page++;
  load();
});
list.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { id, action } = button.dataset;
  if (
    action === "delete" &&
    !confirm(
      "Permanently delete this submission and its photo? This cannot be undone.",
    )
  )
    return;
  button.disabled = true;
  try {
    await api(
      `/api/admin/submissions/${id}`,
      action === "delete"
        ? { method: "DELETE" }
        : { method: "PATCH", body: JSON.stringify({ status: action }) },
    );
    await load();
  } catch (error) {
    status(error.message, true);
    button.disabled = false;
  }
});
if (location.protocol === "file:") {
  status(
    "Admin review needs the backend. Run npm install and npm start, then open http://localhost:3000/admin.",
    true,
  );
  document.querySelector("#loginForm button").disabled = true;
} else
  api("/api/admin/session")
    .then(() => {
      signedIn(true);
      load();
    })
    .catch(() =>
      status("Sign in with the admin password configured on the server."),
    );
