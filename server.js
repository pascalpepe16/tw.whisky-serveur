// server.js — TW eQSL (Solution A : Cloudinary as DB)
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

// static frontend
app.use(express.static(path.join(__dirname, "public")));

// Cloudinary config — set as env vars in Render
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dqpvrfjeu",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || ""
});

// helper to parse context string from Cloudinary resource
function parseContext(ctx) {
  if (!ctx || !ctx.custom || !ctx.custom.entry) return {};
  return ctx.custom.entry.split("|").reduce((acc, piece) => {
    const [k, ...rest] = piece.split("=");
    acc[k] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

// ---------------------------
// GET /qsl  -> liste les images (Cloudinary search)
// ---------------------------
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
        public_id: r.public_id,          // ex: "TW-eQSL/abcd1234"
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
    console.error("GET /qsl ERROR", err);
    res.status(500).json({ error: "Erreur Cloudinary" });
  }
});

// ---------------------------
// POST /upload -> génère la QSL (compose image + panneau) puis upload sur Cloudinary
// ---------------------------
app.post("/upload", async (req, res) => {
  try {
    if (!req.files || !req.files.qsl) return res.json({ success: false, error: "Aucune image fournie" });

    const file = req.files.qsl;
    // resize user image to fit inside max 1400x900 (keeps aspect)
    const base = sharp(file.tempFilePath).resize({ width: 1400, height: 900, fit: "inside", withoutEnlargement: true });
    const meta = await base.metadata();
    const W = meta.width;
    const H = meta.height || 900;
    const panelWidth = 350;

    // wrap note into lines (simple)
    const wrapText = (text = "", max = 32) => {
      if (!text) return [];
      const words = text.trim().split(/\s+/);
      const lines = [];
      let line = "";
      for (const w of words) {
        if ((line + w).length > max) { lines.push(line.trim()); line = ""; }
        line += w + " ";
      }
      if (line.trim()) lines.push(line.trim());
      return lines;
    };
    const noteLines = wrapText(req.body.note || "", 32);
    const noteTspans = noteLines.map((ln, i) => `<tspan x="20" dy="${i===0? '0' : '1.2em'}">${ln}</tspan>`).join("");

    // build SVG panel matching height H
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${panelWidth}" height="${H}">
        <rect width="100%" height="100%" fill="white"/>
        <text x="20" y="60" font-size="42" font-weight="700" fill="black">${(req.body.indicatif||"").toUpperCase()}</text>
        <text x="20" y="120" font-size="28" fill="black">Date : ${req.body.date||""}</text>
        <text x="20" y="160" font-size="28" fill="black">UTC : ${req.body.time||""}</text>
        <text x="20" y="200" font-size="28" fill="black">Bande : ${req.body.band||""}</text>
        <text x="20" y="240" font-size="28" fill="black">Mode : ${req.body.mode||""}</text>
        <text x="20" y="280" font-size="28" fill="black">Report : ${req.body.report||""}</text>
        <text x="20" y="340" font-size="22" fill="black">${noteTspans}</text>
      </svg>
    `;
    const svgBuffer = Buffer.from(svg);

    const userBuffer = await base.toBuffer();

    // compose final image: user image left, white panel right
    const final = await sharp({
      create: { width: W + panelWidth, height: H, channels: 3, background: "white" }
    })
      .composite([
        { input: userBuffer, left: 0, top: 0 },
        { input: svgBuffer, left: W, top: 0 }
      ])
      .jpeg({ quality: 92 })
      .toBuffer();

    // prepare context string for Cloudinary metadata
    const ctxArr = [
      `indicatif=${encodeURIComponent((req.body.indicatif||"").toUpperCase())}`,
      `date=${encodeURIComponent(req.body.date||"")}`,
      `time=${encodeURIComponent(req.body.time||"")}`,
      `band=${encodeURIComponent(req.body.band||"")}`,
      `mode=${encodeURIComponent(req.body.mode||"")}`,
      `report=${encodeURIComponent(req.body.report||"")}`,
      `note=${encodeURIComponent(req.body.note||"")}`,
      `downloads=0`
    ];
    const ctxStr = ctxArr.join("|");

    // upload buffer to Cloudinary via stream and pass context
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "TW-eQSL", context: ctxStr },
      (err, result) => {
        if (err) {
          console.error("Cloudinary upload error:", err);
          return res.json({ success: false, error: err.message || "Cloudinary error" });
        }
        // respond entry
        const entry = {
          public_id: result.public_id,
          url: result.secure_url,
          thumb: result.secure_url.replace("/upload/", "/upload/w_300/"),
          indicatif: req.body.indicatif || "",
          date: req.body.date || "",
          time: req.body.time || "",
          band: req.body.band || "",
          mode: req.body.mode || "",
          report: req.body.report || "",
          note: req.body.note || "",
          downloads: 0
        };
        return res.json({ success: true, qsl: entry });
      }
    );

    uploadStream.end(final);

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    return res.json({ success: false, error: err.message || String(err) });
  }
});

// ---------------------------
// GET /file/:public_id -> download real JPEG (fetch from Cloudinary and stream)
app.get("/file/:public_id", async (req, res) => {
  try {
    const pid = req.params.public_id; // example "TW-eQSL/abcd123"
    // Build Cloudinary public URL (ensure .jpg)
    const cloudName = cloudinary.config().cloud_name;
    const fileUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${pid}.jpg`;

    // retrieve bytes
    const response = await axios.get(fileUrl, { responseType: "arraybuffer" });

    // send as attachment
    res.setHeader("Content-Disposition", `attachment; filename="${(pid.replace(/\//g,'_'))}.jpg"`);
    res.setHeader("Content-Type", "image/jpeg");
    return res.send(Buffer.from(response.data));
  } catch (err) {
    console.error("FILE ERROR", err);
    return res.status(500).send("Erreur téléchargement");
  }
});

// ---------------------------
// fallback: list by indicatif
app.get("/download/:call", async (req, res) => {
  try {
    const call = (req.params.call || "").toUpperCase();
    // search Cloudinary for images where context indicatif matches
    // Cloudinary search cannot query context directly easily; we will list folder and filter client-side
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
    }).filter(x => (x.indicatif || "").toUpperCase() === call);

    res.json(list);
  } catch (err) {
    console.error("DOWNLOAD SEARCH ERR", err);
    res.status(500).json([]);
  }
});

// serve frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// start
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("TW-eQSL server running on port", PORT));
