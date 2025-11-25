// -----------------------------------------
//  TW eQSL – Serveur Render Compatible
//  Sharp + Cloudinary + Génération QSL
// -----------------------------------------

import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

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

// Fichiers publics
app.use(express.static(path.join(__dirname, "public")));

const LOCAL_TEMPLATE = path.join(__dirname, "template/eqsl_template.jpg");

// -----------------------------------------
// CLOUDINARY
cloudinary.config({
    cloud_name: "dqpvrfjeu",
    api_key: "825331418956744",
    api_secret: "XJKCIOnfRfD8sFXYuDjNrB-1zpE"
});

// Stockage RAM
let qslList = [];

// -----------------------------------------
// UPLOAD + GENERATION QSL
// -----------------------------------------
app.post("/upload", async (req, res) => {
    try {
        if (!req.body.indicatif)
            return res.json({ success: false, error: "Indicatif manquant" });

        let templatePath = LOCAL_TEMPLATE;
        if (req.files?.template) templatePath = req.files.template.tempFilePath;

        if (!req.files || !req.files.qsl)
            return res.json({ success: false, error: "Aucune image QSL fournie" });

        const file = req.files.qsl;

        // Load template
        const template = sharp(templatePath);
        const tMeta = await template.metadata();
        const TW = tMeta.width;
        const TH = tMeta.height;

        const panelWidth = 380;

        // NOTE → couper automatiquement en lignes
        const noteText = (req.body.note || "").substring(0, 120);
        const lines = noteText.match(/.{1,24}/g) || [];
        let svgLines = "";
        let y = 470;
        lines.forEach(l => {
            svgLines += `<text x="30" y="${y}" font-size="28" fill="black">${l}</text>`;
            y += 40;
        });

        // SVG panel
        const svg = `
        <svg width="${panelWidth}" height="${TH}">
            <rect width="100%" height="100%" fill="white"/>
            <text x="30" y="80" font-size="48" font-weight="700" fill="black">${req.body.indicatif}</text>
            <text x="30" y="150" font-size="32" fill="black">Date : ${req.body.date}</text>
            <text x="30" y="200" font-size="32" fill="black">UTC : ${req.body.time}</text>
            <text x="30" y="260" font-size="32" fill="black">Bande : ${req.body.band}</text>
            <text x="30" y="310" font-size="32" fill="black">Mode : ${req.body.mode}</text>
            <text x="30" y="360" font-size="32" fill="black">Report : ${req.body.report}</text>
            ${svgLines}
        </svg>
        `;

        const svgBuffer = Buffer.from(svg);

        // Resize user image (contain mode)
        const userImg = await sharp(file.tempFilePath)
            .resize(TW, TH, { fit: "contain", background: "white" })
            .toBuffer();

        // Final composition
        const final = await sharp({
            create: {
                width: TW + panelWidth,
                height: TH,
                channels: 3,
                background: "white"
            }
        })
            .composite([
                { input: userImg, left: 0, top: 0 },
                { input: svgBuffer, left: TW, top: 0 }
            ])
            .jpeg({ quality: 92 })
            .toBuffer();

        // Cloudinary upload
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
        res.json({ success: false, error: err.message });
    }
});

// -----------------------------------------
// GALERIE
app.get("/qsl", (req, res) => {
    res.json(qslList);
});

// -----------------------------------------
// DOWNLOAD DIRECT
// -----------------------------------------
app.get("/direct", async (req, res) => {
    try {
        const url = req.query.url;
        const name = req.query.name || "qsl.jpg";

        if (!url) return res.status(400).send("Missing URL");

        const img = await fetch(url);
        const buffer = await img.arrayBuffer();

        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Content-Disposition", `attachment; filename="${name}"`);

        res.send(Buffer.from(buffer));
    } catch (err) {
        res.status(500).send("Erreur download");
    }
});

// -----------------------------------------
// ROUTE PAR DEFAUT
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

// START
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("TW-eQSL server running on port " + PORT));
