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

// Dossier public
app.use(express.static(path.join(__dirname, "public")));

// Template QSL local
const LOCAL_TEMPLATE = path.join(__dirname, "template/eqsl_template.jpg");

// -----------------------------------------
//  CLOUDINARY
cloudinary.config({
    cloud_name: "dqpvrfjeu",
    api_key: "794295772667991",
    api_secret: "EF3kOwRM3a9sQL22r83-LRVh4nw"
});

// -----------------------------------------
// STOCKAGE EN RAM
let qslList = [];


// -----------------------------------------------------------
//  FONCTION UTILITAIRE : Coupe la note en lignes automatiques
// -----------------------------------------------------------
function wrapText(text = "", maxChars = 32) {
    const words = text.split(" ");
    let lines = [];
    let line = "";

    for (let w of words) {
        if ((line + w).length > maxChars) {
            lines.push(line);
            line = "";
        }
        line += w + " ";
    }
    if (line.trim() !== "") lines.push(line);

    // Limite max : 5 lignes
    return lines.slice(0, 5)
        .map((l, i) => `<text x="30" y="${480 + i * 40}" font-size="28" fill="black">${l}</text>`)
        .join("\n");
}



// -----------------------------------------
// UPLOAD + GENERATION QSL
// -----------------------------------------
app.post("/upload", async (req, res) => {
    try {
        if (!req.body.indicatif)
            return res.json({ success: false, error: "Indicatif manquant" });

        let templatePath = LOCAL_TEMPLATE;

        // Template personnalisé
        if (req.files?.template) {
            templatePath = req.files.template.tempFilePath;
        }

        if (!req.files || !req.files.qsl)
            return res.json({ success: false, error: "Aucune image QSL fournie" });

        const file = req.files.qsl;

        // -----------------------------
        // TEMPLATE (taille 1400x900)
        // -----------------------------
        const TW = 1400;
        const TH = 900;
        const panelWidth = 420;

        // -----------------------------
        // Note formatée
        // -----------------------------
        const noteLines = wrapText(req.body.note || "");

        // -----------------------------
        // SVG TEXTE À DROITE
        // -----------------------------
        const svg = `
        <svg width="${panelWidth}" height="${TH}">
            <rect width="100%" height="100%" fill="white"/>

            <text x="30" y="80" font-size="46" font-weight="700" fill="black">${req.body.indicatif}</text>

            <text x="30" y="150" font-size="32" fill="black">Date : ${req.body.date}</text>
            <text x="30" y="200" font-size="32" fill="black">UTC : ${req.body.time}</text>

            <text x="30" y="260" font-size="32" fill="black">Bande : ${req.body.band}</text>
            <text x="30" y="310" font-size="32" fill="black">Mode : ${req.body.mode}</text>

            <text x="30" y="360" font-size="32" fill="black">Report : ${req.body.report}</text>

            ${noteLines}
        </svg>
        `;
        const svgBuffer = Buffer.from(svg);

        // -----------------------------
        // IMAGE UTILISATEUR (contain)
        // -----------------------------
        const userImg = await sharp(file.tempFilePath)
            .resize(TW, TH, { fit: "contain", background: "white" })
            .toBuffer();

        // -----------------------------
        // TEMPLATE DE BASE
        // -----------------------------
        const template = await sharp(LOCAL_TEMPLATE)
            .resize(TW, TH)
            .toBuffer();

        // -----------------------------
        // COMPOSITION FINALE
        // -----------------------------
        const final = await sharp({
            create: {
                width: TW + panelWidth,
                height: TH,
                channels: 3,
                background: "white"
            }
        })
            .composite([
                { input: template, left: 0, top: 0 },
                { input: userImg, left: 0, top: 0 },
                { input: svgBuffer, left: TW, top: 0 }
            ])
            .jpeg({ quality: 92 })
            .toBuffer();


        // -----------------------------
        // UPLOAD CLOUDINARY
        // -----------------------------
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
                res.json({ success: true, qsl: entry });
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
// DOWNLOAD PAR INDICATIF (téléchargement direct)
app.get("/download/:call", async (req, res) => {
    const call = req.params.call.toUpperCase();

    const list = qslList.filter(q => q.indicatif.toUpperCase() === call);
    if (!list.length) return res.status(404).json({ error: "Aucune QSL trouvée" });

    // → Téléchargement direct de la dernière QSL
    const qsl = list[list.length - 1];

    res.redirect(qsl.url);
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
