// server.js
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

// Cloudinary must be set via environment variables on Render / host
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// helper to build context string
function buildContext(obj = {}) {
  // ctx key=value|key=value...
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${encodeURIComponent(v || "")}`)
    .join("|");
}

// parse context returned by cloudinary (resource.context)
function parseContext(ctx) {
  if (!ctx || !ctx.custom || !ctx.custom.entry) return {};
  const str = ctx.custom.entry;
  return str.split("|").reduce((acc, p) => {
    const [k, ...rest] = p.split("=");
    acc[k] = decodeURIComponent(rest.join("=") || "");
    return acc;
  }, {});
}

// Wrap text into lines (simple)
function wrapText(text = "", maxChars = 32) {
  const words = String(text || "").split(/\s+/);
  let lines = [], line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars) {
      if (line.trim()) lines.push(line.trim());
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join("\n");
}

// =====================
// GET /qsl  — list from Cloudinary folder
// =====================
app.get("/qsl", async (req, res) => {
  try {
    // search Cloudinary folder (max_results 500)
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
      };
    });

    res.json(list);
  } catch (err) {
    console.error("GET /qsl ERROR", err);
    res.status(500).json({ error: "Erreur Cloudinary" });
  }
});

// =====================
// POST /upload — receives form: qsl (image), indicatif, date, time, band, mode, report, note (optional)
// Generates final image (user image + white panel on right with text) and uploads to Cloudinary with context
// =====================
app.post("/upload", async (req, res) => {
  try {
    if (!req.files || !req.files.qsl) return res.status(400).json({ success: false, error: "Aucune image fournie" });

    const file = req.files.qsl;
    // resize user image to fit max 1400x900 keeping aspect ratio
    const userSharp = sharp(file.tempFilePath).resize({ width: 1400, height: 900, fit: "inside", withoutEnlargement: true });
    const meta = await userSharp.metadata();
    const W = meta.width || 1400;
    const H = meta.height || 900;

    const panelWidth = 350;

    // compose SVG text panel
    const indicatif = (req.body.indicatif || "").toUpperCase();
    const date = req.body.date || "";
    const time = req.body.time || "";
    const band = req.body.band || "";
    const mode = req.body.mode || "";
    const report = req.body.report || "";
    const note = wrapText(req.body.note || "", 32);

    // svg with tspan for multiline note
    const noteTspans = note
      .split("\n")
      .map((ln, i) => `<tspan x="20" dy="${i === 0 ? 0 : 24}">${ln}</tspan>`)
      .join("");

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${panelWidth}" height="${H}">
        <rect width="100%" height="100%" fill="white" />
        <text x="20" y="60" font-size="42" font-weight="700" fill="black">${indicatif}</text>
        <text x="20" y="120" font-size="28" fill="black">Date : ${date}</text>
        <text x="20" y="160" font-size="28" fill="black">UTC  : ${time}</text>
        <text x="20" y="200" font-size="28" fill="black">Bande : ${band}</text>
        <text x="20" y="240" font-size="28" fill="black">Mode : ${mode}</text>
        <text x="20" y="280" font-size="28" fill="black">Report : ${report}</text>
        <text x="20" y="340" font-size="22" fill="black">${noteTspans}</text>
      </svg>
    `;

    const svgBuffer = Buffer.from(svg);
    const userBuffer = await userSharp.toBuffer();

    // final image: width = W + panelWidth, height = H
    const finalBuffer = await sharp({
      create: { width: W + panelWidth, height: H, channels: 3, background: "white" }
    })
      .composite([
        { input: userBuffer, left: 0, top: 0 },
        { input: svgBuffer, left: W, top: 0 }
      ])
      .jpeg({ quality: 92 })
      .toBuffer();

    // build context string
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

    // upload buffer to Cloudinary (stream)
    cloudinary.uploader.upload_stream({ folder: "TW-eQSL", context: `entry=${ctxStr}` }, (err, result) => {
      if (err) {
        console.error("Cloudinary upload error:", err);
        return res.status(500).json({ success: false, error: err.message || "Cloudinary error" });
      }

      // return entry to frontend
      res.json({
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
    console.error("UPLOAD ERROR", err);
    res.status(500).json({ success: false, error: err.message || "Erreur serveur" });
  }
});

// =====================
// POST /increment-download/:public_id  — increment downloads in Cloudinary context (optional)
// =====================
app.post("/increment-download/:public_id", async (req, res) => {
  try {
    const id = req.params.public_id;
    // get resource
    const resource = await cloudinary.api.resource(id, { colors: false });
    const ctx = parseContext(resource.context);
    const downloads = (Number(ctx.downloads) || 0) + 1;

    // update context
    const newCtx = buildContext({ ...ctx, downloads });
    await cloudinary.uploader.explicit(id, { type: "upload", context: `entry=${newCtx}` });

    return res.json({ success: true, downloads });
  } catch (err) {
    console.error("INCREMENT ERROR", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================
// GET /file/:public_id  — stream bytes from Cloudinary and force download (attachment)
// =====================
app.get("/file/:public_id", async (req, res) => {
  try {
    const id = req.params.public_id;

    // fetch resource info to get url and context
    const r = await cloudinary.api.resource(id);
    const ctx = parseContext(r.context);

    // increment downloads in context (best effort)
    try {
      const downloads = (Number(ctx.downloads) || 0) + 1;
      const newCtx = buildContext({ ...ctx, downloads });
      await cloudinary.uploader.explicit(id, { type: "upload", context: `entry=${newCtx}` });
    } catch (e) {
      console.warn("Could not update downloads:", e.message);
    }

    // compute public URL (secure)
    const url = r.secure_url;

    // fetch bytes and stream to client with attachment
    const resp = await axios.get(url, { responseType: "arraybuffer" });
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${(ctx.indicatif || id).replace(/\//g,'_')}_${ctx.date || ''}.jpg"`);
    return res.send(Buffer.from(resp.data));
  } catch (err) {
    console.error("FILE ERROR", err);
    return res.status(500).send("Erreur téléchargement");
  }
});

// fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// start
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("TW-eQSL server running on port", PORT));
