// public/script.js
const API_URL = location.origin; // backend+frontend same domaine

// ----- Sections & password
function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  if (id === "gallery") loadGallery();
}
let sectionToOpen = null;
function showPassword(target) {
  sectionToOpen = target;
  document.getElementById("passwordBox").classList.remove("hidden");
}
function cancelPassword() {
  document.getElementById("passwordBox").classList.add("hidden");
  sectionToOpen = null;
}
function verifyPassword() {
  const v = document.getElementById("pwd").value;
  if (v === "123456") {
    document.getElementById("pwd").value = "";
    document.getElementById("passwordBox").classList.add("hidden");
    if (sectionToOpen) showSection(sectionToOpen);
    sectionToOpen = null;
  } else {
    alert("Mot de passe incorrect !");
  }
}

// ----- Gallery
async function loadGallery() {
  const box = document.getElementById("galleryContent");
  box.innerHTML = "Chargement…";
  try {
    const res = await fetch(API_URL + "/qsl");
    const list = await res.json();
    if (!list || !list.length) { box.innerHTML = "Aucune QSL pour l'instant"; return; }
    box.innerHTML = "";
    list.forEach(q => {
      const img = document.createElement("img");
      img.src = q.thumb || q.url;
      img.title = `${q.indicatif} — ${q.date || ""}`;
      img.className = "galleryThumb";
      img.onclick = () => openModal(q);
      box.appendChild(img);
    });
  } catch (err) {
    box.innerHTML = "Erreur de chargement.";
    console.error("loadGallery", err);
  }
}
loadGallery();

// ----- Modal simple (use browser alert-ish) - create a basic modal via alert for now
function openModal(q) {
  // quick modal: open full image in new tab for now
  window.open(q.url, "_blank");
}

// ----- Upload / Generate QSL
document.getElementById("genForm").onsubmit = async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const preview = document.getElementById("genPreview");
  preview.innerHTML = "Génération…";
  try {
    const res = await fetch(API_URL + "/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!data || !data.success) {
      preview.innerHTML = "Erreur : " + (data?.error || "Serveur");
      return;
    }
    preview.innerHTML = `<img src="${data.qsl.url}" class="generatedQSL" alt="QSL générée">`;
    // refresh gallery
    loadGallery();
  } catch (err) {
    preview.innerHTML = "Erreur réseau";
    console.error("upload", err);
  }
};

// ----- Download / Search by callsign
document.getElementById("btnSearch").onclick = async () => {
  const call = document.getElementById("dlCall").value.trim().toUpperCase();
  const box = document.getElementById("dlPreview");
  if (!call) return alert("Entrez un indicatif");
  box.innerHTML = "Recherche…";
  try {
    const res = await fetch(API_URL + "/download/" + call);
    const list = await res.json();
    if (!list || !list.length) { box.innerHTML = "Aucune QSL trouvée."; return; }
    box.innerHTML = "";
    list.forEach(q => {
      const wrap = document.createElement("div");
      wrap.className = "dlItem";

      const img = document.createElement("img");
      img.src = q.thumb || q.url;
      img.className = "dlThumb";
      wrap.appendChild(img);

      const txt = document.createElement("div");
      txt.style.flex = "1";
      txt.innerHTML = `<strong>${q.indicatif}</strong><br><small>${q.date || ""}</small>`;

      const viewBtn = document.createElement("button");
      viewBtn.textContent = "Visualiser";
      viewBtn.className = "primary";
      viewBtn.onclick = () => window.open(q.url, "_blank");

      const dlBtn = document.createElement("button");
      dlBtn.textContent = "Télécharger";
      dlBtn.className = "primary";
      dlBtn.onclick = () => {
        // download direct via server endpoint which streams the file as attachment
        const a = document.createElement("a");
        a.href = API_URL + "/file/" + encodeURIComponent(q.public_id || q.public_id === 0 ? q.public_id : q.public_id);
        a.download = `${q.indicatif || "qsl"}_${q.date || ""}.jpg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      };

      wrap.appendChild(txt);
      wrap.appendChild(viewBtn);
      wrap.appendChild(dlBtn);
      box.appendChild(wrap);
    });
  } catch (err) {
    box.innerHTML = "Erreur réseau";
    console.error("download", err);
  }
};
