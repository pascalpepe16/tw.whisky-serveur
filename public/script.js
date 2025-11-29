// public/script.js
const API_URL = location.origin; // utilise même domaine si Render sert frontend + API

function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  if (id === "gallery") loadGallery();
}

let sectionToOpen = null;
function showPassword(target) { sectionToOpen = target; document.getElementById("passwordBox").classList.remove("hidden"); }
function verifyPassword() { if (document.getElementById("pwd").value === "123456") { document.getElementById("passwordBox").classList.add("hidden"); showSection(sectionToOpen); } else alert("Mot de passe incorrect !"); }

// GALLERY: list from Cloudinary via /qsl
async function loadGallery() {
  const box = document.getElementById("galleryContent");
  box.innerHTML = "Chargement…";
  try {
    const res = await fetch(API_URL + "/qsl");
    const list = await res.json();
    if (!list.length) { box.innerHTML = "Aucune QSL pour l'instant"; return; }
    box.innerHTML = "";
    list.forEach(q => {
      const img = document.createElement("img");
      img.src = q.thumb;
      img.title = `${q.indicatif} — ${q.date}`;
      img.className = "galleryThumb";
      box.appendChild(img);
    });
  } catch (e) {
    box.innerHTML = "Erreur de chargement.";
  }
}
loadGallery();

// UPLOAD / GENERATE QSL
document.getElementById("genForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const preview = document.getElementById("genPreview");
  preview.innerHTML = "Génération…";
  try {
    const res = await fetch(API_URL + "/upload", { method: "POST", body: f });
    const data = await res.json();
    if (!data.success) { preview.innerHTML = "Erreur : " + data.error; return; }
    preview.innerHTML = `<img src="${data.qsl.url}" class="generatedQSL">`;
    loadGallery();
  } catch {
    preview.innerHTML = "Erreur réseau";
  }
};

// DOWNLOAD / SEARCH by indicatif
document.getElementById("btnSearch").onclick = async () => {
  const call = document.getElementById("dlCall").value.trim().toUpperCase();
  const box = document.getElementById("dlPreview");
  if (!call) return alert("Entrez un indicatif");
  box.innerHTML = "Recherche…";
  try {
    const res = await fetch(API_URL + "/download/" + call);
    const list = await res.json();
    if (!list.length) { box.innerHTML = "Aucune QSL trouvée."; return; }
    box.innerHTML = "";
    list.forEach(q => {
      const wrap = document.createElement("div");
      wrap.className = "dlItem";
      const img = document.createElement("img"); img.src = q.thumb; img.className = "dlThumb";
      wrap.appendChild(img);
      const viewBtn = document.createElement("button"); viewBtn.textContent = "Visualiser"; viewBtn.className = "primary";
      viewBtn.onclick = () => window.open(q.url, "_blank");
      const dlBtn = document.createElement("button"); dlBtn.textContent = "Télécharger"; dlBtn.className = "primary";
      dlBtn.onclick = () => {
        // download direct via server endpoint which streams the file with attachment
        const a = document.createElement("a");
        a.href = API_URL + "/file/" + q.public_id;
        a.download = q.indicatif + "_" + q.date + ".jpg";
        document.body.appendChild(a);
        a.click();
        a.remove();
      };
      wrap.appendChild(viewBtn);
      wrap.appendChild(dlBtn);
      box.appendChild(wrap);
    });
  } catch {
    box.innerHTML = "Erreur réseau";
  }
};
