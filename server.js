// -----------------------------------------
//  TW eQSL – Serveur Render Compatible
//  Sharp + Cloudinary – Version ULTRA STABLE
// -----------------------------------------

import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import fs from "fs";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import { fileURLToPath } from "url";

// -----------------------------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp/" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

const TEMPLATE_PATH = path.join(__dirname, "template/blank.jpg");

// -----------------------------------------
// CLOUDINARY
cloudinary.config({
    cloud_name: "dqpvrfjeu",
    api_key: "825331418956744",
    api_secret: "XJKCIOnfRfD8sFXYuDjNrB-1zpE"
});

// -----------------------------------------
let qslList = [];

// -----------------------------------------
function wrap(text, max = 32) {
    if (!text) return "";
    let out = [];
    let line = "";
    text.split(" ").forEach(w => {
        if ((line + w).length > max) {
            out.push(line.trim());
            line = "";
        }
        line += w + " ";
    });
    if (line.trim() !== "") out.push(line.trim());
    return out.join("\n");
}

// -----------------------------------------
// UPLOAD + GENERATION
// -----------------------------------------
app.post("/upload", async (req, res) => {
    try {
        if (!req.body.indicatif)
            return res.json({ success: false, error: "Indicatif manquant" });

        if (!req.files || !req.files.qsl)
            return res.json({ success: false, error: "Aucune image QSL fournie" });

        const img = req.files.qsl;

        // -----------------------------------------
        // FORCE HEIGHT = 900px
        const TARGET_H = 900;

        const baseSharp = sharp(img.tempFilePath).resize({
            height: TARGET_H,
            fit: "contain",
            background: { r: 255, g: 255, b: 255 }
        });

        const meta = await baseSharp.metadata();
        const W = meta.width;
        const H = meta.height; // ALWAYS = 900

        // -----------------------------------------
        // PANEL WIDTH = 30% of final
        const panelWidth = Math.round(W * 0.33);

        const noteTxt = wrap(req.body.note || "", 32);

        // SVG PANEL
        const svg = `
<svg width="${panelWidth}" height="${H}">
  <rect width="100%" height="100%" fill="white"/>
  <text x="25" y="70" font-size="46" font-weight="700" fill="black">${req.body.indicatif}</text>

  <text x="25" y="140" font-size="28" fill="black">Date : ${req.body.date}</text>
  <text x="25" y="180" font-size="28" fill="black">UTC : ${req.body.time}</text>
  <text x="25" y="220" font-size="28" fill="black">Bande : ${req.body.band}</text>
  <text x="25" y="260" font-size="28" fill="black">Mode : ${req.body.mode}</text>
  <text x="25" y="300" font-size="28" fill="black">Report : ${req.body.report}</text>

  <text x="25" y="380" font-size="26" fill="black">${noteTxt}</text>
</svg>
`;

        const svgBuffer = Buffer.from(svg);
        const userBuffer = await baseSharp.toBuffer();

        // -----------------------------------------
        // FINAL CANVAS = EXACT SAME HEIGHT
        const final = await sharp({
            create: {
                width: W + panelWidth,
                height: H,
                channels: 3,
                background: "white"
            }
        })
        .composite([
            { input: userBuffer, top: 0, left: 0 },
            { input: svgBuffer, top: 0, left: W }
        ])
        .jpeg({ quality: 92 })
        .toBuffer();

        // -----------------------------------------
        // UPLOAD CLOUDINARY
        const stream = cloudinary.uploader.upload_stream(
            { folder: "TW-eQSL" },
            (err, result) => {
                if (err) return res.json({ success: false, error: err.message });

                const entry = {
                    id: Date.now(),
                    indicatif: req.body.indicatif,
                    url: result.secure_url,
                    thumb: result.secure_url.replace("/upload/", "/upload/w_300/"),
                    date: req.body.date
                };

                qslList.push(entry);
                res.json({ success: true, qsl: entry });
            }
        );

        stream.end(final);

    } catch (err) {
        console.error("UPLOAD ERROR:", err);
        res.json({ success: false, error: err.message });
    }
});

// -----------------------------------------
app.get("/qsl", (req, res) => res.json(qslList));
app.get("/download/:call", (req, res) =>
    res.json(qslList.filter(q => q.indicatif.toUpperCase() === req.params.call.toUpperCase()))
);

// -----------------------------------------
app.get("*", (req, res) =>
    res.sendFile(path.join(__dirname, "public/index.html"))
);

// -----------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("TW-eQSL server running on port " + PORT));
