// server.js — TW eQSL (stable, Render-compatible)
import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import fs from "fs";
import { v2 as cloudinary } from "cloudinary";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- data folder & file (must be committed to git to persist on Render)
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const DATA_FILE = path.join(DATA_DIR, "qsl.json");
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");

// helpers
function loadQSL() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return []; }
}
function saveQSL(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), "utf8");
}

let qslList = loadQSL();

// --- express init
const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp/" }));
app.use(express.static(path.join(__dirname, "public")));

const LOCAL_TEMPLATE = path.join(__dirname, "template", "eqsl_template.jpg");

// --- cloudinary config (use env vars in production)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dqpvrfjeu",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || ""
});

// --- util wrap text
function wrapText(text = "", max = 32) {
  const words = text.trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + w).length > max) {
      lines.push(line.trim());
      line = "";
    }
    line += w + " ";
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join("\n");
}

// --- UPLOAD & GENERATE QSL
app.post("/upload", async (req, res) => {
  try {
    if (!req.files || !req.files.qsl) return res.json({ success: false, error: "Aucune image fournie" });

    const imgFile = req.files.qsl;
    // resize user image to max 1400x900, keep aspect (fit: inside)
    const base = sharp(imgFile.tempFilePath).resize({ width: 1400, height: 900, fit: "inside", withoutEnlargement: true });
    const meta = await base.metadata();
    const W = meta.width;
    const H = meta.height;

    // panel on the right
    const panelWidth = 350;
    const panelHeight = H;

    // prepare SVG panel (same height as image)
    const noteWrapped = wrapText(req.body.note || "", 32).replace(/\n/g, "<tspan x='20' dy='1.2em'>");
    // Build multi-line safe SVG: we'll split lines into tspans to control line spacing
    const noteLines = (req.body.note || "") ? wrapText(req.body.note || "", 32).split("\n") : [];
    const noteTspans = noteLines.map((ln, idx) => `<tspan x="20" dy="${idx===0 ? '0' : '1.2em'}">${ln}</tspan>`).join("");

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${panelWidth}" height="${panelHeight}">
        <rect width="100%" height="100%" fill="white"/>
        <text x="20" y="60" font-size="42" font-weight="700" fill="black">${(req.body.indicatif||"").toUpperCase()}</text>
        <text x="20" y="120" font-size="28" fill="black">Date : ${req.body.date || ""}</text>
        <text x="20" y="160" font-size="28" fill="black">UTC : ${req.body.time || ""}</text>
        <text x="20" y="200" font-size="28" fill="black">Bande : ${req.body.band || ""}</text>
        <text x="20" y="240" font-size="28" fill="black">Mode : ${req.body.mode || ""}</text>
        <text x="20" y="280" font-size="28" fill="black">Report : ${req.body.report || ""}</text>
        <text x="20" y="340" font-size="22" fill="black">${noteTspans}</text>
      </svg>
    `;
    const svgBuffer = Buffer.from(svg);

    const userBuffer = await base.toBuffer();

    // final canvas larger than both images (userBuffer fits at left)
    const finalBuffer = await sharp({
      create: {
        width: W + panelWidth,
        height: H,
        channels: 3,
        background: "white"
      }
    })
      .composite([
        { input: userBuffer, left: 0, top: 0 },
        { input: svgBuffer, left: W, top: 0 }
      ])
      .jpeg({ quality: 92 })
      .toBuffer();

    // upload to Cloudinary (stream)
    cloudinary.uploader.upload_stream({ folder: "TW-eQSL" }, (err, result) => {
      if (err) {
        console.error("Cloudinary upload error:", err);
        return res.json({ success: false, error: err.message || "Cloudinary error" });
      }
      const entry = {
        public_id: result.public_id,
        url: result.secure_url,
        thumb: result.secure_url.replace("/upload/", "/upload/w_300/"),
        indicatif: (req.body.indicatif || "").toUpperCase() || "INCONNU",
        date: req.body.date || "",
        time: req.body.time || "",
        band: req.body.band || "",
        mode: req.body.mode || "",
        report: req.body.report || "",
        note: req.body.note || "",
        downloads: 0
      };
      qslList.push(entry);
      saveQSL(qslList);
      return res.json({ success: true, qsl: entry });
    }).end(finalBuffer);

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    return res.json({ success: false, error: err.message || String(err) });
  }
});

// --- LIST ALL QSL (gallery)
app.get("/qsl", (req, res) => {
  res.json(qslList);
});

// --- FILE: stream the real JPEG (download direct)
app.get("/file/:public_id", async (req, res) => {
  try {
    const pid = req.params.public_id;
    const q = qslList.find(x => x.public_id === pid);
    if (!q) return res.status(404).send("Not found");

    // increment counter and save
    q.downloads = (q.downloads || 0) + 1;
    saveQSL(qslList);

    // Build Cloudinary attachment URL (raw fetch)
    const cloudName = cloudinary.config().cloud_name;
    const fileUrl = `https://res.cloudinary.com/${cloudName}/image/upload/fl_attachment/${encodeURIComponent(pid)}.jpg`;

    const response = await axios.get(fileUrl, { responseType: "arraybuffer" });

    res.setHeader("Content-Disposition", `attachment; filename="${(q.indicatif||'QSL')}_${q.date||''}.jpg"`);
    res.setHeader("Content-Type", "image/jpeg");
    return res.send(Buffer.from(response.data));
  } catch (err) {
    console.error("DOWNLOAD ERROR:", err);
    return res.status(500).send("Erreur téléchargement");
  }
});

// --- SEARCH by callsign
app.get("/download/:call", (req, res) => {
  const call = (req.params.call || "").toUpperCase();
  res.json(qslList.filter(q => (q.indicatif || "").toUpperCase() === call));
});

// serve frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// start
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("TW eQSL server running on port", PORT));
