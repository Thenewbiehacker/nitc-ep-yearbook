const grid = document.querySelector("#grid");
const dialog = document.querySelector("#profile");
const content = document.querySelector("#profileContent");
const batchSize = 37;
let mode = "table";
let activeIndex = 0;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

let deckIndex = 0;
function renderDeck() {
  const deck = document.querySelector("#quoteDeck");
  deck.replaceChildren();
  const count = Math.min(3, students.length);
  for (let slot = count - 1; slot >= 0; slot--) {
    const index = (deckIndex + slot) % students.length;
    const person = students[index];
    const card = document.createElement("button");
    card.className = "quote-card";
    card.dataset.slot = slot;
    card.dataset.tone = index % 3;
    card.setAttribute("aria-label", `Read ${person.name}'s story`);
    card.tabIndex = slot === 0 ? 0 : -1;
    card.innerHTML = `<span class="card-top"><span>EP / 37</span><span>${person.example ? "Sample story" : "The batch archive"}</span></span><span class="card-quote">“${esc(person.quote || "Their story is coming soon.")}”</span><span class="card-bottom"><span>${esc(person.name)}</span><span>Open story ↗</span></span>`;
    card.addEventListener("click", () => showPerson(index));
    deck.append(card);
  }
  if (!count)
    deck.innerHTML =
      '<p class="empty-state">The first story is still to come.</p>';
  document.querySelector("#deckPosition").textContent = count
    ? `${deckIndex + 1} / ${students.length}`
    : "";
  document.querySelector("#shuffleBtn").disabled = students.length < 2;
}

function formatBirthday(value) {
  if (/^[0-9]{2}-[0-9]{2}-[0-9]{4}$/.test(value)) return value;
  // Older profiles only supplied MM-DD; their birth year is unknown.
  const [month, day] = value.split("-");
  return `${day}-${month} (year not provided)`;
}

function showPerson(index) {
  if (!students.length) return;
  activeIndex = (index + students.length) % students.length;
  const person = students[activeIndex];
  content.innerHTML = `
    <div class="portrait"><span aria-hidden="true">${esc(person.initials || "?")}</span>
      ${person.photo ? `<img src="${esc(person.photo)}" alt="Portrait of ${esc(person.name)}">` : ""}
      <small class="portrait-label">${person.photo ? "" : "A portrait will go here"}</small>
    </div>
    <div class="profile-copy"><p class="section-kicker">Story ${String(activeIndex + 1).padStart(2, "0")}</p>
      <h2 id="profileName">${esc(person.name || "Name to come")}</h2>
      <p class="property">${esc(person.property || "A story in the making")}</p>
      ${person.birthday ? `<p class="birthday">Birthday · ${esc(formatBirthday(person.birthday))}</p>` : ""}
      <blockquote>“${esc(person.quote || "Their story is coming soon.")}”</blockquote>
      <p class="caption">Engineering Physics, NIT Calicut<br>${person.example ? "Fictional profile · Concept preview" : "The batch archive"}</p>
    </div>`;
  const photo = content.querySelector("img");
  if (photo)
    photo.addEventListener("error", () => {
      photo.remove();
      content.querySelector(".portrait-label").textContent =
        "Portrait unavailable";
    });
  document.querySelector("#profilePosition").textContent =
    `${activeIndex + 1} / ${students.length}`;
  document.querySelector("#prevPerson").disabled = students.length < 2;
  document.querySelector("#nextPerson").disabled = students.length < 2;
  if (!dialog.open) dialog.showModal();
}

function render() {
  document.body.dataset.mode = mode;
  document
    .querySelector("#tableBtn")
    .setAttribute("aria-pressed", String(mode === "table"));
  document
    .querySelector("#recordBtn")
    .setAttribute("aria-pressed", String(mode === "record"));
  const examples = students.filter((person) => person.example).length;
  document.querySelector("#sampleNote").textContent = examples
    ? `Concept preview: ${examples} fictional ${examples === 1 ? "profile" : "profiles"}. ${students.length < batchSize ? "The rest of the batch is still to come." : "Explore the archive below."}`
    : students.length
      ? "The archive is growing, one story at a time."
      : "The archive is waiting for its first story.";
  document.querySelector("#profileCount").textContent =
    `${students.length} ${examples === students.length && examples ? "sample " : ""}${students.length === 1 ? "profile" : "profiles"}`;
  document.querySelector("#randomBtn").disabled = !students.length;
  grid.className = `grid ${mode}`;
  grid.replaceChildren();
  document.querySelector("#remainingCount").textContent =
    students.length < batchSize
      ? `${batchSize - students.length} places are waiting for their stories.`
      : "";
  if (!students.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent =
      "No profiles yet. Each story starts with a photo, a few words, and permission to share.";
    grid.append(empty);
  }
  students.forEach((person, index) => {
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.setAttribute(
      "aria-label",
      `Open profile: ${person.name || "Name to come"}`,
    );
    tile.innerHTML =
      mode === "table"
        ? `<span class="poster"><span class="poster-top"><span>EP / ${String(index + 1).padStart(2, "0")}</span><span>${esc(person.property || "A story in the making")}</span></span><span class="poster-symbol" aria-hidden="true">${esc(person.initials || "?")}</span>${person.photo ? `<img src="${esc(person.photo)}" alt="Portrait of ${esc(person.name)}" loading="lazy">` : ""}<span class="poster-quote">“${esc(person.quote || "Their story is coming soon.")}”</span></span><span class="tile-footer"><span><strong>${esc(person.name)}</strong><small>${person.example ? "Sample profile" : "Engineering Physics"}</small></span><span aria-hidden="true">↗</span></span>`
        : `<span class="number">${String(index + 1).padStart(2, "0")}</span><strong>${esc(person.name)}</strong><span class="record-line">${esc(person.property || "A story in the making")}</span><span class="tile-arrow" aria-hidden="true">↗</span>`;
    const image = tile.querySelector("img");
    if (image) image.addEventListener("error", () => image.remove());
    tile.addEventListener("click", () => showPerson(index));
    grid.append(tile);
  });
  deckIndex = students.length ? deckIndex % students.length : 0;
  renderDeck();
}

document.querySelector("#tableBtn").addEventListener("click", () => {
  mode = "table";
  render();
});
document.querySelector("#recordBtn").addEventListener("click", () => {
  mode = "record";
  render();
});
document
  .querySelector("#randomBtn")
  .addEventListener("click", () =>
    showPerson(Math.floor(Math.random() * students.length)),
  );
document
  .querySelector(".close")
  .addEventListener("click", () => dialog.close());
document
  .querySelector("#prevPerson")
  .addEventListener("click", () => showPerson(activeIndex - 1));
document
  .querySelector("#nextPerson")
  .addEventListener("click", () => showPerson(activeIndex + 1));
dialog.addEventListener("click", (event) => {
  const rect = dialog.getBoundingClientRect();
  if (
    event.target === dialog &&
    (event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom)
  )
    dialog.close();
});
dialog.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    showPerson(activeIndex - 1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    showPerson(activeIndex + 1);
  }
});
render();

document.querySelector("#shuffleBtn").addEventListener("click", () => {
  if (!students.length) return;
  deckIndex = (deckIndex + 1) % students.length;
  renderDeck();
});

// Local file previews use fictional samples; the running server uses only approved profiles.
if (location.protocol === "http:" || location.protocol === "https:") {
  const previewProfiles = students.map((person) => ({ ...person }));
  students.splice(0);
  render();
  const notice = document.querySelector("#loadStatus");
  notice.textContent = "Loading the batch archive…";
  fetch("/api/profiles")
    .then(async (response) => {
      if (!response.ok) throw new Error("Archive unavailable");
      const data = await response.json();
      if (!Array.isArray(data.profiles)) throw new Error("Invalid archive");
      students.splice(
        0,
        students.length,
        ...(data.profiles.length ? data.profiles : previewProfiles),
      );
      render();
      notice.textContent = "";
    })
    .catch(() => {
      notice.textContent =
        "The archive could not be loaded. Refresh to try again.";
    });
}
