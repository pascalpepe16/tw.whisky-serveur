// -----------------------------------------
//  TW eQSL – Serveur Render Compatible
//  Sharp + Cloudinary + Génération QSL
//  + Sauvegarde qsl.json
//  + Suppression Cloudinary après 2 téléchargements
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

app.use(express.static(path.join(__dirname, "public")));

const DATA_FILE = path.join(__dirname, "data/qsl.json");
const LOCAL_TEMPLATE = path.join(__dirname, "template/eqsl_template.jpg");

// -----------------------------------------
// CLOUDINARY
cloudinary.config({
    cloud_name: "dqpvrfjeu",
    api_key: "825331418956744",
    api_secret: "XJKCIOnfRfD8sFXYuDjNrB-1zpE"
});

// -----------------------------------------
// LOAD QSL LIST FROM JSON
let qslList = [];

if (fs.existsSync(DATA_FILE)) {
    try {
        qslList = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch {
        qslList = [];
    }
}

function saveQSL() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(qslList, null, 2));
}

// -----------------------------------------
// WORD WRAPPING
function wrapText(text, max = 40) {
    if (!text) return "";
    const words = text.split(" ");
    let lines = [];
    let line = "";
    for (let w of words) {
        if ((line + w).length > max) {
            lines.push(line);
            line = "";
        }
        line += w + " ";
    }
    if (line.trim() !== "") lines.push(line);
    return lines.join("\n");
}

// -----------------------------------------
// UPLOAD QSL
// -----------------------------------------
app.post("/upload", async (req, res) => {
    try {
        if (!req.body.indicatif)
            return res.json({ success: false, error: "Indicatif manquant" });

        if (!req.files || !req.files.qsl)
            return res.json({ success: false, error: "Aucune image fournie" });

        const imgFile = req.files.qsl;

        let templatePath = LOCAL_TEMPLATE;
        if (req.files?.template) templatePath = req.files.template.tempFilePath;

        // Resize image max 1400×900
        const baseImg = sharp(imgFile.tempFilePath).resize({
            width: 1400,
            height: 900,
            fit: "inside"
        });

        const meta = await baseImg.metadata();
        const W = meta.width;
        const H = meta.height;

        const panelWidth = 350;
        const noteWrapped = wrapText(req.body.note, 32);

        const svg = `
<svg width="${panelWidth}" height="${H}">
    <rect width="100%" height="100%" fill="white"/>
    <text x="20" y="60" font-size="42" font-weight="700" fill="black">${req.body.indicatif}</text>

    <text x="20" y="130" font-size="28">Date : ${req.body.date}</text>
    <text x="20" y="170" font-size="28">UTC : ${req.body.time}</text>
    <text x="20" y="210" font-size="28">Bande : ${req.body.band}</text>
    <text x="20" y="250" font-size="28">Mode : ${req.body.mode}</text>
    <text x="20" y="290" font-size="28">Report : ${req.body.report}</text>

    <text x="20" y="360" font-size="24">${noteWrapped}</text>
</svg>`;

        const svgBuffer = Buffer.from(svg);
        const userBuffer = await baseImg.toBuffer();

        // FINAL COMPOSITION (template + texte)
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

        // Cloudinary upload
        cloudinary.uploader.upload_stream(
            { folder: "TW-eQSL" },
            (err, result) => {
                if (err) return res.json({ success: false, error: err.message });

                const entry = {
                    id: Date.now(),
                    indicatif: req.body.indicatif.toUpperCase(),
                    url: result.secure_url,
                    public_id: result.public_id,
                    thumb: result.secure_url.replace("/upload/", "/upload/w_300/"),
                    date: req.body.date,
                    downloads: 0
                };

                qslList.push(entry);
                saveQSL();

                res.json({ success: true, qsl: entry });
            }
        ).end(final);

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
// DOWNLOAD COUNTER + AUTO DELETE
// -----------------------------------------
app.get("/file/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const entry = qslList.find(q => q.id === id);

    if (!entry) return res.status(404).send("Not found");

    entry.downloads++;
    saveQSL();

    // after 2 downloads → delete Cloudinary
    if (entry.downloads >= 2) {
        try {
            await cloudinary.uploader.destroy(entry.public_id);
            qslList = qslList.filter(q => q.id !== id);
            saveQSL();
        } catch (err) {
            console.log("Cloudinary delete error:", err);
        }
    }

    const filename = `${entry.indicatif}_${entry.date}.jpg`;
    const dlUrl = entry.url.replace(
        "/upload/",
        `/upload/fl_attachment:${filename}/`
    );

    return res.redirect(dlUrl);
});

// -----------------------------------------
app.get("/download/:call", (req, res) => {
    const call = req.params.call.toUpperCase();
    res.json(qslList.filter(q => q.indicatif === call));
});

// -----------------------------------------
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

// SERVER
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
    console.log("TW-eQSL server running on port " + PORT)
);
