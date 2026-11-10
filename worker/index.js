import { validBirthday, validateProfileEdit } from "../backend/profile-details.js";
const encoder = new TextEncoder();
const hash = async (value) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
const token = () => {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
const error = (message, status = 400) => json({ error: message }, status);
const invalid = "Invalid or oversized request.";
const privateLink =
  "This private link is invalid, or the submission has been removed.";
const query = (db, sql, ...args) => db.prepare(sql).bind(...args);
async function bodyBytes(req, limit) {
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader(),
    chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("body");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
// Parse JPEG structure without decoding pixels. Metadata segments are omitted even between scans.
export function sanitizeJpeg(input) {
  const b = new Uint8Array(input);
  if (b.length > 1048576 || b.length < 4 || b[0] !== 255 || b[1] !== 216)
    throw Error("jpeg");
  let i = 2,
    width = 0,
    height = 0,
    scan = false,
    end = false;
  const pieces = [b.slice(0, 2)];
  while (i < b.length) {
    const start = i;
    if (b[i++] !== 255) throw Error("marker");
    while (i < b.length && b[i] === 255) i++;
    if (i >= b.length) throw Error("marker");
    const m = b[i++];
    if (m === 0xd9) {
      if (!scan || !width || !height || i !== b.length) throw Error("end");
      pieces.push(b.slice(start, i));
      end = true;
      break;
    }
    if (m === 0xd8 || m === 0 || m === 1 || (m >= 0xd0 && m <= 0xd7))
      throw Error("marker");
    if (i + 2 > b.length) throw Error("length");
    const len = b[i] * 256 + b[i + 1];
    if (len < 2 || i + len > b.length) throw Error("length");
    const segmentEnd = i + len;
    if ([0xc0, 0xc1, 0xc2].includes(m)) {
      if (width || len < 11) throw Error("frame");
      height = b[i + 3] * 256 + b[i + 4];
      width = b[i + 5] * 256 + b[i + 6];
      const components = b[i + 7];
      if (
        !width ||
        !height ||
        width > 1000 ||
        height > 1200 ||
        !components ||
        len !== 8 + 3 * components
      )
        throw Error("dimensions");
    } else if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m))
      throw Error("frame");
    if (!(m >= 0xe0 && m <= 0xef) && m !== 0xfe)
      pieces.push(b.slice(start, segmentEnd));
    i = segmentEnd;
    if (m === 0xda) {
      if (!width || len < 6) throw Error("scan");
      scan = true;
      const dataStart = i;
      while (i < b.length) {
        if (b[i] !== 255) {
          i++;
          continue;
        }
        let j = i + 1;
        while (j < b.length && b[j] === 255) j++;
        if (j >= b.length) throw Error("scan");
        if (b[j] === 0 || (b[j] >= 0xd0 && b[j] <= 0xd7)) {
          i = j + 1;
          continue;
        }
        break;
      }
      pieces.push(b.slice(dataStart, i));
    }
  }
  if (!end) throw Error("end");
  let n = 0;
  for (const p of pieces) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of pieces) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
async function limited(db, req, kind, limit, window) {
  const now = Date.now(),
    ip = req.headers.get("CF-Connecting-IP") || "unknown",
    key = await hash(`${kind}:${ip}`);
  const row = await query(
    db,
    `INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count`,
    key,
    now + window,
    now,
    now,
  ).first();
  // Bound cleanup work and avoid scanning the entire table on each request.
  await query(
    db,
    "DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires<=? LIMIT 20)",
    now,
  ).run();
  return row.count > limit;
}
const allow = new Set([
  "/index.html",
  "/style.css",
  "/app.js",
  "/students.js",
  "/submit.html",
  "/admin.html",
  "/withdraw.html",
  "/forms.css",
  "/forms.js",
  "/admin.js",
]);
async function handle(req, env) {
  const url = new URL(req.url),
    path = url.pathname,
    db = env.DB,
    method = req.method;
  if (!path.startsWith("/api/")) {
    const routes = {
      "/": "/index.html",
      "/submit": "/submit.html",
      "/admin": "/admin.html",
      "/withdraw": "/withdraw.html",
    };
    const target = routes[path] || path;
    if (!["GET", "HEAD"].includes(method) || !allow.has(target))
      return new Response("Not found", { status: 404 });
    const assetUrl = new URL(req.url);
    assetUrl.pathname = target;
    return env.ASSETS.fetch(new Request(assetUrl, req));
  }
  if (
    !["GET", "HEAD", "OPTIONS"].includes(method) &&
    req.headers.get("Origin") !== (env.PUBLIC_ORIGIN || url.origin)
  )
    return error("This request must come from the yearbook website.", 403);
  const password = env.ADMIN_PASSWORD || "",
    version = await hash(password);
  const match = (req.headers.get("Cookie") || "").match(
    /(?:^|;\s*)ep_session=([A-Za-z0-9_-]{43})(?:;|$)/,
  );
  let session = null;
  if (match && password.length >= 16 && password.length <= 256)
    session = await query(
      db,
      "SELECT hash FROM sessions WHERE hash=? AND expires>? AND password_version=?",
      await hash(match[1]),
      Date.now(),
      version,
    ).first();
  const id = (s) =>
    /^\d+$/.test(s) && Number.isSafeInteger(Number(s)) ? Number(s) : -1;
  const rate = async (kind, n, ms) => limited(db, req, kind, n, ms);
  const tooMany = () =>
    error("Too many attempts. Please try again later.", 429);
  const readJson = async () =>
    JSON.parse(new TextDecoder().decode(await bodyBytes(req, 8192)));
  if (method === "GET" && path === "/api/health") return json({ ok: true });
  if (method === "GET" && path === "/api/profiles") {
    const { results } = await query(
      db,
      "SELECT id,name,initials,quote,property,birthday,photo IS NOT NULL AS has_photo FROM submissions WHERE status='approved' ORDER BY id",
    ).all();
    return json({
      profiles: results.map(({ has_photo, ...r }) => ({
        ...r,
        photo: has_photo ? `/api/photos/${r.id}` : "",
        example: false,
      })),
    });
  }
  let m = path.match(/^\/api\/photos\/(\d+)$/);
  if (method === "GET" && m) {
    const row = await query(
      db,
      "SELECT photo,photo_mime FROM submissions WHERE id=? AND status='approved'",
      id(m[1]),
    ).first();
    return row?.photo && row.photo_mime === "image/jpeg"
      ? new Response(new Uint8Array(row.photo), {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        })
      : new Response(null, { status: 404 });
  }
  if (method === "POST" && path === "/api/submissions") {
    if (await rate("submit", 120, 3600000)) return tooMany();
    const bytes = await bodyBytes(req, 1200000);
    const form = await new Response(bytes, {
      headers: { "Content-Type": req.headers.get("Content-Type") || "" },
    }).formData();
    if (
      [...form.entries()].length > 8 ||
      [...form.entries()].some(
        ([k, v]) =>
          ![
            "name",
            "initials",
            "quote",
            "property",
            "birthday",
            "consent",
            "photo",
          ].includes(k) ||
          form.getAll(k).length !== 1 ||
          (typeof v === "string" && v.length > 2048),
      )
    )
      return error("The form contains too many or oversized fields.");
    const text = (k, min, max) =>
      typeof form.get(k) === "string" &&
      form.get(k).trim().length >= min &&
      form.get(k).trim().length <= max;
    if (
      !text("name", 2, 80) ||
      !text("quote", 1, 240) ||
      !text("property", 1, 60) ||
      (form.get("initials") && !text("initials", 1, 4))
    )
      return error(
        "Enter a name (2–80 characters), a quote (up to 240), a description (up to 60), and initials of up to 4 characters.",
      );
    if (!validBirthday(form.get("birthday")))
      return error("Birthday is required. Enter a valid date in DD-MM-YYYY format, such as 29-02-2004, that is not in the future.");
    if (form.get("consent") !== "true")
      return error("Your permission to publish is required.");
    let photo = null;
    const file = form.get("photo");
    if (!file || (typeof file !== "string" && !file.size))
      return error("A photo is required.");
    if (file && typeof file !== "string" && file.size) {
      try {
        photo = sanitizeJpeg(await file.arrayBuffer());
      } catch {
        return error(
          "Use a valid JPEG photo no larger than 1 MB and 1000 × 1200 pixels.",
        );
      }
    } else if (file && typeof file === "string") return error(invalid);
    const name = form.get("name").trim(),
      initials =
        form.get("initials")?.trim() ||
        name
          .split(/\s+/)
          .slice(0, 2)
          .map((w) => Array.from(w)[0])
          .join(""),
      secret = token(),
      now = new Date().toISOString();
    const result = await query(
      db,
      "INSERT INTO submissions(name,initials,quote,property,birthday,photo,photo_mime,withdrawal_hash,consent_version,consent_at,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM submissions)<200",
      name,
      initials,
      form.get("quote").trim(),
      form.get("property").trim(),
      form.get("birthday") || null,
      photo ? Array.from(photo) : null,
      photo ? "image/jpeg" : null,
      await hash(secret),
      "birthday-full-date-v3",
      now,
      now,
    ).run();
    if (!result.meta.changes)
      return error(
        "The archive has reached its submission capacity. Please ask the batch admin to review and clear old entries.",
        503,
      );
    return json(
      {
        id: Number(result.meta.last_row_id),
        status: "pending",
        withdrawalToken: secret,
      },
      201,
    );
  }
  m = path.match(/^\/api\/submissions\/(\d+)(\/status)?$/);
  if (m && ((method === "GET" && m[2]) || (method === "DELETE" && !m[2]))) {
    const status = method === "GET";
    if (await rate(status ? "status" : "withdraw", status ? 60 : 30, 900000))
      return tooMany();
    const h = await hash(req.headers.get("x-withdrawal-token") || "");
    if (status) {
      const row = await query(
        db,
        "SELECT status FROM submissions WHERE id=? AND withdrawal_hash=?",
        id(m[1]),
        h,
      ).first();
      return row ? json(row) : error(privateLink, 404);
    }
    const r = await query(
      db,
      "DELETE FROM submissions WHERE id=? AND withdrawal_hash=?",
      id(m[1]),
      h,
    ).run();
    return r.meta.changes
      ? json({ ok: true })
      : error(
          "This private link is invalid, or the submission has already been removed.",
          404,
        );
  }
  if (method === "POST" && path === "/api/admin/login") {
    if (await rate("login", 5, 900000)) return tooMany();
    if (password.length < 16 || password.length > 256)
      return error(
        "Admin access is not configured. Set ADMIN_PASSWORD on the server.",
        503,
      );
    const candidate = (await readJson())?.password;
    const a = await hash(
      typeof candidate === "string" && candidate.length <= 256 ? candidate : "",
    );
    let diff = 0;
    for (let i = 0; i < a.length; i++)
      diff |= a.charCodeAt(i) ^ version.charCodeAt(i);
    if (diff || typeof candidate !== "string" || candidate.length > 256)
      return error("Incorrect password.", 401);
    const secret = token();
    await query(
      db,
      "DELETE FROM sessions WHERE hash IN (SELECT hash FROM sessions WHERE expires<? LIMIT 20)",
      Date.now(),
    ).run();
    await query(
      db,
      "INSERT INTO sessions(hash,expires,password_version) VALUES(?,?,?)",
      await hash(secret),
      Date.now() + 28800000,
      version,
    ).run();
    return json({ ok: true }, 200, {
      "Set-Cookie": `ep_session=${secret}; HttpOnly; Secure; SameSite=Strict; Max-Age=28800; Path=/api/admin`,
    });
  }
  if (path.startsWith("/api/admin/")) {
    if (!session) return error("Sign in to review submissions.", 401);
    if (method === "POST" && path === "/api/admin/logout") {
      await query(db, "DELETE FROM sessions WHERE hash=?", session.hash).run();
      return json({ ok: true }, 200, {
        "Set-Cookie":
          "ep_session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/api/admin",
      });
    }
    if (method === "GET" && path === "/api/admin/session")
      return json({ ok: true });
    if (method === "GET" && path === "/api/admin/submissions") {
      const status = ["pending", "approved", "rejected"].includes(
          url.searchParams.get("status"),
        )
          ? url.searchParams.get("status")
          : "pending",
        page = Math.max(
          0,
          Math.min(100000, parseInt(url.searchParams.get("page"), 10) || 0),
        );
      const { results } = await query(
        db,
        "SELECT id,name,initials,quote,property,birthday,status,consent_version,consent_at,created_at,reviewed_at,photo IS NOT NULL AS has_photo FROM submissions WHERE status=? ORDER BY id DESC LIMIT 50 OFFSET ?",
        status,
        page * 50,
      ).all();
      const { total } = await query(
        db,
        "SELECT COUNT(*) AS total FROM submissions WHERE status=?",
        status,
      ).first();
      return json({ submissions: results, total, page });
    }
    m = path.match(/^\/api\/admin\/photos\/(\d+)$/);
    if (method === "GET" && m) {
      const row = await query(
        db,
        "SELECT photo,photo_mime FROM submissions WHERE id=?",
        id(m[1]),
      ).first();
      return row?.photo && row.photo_mime === "image/jpeg"
        ? new Response(new Uint8Array(row.photo), {
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          })
        : new Response(null, { status: 404 });
    }
    m = path.match(/^\/api\/admin\/submissions\/(\d+)\/details$/);
    if (method === "PATCH" && m) {
      const current = await query(db,
        "SELECT name,initials,quote,property,birthday FROM submissions WHERE id=?",
        id(m[1]),
      ).first();
      if (!current) return error("Submission not found.", 404);
      const { details, error: message } = validateProfileEdit(current, await readJson());
      if (message) return error(message);
      const result = await query(db,
        "UPDATE submissions SET name=?,initials=?,quote=?,property=?,birthday=? WHERE id=?",
        details.name, details.initials, details.quote, details.property,
        details.birthday, id(m[1]),
      ).run();
      return result.meta.changes ? json({ ok: true }) : error("Submission not found.", 404);
    }
    m = path.match(/^\/api\/admin\/submissions\/(\d+)$/);
    if (m && ["PATCH", "DELETE"].includes(method)) {
      let result;
      if (method === "PATCH") {
        const status = (await readJson())?.status;
        if (!["approved", "rejected", "pending"].includes(status))
          return error("Choose approved, rejected, or pending.");
        result = await query(
          db,
          "UPDATE submissions SET status=?,reviewed_at=? WHERE id=?",
          status,
          new Date().toISOString(),
          id(m[1]),
        ).run();
      } else
        result = await query(
          db,
          "DELETE FROM submissions WHERE id=?",
          id(m[1]),
        ).run();
      return result.meta.changes
        ? json({ ok: true })
        : error("Submission not found.", 404);
    }
  }
  return error("Not found.", 404);
}
export default {
  async fetch(req, env) {
    let response;
    try {
      response = await handle(req, env);
    } catch (e) {
      if (
        e instanceof SyntaxError ||
        e instanceof TypeError ||
        e.message === "body"
      )
        response = error(invalid);
      else {
        console.error("Request failed:", e.message);
        response = error(
          "The request could not be completed. Please try again.",
          500,
        );
      }
    }
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'",
    );
    headers.set(
      "Cache-Control",
      new URL(req.url).pathname.startsWith("/api/") ? "no-store" : "no-cache",
    );
    if (new URL(req.url).protocol === "https:")
      headers.set("Strict-Transport-Security", "max-age=31536000");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
