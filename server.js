import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import { fileURLToPath } from "url";

// === Resolve dirname ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === App Config ===
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

// === Cloudinary ===
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ============================
// HELPERS
// ============================
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

// ============================
// HEALTH
// ============================
app.get("/health", (req, res) => res.json({ ok: true }));

// ============================
// LIST ALL QSL
// ============================
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
    console.error(err);
    res.status(500).json({ error: "Erreur Cloudinary" });
  }
});

// ============================
// UPLOAD + GENERATE QSL
// ============================
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

    // Resize image
    const userImg = sharp(f.tempFilePath).resize(1400, 900, {
      fit: "inside",
      withoutEnlargement: true,
    });

    const meta = await userImg.metadata();
    const W = meta.width;
    const H = meta.height;
    const P = 350;

    // TEXT BOX SVG
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${P}" height="${H}">
        <rect width="${P}" height="${H}" fill="rgba(0,0,0,0.55)"/>
        <text x="20" y="60" fill="#fff" font-size="42" font-weight="bold">QSL - ${escapeXml(indicatif)}</text>

        <text x="20" y="130" fill="#fff" font-size="32">Date : ${escapeXml(date)}</text>
        <text x="20" y="180" fill="#fff" font-size="32">UTC : ${escapeXml(time)}</text>
        <text x="20" y="230" fill="#fff" font-size="32">Bande : ${escapeXml(band)}</text>
        <text x="20" y="280" fill="#fff" font-size="32">Mode : ${escapeXml(mode)}</text>
        <text x="20" y="330" fill="#fff" font-size="32">Report : ${escapeXml(report)}</text>

        <text x="20" y="400" fill="#fff" font-size="28">${escapeXml(note)}</text>
      </svg>
    `;

    // Composite QSL
    const finalBuffer = await userImg
      .composite([{ input: Buffer.from(svg), left: W - P, top: 0 }])
      .jpeg({ quality: 92 })
      .toBuffer();

    // Upload to Cloudinary
    const upload = await cloudinary.uploader.upload_stream(
      {
        folder: "TW-eQSL",
        resource_type: "image",
        context: {
          entry: buildContext({
            indicatif,
            date,
            time,
            band,
            mode,
            report,
            note,
            downloads: 0,
          }),
        },
      },
      (err, result) => {
        if (err) {
          console.error("UPLOAD ERROR:", err);
          return res.json({ success: false, error: "Erreur Cloudinary" });
        }
        res.json({ success: true, url: result.secure_url });
      }
    );

    upload.end(finalBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur upload" });
  }
});

// ============================
// SEARCH BY INDICATIF
// ============================
app.get("/download", async (req, res) => {
  try {
    const call = (req.query.call || "").toUpperCase();
    if (!call) return res.json([]);

    const r = await cloudinary.search
      .expression(`folder:TW-eQSL AND context.entry:*${call}*`)
      .sort_by("created_at", "desc")
      .max_results(50)
      .execute();

    const list = r.resources.map((img) => {
      const ctx = parseContext(img.context);
      return {
        public_id: img.public_id,
        url: img.secure_url,
        thumb: img.secure_url.replace("/upload/", "/upload/w_300/"),
        ...ctx,
      };
    });

    res.json(list);
  } catch (err) {
    console.error("SEARCH ERROR:", err);
    res.status(500).json({ error: "Erreur recherche" });
  }
});

// ============================
// START SERVER
// ============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("SERVER RUNNING ON PORT", PORT));
