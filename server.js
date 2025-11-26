// -----------------------------------------
//  TW eQSL – Server Render Stable Version
//  Modules : ZIP / Auto-clean / Sort / No Error Composite
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
// PATHS
// -----------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const DATA_FILE = path.join(DATA_DIR, "qsl.json");
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

const LOCAL_TEMPLATE = path.join(__dirname, "template/eqsl_template.jpg");

// Chargement JSON
let qslList = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

// Sauvegarde JSON
function saveQSL() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(qslList, null, 2));
}

// -----------------------------------------
// CLOUDINARY CONFIG
// -----------------------------------------
cloudinary.config({
    cloud_name: "dqpvrfjeu",
    api_key: "825331418956744",
    api_secret: "XJKCIOnfRfD8sFXYuDjNrB-1zpE"
});

// -----------------------------------------
// EXPRESS SETUP
// -----------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/"
}));

app.use(express.static(path.join(__dirname, "public")));

// -----------------------------------------
// TEXT WRAP
// -----------------------------------------
function wrapText(text, max = 32) {
    if (!text) return "";
    const words = text.split(" ");
    let lines = [];
    let line = "";

    for (let w of words) {
        if ((line + w).length > max) {
            lines.push(line.trim());
            line = "";
        }
        line += w + " ";
    }
    if (line.trim()) lines.push(line.trim());

    return lines.join("\n");
}

// -----------------------------------------
// AUTO CLEANUP : suppression après X jours
// -----------------------------------------
const DAYS_BEFORE_DELETE = 15;

function autoCleanup() {
    const now = Date.now();
    const limit = DAYS_BEFORE_DELETE * 24 * 60 * 60 * 1000;

    let before = qslList.length;
    qslList = qslList.filter(q => now - q.id < limit);
    if (before !== qslList.length) saveQSL();
}

setInterval(autoCleanup, 3600 * 1000);

// -----------------------------------------
// UPLOAD / GENERATE QSL
// -----------------------------------------
app.post("/upload", async (req, res) => {
    try {
        if (!req.files || !req.files.qsl)
            return res.json({ success: false, error: "Aucune image fournie" });

        const imgFile = req.files.qsl;

        // 1️⃣ Resize max 1400×900
        const baseImg = sharp(imgFile.tempFilePath).resize({
            width: 1400,
            height: 900,
            fit: "inside",
            withoutEnlargement: true
        });

        const meta = await baseImg.metadata();
        const W = meta.width;
        const H = meta.height;

        // 2️⃣ Panel même hauteur EXACTE => FINI les erreurs
        const panelWidth = 350;

        const svg = `
<svg width="${panelWidth}" height="${H}">
    <rect width="100%" height="100%" fill="white"/>
    <text x="20" y="60" font-size="42" font-weight="700" fill="black">${req.body.indicatif}</text>

    <text x="20" y="120" font-size="28" fill="black">Date : ${req.body.date}</text>
    <text x="20" y="160" font-size="28" fill="black">UTC : ${req.body.time}</text>
    <text x="20" y="200" font-size="28" fill="black">Bande : ${req.body.band}</text>
    <text x="20" y="240" font-size="28" fill="black">Mode : ${req.body.mode}</text>
    <text x="20" y="280" font-size="28" fill="black">Report : ${req.body.report}</text>

    <text x="20" y="350" font-size="22" fill="black">${wrapText(req.body.note, 32)}</text>
</svg>`;

        const svgBuffer = Buffer.from(svg);
        const userBuffer = await baseImg.toBuffer();

        // 3️⃣ Création du canvas final
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

        // 4️⃣ Cloudinary upload
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "TW-eQSL" },
            (err, result) => {
                if (err) return res.json({ success: false, error: err.message });

                const entry = {
                    id: Date.now(),
                    indicatif: req.body.indicatif,
                    date: req.body.date,
                    url: result.secure_url,
                    thumb: result.secure_url.replace("/upload/", "/upload/w_300/"),
                    downloads: 0
                };

                qslList.push(entry);
                saveQSL();

                res.json({ success: true, qsl: entry });
            }
        );

        uploadStream.end(final);

    } catch (err) {
        console.error("UPLOAD ERROR:", err);
        return res.json({ success: false, error: err.message });
    }
});

// -----------------------------------------
// GALLERY (Tri du plus récent au plus vieux)
// -----------------------------------------
app.get("/qsl", (req, res) => {
    res.json(qslList.sort((a, b) => b.id - a.id));
});

// -----------------------------------------
// DOWNLOAD TRACKING
// -----------------------------------------
app.get("/file/:id", (req, res) => {
    const qsl = qslList.find(q => q.id == req.params.id);
    if (!qsl) return res.status(404).send("Not found");

    qsl.downloads++;
    saveQSL();

    res.redirect(qsl.url);
});

// -----------------------------------------
// SEARCH BY CALLSIGN
// -----------------------------------------
app.get("/download/:call", (req, res) => {
    const call = req.params.call.toUpperCase();
    res.json(qslList.filter(q => q.indicatif.toUpperCase() === call));
});

// -----------------------------------------
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

// -----------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
    console.log("TW eQSL server running on port " + PORT)
);
