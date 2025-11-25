// -----------------------------------------
//  TW eQSL – Serveur Render Compatible
//  Sharp + Cloudinary + Génération QSL
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
// INIT EXPRESS
const app = express();
app.use(cors());
app.use(express.json());

app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/"
}));

// -----------------------------------------
// PATHS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Static folder
app.use(express.static(path.join(__dirname, "public")));

// Local template
const LOCAL_TEMPLATE = path.join(__dirname, "template/eqsl_template.jpg");

// -----------------------------------------
// CLOUDINARY
cloudinary.config({
    cloud_name: "dqpvrfjeu",
    api_key: "825331418956744",
    api_secret: "XJKCIOnfRfD8sFXYuDjNrB-1zpE"
});

// -----------------------------------------
// RAM storage of QSL
let qslList = [];

// -----------------------------------------
// TEXT WRAPPING FUNCTION
function wrapText(text, max = 40) {
    if (!text) return "";
    const words = text.split(" ");
    let lines = [];
    let line = "";

    words.forEach(w => {
        if ((line + w).length > max) {
            lines.push(line);
            line = "";
        }
        line += w + " ";
    });

    if (line.trim() !== "") lines.push(line);

    return lines.join("\n");
}

// -----------------------------------------
// UPLOAD & GENERATE QSL
// -----------------------------------------
app.post("/upload", async (req, res) => {
    try {
        if (!req.body.indicatif)
            return res.json({ success: false, error: "Indicatif manquant" });

        if (!req.files || !req.files.qsl)
            return res.json({ success: false, error: "Aucune image QSL fournie" });

        const imgFile = req.files.qsl;

        // user template ?
        let templatePath = LOCAL_TEMPLATE;
        if (req.files?.template) {
            templatePath = req.files.template.tempFilePath;
        }

        // -----------------------------
        // LOAD USER IMAGE + RESIZE MAX 1400x900
        const baseImg = sharp(imgFile.tempFilePath).resize({
            width: 1500,
            height: 900,
            fit: "inside"
        });

        const meta = await baseImg.metadata();
        const W = meta.width;
        const H = meta.height;

        // -----------------------------
        // PANEL FIXED WIDTH
        const panelWidth = 350;

        // -----------------------------
        // NOTE WRAP
        const noteWrapped = wrapText(req.body.note, 32);

        // -----------------------------
        // SVG TEXT PANEL
        const svg = `
<svg width="${panelWidth}" height="${H}">
    <rect width="100%" height="100%" fill="white"/>
    <text x="20" y="60" font-size="42" font-weight="700" fill="black">${req.body.indicatif}</text>

    <text x="20" y="130" font-size="28" fill="black">Date : ${req.body.date}</text>
    <text x="20" y="170" font-size="28" fill="black">UTC  : ${req.body.time}</text>
    <text x="20" y="210" font-size="28" fill="black">Bande : ${req.body.band}</text>
    <text x="20" y="250" font-size="28" fill="black">Mode : ${req.body.mode}</text>
    <text x="20" y="290" font-size="28" fill="black">Report : ${req.body.report}</text>

    <text x="20" y="360" font-size="24" fill="black">${noteWrapped}</text>
</svg>`;

        const svgBuffer = Buffer.from(svg);

        const userBuffer = await baseImg.toBuffer();

        // -----------------------------
        // FINAL COMPOSITION
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

        // -----------------------------
        // CLOUDINARY UPLOAD stream
        const uploadStream = cloudinary.uploader.upload_stream(
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

                return res.json({ success: true, qsl: entry });
            }
        );

        uploadStream.end(final);

    } catch (err) {
        console.error("UPLOAD ERROR:", err);
        res.json({ success: false, error: err.message });
    }
});

// -----------------------------------------
// GALLERY
app.get("/qsl", (req, res) => {
    res.json(qslList);
});

// -----------------------------------------
// DIRECT DOWNLOAD
app.get("/download/:call", async (req, res) => {
    const call = req.params.call.toUpperCase();
    const list = qslList.filter(q => q.indicatif.toUpperCase() === call);

    res.json(list);
});

// -----------------------------------------
// FRONTEND DEFAULT ROUTE
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

// -----------------------------------------
// SERVER
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
    console.log("TW-eQSL server running on port " + PORT)
);
