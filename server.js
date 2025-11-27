// -----------------------------------------
//  TW eQSL – Serveur Render Compatible (Version Fixée)
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
// PATHS + DATA STORAGE
// -----------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const DATA_FILE = path.join(DATA_DIR, "qsl.json");
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

let qslList = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

function saveQSL() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(qslList, null, 2));
}

// -----------------------------------------
// EXPRESS INIT
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
// CLOUDINARY
// -----------------------------------------
cloudinary.config({
    cloud_name: "dqpvrfjeu",
    api_key: "825331418956744",
    api_secret: "XJKCIOnfRfD8sFXYuDjNrB-1zpE"
});

// -----------------------------------------
// TEXT WRAP
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
// UPLOAD / GENERATE QSL
// -----------------------------------------
app.post("/upload", async (req, res) => {
    try {
        if (!req.files?.qsl)
            return res.json({ success: false, error: "Aucune image QSL fournie" });

        const imgFile = req.files.qsl;

        // Resize image max 1400×900
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
        const noteText = wrapText(req.body.note, 32);

        // PANEL SVG
        const svg = `
        <svg width="${panelWidth}" height="${H}">
            <rect width="100%" height="100%" fill="white"/>

            <text x="20" y="60" font-size="42" font-weight="700">${req.body.indicatif}</text>

            <text x="20" y="100" font-size="28">Date : ${req.body.date}</text>
            <text x="20" y="140" font-size="28">UTC : ${req.body.time}</text>
            <text x="20" y="180" font-size="28">Bande : ${req.body.band}</text>
            <text x="20" y="200" font-size="28">Mode : ${req.body.mode}</text>
            <text x="20" y="260" font-size="28">Report : ${req.body.report}</text>

            <text x="20" y="280" font-size="24">${noteText}</text>
        </svg>`;

        const svgBuffer = Buffer.from(svg);
        const userBuffer = await baseImg.toBuffer();

        // FINAL CANVAS (never error)
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
                if (err)
                    return res.json({ success: false, error: err.message });

                const entry = {
                    id: Date.now(),
                    indicatif: req.body.indicatif,
                    url: result.secure_url,
                    thumb: result.secure_url.replace("/upload/", "/upload/w_300/"),
                    date: req.body.date,
                    downloads: 0
                };

                qslList.push(entry);
                saveQSL();

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
// -----------------------------------------
app.get("/qsl", (req, res) => res.json(qslList));

// -----------------------------------------
// DIRECT DOWNLOAD + COUNTER
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

// FRONTEND
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

// RUN SERVER
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
    console.log("TW eQSL server running on port " + PORT)
);
