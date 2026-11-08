const isOffline = location.protocol === "file:";
const statusElement = document.querySelector("#formStatus, #withdrawStatus");
function status(message, error = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}
async function api(url, options = {}) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request failed.");
  return result;
}
// Normalize locally so Cloudflare can store small, metadata-free portraits without a paid image service.
async function preparePortrait(file) {
  if (file.size > 8 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 8 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPEG, PNG, or WebP photo.");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "This photo could not be read. Try a different JPEG, PNG, or WebP.",
    );
  }
  try {
    if (bitmap.width * bitmap.height > 25000000)
      throw new Error("Choose a photo under 25 megapixels.");
    const scale = Math.min(1, 1000 / bitmap.width, 1200 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.84, 0.7, 0.55]) {
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob && blob.size <= 1024 * 1024) return blob;
    }
    throw new Error(
      "This photo could not be made small enough. Please choose a simpler or smaller portrait.",
    );
  } finally {
    bitmap.close();
  }
}
if (isOffline) {
  status(
    "This form needs the backend. Run npm install and npm start, then open http://localhost:3000. The downloaded index.html is a design preview only.",
    true,
  );
  document
    .querySelectorAll("form button,form input,form textarea")
    .forEach((el) => (el.disabled = true));
}
const form = document.querySelector("#submissionForm");
let receipt = "";
let previewURL;
if (form) {
  document.querySelector("#photoInput").addEventListener("change", (event) => {
    const photo = event.target.files[0];
    const preview = document.querySelector("#photoPreview");
    if (previewURL) URL.revokeObjectURL(previewURL);
    preview.hidden = true;
    if (!photo) return;
    if (photo.size > 8 * 1024 * 1024) {
      status("Choose a photo smaller than 8 MB.", true);
      event.target.value = "";
      return;
    }
    previewURL = URL.createObjectURL(photo);
    preview.src = previewURL;
    preview.hidden = false;
    preview.onerror = () => {
      preview.hidden = true;
      status(
        "This photo could not be previewed. Please choose a JPEG, PNG, or WebP.",
        true,
      );
    };
    status("");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isOffline || !form.reportValidity()) return;
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    status("Sending your story for review…");
    try {
      const payload = new FormData(form);
      const photo = payload.get("photo");
      if (photo && photo.size) {
        status("Preparing your portrait…");
        payload.set("photo", await preparePortrait(photo), "portrait.jpg");
      } else payload.delete("photo");
      status("Sending your story for review…");
      const result = await api("/api/submissions", {
        method: "POST",
        body: payload,
      });
      const privateURL = new URL("/withdraw", location.origin);
      privateURL.hash = new URLSearchParams({
        id: result.id,
        token: result.withdrawalToken,
      }).toString();
      document.querySelector("#privateLink").value = privateURL.href;
      receipt = `EP / 37 — Submission receipt\nSubmission: ${result.id}\nStatus: pending review\n\nPrivate management link (do not share):\n${privateURL.href}\n\nUse this link to check the status or permanently withdraw your profile.\n`;
      form.hidden = true;
      const success = document.querySelector("#submissionSuccess");
      success.hidden = false;
      success.focus();
    } catch (error) {
      status(
        error.message || "Could not connect to the server. Please try again.",
        true,
      );
    } finally {
      submit.disabled = false;
    }
  });
  document
    .querySelector("#copyLink")
    .addEventListener("click", async (event) => {
      try {
        await navigator.clipboard.writeText(
          document.querySelector("#privateLink").value,
        );
        event.target.textContent = "Copied";
      } catch {
        document.querySelector("#privateLink").select();
        event.target.textContent = "Select and copy the link above";
      }
    });
  document.querySelector("#saveReceipt").addEventListener("click", () => {
    const url = URL.createObjectURL(
      new Blob([receipt], { type: "text/plain" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "ep-37-private-receipt.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
if (document.querySelector("#withdrawButton") && !isOffline) {
  const params = new URLSearchParams(location.hash.slice(1));
  const id = params.get("id"),
    secret = params.get("token");
  const controls = document.querySelector("#withdrawControls");
  const confirmation = document.querySelector("#withdrawConfirm");
  if (!/^\d+$/.test(id || "") || !/^[A-Za-z0-9_-]{43}$/.test(secret || ""))
    status(
      "Open the full private link from your saved receipt to manage your submission.",
      true,
    );
  else {
    api(`/api/submissions/${id}/status`, {
      headers: { "x-withdrawal-token": secret },
    })
      .then((result) => {
        const labels = {
          pending: "Your story is waiting for admin review.",
          approved:
            "Your story has been approved and is public in the archive.",
          rejected:
            "Your story was not approved. You can withdraw it here and submit a revised version.",
        };
        status(labels[result.status]);
        controls.hidden = false;
      })
      .catch((error) => status(error.message, true));
    document.querySelector("#withdrawButton").addEventListener("click", () => {
      controls.hidden = true;
      confirmation.hidden = false;
      document.querySelector("#cancelWithdraw").focus();
    });
    document.querySelector("#cancelWithdraw").addEventListener("click", () => {
      controls.hidden = false;
      confirmation.hidden = true;
      document.querySelector("#withdrawButton").focus();
    });
    document
      .querySelector("#confirmWithdraw")
      .addEventListener("click", async (event) => {
        event.target.disabled = true;
        try {
          await api(`/api/submissions/${id}`, {
            method: "DELETE",
            headers: { "x-withdrawal-token": secret },
          });
          confirmation.hidden = true;
          status(
            "Your story has been removed from the database and the live archive.",
          );
          history.replaceState(null, "", location.pathname);
        } catch (error) {
          status(error.message, true);
          event.target.disabled = false;
        }
      });
  }
}

// A receipt link may be opened while this same management page is already loaded.
if (document.querySelector("#withdrawButton")) {
  window.addEventListener("hashchange", () => location.reload());
}
