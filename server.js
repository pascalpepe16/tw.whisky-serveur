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
// PATH SETUP
// -----------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// data/ folder auto-create
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const DATA_FILE = path.join(DATA_DIR, "qsl.json");

// repair JSON file if empty or broken
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]");
} else {
    try {
        JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch {
        fs.writeFileSync(DATA_FILE, "[]");
    }
}

// Load & Save helpers
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
// CLOUDINARY CONFIG
// -----------------------------------------
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dqpvrfjeu",
    api_key: process.env.CLOUDINARY_API_KEY || "825331418956744",
    api_secret: process.env.CLOUDINARY_API_SECRET || "XJKCIOnfRfD8sFXYuDjNrB-1zpE"
});

// -----------------------------------------
// TEXT WRAP
// -----------------------------------------
function wrapText(text, max = 32) {
    if (!text) return "";
    const words = text.trim().split(/\s+/);
    const lines = [];
    let line = "";

    for (const w of words) {
        if ((line + w).length > max) {
            lines.push(line.trim());
            line = "";
        }
        line += w + " ";
    }
    if (line.trim().length > 0) lines.push(line.trim());
    return lines.join("\n");
}

// -----------------------------------------
// UPLOAD + QSL GENERATION
// -----------------------------------------
app.post("/upload", async (req, res) => {
    try {
        if (!req.files || !req.files.qsl)
            return res.json({ success: false, error: "Aucune image fournie" });

        const imgFile = req.files.qsl;

        // Resize image
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

        const svg = `
        <svg width="${panelWidth}" height="${H}">
            <rect width="100%" height="100%" fill="white"/>
            <text x="20" y="60" font-size="42" font-weight="700">${req.body.indicatif}</text>
            <text x="20" y="120" font-size="28">Date : ${req.body.date}</text>
            <text x="20" y="160" font-size="28">UTC  : ${req.body.time}</text>
            <text x="20" y="200" font-size="28">Bande: ${req.body.band}</text>
            <text x="20" y="240" font-size="28">Mode : ${req.body.mode}</text>
            <text x="20" y="280" font-size="28">Report : ${req.body.report}</text>
            <text x="20" y="340" font-size="24">${noteText}</text>
        </svg>`;

        const svgBuffer = Buffer.from(svg);
        const userBuffer = await baseImg.toBuffer();

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

        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "TW-eQSL" },
            (err, result) => {
                if (err) return res.json({ success: false, error: err.message });

                const entry = {
                    public_id: result.public_id,
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
// DOWNLOAD: direct → browser
// -----------------------------------------
app.get("/file/:public_id", async (req, res) => {
    try {
        const pid = req.params.public_id;

        const qsl = qslList.find(q => q.public_id === pid);
        if (!qsl) return res.status(404).send("Not found");

        qsl.downloads++;
        saveQSL(qslList);

        res.setHeader("Content-Disposition", `attachment; filename="${qsl.indicatif}_${qsl.date}.jpg"`);
        res.redirect(qsl.url);

    } catch (err) {
        console.error("DOWNLOAD ERROR:", err);
        res.status(500).send("Download error");
    }
});

// -----------------------------------------
// SEARCH BY INDICATIF
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
