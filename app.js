const grid = document.querySelector("#grid");
const dialog = document.querySelector("#profile");
const content = document.querySelector("#profileContent");
const batchSize = 37;
let mode = "table";
let activeIndex = 0;
let sortOrder = "archive";
let displayedIndices = [];
let renderedBirthdayDay = null;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

let deckOrder = [];
function renderDeck() {
  if (deckOrder.length !== students.length)
    deckOrder = students.map((_, index) => index);
  const deck = document.querySelector("#quoteDeck");
  deck.replaceChildren();
  const count = Math.min(3, students.length);
  for (let slot = count - 1; slot >= 0; slot--) {
    const index = deckOrder[slot];
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
    ? `${deckOrder[0] + 1} / ${students.length}`
    : "";
  document.querySelector("#shuffleBtn").disabled = students.length < 2;
}

function formatBirthday(value) {
  if (/^[0-9]{2}-[0-9]{2}-[0-9]{4}$/.test(value)) return value;
  // Older profiles only supplied MM-DD; their birth year is unknown.
  const [month, day] = value.split("-");
  return `${day}-${month} (year not provided)`;
}

// Compare calendar dates in India; UTC arithmetic avoids daylight-saving offsets.
function birthdayToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = type => Number(parts.find(part => part.type === type).value);
  return Date.UTC(value("year"), value("month") - 1, value("day"));
}

function nextBirthday(value, today = birthdayToday()) {
  if (typeof value !== "string") return null;
  let day, month, year = 2000;
  if (/^[0-9]{2}-[0-9]{2}-[0-9]{4}$/.test(value)) {
    [day, month, year] = value.split("-").map(Number);
  } else if (/^[0-9]{2}-[0-9]{2}$/.test(value)) {
    [month, day] = value.split("-").map(Number);
  } else return null;
  const check = new Date(0);
  check.setUTCFullYear(year, month - 1, day);
  if (year < 1 || check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  const thisYear = new Date(today).getUTCFullYear();
  // February 29 rolls to March 1 in a non-leap year.
  let next = Date.UTC(thisYear, month - 1, day);
  if (next < today) next = Date.UTC(thisYear + 1, month - 1, day);
  return {
    day, month, days: Math.round((next - today) / 86400000),
    date: `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}`,
  };
}

function birthdayTiming(birthday) {
  if (!birthday) return "Birthday not provided";
  const when = birthday.days === 0 ? "Today!" : birthday.days === 1 ? "Tomorrow" : `In ${birthday.days} days`;
  return `${birthday.date} · ${when}`;
}

function stepPerson(direction) {
  if (!displayedIndices.length) return;
  const position = displayedIndices.indexOf(activeIndex);
  showPerson(displayedIndices[(position + direction + displayedIndices.length) % displayedIndices.length]);
}

function showPerson(index) {
  if (!students.length) return;
  activeIndex = (index + students.length) % students.length;
  const person = students[activeIndex];
  document.querySelector("#profileStory").textContent = `Story ${String(activeIndex + 1).padStart(2, "0")}`;
  content.innerHTML = `
    <div class="portrait"><span aria-hidden="true">${esc(person.initials || "?")}</span>
      ${person.photo ? `<img src="${esc(person.photo)}" alt="Portrait of ${esc(person.name)}">` : ""}
      <small class="portrait-label">${person.photo ? "Engineering Physics · NIT Calicut" : "A portrait will go here"}</small>
    </div>
    <div class="profile-copy">
      <p class="profile-eyebrow">One of our own</p>
      <h2 id="profileName">${esc(person.name || "Name to come")}</h2>
      <p class="property">${esc(person.property || "A story in the making")}</p>
      <div class="profile-quote"><span class="profile-quote-mark" aria-hidden="true">“</span>
        <blockquote>${esc(person.quote || "Their story is coming soon.")}</blockquote>
      </div>
      <div class="profile-details">
        ${person.birthday ? `<p class="birthday"><span>Birthday · </span>${esc(formatBirthday(person.birthday))}</p>` : ""}
        <p class="caption"><span>Same wavelength</span>${person.example ? "Fictional profile · Concept preview" : "The batch archive"}</p>
      </div>
    </div>`;
  const photo = content.querySelector("img");
  if (photo)
    photo.addEventListener("error", () => {
      photo.remove();
      content.querySelector(".portrait-label").textContent =
        "Portrait unavailable";
    });
  document.querySelector("#profilePosition").textContent =
    `${displayedIndices.indexOf(activeIndex) + 1} / ${students.length}`;
  document.querySelector("#prevPerson").disabled = students.length < 2;
  document.querySelector("#nextPerson").disabled = students.length < 2;
  if (!dialog.open) dialog.showModal();
}

function render() {
  const today = birthdayToday();
  renderedBirthdayDay = today;
  const ordered = students.map((person, index) => ({ person, index, birthday: nextBirthday(person.birthday, today) }));
  if (sortOrder === "birthday") ordered.sort((a, b) =>
    (a.birthday?.days ?? Infinity) - (b.birthday?.days ?? Infinity) || a.index - b.index);
  displayedIndices = ordered.map(entry => entry.index);
  const summary = document.querySelector("#birthdaySummary");
  summary.hidden = sortOrder !== "birthday";
  if (sortOrder === "birthday") {
    const first = ordered.find(entry => entry.birthday);
    if (first) {
      const names = ordered.filter(entry => entry.birthday?.days === first.birthday.days)
        .map(entry => entry.person.name).join(", ");
      summary.textContent = `Next up: ${names} · ${birthdayTiming(first.birthday)}. Dates use India time.`;
      const year = new Date(today).getUTCFullYear();
      if (new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1 &&
        ordered.some(entry => entry.birthday?.month === 2 && entry.birthday.day === 29))
        summary.textContent += " February 29 birthdays are shown on March 1 in non-leap years.";
    } else summary.textContent = "No birthdays have been added yet.";
  }
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
  ordered.forEach(({ person, index, birthday }) => {
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
    if (sortOrder === "birthday") {
      const date = document.createElement("small");
      date.className = "birthday-preview";
      date.textContent = birthdayTiming(birthday);
      tile.querySelector(mode === "table" ? ".tile-footer > span" : ".record-line").append(date);
    }
    const image = tile.querySelector("img");
    if (image) image.addEventListener("error", () => image.remove());
    tile.addEventListener("click", () => showPerson(index));
    grid.append(tile);
  });
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
document.querySelector("#profileSort").addEventListener("change", event => {
  sortOrder = event.target.value;
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
  .addEventListener("click", () => stepPerson(-1));
document
  .querySelector("#nextPerson")
  .addEventListener("click", () => stepPerson(1));
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
    stepPerson(-1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    stepPerson(1);
  }
});
function refreshBirthdayOrder() {
  if (sortOrder === "birthday" && !dialog.open && birthdayToday() !== renderedBirthdayDay) render();
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshBirthdayOrder();
});
dialog.addEventListener("close", refreshBirthdayOrder);
setInterval(refreshBirthdayOrder, 60000);
render();

document.querySelector("#shuffleBtn").addEventListener("click", () => {
  if (!students.length) return;
  const previousTop = deckOrder[0];
  // Fisher–Yates mixes the entire deck, including stories behind the visible cards.
  for (let i = deckOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deckOrder[i], deckOrder[j]] = [deckOrder[j], deckOrder[i]];
  }
  if (deckOrder.length > 1 && deckOrder[0] === previousTop) {
    const j = 1 + Math.floor(Math.random() * (deckOrder.length - 1));
    [deckOrder[0], deckOrder[j]] = [deckOrder[j], deckOrder[0]];
  }
  renderDeck();
  showPerson(deckOrder[0]);
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
