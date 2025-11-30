// server.js
// TW eQSL — Cloudinary-only (option B)
// Stocke metadata dans Cloudinary.context.custom.entry (k=v|k=v)
// Liste seulement les images qui ont indicatif (=> créées via site)

import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import { v2 as cloudinary } from "cloudinary";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp/" }));

// static
app.use(express.static(path.join(__dirname, "public")));

// Cloudinary config — utilise les env vars en production
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dqpvrfjeu",
  api_key: process.env.CLOUDINARY_API_KEY || "YOUR_API_KEY",
  api_secret: process.env.CLOUDINARY_API_SECRET || "YOUR_API_SECRET",
});

// parse context string provided by cloudinary (custom.entry format)
function parseContext(ctx) {
  // ctx may be { custom: { entry: "k=v|k2=v2" } } or undefined
  if (!ctx || !ctx.custom || !ctx.custom.entry) return {};
  return ctx.custom.entry.split("|").reduce((acc, p) => {
    const [k, ...rest] = p.split("=");
    acc[k] = decodeURIComponent(rest.join("=") || "");
    return acc;
  }, {});
}

// Upload: create final QSL image on the server (optional composition done by user earlier).
// Here we upload the provided image buffer to Cloudinary and save metadata in context.
app.post("/upload", async (req, res) => {
  try {
    if (!req.files || !req.files.qsl) {
      return res.json({ success: false, error: "Aucune image reçue (qsl)" });
    }

    const file = req.files.qsl;
    // build context string
    const meta = {
      indicatif: (req.body.indicatif || "").toUpperCase(),
      date: req.body.date || "",
      time: req.body.time || "",
      band: req.body.band || "",
      mode: req.body.mode || "",
      report: req.body.report || "",
      note: req.body.note || "",
      downloads: "0",
    };

    const ctxStr = Object.entries(meta)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("|");

    // upload file (file.tempFilePath exists because useTempFiles:true)
    const up = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: "TW-eQSL",
      context: ctxStr,
      use_filename: false,
      unique_filename: true,
      overwrite: false,
    });

    // return useful info
    res.json({
      success: true,
      qsl: {
        public_id: up.public_id,
        url: up.secure_url,
        thumb: up.secure_url.replace("/upload/", "/upload/w_300/"),
        indicatif: meta.indicatif,
        date: meta.date,
        time: meta.time,
        band: meta.band,
        mode: meta.mode,
        report: meta.report,
        note: meta.note,
        downloads: 0
      },
    });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /qsl — liste depuis Cloudinary, filtrée : uniquement les resources avec context.indicatif
app.get("/qsl", async (req, res) => {
  try {
    // recherche dossier TW-eQSL ; récupère jusqu'à 500 (ajuste si besoin)
    const result = await cloudinary.search
      .expression("folder:TW-eQSL")
      .sort_by("created_at", "desc")
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
          time: ctx.time || "",
          band: ctx.band || "",
          mode: ctx.mode || "",
          report: ctx.report || "",
          note: ctx.note || "",
          downloads: Number(ctx.downloads || 0),
