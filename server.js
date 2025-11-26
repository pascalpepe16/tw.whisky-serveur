// server.js
// TW eQSL — Stable final: auto panel (C), panel width fixed 350px (1),
// GitHub persistence, Cloudinary upload, robust Sharp composition.

import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp/" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

// -------------------
// Cloudinary config
// -------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dqpvrfjeu",
  api_key: process.env.CLOUDINARY_API_KEY || "825331418956744",
  api_secret: process.env.CLOUDINARY_API_SECRET || "XJKCIOnfRfD8sFXYuDjNrB-1zpE"
});

// -------------------
// GitHub config (persistence)
// -------------------
const GH_TOKEN = process.env.GITHUB_TOKEN || "";
const GH_REPO = process.env.GITHUB_REPO || ""; // e.g. pascalpepe16/tw.whisky-serveur
const GH_FILE = process.env.GITHUB_FILE || "data/qsl.json";

// -------------------
// In-memory list (will be loaded from GitHub at startup)
// -------------------
let qslList = [];

// -------------------
// Helpers
// -------------------
function wrapText(text = "", max = 32) {
  if (!text) return "";
  const words = text.split(" ");
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

async function loadQSLfromGitHub() {
  if (!GH_TOKEN || !GH_REPO || !GH_FILE) {
    console.log("GitHub persistence not configured (missing env). Starting with empty list.");
    qslList = [];
    return;
  }

  try {
    const url = `https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${GH_TOKEN}`, "User-Agent": "tw-eqsl-server" },
    });

    if (!resp.ok) {
      console.log("No qsl file on GitHub (status " + resp.status + "). Starting empty.");
      qslList = [];
      return;
    }

    const data = await resp.json();
    const content = Buffer.from(data.content, "base64").toString("utf8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      qslList = parsed;
      console.log("Loaded", qslList.length, "QSL entries from GitHub.");
    } else {
      qslList = [];
    }
  } catch (err) {
    console.error("Error loading QSL from GitHub:", err);
    qslList = [];
  }
}

async function saveQSLtoGitHub() {
  if (!GH_TOKEN || !GH_REPO || !GH_FILE) {
    console.log("GitHub persistence not configured; skipping save.");
    return;
  }

  try {
    const url = `https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`;

    // get current sha if exists (to update)
    let sha = null;
    const getResp = await fetch(url, { headers: { Authorization: `Bearer ${GH_TOKEN}`, "User-Agent": "tw-eqsl-server" } });
    if (getResp.ok) {
      const getJson = await getResp.json();
      if (getJson && getJson.sha) sha = getJson.sha;
    }

    const contentBase64 = Buffer.from(JSON.stringify(qslList, null, 2)).toString("base64");

    const body = {
      message: "Update QSL list",
      content: contentBase64,
      branch: "main"
    };
    if (sha) body.sha = sha;

    const putResp = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${GH_TOKEN}`, "User-Agent": "tw-eqsl-server", "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!putResp.ok) {
      const txt = await putResp.text();
      console.error("GitHub save failed:", putResp.status, txt);
    } else {
      console.log("Saved QSL list to GitHub.");
    }
  } catch (err) {
    console.error("Error saving QSL to GitHub:", err);
  }
}

// load at startup
loadQSLfromGitHub();

// -------------------
// Upload + generate QSL
// -------------------
app.post("/upload", async (req, res) => {
  try {
    if (!req.body.indicatif) return res.json({ success: false, error: "Indicatif manquant" });
    if (!req.files || !req.files.qsl) return res.json({ success: false, error: "Aucune image QSL fournie" });

    const imgFile = req.files.qsl;

    // 1) Resize to fit inside 1400x900 (contain) with white background, get buffer
    const resizedBuffer = await sharp(imgFile.tempFilePath)
      .resize({ width: 1400, height: 900, fit: "inside", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .jpeg({ quality: 92 })
      .toBuffer();

    // 2) Get exact dimensions
    const meta = await sharp(resizedBuffer).metadata();
    const W = meta.width || 1400;
    const H = meta.height || 900;

    // 3) Panel positioning logic (choice C):
    //    if image width >= 1000 -> panel to the RIGHT (panelWidth fixed 350)
    //    else -> panel BELOW (panelWidth fixed 350, panelHeight computed)
    const PANEL_WIDTH = 350;
    const imageLargeEnough = W >= 1000;

    // prepare note and svg(s)
    const noteWrapped = wrapText(req.body.note || "", 32);

    if (imageLargeEnough) {
      // panel to the right, height must equal H exactly
      const svgRight = `
<svg width="${PANEL_WIDTH}" height="${H}">
  <rect width="100%" height="100%" fill="white"/>
  <text x="22" y="60" font-size="38" font-weight="700" fill="black">${(req.body.indicatif || "").toUpperCase()}</text>
  <text x="22" y="110" font-size="22" fill="black">Date : ${req.body.date || ""}</text>
  <text x="22" y="140" font-size="22" fill="black">UTC  : ${req.body.time || ""}</text>
  <text x="22" y="170" font-size="22" fill="black">Bande : ${req.body.band || ""}</text>
  <text x="22" y="200" font-size="22" fill="black">Mode : ${req.body.mode || ""}</text>
  <text x="22" y="230" font-size="22" fill="black">Report: ${req.body.report || ""}</text>
  <text x="22" y="300" font-size="20" fill="black">${noteWrapped}</text>
</svg>`;
      const svgBuffer = Buffer.from(svgRight);

      // compose horizontally: width = W + PANEL_WIDTH, height = H
      const finalBuffer = await sharp({
        create: { width: W + PANEL_WIDTH, height: H, channels: 3, background: "white" }
      })
        .composite([
          { input: resizedBuffer, left: 0, top: 0 },
          { input: svgBuffer, left: W, top: 0 }
        ])
        .jpeg({ quality: 92 })
        .toBuffer();

      // upload to Cloudinary
      cloudinary.uploader.upload_stream({ folder: "TW-eQSL", tags: ["TWQSL", `CALL-${(req.body.indicatif || "").toUpperCase()}`] },
        async (err, result) => {
          if (err) {
            console.error("Cloudinary upload err:", err);
            return res.json({ success: false, error: err.message || String(err) });
          }

          const entry = {
            id: result.public_id,
            indicatif: (req.body.indicatif || "").toUpperCase(),
            url: result.secure_url,
            thumb: result.secure_url.replace("/upload/", "/upload/w_400/"),
            date: req.body.date || new Date().toISOString().slice(0, 10)
          };

          // prepend
          qslList.unshift(entry);
          // persist to GitHub
          await saveQSLtoGitHub();

          return res.json({ success: true, qsl: entry });
        }
      ).end(finalBuffer);

    } else {
      // panel below: compute panel height based on text lines
      const lines = (noteWrapped ? noteWrapped.split("\n").length : 0) + 5; // extra lines for fields
      const lineHeight = 28;
      const padding = 80;
      const panelHeight = Math.max(220, lines * lineHeight + padding);

      const canvasWidth = Math.max(W, PANEL_WIDTH);
      const svgBelow = `
<svg width="${canvasWidth}" height="${panelHeight}">
  <rect width="100%" height="100%" fill="white"/>
  <text x="22" y="40" font-size="30" font-weight="700" fill="black">${(req.body.indicatif || "").toUpperCase()}</text>
  <text x="22" y="80" font-size="18" fill="black">Date : ${req.body.date || ""}</text>
  <text x="22" y="105" font-size="18" fill="black">UTC  : ${req.body.time || ""}</text>
  <text x="22" y="130" font-size="18" fill="black">Bande : ${req.body.band || ""}</text>
  <text x="22" y="155" font-size="18" fill="black">Mode : ${req.body.mode || ""}</text>
  <text x="22" y="180" font-size="18" fill="black">Report: ${req.body.report || ""}</text>
  <text x="22" y="230" font-size="16" fill="black">${noteWrapped}</text>
</svg>`;
      const svgBuffer = Buffer.from(svgBelow);

      // compose vertically: width = canvasWidth, height = H + panelHeight
      // first create a canvas with white background same width
      const finalBuffer = await sharp({
        create: { width: canvasWidth, height: H + panelHeight, channels: 3, background: "white" }
      })
        .composite([
          { input: resizedBuffer, left: Math.floor((canvasWidth - W) / 2), top: 0 }, // center image horizontally
          { input: svgBuffer, left: 0, top: H }
        ])
        .jpeg({ quality: 92 })
        .toBuffer();

      // upload to Cloudinary
      cloudinary.uploader.upload_stream({ folder: "TW-eQSL", tags: ["TWQSL", `CALL-${(req.body.indicatif || "").toUpperCase()}`] },
        async (err, result) => {
          if (err) {
            console.error("Cloudinary upload err:", err);
            return res.json({ success: false, error: err.message || String(err) });
          }

          const entry = {
            id: result.public_id,
            indicatif: (req.body.indicatif || "").toUpperCase(),
            url: result.secure_url,
            thumb: result.secure_url.replace("/upload/", "/upload/w_400/"),
            date: req.body.date || new Date().toISOString().slice(0, 10)
          };

          qslList.unshift(entry);
          await saveQSLtoGitHub();

          return res.json({ success: true, qsl: entry });
        }
      ).end(finalBuffer);
    }

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    return res.json({ success: false, error: err.message || String(err) });
  }
});

// -------------------
// Return current list (from memory, persisted on GitHub)
app.get("/qsl", (req, res) => {
  res.json(qslList);
});

// -------------------
// Find by callsign (from in-memory list)
app.get("/download/:call", (req, res) => {
  const call = (req.params.call || "").toUpperCase();
  const list = qslList.filter(q => q.indicatif.toUpperCase() === call);
  res.json(list);
});

// -------------------
// Direct download route: redirect to Cloudinary attachment url
app.get("/file/:id", async (req, res) => {
  const id = req.params.id;
  const entry = qslList.find(q => q.id === id);
  if (!entry) return res.status(404).send("Not found");

  // Use Cloudinary fl_attachment to force download
  // replace /upload/ with /upload/fl_attachment/ (keeps the rest of URL)
  const dlUrl = entry.url.replace("/upload/", "/upload/fl_attachment/");
  return res.redirect(dlUrl);
});

// -------------------
// Default route serves front
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// -------------------
// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("TW-eQSL server running on port " + PORT));
