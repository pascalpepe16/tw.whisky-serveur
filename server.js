// -----------------------------------------
//  TW eQSL – Serveur Render + Cloudinary Only
//  Version OPTION B – Zéro RAM, Zéro Perte
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

// PATHS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// CLOUDINARY
cloudinary.config({
    cloud_name: "dqpvrfjeu",
    api_key: "825331418956744",
    api_secret: "XJKCIOnfRfD8sFXYuDjNrB-1zpE"
});

// Cloudinary Tag
const TAG = "TWQSL";

// -----------------------------------------
// NOTE WRAP
function wrap(text, max = 32) {
    if (!text) return "";
    const words = text.split(" ");
    const lines = [];
    let line = "";

    for (const w of words) {
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
// UPLOAD + GENERATION QSL
// -----------------------------------------
app.post("/upload", async (req, res) => {
    try {
        if (!req.body.indicatif)
            return res.json({ success: false, error: "Indicatif manquant" });

        if (!req.files || !req.files.qsl)
            return res.json({ success: false, error: "Aucune image QSL fournie" });

        // ----------- Chargement image utilisateur -------------
        const baseImg = sharp(req.files.qsl.tempFilePath).resize({
            width: 1400,
            height: 900,
            fit: "inside",
            background: "white"
        });

        const meta = await baseImg.metadata();
        const W = meta.width;
        const H = meta.height;

        const panelWidth = 350;
        const noteWrapped = wrap(req.body.note);

        // ----------- SVG panneaux -------------------
        const svg = `
<svg width="${panelWidth}" height="${H}">
    <rect width="100%" height="100%" fill="white"/>
    <text x="20" y="60" font-size="42" font-weight="700">${req.body.indicatif}</text>
    <text x="20" y="125" font-size="28">Date : ${req.body.date}</text>
    <text x="20" y="165" font-size="28">UTC  : ${req.body.time}</text>
    <text x="20" y="205" font-size="28">Bande : ${req.body.band}</text>
    <text x="20" y="245" font-size="28">Mode : ${req.body.mode}</text>
    <text x="20" y="285" font-size="28">Report : ${req.body.report}</text>

    <text x="20" y="360" font-size="24">${noteWrapped}</text>
</svg>`;
        const svgBuffer = Buffer.from(svg);

        const userBuffer = await baseImg.toBuffer();

        // ----------- Composition finale -------------------
        const finalBuffer = await sharp({
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

        // ----------- Upload Cloudinary -------------------
        cloudinary.uploader.upload_stream(
            { folder: "TW-eQSL", tags: [TAG] },
            (err, result) => {
                if (err) return res.json({ success: false, error: err.message });

                return res.json({
                    success: true,
                    qsl: {
                        indicatif: req.body.indicatif,
                        url: result.secure_url,
                        thumb: result.secure_url.replace("/upload/", "/upload/w_400/"),
                        date: req.body.date
                    }
                });
            }
        ).end(finalBuffer);

    } catch (e) {
        console.error(e);
        res.json({ success: false, error: e.message });
    }
});

// -----------------------------------------
// GET ALL QSL (cloud-only)
// -----------------------------------------
app.get("/qsl", async (req, res) => {
    const list = await cloudinary.search
        .expression(`tags=${TAG}`)
        .sort_by("uploaded_at", "desc")
        .max_results(100)
        .execute();

    const result = list.resources.map(r => ({
        indicatif: r.filename,
        url: r.secure_url,
        thumb: r.secure_url.replace("/upload/", "/upload/w_400/")
    }));

    res.json(result);
});

// -----------------------------------------
// DIRECT DOWNLOAD (no preview)
// -----------------------------------------
app.get("/download/:call", async (req, res) => {
    const call = req.params.call.toUpperCase();

    const search = await cloudinary.search
        .expression(`tags=${TAG} AND filename:${call}`)
        .max_results(50)
        .execute();

    if (!search.resources.length)
        return res.json([]);

    const file = search.resources[0];

    res.setHeader("Content-Disposition", `attachment; filename="${call}.jpg"`);
    res.redirect(file.secure_url);
});

// -----------------------------------------
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

// -----------------------------------------
app.listen(process.env.PORT || 10000, () =>
    console.log("TW-eQSL server running")
);
