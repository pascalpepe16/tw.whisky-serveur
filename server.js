// server.js - TW eQSL (final, production-ready)
// Requires env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp/" }));
app.use(express.static(path.join(__dirname, "public")));

// Cloudinary config via env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helpers
function buildContext(obj = {}) {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${encodeURIComponent(v || "")}`)
    .join("|");
}

function parseContext(ctx) {
  if (!ctx || !ctx.custom || !ctx.custom.entry) return {};
  return ctx.custom.entry.split("|").reduce((acc, p) => {
    const [k, ...rest] = p.split("=");
    acc[k] = decodeURIComponent(rest.join("=") || "");
    return acc;
  }, {});
}

function wrapText(text = "", max = 32) {
  if (!text) return "";
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max) {
      if (line.trim()) lines.push(line.trim());
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join("\n");
}

// Health
app.get("/health", (req, res) => res.json({ ok: true }));

// Debug: quick list read from Cloudinary (not used by normal UI)
app.get("/debug/qsl", async (req, res) => {
  try {
    const result = await cloudinary.search
      .expression("folder:TW-eQSL")
      .max_results(200)
      .execute();
    res.json(result.resources || []);
  } catch (err) {
    console.error("DEBUG ERROR", err?.message || err);
    res.status(500).json({ error: "Cloudinary error" });
  }
});

// GET /qsl - list QSL (pulls meta from Cloudinary)
app.get("/qsl", async (req, res) => {
  try {
    const result = await cloudinary.search
      .expression("folder:TW-eQSL")
      .sort_by("created_at", "desc")
      .max_results(500)
      .execute();

    const list = (result.resources || []).map((r) => {
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
        downloads: Number(ctx.downloads || 0),
        format: r.format || "jpg",
      };
    });

    res.json(list);
  } catch (err) {
    console.error("GET /qsl ERROR", err?.message || err);
    res.status(500).json({ error: "Impossible de lister QSL (Cloudinary)" });
  }
});

// POST /upload - generate composed QSL image and upload to Cloudinary
// Expects form-data: qsl (file), indicatif, date, time, band, mode, report, note
app.post("/upload", async (req, res) => {
  try {
    if (!req.files || !req.files.qsl) {
      return res.status(400).json({ success: false, error: "Aucune image reçue" });
    }

    // Early check cloudinary credentials
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(500).json({ success: false, error: "Cloudinary non configuré (variables d'environnement manquantes)" });
    }

    const file = req.files.qsl;

    // Resize user image to max 1400x900 (keeping aspect ratio)
    const userSharp = sharp(file.tempFilePath).resize({ width: 1400, height: 900, fit: "inside", withoutEnlargement: true });
    const meta = await userSharp.metadata();
    const W = meta.width || 1400;
    const H = meta.height || 900;
    const panelWidth = 350;

    const indicatif = (req.body.indicatif || "").toUpperCase();
    const date = req.body.date || "";
    const time = req.body.time || "";
    const band = req.body.band || "";
    const mode = req.body.mode || "";
    const report = req.body.report || "";
    const note = wrapText(req.body.note || "", 32);

    // Build SVG panel (note uses tspans for multiline)
    const noteTspans = note.split("\n").map((ln, i) => `<tspan x="20" dy="${i === 0 ? 0 : 22}">${ln}</tspan>`).join("");
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" width="${panelWidth}" height="${H}">
      <rect width="100%" height="100%" fill="white"/>
      <text x="20" y="60" font-size="42" font-weight="700" fill="black">${indicatif}</text>
      <text x="20" y="120" font-size="28" fill="black">Date : ${date}</text>
      <text x="20" y="160" font-size="28" fill="black">UTC  : ${time}</text>
      <text x="20" y="200" font-size="28" fill="black">Bande : ${band}</text>
      <text x="20" y="240" font-size="28" fill="black">Mode : ${mode}</text>
      <text x="20" y="280" font-size="28" fill="black">Report : ${report}</text>
      <text x="20" y="340" font-size="22" fill="black">${noteTspans}</text>
    </svg>`;

    const svgBuffer = Buffer.from(svg);
    const userBuffer = await userSharp.toBuffer();

    // Compose final canvas: width = W + panelWidth, height = H
    const finalBuffer = await sharp({
      create: { width: W + panelWidth, height: H, channels: 3, background: "white" }
    })
      .composite([
        { input: userBuffer, left: 0, top: 0 },
        { input: svgBuffer, left: W, top: 0 }
      ])
      .jpeg({ quality: 92 })
      .toBuffer();

    // Prepare context metadata for Cloudinary (so we can retrieve later)
    const ctxStr = buildContext({
      indicatif,
      date,
      time,
      band,
      mode,
      report,
      note,
      downloads: 0
    });

    // Upload buffer to Cloudinary (upload_stream)
    cloudinary.uploader.upload_stream({ folder: "TW-eQSL", context: `entry=${ctxStr}` }, (err, result) => {
      if (err) {
        console.error("Cloudinary upload error:", err);
        return res.status(500).json({ success: false, error: err.message || "Upload Cloudinary failed" });
      }

      // Return the newly created object
      return res.json({
        success: true,
        qsl: {
          public_id: result.public_id,
          url: result.secure_url,
          thumb: result.secure_url.replace("/upload/", "/upload/w_300/"),
          indicatif,
          date,
          time,
          band,
          mode,
          report,
          note,
          downloads: 0
        }
      });
    }).end(finalBuffer);

  } catch (err) {
    console.error("UPLOAD ERROR:", err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || "Erreur serveur lors de la génération" });
  }
});

// GET /download/:call — search by callsign (reads Cloudinary)
app.get("/download/:call", async (req, res) => {
  try {
    const call = (req.params.call || "").toUpperCase();
    if (!call) return res.json([]);

    // Query Cloudinary and parse contexts
    const result = await cloudinary.search
      .expression("folder:TW-eQSL")
      .sort_by("created_at", "desc")
      .max_results(500)
      .execute();

    const list = (result.resources || []).map(r => {
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
        downloads: Number(ctx.downloads || 0),
        format: r.format || "jpg"
      };
    }).filter(x => (x.indicatif || "").toUpperCase() === call);

    return res.json(list);
  } catch (err) {
    console.error("SEARCH ERROR", err?.message || err);
    return res.status(500).json([]);
  }
});

// GET /file/:public_id — fetch bytes from Cloudinary and return as attachment (download)
app.get("/file/:public_id", async (req, res) => {
  try {
    const public_id = req.params.public_id;

    // Get resource info (format + secure_url + context)
    const info = await cloudinary.api.resource(public_id, { resource_type: "image" });

    const ctx = parseContext(info.context);
    // Increment downloads in context (best effort)
    try {
      const downloads = (Number(ctx.downloads) || 0) + 1;
      const newCtxStr = buildContext({ ...ctx, downloads });
      await cloudinary.uploader.explicit(public_id, { type: "upload", context: `entry=${newCtxStr}` });
    } catch (e) {
      console.warn("Could not update downloads count:", e?.message || e);
    }

    // Determine filename and extension
    const ext = info.format || "jpg";
    const safeName = ((ctx.indicatif || public_id).replace(/\W+/g, "_")).slice(0, 140);
    const filename = `${safeName}_${ctx.date || ""}.${ext}`;

    // Fetch bytes from Cloudinary secure url
    const r = await axios.get(info.secure_url, { responseType: "arraybuffer" });
    res.setHeader("Content-Type", `image/${ext}`);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(Buffer.from(r.data));
  } catch (err) {
    console.error("FILE ERROR:", err?.message || err);
    return res.status(500).send("Impossible de télécharger la QSL");
  }
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Start
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`TW-eQSL server listening on ${PORT}`));
