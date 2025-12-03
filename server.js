// -------------------------------------------
//  TW eQSL — SERVER STABLE 2025
// -------------------------------------------

import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import sharp from "sharp";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import { fileURLToPath } from "url";

// System paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp" }));
app.use(express.static(path.join(__dirname, "public")));

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// -------------------------
//  HELPERS
// -------------------------
function buildContext(obj = {}) {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${encodeURIComponent(v || "")}`)
    .join("|");
}

function parseContext(ctx) {
  if (!ctx) return {};
  if (ctx.custom?.entry) ctx = ctx.custom.entry;

  if (typeof ctx === "string") {
    return ctx.split("|").reduce((acc, part) => {
      const [k, ...rest] = part.split("=");
      acc[k] = decodeURIComponent(rest.join("=") || "");
      return acc;
    }, {});
  }

  return {};
}

function wrapText(text = "", max = 32) {
  const words = text.trim().split(/\s+/);
  const lines = [];
  let line = "";

  for (const w of words) {
    if ((line + " " + w).trim().length > max) {
      lines.push(line.trim());
      line = w;
    } else line += " " + w;
  }
  if (line.trim()) lines.push(line.trim());

  return lines.join("\n");
}

function escapeXml(s = "") {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// -------------------------
//  HEALTH
// -------------------------
app.get("/health", (req, res) => res.json({ ok: true }));

// -------------------------
//  DEBUG — LIST CLOUDINARY
// -------------------------
app.get("/debug/qsl", async (req, res) => {
  try {
    const result = await cloudinary.search
      .expression("folder:TW-eQSL")
      .max_results(200)
      .execute();
    res.json(result.resources);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------
//  LIST ALL QSL
// -------------------------
app.get("/qsl", async (req, res) => {
  try {
    const result = await cloudinary.search
      .expression("folder:TW-eQSL")
      .sort_by("created_at", "desc")
      .max_results(500)
      .
