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

// Chemin du template local
const LOCAL_TEMPLATE = path.join(__dirname, "template/eqsl_template.jpg");

// -----------------------------------------
// CLOUDINARY
cloudinary.config({
    cloud_name: "dqpvrfjeu",
    api_key: "794295772667991",
    api_secret: "EF3kOwRM3a9sQL22r83-LRVh4nw"
});

// -----------------------------------------
// STOCKAGE QSL EN RAM
let qslList = [];

// Escape XML
const escapeXml = (str) => str.replace(/[<>&'"]/g, c => ({
    "<": "&lt;", ">": "&gt;",
    "&": "&amp;", "'": "&apos;", "\"": "&quot;"
}[c]));

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

        // Template info
        const template = sharp(templatePath);
        const tMeta = await template.metadata();
        const TW = tMeta.width;
        const TH = tMeta.height;

        // PANEL
        const panelWidth = 380;

        // --------------------------
        // NOTE MULTI-LIGNES SPLIT
        // --------------------------
        const noteText = (req.body.note || "").trim().substring(0, 120); // 120 chars max
        const words = noteText.split(" ");
        let lines = [];
        let line = "";

        for (let w of words) {
            if ((line + w).length > 26) { // 26 chars per line
                lines.push(line);
                line = w + " ";
            } else line += w + " ";
        }
        if (line.trim() !== "") lines.push(line);

        // Construct note SVG block
        let noteSvg = "";
        const baseY = 400;
        const lineHeight = 34;

        for (let i = 0; i < lines.length; i++) {
            const y = baseY + i * lineHeight;
            noteSvg += `<text x="25" y="${y}" font-size="28" fill="black">${escapeXml(lines[i])}</text>`;
        }

        // -------------------------
        // SVG FINAL
        // -------------------------
        const svg = `
        <svg width="${panelWidth}" height="${TH}">
            <rect width="100%" height="100%" fill="white"/>
            <text x="25" y="70" font-size="50" font-weight="700">${escapeXml(req.body.indicatif)}</text>
            <text x="25" y="150" font-size="32">Date : ${escapeXml(req.body.date)}</text>
            <text x="25" y="200" font-size="32">UTC : ${escapeXml(req.body.time)}</text>
            <text x="25" y="260" font-size="32">Bande : ${escapeXml(req.body.band)}</text>
            <text x="25" y="310" font-size="32">Mode : ${escapeXml(req.body.mode)}</text>
            <text x="25" y="360" font-size="32">Report : ${escapeXml(req.body.report)}</text>

            ${noteSvg}
        </svg>
        `;
        const svgBuffer = Buffer.from(svg);

        // -------------------------
        // USER IMAGE (CONTAIN)
        // -------------------------
        const userImg = await sharp(file.tempFilePath)
            .resize(TW, TH, {
                fit: "contain",
                background: "white"
            })
            .toBuffer();

        // -------------------------
        // FINAL COMPOSITING
        // -------------------------
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

        // -------------------------
        // CLOUDINARY STREAM UPLOAD
        // -------------------------
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "TW-eQSL" },
            (err, result) => {
                if (err) return res.json({ success: false, error: err.message });

                const entry = {
                    id: Date.now(),
                    indicatif: req.body.indicatif.toUpperCase(),
                    url: result.secure_url,
                    thumb: result.secure_url.replace("/upload/", "/upload/w_350/"),
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
// GALERIE
app.get("/qsl", (req, res) => res.json(qslList));

// -----------------------------------------
// DOWNLOAD PAR INDICATIF
app.get("/download/:call", (req, res) => {
    const call = req.params.call.toUpperCase();
    res.json(qslList.filter(q => q.indicatif === call));
});

// -----------------------------------------
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

// -----------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("TW-eQSL server running on port " + PORT));
