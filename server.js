// -----------------------------------------
//  TW eQSL – Serveur Render Compatible
//  Sharp + Cloudinary + Génération QSL
// -----------------------------------------

import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import https from "https";
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
// STOCKAGE EN RAM DES QSL
let qslList = [];

// -----------------------------------------
// UPLOAD + GENERATION QSL
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

        // TEMPLATE
        const template = sharp(templatePath);
        const tMeta = await template.metadata();
        const TW = tMeta.width;
        const TH = tMeta.height;

        // ----------- NOTE WRAP (120 caractères max) -----------
        const note = (req.body.note || "")
            .replace(/(.{40})/g, "$1\n")
            .substring(0, 120);

        // ----------- SVG PANEL TEXTE -----------
        const panelWidth = 380;

        const svg = `
        <svg width="${panelWidth}" height="${TH}">
            <rect width="100%" height="100%" fill="white"/>
            <text x="20" y="70" font-size="46" font-weight="700" fill="black">${req.body.indicatif}</text>
            <text x="20" y="130" font-size="32" fill="black">Date : ${req.body.date}</text>
            <text x="20" y="180" font-size="32" fill="black">UTC : ${req.body.time}</text>
            <text x="20" y="230" font-size="32" fill="black">Bande : ${req.body.band}</text>
            <text x="20" y="280" font-size="32" fill="black">Mode : ${req.body.mode}</text>
            <text x="20" y="330" font-size="32" fill="black">Report : ${req.body.report}</text>
            <text x="20" y="390" font-size="26" fill="black">${note}</text>
        </svg>
        `;
        const svgBuffer = Buffer.from(svg);

        // ----------- IMAGE UTILISATEUR (contain, pas déformée) -----------
        const userImg = await sharp(file.tempFilePath)
            .resize(TW, TH, { fit: "contain", background: "white" })
            .toBuffer();

        // ----------- COMPOSITION FINALE -----------
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
            .jpeg({ quality: 90 })
            .toBuffer();

        // ----------- UPLOAD CLOUDINARY -----------
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
// GALERIE
app.get("/qsl", (req, res) => {
    res.json(qslList);
});

// -----------------------------------------
// TELECHARGEMENT DIRECT
// -----------------------------------------
app.get("/direct-download/:id", (req, res) => {
    const id = req.params.id;
    const qsl = qslList.find(q => String(q.id) === String(id));

    if (!qsl) return res.status(404).send("Not found");

    https.get(qsl.url, fileRes => {
        res.setHeader("Content-Disposition",
            `attachment; filename="${qsl.indicatif}_${qsl.date}.jpg"`
        );
        fileRes.pipe(res);
    });
});

// -----------------------------------------
// ROUTE PAR DEFAUT
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

// -----------------------------------------
// START SERVER
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
    console.log("TW-eQSL server running on port " + PORT)
);
