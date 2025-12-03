// -------------------------------------------
//  TW eQSL — SERVER STABLE 2025 (COMPLET)
// -------------------------------------------

import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import { fileURLToPath } from "url";

// System paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// App setup
const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp" }));
app.use(express.static(path.join(__dirname, "public")));

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// -------------------------------------------
// HELPERS
// -------------------------------------------
function buildContext(obj = {}) {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${encodeURIComponent(v || "")}`)
    .join("|");
}

function parseContext(ctx) {
  if (!ctx) return {};
  if (ctx.custom?.entry) ctx = ctx.custom.entry;

  if (typeof ctx === "string") {
    return ctx.split("|").reduce((acc, part) => {
      const [k, ...rest] = part.split("=");
      acc[k] = decodeURIComponent(rest.join("=") || "");
      return acc;
    }, {});
  }

  return {};
}

function wrapText(text = "", max = 32) {
  const words = text.trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max) {
      lines.push(line.trim());
      line = w;
    } else line += " " + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join("\n");
}

function escapeXml(s = "") {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// -------------------------------------------
// ROUTES
// -------------------------------------------

// Health
app.get("/health", (req, res) => res.json({ ok: true }));

// Debug list
app.get("/debug/qsl", async (req, res) => {
  try {
    const result = await cloudinary.search
      .expression("folder:TW-eQSL")
      .max_results(300)
      .execute();
    res.json(result.resources);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------
// GET /qsl — LIST ALL QSL
// -------------------------------------------
app.get("/qsl", async (req, res) => {
  try {
    const result = await cloudinary.search
      .expression("folder:TW-eQSL")
      .sort_by("created_at", "desc")
      .max_results(500)
      .execute();

    const list = result.resources.map(r => {
      const ctx = parseContext(r.context);
      return {
        public_id: r.public_id,
        url: r.secure_url,
        thumb: r.secure_url.replace("/upload/", "/upload/w_300/"),
        indicatif: ctx.indicatif || "",
        date: ctx.date || "",
        time: ctx.time || "",
        band: ctx.band || "",
        mode: ctx.mode || "",
        report: ctx.report || "",
        note: ctx.note || "",
        downloads: Number(ctx.downloads || 0)
      };
    });

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: "Impossible de lister" });
  }
});

// -------------------------------------------
// POST /upload — GENERATE QSL
// -------------------------------------------
app.post("/upload", async (req, res) => {
  try {
    if (!req.files || !req.files.qsl)
      return res.json({ success: false, error: "Aucune image reçue" });

    const file = req.files.qsl;

    const userSharp = sharp(file.tempFilePath).resize({
      width: 1400,
      height: 900,
      fit: "inside",
      withoutEnlargement: true
    });

    const meta = await userSharp.metadata();
    const W = meta.width;
    const H = meta.height;
    const panel = 350;

    const indicatif = (req.body.indicatif || "").toUpperCase();
    const date = req.body.date || "";
    const time = req.body.time || "";
    const band = req.body.band || "";
    const mode = req.body.mode || "";
    const report = req.body.report || "";
    const note = wrapText(req.body.note || "");

    const noteSvg = note
      .split("\n")
      .map((l, i) => `<tspan x="20" dy="${i === 0 ? 0 : 22}">${escapeXml(l)}</tspan>`)
      .join("");

    const svg = `
    <svg width="${panel}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      <text x="20" y="60" font-size="42" font-weight="700">${escapeXml(indicatif)}</text>
      <text x="20" y="120" font-size="28">Date : ${escapeXml(date)}</text>
      <text x="20" y="160" font-size="28">UTC : ${escapeXml(time)}</text>
      <text x="20" y="200" font-size="28">Bande : ${escapeXml(band)}</text>
      <text x="20" y="240" font-size="28">Mode : ${escapeXml(mode)}</text>
      <text x="20" y="280" font-size="28">Report : ${escapeXml(report)}</text>
      <text x="20" y="340" font-size="22">${noteSvg}</text>
    </svg>`;

    const final = await sharp({
      create: { width: W + panel, height: H, channels: 3, background: "white" }
    })
      .composite([
        { input: await userSharp.toBuffer(), left: 0, top: 0 },
        { input: Buffer.from(svg), left: W, top: 0 }
      ])
      .jpeg({ quality: 92 })
      .toBuffer();

    const ctx = buildContext({
      indicatif,
      date,
      time,
      band,
      mode,
      report,
      note,
      downloads: 0
    });

    cloudinary.uploader.upload_stream(
      { folder: "TW-eQSL", context: `entry=${ctx}` },
      (err, result) => {
        if (err) return res.json({ success: false, error: err.message });

        res.json({
          success: true,
          qsl: {
            public_id: result.public_id,
            url: result.secure_url,
            thumb: result.secure_url.replace("/upload/", "/upload/w_300/")
          }
        });
      }
    ).end(final);

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// -------------------------------------------
// GET /download/:call — LIST QSL OF A CALL
// -------------------------------------------
app.get("/download/:call", async (req, res) => {
  try {
    const call = req.params.call.toUpperCase();

    const result = await cloudinary.search
      .expression("folder:TW-eQSL AND context.indicatif=" + call)
      .sort_by("created_at", "desc")
      .max_results(200)
      .execute();

    const list = result.resources.map(r => {
      const ctx = parseContext(r.context);
      return {
        public_id: r.public_id,
        url: r.secure_url,
        thumb: r.secure_url.replace("/upload/", "/upload/w_300/")
      };
    });

    res.json(list);
  } catch (err) {
    res.json([]);
  }
});

// -------------------------------------------
// GET /file?pid=.... — DOWNLOAD REAL IMAGE
// -------------------------------------------
app.get("/file", async (req, res) => {
  try {
    const pid = req.query.pid;
    if (!pid) return res.status(400).send("Missing pid");

    const info = await cloudinary.api.resource(pid);
    const ctx = parseContext(info.context);

    const filename = `${ctx.indicatif || pid}_${ctx.date || ""}.jpg`;

    const r = await axios.get(info.secure_url, { responseType: "arraybuffer" });

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(Buffer.from(r.data));

  } catch (err) {
    res.status(500).send("Erreur téléchargement");
  }
});

// -------------------------------------------
// SPA fallback
// -------------------------------------------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Start
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`TW eQSL server online on port ${PORT}`)
);
