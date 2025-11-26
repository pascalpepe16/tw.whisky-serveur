// -----------------------------------------
//  TW eQSL – Serveur Render Compatible
//  Sharp + Cloudinary + Génération QSL Auto
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
const app = express();
app.use(cors());
app.use(express.json());

app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/"
}));

// Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Static folder
app.use(express.static(path.join(__dirname, "public")));

// Local template if no user template
const TEMPLATE_PATH = path.join(__dirname, "template/eqsl_template.jpg");

// -----------------------------------------
// Cloudinary config
cloudinary.config({
    cloud_name: "dqpvrfjeu",
    api_key: "825331418956744",
    api_secret: "XJKCIOnfRfD8sFXYuDjNrB-1zpE"
});

// -----------------------------------------
// SAVE QSL LIST ON DISK (survival after restart)
const DATA_FILE = path.join(__dirname, "qsl_data.json");

let qslList = [];
if (fs.existsSync(DATA_FILE)) {
    qslList = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

// save function
function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(qslList, null, 2));
}

// -----------------------------------------
// Word wrap
function wrap(text, max = 32) {
    if (!text) return "";
    let out = [];
    let line = "";
    text.split(" ").forEach(w => {
        if ((line + w).length > max) {
            out.push(line);
            line = "";
        }
        line += w + " ";
    });
    if (line.trim()) out.push(line);
    return out.join("\n");
}

// -----------------------------------------
// UPLOAD + GENERATION
