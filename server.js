//--------------------------------------------------
//  TW eQSL – Version 100% STABLE (fix final Sharp)
//--------------------------------------------------

import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp/" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

cloudinary.config({
    cloud_name: "dqpvrfjeu",
    api_key: "825331418956744",
    api_secret: "XJKCIOnfRfD8sFXYuDjNrB-1zpE"
});

//----------------------------------------
//  MEMORY DB
//----------------------------------------
let qslList = [];

function wrap(text, max = 32) {
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

//----------------------------------------
//  UPLOAD ROUTE
//----------------------------------------
app.post("/upload", async (req, res) => {
    try {
        if (!req.body.indicatif)
            return res.json({ success: false, error: "Indicatif manquant" });

        if (!req.files || !req.files.qsl)
            return res.json({ success: false, error: "Aucune image QSL fournie" });

        const img = req.files.qsl;

        //----------------------------------------
        // 1) FORCE HEIGHT = 900 → mais Sharp peut finir à 899/901 : pas grave
        //----------------------------------------
        const buffer900 = await sharp(img.tempFilePath)
            .resize({ height: 900, fit: "contain", background: "white" })
            .toBuffer();

        // RÉCUPÈRE EXACTEMENT LA HAUTEUR FINALE (fix essentiel)
        const realMeta = await sharp(buffer900).metadata();
        const W = realMeta.width;
        const H = realMeta.height; // souvent 900 mais peut être 899/901

        //----------------------------------------
        // 2) CALCUL PANEL WIDTH (fixe et sûr)
        //----------------------------------------
        const panelWidth = Math.round(W * 0.33);
        const noteTxt = wrap(req.body.note || "", 32);

        //----------------------------------------
        // 3) SVG EXACT SAME HEIGHT → FIX FINAL
        //----------------------------------------
        const svg = `
<svg width="${panelWidth}" height="${H}">
  <rect width="100%" height="100%" fill="white"/>

  <text x="25" y="70" font-size="46" font-weight="700">${req.body.indicatif}</text>

  <text x="25" y="140" font-size="28">Date : ${req.body.date}</text>
  <text x="25" y="180" font-size="28">UTC : ${req.body.time}</text>
  <text x="25" y="220" font-size="28">Bande : ${req.body.band}</text>
  <text x="25" y="260" font-size="28">Mode : ${req.body.mode}</text>
  <text x="25" y="300" font-size="28">Report : ${req.body.report}</text>

  <text x="25" y="380" font-size="26">${noteTxt}</text>
</svg>
`;

        const svgBuffer = Buffer.from(svg);

        //----------------------------------------
        // 4) COMPOSITION — dimensions 100% identiques → impossible d'avoir erreur
        //----------------------------------------
        const final = await sharp({
            create: {
                width: W + panelWidth,
                height: H,
                channels: 3,
                background: "white"
            }
        })
            .composite([
                { input: buffer900, left: 0, top: 0 },
                { input: svgBuffer, left: W, top: 0 }
            ])
            .jpeg({ quality: 92 })
            .toBuffer();

        //----------------------------------------
        // 5) Upload Cloudinary
        //----------------------------------------
        const upload = cloudinary.uploader.upload_stream(
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

        upload.end(final);

    } catch (err) {
        console.error("UPLOAD ERROR:", err);
        res.json({ success: false, error: err.message });
    }
});

//----------------------------------------
app.get("/qsl", (req, res) => res.json(qslList));

//----------------------------------------
app.get("/download/:call", (req, res) => {
    const call = req.params.call.toUpperCase();
    res.json(qslList.filter(q => q.indicatif.toUpperCase() === call));
});

//----------------------------------------
app.get("*", (req, res) =>
    res.sendFile(path.join(__dirname, "public/index.html"))
);

//----------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("TW-eQSL server running on port " + PORT));
