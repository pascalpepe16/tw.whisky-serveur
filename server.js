// server.js — TW eQSL (Cloudinary persistence, no dotenv)

import axios from "axios";
import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import { fileURLToPath } from "url";

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

// -------------------- cloudinary config (Render env or fallback DEV keys)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dqpvrfjeu",
  api_key: process.env.CLOUDINARY_API_KEY || "825331418956744",
  api_secret: process.env.CLOUDINARY_API_SECRET || "XJKCIOnfRfD8sFXYuDjNrB-1zpE"
});

// -------------------- helpers
function parseContext(ctx) {
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

// -------------------- GET /qsl — list QSLs from Cloudinary
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
    });

    res.json(list);
  } catch (err) {
    console.error("GET /qsl ERROR", err);
    res.status(500).json({ error: "Impossible de lire Cloudinary" });
  }
});

// -------------------- POST /upload — generate QSL
app.post("/upload", async (req, res) => {
  try {
    if (!req.files || !req.files.qsl)
      return res.json({ success: false, error: "Aucune image QSL fournie" });

    const file = req.files.qsl;
    const indicatif = (req.body.indicatif || "").toUpperCase();

    const base = sharp(file.tempFilePath).resize({
      width: 1400,
      height: 900,
      fit: "inside",
      withoutEnlargement: true
    });

    const meta = await base.metadata();
    const W = meta.width;
    const H = meta.height;

    const panelWidth = 350;
    const noteWrapped = wrapText(req.body.note, 32).replace(/\n/g, "&#10;");

    const svg = `
      <svg width="${panelWidth}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="white"/>
        <text x="20" y="60" font-size="42" font-weight="700" fill="black">${indicatif}</text>
        <text x="20" y="120" font-size="28" fill="black">Date : ${req.body.date}</text>
        <text x="20" y="160" font-size="28" fill="black">UTC : ${req.body.time}</text>
        <text x="20" y="200" font-size="28" fill="black">Bande : ${req.body.band}</text>
        <text x="20" y="240" font-size="28" fill="black">Mode : ${req.body.mode}</text>
        <text x="20" y="280" font-size="28" fill="black">Report : ${req.body.report}</text>
        <text x="20" y="340" font-size="22" fill="black">${noteWrapped}</text>
      </svg>
    `;

    const svgBuffer = Buffer.from(svg);
    const userBuffer = await base.toBuffer();

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

    const ctxObj = {
      indicatif,
      date: req.body.date,
      time: req.body.time,
      band: req.body.band,
      mode: req.body.mode,
      report: req.body.report,
      note: req.body.note,
      downloads: 0
    };
    const ctxStr = buildContextObj(ctxObj);

    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "TW-eQSL", context: ctxStr },
      (err, result) => {
        if (err) return res.json({ success: false, error: err.message });

        return res.json({
          success: true,
          qsl: {
            public_id: result.public_id,
            url: result.secure_url,
            thumb: result.secure_url.replace("/upload/", "/upload/w_300/"),
            ...ctxObj
          }
        });
      }
    );

    uploadStream.end(final);

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------- DOWNLOAD (force direct download)
app.get("/file/:public_id", async (req, res) => {
  try {
    const id = req.params.public_id;
  

        const qsl = qslList.find(q => q.public_id === id);
        if (!qsl) return res.status(404).send("Not found");

        // Compteur
        qsl.downloads++;
        saveQSL(qslList);

        // Télécharger l’image Cloudinary en binaire
        const response = await axios.get(qsl.url, { responseType: "arraybuffer" });

        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${qsl.indicatif}_${qsl.date}.jpg"`
        );

        // Envoi direct du binaire
        res.send(Buffer.from(response.data, "binary"));

    } catch (err) {
        console.error("DOWNLOAD ERROR:", err);
        res.status(500).send("Download error");
  }
});

// -------------------- SEARCH
app.get("/download/:call", async (req, res) => {
  try {
    const call = req.params.call.toUpperCase();

    const result = await cloudinary.search
      .expression("folder:TW-eQSL")
      .max_results(500)
      .execute();

    const list = result.resources
      .map(r => {
        const ctx = parseContext(r.context);
        return {
          public_id: r.public_id,
          url: r.secure_url,
          thumb: r.secure_url.replace("/upload/", "/upload/w_300/"),
          indicatif: ctx.indicatif || "",
          date: ctx.date || "",
          downloads: Number(ctx.downloads || 0)
        };
      })
      .filter(x => x.indicatif === call);

    res.json(list);

  } catch (err) {
    console.error("SEARCH ERROR", err);
    res.status(500).json({ error: "Erreur recherche" });
  }
});

// -------------------- frontend fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// -------------------- start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log("TW-eQSL server running on port " + PORT)
);
