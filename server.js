// -----------------------------------------
//  TW eQSL – Serveur Render + Cloudinary + Sharp
//  Version : PERSISTANCE Cloudinary (Solution B)
// -----------------------------------------

import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import fetch from "node-fetch";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import { fileURLToPath } from "url";

// -----------------------------------------
// INIT EXPRESS
const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp/" }));

// -----------------------------------------
// PATH SYSTEM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Static folder
app.use(express.static(path.join(__dirname, "public")));

// Template local
const LOCAL_TEMPLATE = path.join(__dirname, "template/eqsl_template.jpg");

// -----------------------------------------
// CLOUDINARY CONFIG
cloudinary.config({
    cloud_name: "dqpvrfjeu",
    api_key: "825331418956744",
    api_secret: "XJKCIOnfRfD8sFXYuDjNrB-1zpE"
});

// -----------------------------------------
// WRAP TEXT FUNCTION
function wrapText(text, max = 40) {
    if (!text) return "";
    const words = text.split(" ");
    let lines = [], line = "";

    words.forEach(w => {
        if ((line + w).length > max) {
            lines.push(line);
            line = "";
        }
        line += w + " ";
    });

    if (line.trim()) lines.push(line.trim());
    return lines.join("\n");
}

// -----------------------------------------
// UPLOAD + GENERATE QSL
// -----------------------------------------
app.post("/upload", async (req, res) => {
    try {
        if (!req.body.indicatif)
            return res.json({ success: false, error: "Indicatif manquant" });

        if (!req.files || !req.files.qsl)
            return res.json({ success: false, error: "Aucune image QSL fournie" });

        const imgFile = req.files.qsl;

        // Template user ?
        let templatePath = LOCAL_TEMPLATE;
        if (req.files?.template) templatePath = req.files.template.tempFilePath;

        // -----------------------------
        // LOAD USER IMAGE (auto-resize max 1400x900)
        const baseImg = sharp(imgFile.tempFilePath).resize({
            width: 1400,
            height: 900,
            fit: "inside"
        });

        const meta = await baseImg.metadata();
        const W = meta.width;
        const H = meta.height;

        // -----------------------------
        // PANEL WIDTH
        const panelWidth = 350;

        // -----------------------------
        // WRAP NOTE
        const noteWrapped = wrapText(req.body.note, 32);

        // -----------------------------
        // SVG PANEL
        const svg = `
<svg width="${panelWidth}" height="${H}">
    <rect width="100%" height="100%" fill="white"/>
    <text x="20" y="60" font-size="42" font-weight="700" fill="black">${req.body.indicatif}</text>
    <text x="20" y="130" font-size="28" fill="black">Date : ${req.body.date}</text>
    <text x="20" y="170" font-size="28" fill="black">UTC : ${req.body.time}</text>
    <text x="20" y="210" font-size="28" fill="black">Bande : ${req.body.band}</text>
    <text x="20" y="250" font-size="28" fill="black">Mode : ${req.body.mode}</text>
    <text x="20" y="290" font-size="28" fill="black">Report : ${req.body.report}</text>
    <text x="20" y="360" font-size="24" fill="black">${noteWrapped}</text>
</svg>`;
        const svgBuffer = Buffer.from(svg);

        const userBuffer = await baseImg.toBuffer();

        // -----------------------------
        // FINAL IMAGE
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

        // -----------------------------
        // UPLOAD TO CLOUDINARY (PERSISTENT)
        cloudinary.uploader.upload_stream(
            {
                folder: "TW-eQSL",
                tags: ["TWQSL", `CALL-${req.body.indicatif.toUpperCase()}`]
            },
            (err, result) => {
                if (err) return res.json({ success: false, error: err.message });

                const qsl = {
                    id: result.public_id,
                    indicatif: req.body.indicatif,
                    url: result.secure_url,
                    thumb: result.secure_url.replace("/upload/", "/upload/w_350/"),
                    date: req.body.date
                };

                return res.json({ success: true, qsl });
            }
        ).end(final);

    } catch (err) {
        console.error("UPLOAD ERROR:", err);
        res.json({ success: false, error: err.message });
    }
});

// -----------------------------------------
// GALLERY — LIST CLOUDINARY ASSETS
// -----------------------------------------
app.get("/qsl", async (req, res) => {
    try {
        const items = await cloudinary.search
            .expression('resource_type:image AND tags=TWQSL')
            .sort_by("public_id", "desc")
            .max_results(200)
            .execute();

        const list = items.resources.map(r => ({
            id: r.public_id,
            indicatif: r.tags.find(t => t.startsWith("CALL-"))?.replace("CALL-", "") || "N/A",
            url: r.secure_url,
            thumb: r.secure_url.replace("/upload/", "/upload/w_300/"),
            date: r.created_at.substring(0, 10)
        }));

        res.json(list);
    }
    catch (e) {
        res.json([]);
    }
});

// -----------------------------------------
// DOWNLOAD LIST PAR INDICATIF
// -----------------------------------------
app.get("/download/:call", async (req, res) => {
    const call = req.params.call.toUpperCase();

    const items = await cloudinary.search
        .expression(`resource_type:image AND tags=CALL-${call}`)
        .sort_by("public_id", "desc")
        .execute();

    const list = items.resources.map(r => ({
        id: r.public_id,
        url: r.secure_url,
        thumb: r.secure_url.replace("/upload/", "/upload/w_300/"),
        indicatif: call,
        date: r.created_at.substring(0, 10)
    }));

    res.json(list);
});

// -----------------------------------------
// DIRECT DOWNLOAD (SERVER → CLIENT)
// -----------------------------------------
app.get("/file/:id", async (req, res) => {
    try {
        const id = req.params.id;

        const file = await cloudinary.api.resource(id);

        const response = await fetch(file.secure_url);
        const buffer = await response.arrayBuffer();

        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${id}.jpg"`
        );

        return res.send(Buffer.from(buffer));
    }
    catch (e) {
        res.status(500).send("Téléchargement impossible");
    }
});

// -----------------------------------------
// FRONTEND DEFAULT ROUTE
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

// -----------------------------------------
// START SERVER
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("TW-eQSL server running on port " + PORT));
