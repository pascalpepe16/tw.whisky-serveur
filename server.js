// server.js
// TW eQSL — Cloudinary-backed qslData.json (Option A)
// Composite safe (image resized inside max 1400x900), panel fixed width,
// save qslData.json as raw file on Cloudinary and reload on startup.

import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import https from "https";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import { fileURLToPath } from "url";

// -------------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp/" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// Local blank template (you uploaded this file earlier)
const LOCAL_TEMPLATE_PATH = "/mnt/data/A_blank_QSL_card_in_digital_format_features_a_whit.png";

// Cloudinary config (keep your keys here)
cloudinary.config({
  cloud_name: "dqpvrfjeu",
  api_key: "825331418956744",
  api_secret: "XJKCIOnfRfD8sFXYuDjNrB-1zpE"
});

// constants
const JSON_PUBLIC_ID = "TW-eQSL/qslData"; // public_id used to store raw JSON
const JSON_RESOURCE_TYPE = "raw";
const QSL_FOLDER = "TW-eQSL";

// qslList resides in memory but is initialized from Cloudinary JSON at startup
let qslList = [];

// helper: wrap text
function wrapText(text = "", max = 34) {
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

// -------------------------
// Load qslData.json from Cloudinary (if exists)
async function loadQslJsonFromCloudinary() {
  try {
    // check resource
    const info = await cloudinary.api.resource(JSON_PUBLIC_ID, { resource_type: JSON_RESOURCE_TYPE });
    if (info && info.secure_url) {
      // fetch the raw JSON content
      return await new Promise((resolve, reject) => {
        https.get(info.secure_url, (resp) => {
          let data = "";
          resp.on("data", chunk => data += chunk);
          resp.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (err) {
              console.error("Erreur parsing qslData.json:", err);
              resolve([]);
            }
          });
        }).on("error", err => {
          console.error("Erreur download qslData.json:", err);
          resolve([]);
        });
      });
    }
  } catch (err) {
    // resource may not exist yet — ignore
    return [];
  }
  return [];
}

// -------------------------
// Save qslList to Cloudinary as raw JSON
async function saveQslJsonToCloudinary(list) {
  return new Promise((resolve, reject) => {
    const jsonBuffer = Buffer.from(JSON.stringify(list, null, 2), "utf8");

    const uploadStream = cloudinary.uploader.upload_stream(
      { public_id: JSON_PUBLIC_ID, resource_type: JSON_RESOURCE_TYPE, folder: QSL_FOLDER, overwrite: true },
      (err, result) => {
        if (err) {
          console.error("Erreur upload qslData.json:", err);
          return reject(err);
        }
        resolve(result);
      }
    );

    uploadStream.end(jsonBuffer);
  });
}

// initialize qslList from cloudinary on server start
(async () => {
  try {
    const loaded = await loadQslJsonFromCloudinary();
    if (Array.isArray(loaded)) {
      qslList = loaded;
      console.log("qslData.json chargé depuis Cloudinary —", qslList.length, "entrées");
    } else {
      qslList = [];
    }
  } catch (err) {
    console.error("Erreur init qslList:", err);
    qslList = [];
  }
})();

// -------------------------
// Upload + Generate QSL
// -------------------------
app.post("/upload", async (req, res) => {
  try {
    if (!req.body.indicatif) return res.json({ success: false, error: "Indicatif manquant" });
    if (!req.files || !req.files.qsl) return res.json({ success: false, error: "Aucune image QSL fournie" });

    const imgFile = req.files.qsl;

    // resize image to fit inside 1400x900
    const baseImg = sharp(imgFile.tempFilePath).resize({ width: 1400, height: 900, fit: "inside", background: "white" });
    const meta = await baseImg.metadata();
    const W = meta.width;
    const H = meta.height;

    const panelWidth = 370;
    const noteWrapped = wrapText(req.body.note, 34);

    // SVG panel with exact height H
    const svg = `
<svg width="${panelWidth}" height="${H}">
  <rect width="100%" height="100%" fill="white"/>
  <text x="24" y="60" font-size="40" font-weight="700" fill="black">${req.body.indicatif.toUpperCase()}</text>

  <text x="24" y="120" font-size="26" fill="black">Date : ${req.body.date || ""}</text>
  <text x="24" y="155" font-size="26" fill="black">UTC  : ${req.body.time || ""}</text>
  <text x="24" y="190" font-size="26" fill="black">Bande : ${req.body.band || ""}</text>
  <text x="24" y="225" font-size="26" fill="black">Mode : ${req.body.mode || ""}</text>
  <text x="24" y="260" font-size="26" fill="black">Report : ${req.body.report || ""}</text>

  <text x="24" y="320" font-size="22" fill="black">${noteWrapped}</text>
</svg>`;

    const svgBuffer = Buffer.from(svg);
    const userBuffer = await baseImg.toBuffer();

    // compose (canvas size = image width + panel width, height = image height)
    const finalBuffer = await sharp({
      create: { width: W + panelWidth, height: H, channels: 3, background: "white" }
    })
      .composite([
        { input: userBuffer, left: 0, top: 0 },
        { input: svgBuffer, left: W, top: 0 }
      ])
      .jpeg({ quality: 90 })
      .toBuffer();

    // upload final to Cloudinary (image)
    cloudinary.uploader.upload_stream({ folder: QSL_FOLDER }, async (err, result) => {
      if (err) {
        console.error("Upload image erreur:", err);
        return res.json({ success: false, error: err.message || String(err) });
      }

      // create entry
      const entry = {
        id: Date.now(),
        indicatif: (req.body.indicatif || "").toUpperCase(),
        url: result.secure_url,
        thumb: result.secure_url.replace("/upload/", "/upload/w_400/"),
        date: req.body.date || new Date().toISOString().slice(0, 10)
      };

      // update in-memory and persist to Cloudinary JSON
      qslList.unshift(entry); // add newest first
      try {
        await saveQslJsonToCloudinary(qslList);
      } catch (errSave) {
        console.error("Impossible de sauvegarder qslData.json après upload:", errSave);
        // still return success but warn
        return res.json({ success: true, qsl: entry, warning: "QSL créée mais échec sauvegarde JSON" });
      }

      return res.json({ success: true, qsl: entry });
    }).end(finalBuffer);

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.json({ success: false, error: err.message || String(err) });
  }
});

// -------------------------
// Get list of QSL (reads qslList in memory which is synced from cloud)
app.get("/qsl", (req, res) => {
  res.json(qslList);
});

// -------------------------
// Return all QSL for an indicatif (front expects JSON list)
app.get("/download/:call", (req, res) => {
  const call = (req.params.call || "").toUpperCase();
  const list = qslList.filter(q => q.indicatif.toUpperCase() === call);
  res.json(list);
});

// -------------------------
// Direct-download by id (streams image from Cloudinary to client, avoids CORS issues)
import { parse as parseUrl } from "url";
app.get("/direct-download/:id", async (req, res) => {
  const id = req.params.id;
  const entry = qslList.find(q => String(q.id) === String(id));
  if (!entry) return res.status(404).send("Not found");

  // stream Cloudinary image
  const url = entry.url;
  https.get(url, fileRes => {
    res.setHeader("Content-Disposition", `attachment; filename="${entry.indicatif}_${entry.date}.jpg"`);
    fileRes.pipe(res);
  }).on("error", err => {
    res.status(500).send("Download error");
  });
});

// -------------------------
// Default route
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// -------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("TW-eQSL server running on port", PORT));
