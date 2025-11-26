// public/script.js
const API_URL = "https://tw-whisky-serveur.onrender.com";

// sections
function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  if (id === "gallery") loadGallery();
}
let sectionToOpen = null;
function showPassword(target) { sectionToOpen = target; document.getElementById("passwordBox").classList.remove("hidden"); }
function verifyPassword() { if (document.getElementById("pwd").value === "123456") { document.getElementById("passwordBox").classList.add("hidden"); showSection(sectionToOpen); } else alert("Mot de passe incorrect"); }

// gallery
async function loadGallery() {
  const box = document.getElementById("galleryContent");
  box.innerHTML = "Chargement…";
  try {
    const res = await fetch(API_URL + "/qsl");
    const list = await res.json();
    if (!list.length) { box.innerHTML = "Aucune QSL pour l'instant"; return; }
    box.innerHTML = "";
    list.forEach(q => {
      const container = document.createElement("div");
      container.className = "gallery-item";
      const img = document.createElement("img");
      img.src = q.thumb;
      img.title = q.indicatif;
      container.appendChild(img);

      const view = document.createElement("button");
      view.textContent = "Visualiser";
      view.onclick = () => window.open(q.url, "_blank");
      const dl = document.createElement("button");
      dl.textContent = "Télécharger";
      dl.onclick = () => window.location.href = API_URL + "/direct-download/" + q.id;

      container.appendChild(view);
      container.appendChild(dl);
      box.appendChild(container);
    });
  } catch (e) { box.innerHTML = "Erreur de chargement."; console.error(e); }
}
loadGallery();

// upload
document.getElementById("genForm").onsubmit = async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const preview = document.getElementById("genPreview");
  preview.innerHTML = "Génération…";
  try {
    const res = await fetch(API_URL + "/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!data.success) { preview.innerHTML = "Erreur : " + data.error; return; }
    preview.innerHTML = `<img src="${data.qsl.url}">`;
    loadGallery();
  } catch (err) {
    preview.innerHTML = "Erreur réseau";
  }
};

// search / download by indicatif (multiple)
// -----------------------------
// -----------------------------
// DOWNLOAD DIRECT + VISUALISER
// -----------------------------
document.getElementById("btnSearch").onclick = async () => {
    const call = document.getElementById("dlCall").value.trim().toUpperCase();
    const box = document.getElementById("dlPreview");

    if (!call) return alert("Entrez un indicatif");

    box.innerHTML = "Recherche…";

    try {
        const res = await fetch(API_URL + "/download/" + call);
        const list = await res.json();

        if (!list.length) {
            box.innerHTML = "Aucune QSL trouvée.";
            return;
        }

        box.innerHTML = "";

        list.forEach(q => {
            const wrap = document.createElement("div");

            const img = document.createElement("img");
            img.src = q.thumb;

            wrap.appendChild(img);

            // --- BOUTON VISUALISER ---
            const viewBtn = document.createElement("button");
            viewBtn.textContent = "Visualiser";
            viewBtn.className = "primary";
            viewBtn.onclick = () => window.open(q.url, "_blank");
            wrap.appendChild(viewBtn);

            // --- BOUTON TÉLÉCHARGER (100% FONCTIONNEL) ---
            const dlBtn = document.createElement("button");
            dlBtn.textContent = "Télécharger";
            dlBtn.className = "primary";

            dlBtn.onclick = () => {
                window.location.href = API_URL + "/file/" + q.id;
            };

            wrap.appendChild(dlBtn);
            box.appendChild(wrap);
        });

    } catch (e) {
        box.innerHTML = "Erreur réseau";
    }
};
