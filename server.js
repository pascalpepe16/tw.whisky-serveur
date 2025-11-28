// server.js — TW eQSL (corrigé)
// Utilise variables d'environnement pour Cloudinary (recommandé)

import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import fs from "fs";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import { fileURLToPath } from "url";

// PATHS + DATA
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DATA_FILE = path.join(DATA_DIR, "qsl.json");
// create file if missing
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");

// safe load
function loadQSL() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    if (!raw || !raw.trim()) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.warn("qsl.json missing or corrupt - resetting");
    fs.writeFileSync(DATA_FILE, "[]", "utf8");
    return [];
  }
}
let qslList = loadQSL();

function saveQSL() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(qslList, null, 2), "utf8");
}

// EXPRESS INIT
const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: "/tmp/"
}));
app.use(express.static(path.join(__dirname, "public")));

// CLOUDINARY (use env vars in production)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dqpvrfjeu",
  api_key: process.env.CLOUDINARY_API_KEY || "825331418956744",
  api_secret: process.env.CLOUDINARY_API_SECRET || "XJKCIOnfRfD8sFXYuDjNrB-1zpE"
});

// helper: wrap text into lines
function wrapText(text = "", max = 32) {
  text = String(text || "");
  const words = text.trim().split(/\s+/);
  let lines = [], line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line.trim());
  return lines.join("\n");
}

// UPLOAD + GENERATE
app.post("/upload", async (req, res) => {
  try {
    if (!req.files?.qsl) return res.json({ success: false, error: "Aucune image QSL fournie" });

    // Read fields (indicatif, date, time, band, mode, report, note)
    const indicatif = (req.body.indicatif || "").toUpperCase();
    const date = req.body.date || "";
    const time = req.body.time || "";
    const band = req.body.band || "";
    const mode = req.body.mode || "";
    const report = req.body.report || "";
    const note = req.body.note || "";

    const imgFile = req.files.qsl;

    // Resize user image to fit inside 1400x900 without distortion
    const baseImg = sharp(imgFile.tempFilePath).resize({
      width: 1400,
      height: 900,
      fit: "inside",
      withoutEnlargement: true
    });

    const meta = await baseImg.metadata();
    const W = meta.width;
    const H = meta.height;

    const panelWidth = 350;
    const noteWrapped = wrapText(note, 32);

    // SVG panel to the right (height = H)
    const svg = `
      <svg width="${panelWidth}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="white"/>
        <text x="20" y="60" font-size="42" font-weight="700" fill="black">${indicatif}</text>
        <text x="20" y="120" font-size="28" fill="black">Date : ${date}</text>
        <text x="20" y="160" font-size="28" fill="black">UTC  : ${time}</text>
        <text x="20" y="200" font-size="28" fill="black">Bande : ${band}</text>
        <text x="20" y="240" font-size="28" fill="black">Mode : ${mode}</text>
        <text x="20" y="280" font-size="28" fill="black">Report: ${report}</text>
        <text x="20" y="340" font-size="22" fill="black">${noteWrapped}</text>
      </svg>
    `;

    const svgBuffer = Buffer.from(svg);
    const userBuffer = await baseImg.toBuffer();

    // create final canvas (must be >= sizes)
    const final = await sharp({
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

    // upload to Cloudinary
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "TW-eQSL" },
      (err, result) => {
        if (err) {
          console.error("Cloudinary upload error:", err);
          return res.json({ success: false, error: err.message || "Cloudinary error" });
        }

        const entry = {
          id: Date.now(),
          indicatif,
          url: result.secure_url,
          thumb: result.secure_url.replace("/upload/", "/upload/w_300/"),
          date,
          downloads: 0
        };

        qslList.push(entry);
        saveQSL();

        return res.json({ success: true, qsl: entry });
      }
    );

    uploadStream.end(final);

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    return res.json({ success: false, error: err.message || String(err) });
  }
});

// GALLERY
app.get("/qsl", (req, res) => res.json(qslList));

// DIRECT FILE (increments downloads, redirect to Cloudinary URL)
app.get("/file/:id", (req, res) => {
  const qsl = qslList.find(x => String(x.id) === String(req.params.id));
  if (!qsl) return res.status(404).send("Not found");
  qsl.downloads = (qsl.downloads || 0) + 1;
  saveQSL();
  // redirect so browser downloads (depending on headers)
  res.redirect(qsl.url);
});

// SEARCH BY CALLSIGN
app.get("/download/:call", (req, res) => {
  const call = (req.params.call || "").toUpperCase();
  res.json(qslList.filter(x => (x.indicatif || "").toUpperCase() === call));
});

// frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
