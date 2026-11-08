import express from "express";
import helmet from "helmet";
import multer from "multer";
import sharp from "sharp";
import { rateLimit } from "express-rate-limit";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const consentVersion = "birthday-v2";
function validBirthday(value) {
  if (value == null || value === "") return true;
  if (
    typeof value !== "string" ||
    !/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)
  )
    return false;
  const [month, day] = value.split("-").map(Number);
  return day <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function createApp(config = {}) {
  const production = config.production ?? process.env.NODE_ENV === "production";
  const password = config.adminPassword ?? process.env.ADMIN_PASSWORD ?? "";
  const origin =
    config.origin ?? process.env.PUBLIC_ORIGIN ?? "http://localhost:3000";
  if (password && (password.length < 16 || password.length > 256))
    throw new Error(
      "ADMIN_PASSWORD must contain at least 16 characters and at most 256.",
    );
  if (production && (!password || !origin.startsWith("https://")))
    throw new Error(
      "Production requires ADMIN_PASSWORD and an HTTPS PUBLIC_ORIGIN.",
    );
  const dataDir = path.resolve(
    config.dataDir ?? process.env.DATA_DIR ?? "./data",
  );
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dataDir, "yearbook.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, initials TEXT NOT NULL,
      quote TEXT NOT NULL, property TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','approved','rejected')), photo BLOB,
      withdrawal_hash TEXT NOT NULL, consent_version TEXT NOT NULL, consent_at TEXT NOT NULL,
      created_at TEXT NOT NULL, reviewed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL, password_version TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS submissions_status ON submissions(status,id);`);
  if (
    !db
      .prepare("PRAGMA table_info(submissions)")
      .all()
      .some((column) => column.name === "birthday")
  )
    db.exec("ALTER TABLE submissions ADD COLUMN birthday TEXT");
  const salt = randomBytes(16);
  const passwordHash = password ? scryptSync(password, salt, 64) : null;
  const passwordVersion = hash(password);
  const app = express();
  app.disable("x-powered-by");
  if ((config.trustProxy ?? process.env.TRUST_PROXY) === "1")
    app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "blob:"],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: production ? [] : null,
        },
      },
      strictTransportSecurity: production ? undefined : false,
    }),
  );
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") !== origin
    )
      return res
        .status(403)
        .json({ error: "This request must come from the yearbook website." });
    next();
  });
  app.use(express.json({ limit: "8kb" }));
  const limiter = (windowMs, limit) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many attempts. Please try again later." },
    });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 8 * 1024 * 1024,
      files: 1,
      fields: 7,
      fieldSize: 2048,
      parts: 8,
    },
  });
  function session(req) {
    const match = (req.headers.cookie || "").match(
      /(?:^|;\s*)ep_session=([A-Za-z0-9_-]{43})(?:;|$)/,
    );
    if (!match) return null;
    return db
      .prepare(
        "SELECT hash FROM sessions WHERE hash=? AND expires>? AND password_version=?",
      )
      .get(hash(match[1]), Date.now(), passwordVersion);
  }
  function admin(req, res, next) {
    if (!session(req))
      return res.status(401).json({ error: "Sign in to review submissions." });
    next();
  }
  const fields =
    "id,name,initials,quote,property,birthday,status,consent_version,consent_at,created_at,reviewed_at,photo IS NOT NULL AS has_photo";
  const safeId = (req) =>
    /^\d+$/.test(req.params.id) ? Number(req.params.id) : -1;
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/profiles", (_req, res) => {
    const rows = db
      .prepare(
        "SELECT id,name,initials,quote,property,birthday,photo IS NOT NULL AS has_photo FROM submissions WHERE status='approved' ORDER BY id",
      )
      .all();
    res.json({
      profiles: rows.map(({ has_photo, ...row }) => ({
        ...row,
        photo: has_photo ? `/api/photos/${row.id}` : "",
        example: false,
      })),
    });
  });
  app.get("/api/photos/:id", (req, res) => {
    const row = db
      .prepare("SELECT photo FROM submissions WHERE id=? AND status='approved'")
      .get(safeId(req));
    if (!row?.photo) return res.sendStatus(404);
    res.type("webp").send(Buffer.from(row.photo));
  });
  app.post(
    "/api/submissions",
    limiter(60 * 60 * 1000, 120),
    upload.single("photo"),
    async (req, res) => {
      const body = req.body || {};
      const text = (key, min, max) =>
        typeof body[key] === "string" &&
        body[key].trim().length >= min &&
        body[key].trim().length <= max;
      if (
        !text("name", 2, 80) ||
        !text("quote", 1, 240) ||
        !text("property", 1, 60) ||
        (body.initials && !text("initials", 1, 4))
      )
        return res.status(400).json({
          error:
            "Enter a name (2–80 characters), a quote (up to 240), a description (up to 60), and initials of up to 4 characters.",
        });
      if (!validBirthday(body.birthday))
        return res
          .status(400)
          .json({
            error: "Enter a valid birthday in MM-DD format, such as 02-29.",
          });
      if (body.consent !== "true")
        return res
          .status(400)
          .json({ error: "Your permission to publish is required." });
      let photo = null;
      if (req.file) {
        try {
          const input = sharp(req.file.buffer, {
            limitInputPixels: 25000000,
            animated: false,
            failOn: "error",
          });
          const meta = await input.metadata();
          if (!["jpeg", "png", "webp"].includes(meta.format))
            return res
              .status(400)
              .json({ error: "Use a JPEG, PNG, or WebP photo." });
          photo = await input
            .rotate()
            .resize({
              width: 1000,
              height: 1200,
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: 82 })
            .toBuffer();
        } catch {
          return res.status(400).json({
            error:
              "This photo could not be read. Use a valid JPEG, PNG, or WebP image under 8 MB and 25 megapixels.",
          });
        }
      }
      const secret = token();
      const now = new Date().toISOString();
      const initials =
        body.initials?.trim() ||
        body.name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => Array.from(word)[0])
          .join("");
      const result = db
        .prepare(
          "INSERT INTO submissions(name,initials,quote,property,birthday,photo,withdrawal_hash,consent_version,consent_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          body.name.trim(),
          initials,
          body.quote.trim(),
          body.property.trim(),
          body.birthday || null,
          photo,
          hash(secret),
          consentVersion,
          now,
          now,
        );
      res.status(201).json({
        id: Number(result.lastInsertRowid),
        status: "pending",
        withdrawalToken: secret,
      });
    },
  );
  app.get(
    "/api/submissions/:id/status",
    limiter(15 * 60 * 1000, 60),
    (req, res) => {
      const row = db
        .prepare(
          "SELECT status FROM submissions WHERE id=? AND withdrawal_hash=?",
        )
        .get(safeId(req), hash(req.get("x-withdrawal-token") || ""));
      if (!row)
        return res.status(404).json({
          error:
            "This private link is invalid, or the submission has been removed.",
        });
      res.json(row);
    },
  );
  app.delete(
    "/api/submissions/:id",
    limiter(15 * 60 * 1000, 30),
    (req, res) => {
      const result = db
        .prepare("DELETE FROM submissions WHERE id=? AND withdrawal_hash=?")
        .run(safeId(req), hash(req.get("x-withdrawal-token") || ""));
      if (!result.changes)
        return res.status(404).json({
          error:
            "This private link is invalid, or the submission has already been removed.",
        });
      res.json({ ok: true });
    },
  );
  app.post("/api/admin/login", limiter(15 * 60 * 1000, 5), (req, res) => {
    if (!passwordHash)
      return res.status(503).json({
        error:
          "Admin access is not configured. Set ADMIN_PASSWORD on the server.",
      });
    const candidate = req.body?.password;
    if (
      typeof candidate !== "string" ||
      candidate.length > 256 ||
      !timingSafeEqual(scryptSync(candidate, salt, 64), passwordHash)
    )
      return res.status(401).json({ error: "Incorrect password." });
    const secret = token();
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    db.prepare(
      "INSERT INTO sessions(hash,expires,password_version) VALUES(?,?,?)",
    ).run(hash(secret), Date.now() + 8 * 60 * 60 * 1000, passwordVersion);
    res
      .cookie("ep_session", secret, {
        httpOnly: true,
        secure: production,
        sameSite: "strict",
        maxAge: 8 * 60 * 60 * 1000,
        path: "/api/admin",
      })
      .json({ ok: true });
  });
  app.post("/api/admin/logout", admin, (req, res) => {
    db.prepare("DELETE FROM sessions WHERE hash=?").run(session(req).hash);
    res
      .clearCookie("ep_session", {
        httpOnly: true,
        secure: production,
        sameSite: "strict",
        path: "/api/admin",
      })
      .json({ ok: true });
  });
  app.get("/api/admin/session", admin, (_req, res) => res.json({ ok: true }));
  app.get("/api/admin/submissions", admin, (req, res) => {
    const status = ["pending", "approved", "rejected"].includes(
      req.query.status,
    )
      ? req.query.status
      : "pending";
    const page = Math.max(
      0,
      Math.min(100000, Number.parseInt(req.query.page, 10) || 0),
    );
    const submissions = db
      .prepare(
        `SELECT ${fields} FROM submissions WHERE status=? ORDER BY id DESC LIMIT 50 OFFSET ?`,
      )
      .all(status, page * 50);
    const { total } = db
      .prepare("SELECT COUNT(*) AS total FROM submissions WHERE status=?")
      .get(status);
    res.json({ submissions, total, page });
  });
  app.get("/api/admin/photos/:id", admin, (req, res) => {
    const row = db
      .prepare("SELECT photo FROM submissions WHERE id=?")
      .get(safeId(req));
    if (!row?.photo) return res.sendStatus(404);
    res.type("webp").send(Buffer.from(row.photo));
  });
  app.patch("/api/admin/submissions/:id", admin, (req, res) => {
    const status = req.body?.status;
    if (!["approved", "rejected", "pending"].includes(status))
      return res
        .status(400)
        .json({ error: "Choose approved, rejected, or pending." });
    const result = db
      .prepare("UPDATE submissions SET status=?,reviewed_at=? WHERE id=?")
      .run(status, new Date().toISOString(), safeId(req));
    if (!result.changes)
      return res.status(404).json({ error: "Submission not found." });
    res.json({ ok: true });
  });
  app.delete("/api/admin/submissions/:id", admin, (req, res) => {
    const result = db
      .prepare("DELETE FROM submissions WHERE id=?")
      .run(safeId(req));
    if (!result.changes)
      return res.status(404).json({ error: "Submission not found." });
    res.json({ ok: true });
  });
  const routes = {
    "/": "index.html",
    "/submit": "submit.html",
    "/admin": "admin.html",
    "/withdraw": "withdraw.html",
  };
  for (const [url, file] of Object.entries(routes))
    app.get(url, (_req, res) => res.sendFile(path.join(root, file)));
  for (const file of [
    "index.html",
    "style.css",
    "app.js",
    "students.js",
    "submit.html",
    "admin.html",
    "withdraw.html",
    "forms.css",
    "forms.js",
    "admin.js",
  ])
    app.get(`/${file}`, (_req, res) => res.sendFile(path.join(root, file)));
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));
  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError)
      return res.status(400).json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "Choose a photo smaller than 8 MB."
            : "The form contains too many or oversized fields.",
      });
    if (error.type === "entity.too.large" || error instanceof SyntaxError)
      return res.status(400).json({ error: "Invalid or oversized request." });
    console.error("Request failed:", error.message);
    res
      .status(500)
      .json({ error: "The request could not be completed. Please try again." });
  });
  return { app, db, close: () => db.close() };
}
