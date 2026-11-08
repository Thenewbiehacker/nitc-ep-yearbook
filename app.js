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

// Keep the artwork local: a set of superimposed waves, with no image dependency.
const waveGroup = document.querySelector("#wavePaths");
for (let line = 0; line < 32; line++) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  let d = "";
  for (let x = -10; x <= 510; x += 4) {
    const envelope = Math.sin((x / 500) * Math.PI);
    const y =
      200 + (line - 15.5) * 7 + Math.sin(x / 78 + line * 0.13) * 90 * envelope;
    d += `${x === -10 ? "M" : "L"}${x},${y.toFixed(2)} `;
  }
  path.setAttribute("d", d);
  waveGroup.append(path);
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
    <div class="profile-copy"><p class="section-kicker">${mode === "table" ? "Element" : "Experiment"} ${String(activeIndex + 1).padStart(2, "0")}</p>
      <h2 id="profileName">${esc(person.name || "Name to come")}</h2>
      <p class="property">${esc(person.property || "A story in the making")}</p>
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
  document.querySelector("#sectionTitle").textContent =
    mode === "table" ? "The elements of us." : "The class record.";
  document.querySelector("#sectionDesc").textContent =
    mode === "table"
      ? "A small table of very different personalities. Open an element. Get to know the person."
      : "The people behind the observations. Open a record to read their story.";
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
  document.querySelector("#mobileRemainder").textContent =
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
        ? `<span class="number">${String(index + 1).padStart(2, "0")}</span><span class="tile-arrow" aria-hidden="true">↗</span><strong>${esc(person.initials || "?")}</strong><span class="name">${esc(person.name)}</span><small>${esc(person.property || "Story coming soon")}</small>`
        : `<span class="number">Experiment ${String(index + 1).padStart(2, "0")}</span><span class="tile-arrow" aria-hidden="true">↗</span><strong>${esc(person.name)}</strong><span class="record-line">Observation: ${esc(person.property || "Story coming soon")}</span><small>Read their story</small>`;
    tile.addEventListener("click", () => showPerson(index));
    grid.append(tile);
  });
  // Vacant places are not interactive and do not represent invented students.
  for (let index = students.length; index < batchSize; index++) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.innerHTML = `<span class="number">${String(index + 1).padStart(2, "0")}</span><span class="placeholder-symbol">${mode === "table" ? "+" : "—"}</span><small>Story to come</small>`;
    grid.append(placeholder);
  }
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
