// -----------------------------------------
//  TW eQSL – Serveur Render Compatible
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
// PATHS + AUTO CREATION data/qsl.json
// -----------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const DATA_FILE = path.join(DATA_DIR, "qsl.json");
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

// Fonctions utilitaires
function loadQSL() {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function saveQSL(list) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

let qslList = loadQSL();

// -----------------------------------------
// INIT EXPRESS
// -----------------------------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/"
}));

app.use(express.static(path.join(__dirname, "public")));

const LOCAL_TEMPLATE = path.join(__dirname, "template/eqsl_template.jpg");

// -----------------------------------------
// CLOUDINARY
// -----------------------------------------
cloudinary.config({
    cloud_name: "dqpvrfjeu",
    api_key: "825331418956744",
    api_secret: "XJKCIOnfRfD8sFXYuDjNrB-1zpE"
});

// -----------------------------------------
// TEXT WRAP FUNCTION
// -----------------------------------------
function wrapText(text, max = 32) {
    if (!text) return "";
    const words = text.trim().split(" ");
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
// UPLOAD + GENERATION
// -----------------------------------------
app.post("/upload", async (req, res) => {
    try {
        if (!req.files || !req.files.qsl)
            return res.json({ success: false, error: "Aucune image QSL fournie" });

        const imgFile = req.files.qsl;

        let templatePath = LOCAL_TEMPLATE;
        if (req.files?.template)
            templatePath = req.files.template.tempFilePath;

        // Resize image user
        const baseImg = sharp(imgFile.tempFilePath).resize({
            width: 1400,
            height: 900,
            fit: "inside",
            withoutEnlargement: true
        });

        const meta = await baseImg.metadata();
        const W = meta.width;
        const H = meta.height;

        const panelWidth = 350;

        // NOTE WRAPPED
        const noteText = wrapText(req.body.note, 32);

        // SVG PANEL
        const svg = `
        <svg width="${panelWidth}" height="${H}">
            <rect width="100%" height="100%" fill="white"/>
            <text x="20" y="60" font-size="42" font-weight="700" fill="black">${req.body.indicatif}</text>

            <text x="20" y="120" font-size="28" fill="black">Date : ${req.body.date}</text>
            <text x="20" y="160" font-size="28" fill="black">UTC  : ${req.body.time}</text>
            <text x="20" y="200" font-size="28" fill="black">Bande : ${req.body.band}</text>
            <text x="20" y="240" font-size="28" fill="black">Mode : ${req.body.mode}</text>
            <text x="20" y="280" font-size="28" fill="black">Report : ${req.body.report}</text>

            <text x="20" y="340" font-size="24" fill="black">
${noteText}
            </text>
        </svg>`;

        const svgBuffer = Buffer.from(svg);
        const userBuffer = await baseImg.toBuffer();

        // Final canvas
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

        // Upload to Cloudinary
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "TW-eQSL" },
            (err, result) => {
                if (err) return res.json({ success: false, error: err.message });

                const entry = {
                    id: Date.now(),
                    indicatif: req.body.indicatif,
                    url: result.secure_url,
                    thumb: result.secure_url.replace("/upload/", "/upload/w_300/"),
                    date: req.body.date,
                    downloads: 0
                };

                qslList.push(entry);
                saveQSL(qslList);

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
// GALLERY
// -----------------------------------------
app.get("/qsl", (req, res) => {
    res.json(qslList);
});

// -----------------------------------------
// DOWNLOAD TRACKING + REDIRECT
// -----------------------------------------
app.get("/file/:id", (req, res) => {
    const qsl = qslList.find(q => q.id == req.params.id);
    if (!qsl) return res.status(404).send("Not found");

    qsl.downloads++;
    saveQSL(qslList);

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
app.listen(PORT, () => console.log("TW eQSL server running on port " + PORT));
