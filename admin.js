const statusBox = document.querySelector("#adminStatus");
const loginPanel = document.querySelector("#loginPanel");
const reviewPanel = document.querySelector("#reviewPanel");
const filter = document.querySelector("#statusFilter");
const list = document.querySelector("#reviewList");
const editDialog = document.querySelector("#editDialog");
const editForm = document.querySelector("#editForm");
const editStatus = document.querySelector("#editStatus");
const submissions = new Map();
let editingId = null;
let saving = false;
let page = 0;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function formatBirthday(value) {
  if (/^[0-9]{2}-[0-9]{2}-[0-9]{4}$/.test(value)) return value;
  // Older profiles only supplied MM-DD; their birth year is unknown.
  const [month, day] = value.split("-");
  return `${day}-${month} (year not provided)`;
}
function status(text, error = false) {
  statusBox.textContent = text;
  statusBox.classList.toggle("error", error);
}
function signedIn(value) {
  loginPanel.hidden = value;
  reviewPanel.hidden = !value;
  document.querySelector("#logout").hidden = !value;
  if (!value) {
    list.replaceChildren();
    submissions.clear();
    editDialog.close();
    editForm.reset();
    editingId = null;
  }
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
    if (!result.submissions.length && page > 0) {
      page = Math.max(0, Math.ceil(result.total / 50) - 1);
      return load();
    }
    list.replaceChildren();
    submissions.clear();
    for (const person of result.submissions) {
      submissions.set(String(person.id), person);
      const card = document.createElement("article");
      card.className = "review-card";
      card.innerHTML = `<div>${person.has_photo ? `<img class="review-photo" src="/api/admin/photos/${person.id}" alt="Submitted portrait of ${esc(person.name)}">` : `<span class="review-photo" aria-hidden="true">${esc(person.initials)}</span>`}</div><div><p class="review-meta">Submission ${person.id} · ${esc(person.status)}</p><h2>${esc(person.name)}</h2><p>${esc(person.property)}</p>${person.birthday ? `<p>Birthday: ${esc(formatBirthday(person.birthday))}</p>` : ""}<blockquote>“${esc(person.quote)}”</blockquote><p class="review-meta">Consent recorded ${esc(new Date(person.consent_at).toLocaleString())}<br>Consent version: ${esc(person.consent_version)}</p><div class="action-row"><button class="outline-button" data-action="edit" data-id="${person.id}">Edit details</button>${person.status !== "approved" ? `<button class="solid-button" data-action="approved" data-id="${person.id}">Approve & publish</button>` : ""}${person.status !== "rejected" ? `<button class="outline-button" data-action="rejected" data-id="${person.id}">${person.status === "approved" ? "Unpublish & reject" : "Reject"}</button>` : ""}${person.status === "rejected" ? `<button class="outline-button" data-action="pending" data-id="${person.id}">Return to review</button>` : ""}<button class="outline-button danger" data-action="delete" data-id="${person.id}">Delete permanently</button></div></div>`;
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
    return true;
  } catch (error) {
    status(error.message, true);
    return false;
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
  const person = submissions.get(id);
  if (action === "edit") {
    editingId = id;
    editForm.reset();
    editStatus.textContent = "";
    for (const name of ["name", "initials", "quote", "property"])
      editForm.elements.namedItem(name).value = person[name];
    const birthday = editForm.elements.namedItem("birthday");
    const fullDate = /^[0-9]{2}-[0-9]{2}-[0-9]{4}$/.test(person.birthday || "");
    birthday.value = fullDate ? person.birthday : "";
    birthday.required = fullDate;
    document.querySelector("#editBirthdayNote").textContent = fullDate
      ? "Use DD-MM-YYYY."
      : `Current birthday: ${person.birthday ? formatBirthday(person.birthday) : "not provided"}. Leave blank to keep it, or enter DD-MM-YYYY.`;
    editDialog.showModal();
    return;
  }
  if (
    action === "delete" &&
    !confirm(
      `Permanently delete ${person.name}’s entry and photo, including from the public archive? This cannot be undone.`,
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
    if (await load()) status(action === "delete" ? "Entry deleted." : "Review status updated.");
  } catch (error) {
    status(error.message, true);
    button.disabled = false;
  }
});
document.querySelector("#cancelEdit").addEventListener("click", () => editDialog.close());
editDialog.addEventListener("cancel", (event) => {
  if (saving) event.preventDefault();
});
editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (saving || !editForm.reportValidity()) return;
  const id = editingId;
  const details = Object.fromEntries(new FormData(editForm));
  // An empty birthday field on an older entry keeps the original month/day.
  if (!editForm.elements.namedItem("birthday").required && !details.birthday.trim())
    delete details.birthday;
  saving = true;
  editForm.querySelectorAll("input,textarea,button").forEach(control => control.disabled = true);
  editStatus.classList.remove("error");
  editStatus.textContent = "Saving changes…";
  try {
    await api(`/api/admin/submissions/${id}/details`, {
      method: "PATCH",
      body: JSON.stringify(details),
    });
    editDialog.close();
    if (await load()) {
      status("Profile details saved.");
      list.querySelector(`[data-action="edit"][data-id="${id}"]`)?.focus();
    }
  } catch (error) {
    editStatus.textContent = error.message;
    editStatus.classList.add("error");
    if (!editDialog.open) status(error.message, true);
  } finally {
    saving = false;
    editForm.querySelectorAll("input,textarea,button").forEach(control => control.disabled = false);
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
