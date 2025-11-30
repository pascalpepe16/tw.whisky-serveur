// server.js — TW eQSL (Cloudinary-only, lecture depuis data/qsl.json)
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

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const DATA_FILE = path.join(DATA_DIR, "qsl.json");
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

function loadQSL() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return []; }
}
function saveQSL(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

let qslList = loadQSL();

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp/" }));
app.use(express.static(path.join(__dirname, "public")));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dqpvrfjeu",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || ""
});

// helper wrap
function wrapText(text, max = 32) {
  if (!text) return "";
  const words = text.trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + w).length > max) { lines.push(line.trim()); line = ""; }
    line += w + " ";
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join("\n");
}

// upload + generate
app.post("/upload", async (req, res) => {
  try {
    if (!req.files || !req.files.qsl) return res.json({ success: false, error: "Aucune image fournie" });

    const img = req.files.qsl;
    const baseImg = sharp(img.tempFilePath).resize({ width: 1400, height: 900, fit: "inside", withoutEnlargement: true });
    const meta = await baseImg.metadata();
    const W = meta.width, H = meta.height, panelWidth = 350;
    const noteText = wrapText(req.body.note || "", 32);

    const svg = `<svg width="${panelWidth}" height="${H}"><rect width="100%" height="100%" fill="white"/>
      <text x="20" y="60" font-size="42" font-weight="700">${(req.body.indicatif||"").toUpperCase()}</text>
      <text x="20" y="120" font-size="28">Date : ${req.body.date||""}</text>
      <text x="20" y="160" font-size="28">UTC : ${req.body.time||""}</text>
      <text x="20" y="200" font-size="28">Bande : ${req.body.band||""}</text>
      <text x="20" y="240" font-size="28">Mode : ${req.body.mode||""}</text>
      <text x="20" y="280" font-size="28">Report : ${req.body.report||""}</text>
      <text x="20" y="340" font-size="22">${noteText}</text></svg>`;

    const svgBuffer = Buffer.from(svg);
    const userBuffer = await baseImg.toBuffer();

    const finalImg = await sharp({ create: { width: W + panelWidth, height: H, channels: 3, background: "white" } })
      .composite([{ input: userBuffer, left: 0, top: 0 }, { input: svgBuffer, left: W, top: 0 }])
      .jpeg({ quality: 92 })
      .toBuffer();

    cloudinary.uploader.upload_stream({ folder: "TW-eQSL" }, (err, result) => {
      if (err) return res.json({ success: false, error: err.message });
      const entry = {
        public_id: result.public_id,
        url: result.secure_url,
        thumb: result.secure_url.replace("/upload/", "/upload/w_300/"),
        indicatif: (req.body.indicatif||"").toUpperCase() || "INCONNU",
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
      res.json({ success: true, qsl: entry });
    }).end(finalImg);

  } catch (err) {
    console.error("UPLOAD ERROR", err);
    res.json({ success: false, error: err.message });
  }
});

// list
app.get("/qsl", (req, res) => res.json(qslList));

// download real file (streams from cloudinary URL to client as attachment)
app.get("/file/:public_id", async (req, res) => {
  try {
    const pid = req.params.public_id;
    const q = qslList.find(x => x.public_id === pid);
    if (!q) return res.status(404).send("Not found");
    q.downloads = (q.downloads || 0) + 1;
    saveQSL(qslList);

    const response = await axios({ url: q.url, method: "GET", responseType: "arraybuffer" });
    res.setHeader("Content-Disposition", `attachment; filename="${(q.indicatif||'qsl')}_${(q.date||'')}.jpg"`);
    res.setHeader("Content-Type", "image/jpeg");
    res.send(response.data);
  } catch (err) {
    console.error("DOWNLOAD ERROR", err);
    res.status(500).send("Erreur téléchargement");
  }
});

// search by callsign
app.get("/download/:call", (req, res) => {
  const call = (req.params.call||"").toUpperCase();
  res.json(qslList.filter(q => ((q.indicatif||"").toUpperCase() === call)));
});

// frontend
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("TW eQSL server running on port " + PORT));
