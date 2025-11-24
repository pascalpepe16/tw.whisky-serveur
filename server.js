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
//  CLOUDINARY CONFIG
cloudinary.config({
    cloud_name: "dqpvrfjeu",
    api_key: "825331418956744",
    api_secret: "EF3kOwRM3a9sQL22r83-LRVh4nw"
});

// -----------------------------------------
// STOCKAGE EN RAM (Option B)
let qslList = [];

// -----------------------------------------
// UPLOAD + GENERATION QSL
// -----------------------------------------
app.post("/upload", async (req, res) => {
    try {
        if (!req.body.indicatif)
            return res.json({ success: false, error: "Indicatif manquant" });

        // Template personnalisé ou par défaut
        let templatePath = LOCAL_TEMPLATE;

        if (req.files?.template) {
            templatePath = req.files.template.tempFilePath;
        }

        // Image principale obligatoire
        if (!req.files || !req.files.qsl)
            return res.json({ success: false, error: "Aucune image QSL fournie" });

        const file = req.files.qsl;

        // =============================
        // CHARGER TEMPLATE DE BASE
        // =============================
        const template = sharp(templatePath);
        const tMeta = await template.metadata();
        const TW = tMeta.width;
        const TH = tMeta.height;

        // =============================
        // SVG PANNEAU TEXTE
        // =============================
        const panelWidth = 380;

        const svg = `
        <svg width="${panelWidth}" height="${TH}" xmlns="http://www.w3.org/2000/svg">

            <rect width="100%" height="100%" fill="white"/>

            <text x="30" y="70" font-size="54" font-weight="700" fill="black">
                ${req.body.indicatif}
            </text>

            <line x1="20" y1="90" x2="${panelWidth - 20}" y2="90"
                  stroke="black" stroke-width="3"/>

            <text x="30" y="150" font-size="36" fill="black">Date : ${req.body.date}</text>
            <text x="30" y="200" font-size="36" fill="black">UTC : ${req.body.time}</text>

            <text x="30" y="260" font-size="36" fill="black">Bande : ${req.body.band}</text>
            <text x="30" y="310" font-size="36" fill="black">Mode : ${req.body.mode}</text>

            <text x="30" y="370" font-size="36" fill="black">Report : ${req.body.report}</text>

            <foreignObject x="25" y="430" width="${panelWidth - 50}" height="400">
                <div xmlns="http://www.w3.org/1999/xhtml"
                     style="font-size:30px;color:black;line-height:35px;font-family:Arial;">
                     ${req.body.note || ""}
                </div>
            </foreignObject>

        </svg>
        `;

        // IMPORTANT → création du buffer SVG
        const svgBuffer = Buffer.from(svg);

        // =============================
        // REDIMENSION IMAGE UTILISATEUR
        // =============================
        const userImg = await sharp(file.tempFilePath)
            .resize(TW, TH, { fit: "cover" })
            .toBuffer();

        // =============================
        // COMPOSITION FINALE
        // =============================
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

        // =============================
        // UPLOAD CLOUDINARY
        // =============================
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "TW-eQSL" },
            (err, result) => {
                if (err)
                    return res.json({ success: false, error: err.message });

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
// DOWNLOAD PAR INDICATIF
app.get("/download/:call", (req, res) => {
    const call = req.params.call.toUpperCase();
    res.json(qslList.filter(q => q.indicatif.toUpperCase() === call));
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
