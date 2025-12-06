import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import { fileURLToPath } from "url";

// Resolve __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
);
app.use(express.static(path.join(__dirname, "public")));

// Cloudinary config
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
  if (!ctx) return {};
  if (ctx.custom && ctx.custom.entry) ctx = ctx.custom.entry;

  if (typeof ctx === "string") {
    return ctx.split("|").reduce((acc, p) => {
      const [k, ...rest] = p.split("=");
      acc[k] = decodeURIComponent(rest.join("=") || "");
      return acc;
    }, {});
  }

  if (typeof ctx === "object") return ctx;
  return {};
}

function wrapText(text = "", max = 32) {
  if (!text) return "";
  const words = text.split(/\s+/);
  const out = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max) {
      out.push(line.trim());
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line.trim()) out.push(line.trim());
  return out.join("\n");
}

function escapeXml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Routes
app.get("/health", (req, res) => res.json({ ok: true }));

// =======================================
// LIST QSL
// =======================================
app.get("/qsl", async (req, res) => {
  try {
    const r = await cloudinary.search
      .expression("folder:TW-eQSL")
      .sort_by("created_at", "desc")
      .max_results(500)
      .execute();

    const list = r.resources.map((img) => {
      const ctx = parseContext(img.context);
      return {
        public_id: img.public_id,
        url: img.secure_url,
        thumb: img.secure_url.replace("/upload/", "/upload/w_300/"),
        ...ctx,
        downloads: Number(ctx.downloads || 0),
        format: img.format,
      };
    });

    res.json(list);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Erreur Cloudinary" });
  }
});

// =======================================
// UPLOAD + GENERATE QSL
// =======================================
app.post("/upload", async (req, res) => {
  try {
    if (!req.files || !req.files.qsl)
      return res.json({ success: false, error: "Aucune image reçue" });

    const f = req.files.qsl;

    const indicatif = (req.body.indicatif || "").toUpperCase();
    const date = req.body.date || "";
    const time = req.body.time || "";
    const band = req.body.band || "";
    const mode = req.body.mode || "";
    const report = req.body.report || "";
    const note = wrapText(req.body.note || "", 32);

    const userImg = sharp(f.tempFilePath).resize(1400, 900, {
      fit: "inside",
      withoutEnlargement: true,
    });
    const meta = await userImg.metadata();
    const W = meta.width;
    const H = meta.height;
    const P = 350;

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${P}" height="${H}">
      <rect wid
