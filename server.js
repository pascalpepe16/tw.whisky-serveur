// server.js — TW eQSL (Cloudinary persistence, direct download, no local qsl.json)
import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

// -------------------- paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");
const LOCAL_TEMPLATE = path.join(__dirname, "template/eqsl_template.jpg");

// -------------------- express init
const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp/" }));
app.use(express.static(PUBLIC_DIR));

// -------------------- cloudinary config (use env vars in production)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dqpvrfjeu",
  api_key: process.env.CLOUDINARY_API_KEY || "825331418956744",
  api_secret: process.env.CLOUDINARY_API_SECRET || "XJKCIOnfRfD8sFXYuDjNrB-1zpE"
});

// -------------------- helpers
function parseContext(ctx) {
  // ctx may be { custom: { entry: "k=v|k2=v2" } } or ctx === undefined
  if (!ctx || !ctx.custom || !ctx.custom.entry) return {};
  return ctx.custom.entry.split("|").reduce((acc, p) => {
    const [k, ...rest] = p.split("=");
    acc[k] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function buildContextObj(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v || ""))}`)
    .join("|");
}

function wrapText(text = "", max = 32) {
  const words = String(text || "").trim().split(/\s+/);
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

// -------------------- GET /qsl — list from Cloudinary
app.get("/qsl", async (req, res) => {
  try {
    // Search in folder TW-eQSL
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
        downloads: Number(ctx.downloads || 0),
        width: r.width,
        height: r.height,
        created_at: r.created_at
      };
    });

    res.json(list);
  } catch (err) {
    console.error("GET /qsl ERROR", err);
    res.status(500).json({ error: "Impossible de lire Cloudinary" });
  }
});

// -------------------- POST /upload — generate QSL, upload to Cloudinary with context
app.post("/upload", async (req, res) => {
  try {
    if (!req.files || !req.files.qsl)
      return res.status(400).json({ success: false, error: "Aucune image reçue" });

    const file = req.files.qsl;
    const indicatif = (req.body.indicatif || "").toUpperCase();
    const date = req.body.date || "";
    const time = req.body.time || "";
    const band = req.body.band || "";
    const mode = req.body.mode || "";
    const report = req.body.report || "";
    const note = req.body.note || "";

    // Resize input image to fit inside 1400x900 without distortion
    const base = sharp(file.tempFilePath).resize({
      width: 1400,
      height: 900,
      fit: "inside",
      withoutEnlargement: true
    });
    const meta = await base.metadata();
    const W = meta.width;
    const H = meta.height;

    // panel width, height = H
    const panelWidth = 350;
    const noteWrapped = wrapText(note, 32).replace(/\n/g, "&#10;"); // newline for SVG

    // build SVG panel (same height H)
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
      </svg>`;

    const svgBuffer = Buffer.from(svg);
    const userBuffer = await base.toBuffer();

    // final canvas width = W + panelWidth, height = H — always >= components
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

    // context (metadata) to store on Cloudinary
    const ctxObj = {
      indicatif,
      date,
      time,
      band,
      mode,
      report,
      note,
      downloads: 0
    };
    const ctxStr = buildContextObj(ctxObj);

    // upload final buffer to Cloudinary
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "TW-eQSL", context: ctxStr },
      (err, result) => {
        if (err) {
          console.error("Cloudinary upload error:", err);
          return res.status(500).json({ success: false, error: err.message || "Cloudinary error" });
        }

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
      }
    );

    uploadStream.end(final);

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// -------------------- GET /file/:public_id — force direct download (stream from Cloudinary)
// increments download counter in Cloudinary context
app.get("/file/:public_id", async (req, res) => {
  try {
    const id = req.params.public_id;

    // get resource to read context and secure_url
    const r = await cloudinary.api.resource(id);
    const ctx = parseContext(r.context || {});
    const downloads = (Number(ctx.downloads) || 0) + 1;

    // if downloads exceed 3, optionally destroy — REMOVE if you don't want auto-delete
    // if (downloads >= 3) { await cloudinary.uploader.destroy(id); return res.status(410).send("Removed"); }

    // update context (explicit)
    const newCtx = buildContextObj({ ...ctx, downloads });
    await cloudinary.uploader.explicit(id, { type: "upload", context: newCtx });

    // fetch the actual image bytes and stream as attachment
    const fileResp = await axios.get(r.secure_url, { responseType: "arraybuffer" });

    res.set({
      "Content-Type": "image/jpeg",
      "Content-Disposition": `attachment; filename="${(ctx.indicatif || id)}_${ctx.date || ''}.jpg"`
    });
    return res.send(Buffer.from(fileResp.data));
  } catch (err) {
    console.error("DOWNLOAD ERROR", err);
    return res.status(500).send("Erreur téléchargement");
  }
});

// -------------------- GET /download/:call — search by indicatif (cloudinary)
app.get("/download/:call", async (req, res) => {
  try {
    const call = (req.params.call || "").toUpperCase();
    const result = await cloudinary.search
      .expression(`folder:TW-eQSL AND context.custom.entry:indicatif=${encodeURIComponent(call)}`)
      .sort_by("created_at", "desc")
      .max_results(500)
      .execute();

    // fallback: if search by context fails, load folder and filter locally
    let resources = result.resources || [];
    if (!resources.length) {
      const all = await cloudinary.search.expression("folder:TW-eQSL").max_results(500).execute();
      resources = all.resources || [];
    }

    const list = resources
      .map(r => {
        const ctx = parseContext(r.context || {});
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
      })
      .filter(x => (x.indicatif || "").toUpperCase() === call);

    res.json(list);
  } catch (err) {
    console.error("SEARCH ERROR", err);
    res.status(500).json({ error: "Erreur recherche" });
  }
});

// -------------------- frontend fallback
app.get("*", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

// -------------------- start
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("TW-eQSL server running on port", PORT));
