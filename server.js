// -----------------------------------------
//  TW eQSL – Cloudinary TAG SYSTEM
// -----------------------------------------

import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import { fileURLToPath } from "url";

// -----------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
);

// -----------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

const LOCAL_TEMPLATE = path.join(__dirname, "template/eqsl_template.jpg");

// -----------------------------------------
cloudinary.config({
  cloud_name: "dqpvrfjeu",
  api_key: "825331418956744",
  api_secret: "XJKCIOnfRfD8sFXYuDjNrB-1zpE",
});

// -----------------------------------------
//  UPLOAD + GENERATION QSL
// -----------------------------------------
app.post("/upload", async (req, res) => {
  try {
    if (!req.body.indicatif)
      return res.json({ success: false, error: "Indicatif manquant" });

    let templatePath = LOCAL_TEMPLATE;

    if (req.files?.template) {
      templatePath = req.files.template.tempFilePath;
    }

    if (!req.files || !req.files.qsl)
      return res.json({ success: false, error: "Aucune image QSL fournie" });

    const file = req.files.qsl;

    // ------------------------------
    // LOAD TEMPLATE
    const tMeta = await sharp(templatePath).metadata();
    const TW = tMeta.width;
    const TH = tMeta.height;

    // ------------------------------
    // Génération texte + NOTE auto-wrap
    const wrap = (txt, max = 32) => {
      if (!txt) return "";
      return txt.match(new RegExp(`.{1,${max}}`, "g")).join("\n");
    };

    const svg = `
    <svg width="380" height="${TH}">
      <rect width="100%" height="100%" fill="white"/>
      <text x="30" y="80" font-size="48" font-weight="700">${req.body.indicatif}</text>
      <text x="30" y="150" font-size="32">Date : ${req.body.date}</text>
      <text x="30" y="200" font-size="32">UTC : ${req.body.time}</text>
      <text x="30" y="260" font-size="32">Bande : ${req.body.band}</text>
      <text x="30" y="310" font-size="32">Mode : ${req.body.mode}</text>
      <text x="30" y="360" font-size="32">Report : ${req.body.report}</text>

      <text x="30" y="430" font-size="26">
        ${wrap(req.body.note, 25)}
      </text>
    </svg>`;

    const svgBuffer = Buffer.from(svg);

    // ------------------------------
    // Resize image WITHOUT déformation
    const userImg = await sharp(file.tempFilePath)
      .resize(TW, TH, { fit: "contain", background: "white" })
      .toBuffer();

    // ------------------------------
    // FINAL
    const final = await sharp({
      create: {
        width: TW + 380,
        height: TH,
        channels: 3,
        background: "white",
      },
    })
      .composite([
        { input: userImg, left: 0, top: 0 },
        { input: svgBuffer, left: TW, top: 0 },
      ])
      .jpeg({ quality: 92 })
      .toBuffer();

    // ------------------------------
    // CLOUDINARY UPLOAD + TAGS
    cloudinary.uploader
      .upload_stream(
        {
          folder: "TW-eQSL",
          tags: ["tw-eqsl", req.body.indicatif.toUpperCase()],
        },
        (err, result) => {
          if (err)
            return res.json({ success: false, error: err.message });

          return res.json({
            success: true,
            qsl: {
              indicatif: req.body.indicatif.toUpperCase(),
              url: result.secure_url,
              thumb: result.secure_url.replace("/upload/", "/upload/w_300/"),
              date: req.body.date,
            },
          });
        }
      )
      .end(final);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// -----------------------------------------
//  GALERIE = toutes les QSL taggées tw-eqsl
// -----------------------------------------
app.get("/qsl", async (req, res) => {
  try {
    const data = await cloudinary.api.resources_by_tag("tw-eqsl", {
      max_results: 500,
    });

    const list = data.resources.map((r) => ({
      indicatif: r.tags[1],
      url: r.secure_url,
      thumb: r.secure_url.replace("/upload/", "/upload/w_300/"),
      date: "N/A",
    }));

    res.json(list);
  } catch (err) {
    res.json([]);
  }
});

// -----------------------------------------
//  DOWNLOAD PAR INDICATIF
// -----------------------------------------
app.get("/download/:call", async (req, res) => {
  try {
    const call = req.params.call.toUpperCase();

    const data = await cloudinary.api.resources_by_tag(call, {
      max_results: 500,
    });

    const list = data.resources.map((r) => ({
      indicatif: call,
      url: r.secure_url,
      thumb: r.secure_url.replace("/upload/", "/upload/w_300/"),
    }));

    res.json(list);
  } catch (err) {
    res.json([]);
  }
});

// -----------------------------------------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});
// -----------------------------------------
// TELECHARGEMENT DIRECT FORCE
// -----------------------------------------
app.get("/direct", async (req, res) => {
  try {
    const url = req.query.url;
    const name = req.query.name || "qsl.jpg";

    if (!url) return res.status(400).send("Missing URL");

    // Télécharge l'image Cloudinary et renvoie avec header "attachment"
    const fetch = (await import("node-fetch")).default;
    const img = await fetch(url);

    const buffer = await img.arrayBuffer();

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${name}"`
    );

    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).send("Erreur download");
  }
});

// -----------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log("TW-eQSL server running on port " + PORT)
);
