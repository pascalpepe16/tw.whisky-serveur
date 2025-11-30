// public/script.js
// Frontend TW eQSL — compatible avec server.js (Option B Cloudinary-only)

const API_URL = location.origin; // si frontend + api sur même domaine (Render) c'est parfait

// -----------------------------
// Sections / mot de passe simple
// -----------------------------
function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.classList.add("hidden"));
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
  if (id === "gallery") loadGallery();
}

let sectionToOpen = null;
function showPassword(target) {
  sectionToOpen = target;
  document.getElementById("passwordBox").classList.remove("hidden");
}
function cancelPassword() {
  document.getElementById("passwordBox").classList.add("hidden");
  document.getElementById("pwd").value = "";
  sectionToOpen = null;
}
function verifyPassword() {
  const v = document.getElementById("pwd").value;
  if (v === "123456") {
    document.getElementById("passwordBox").classList.add("hidden");
    document.getElementById("pwd").value = "";
    if (sectionToOpen) showSection(sectionToOpen);
    sectionToOpen = null;
  } else {
    alert("Mot de passe incorrect !");
  }
}

// -----------------------------
// Affiche la galerie (GET /qsl)
// -----------------------------
async function loadGallery() {
  const box = document.getElementById("galleryContent");
  box.innerHTML = "Chargement…";

  try {
    const res = await fetch(API_URL + "/qsl");
    if (!res.ok) throw new Error("Erreur API");
    const list = await res.json();

    if (!list || !list.length) {
      box.innerHTML = "Aucune QSL disponible.";
      return;
    }

    box.innerHTML = "";
    list.forEach(q => {
      // n'affiche que les qsl crées via le site si indicatif présent
      if (!q.indicatif || q.indicatif.trim() === "") return;

      const card = document.createElement("div");
      card.className = "galleryCard";

      const img = document.createElement("img");
      img.src = q.thumb || q.url;
      img.alt = q.indicatif;
      img.className = "galleryThumb";
      img.onclick = () => window.open(q.url, "_blank");

      const meta = document.createElement("div");
      meta.className = "galleryMeta";
      meta.innerHTML = `<strong>${q.indicatif}</strong><br><small>${q.date || ""} ${q.time || ""}</small>`;

      card.appendChild(img);
      card.appendChild(meta);

      box.appendChild(card);
    });

  } catch (err) {
    console.error("loadGallery error", err);
    box.innerHTML = "Erreur de chargement.";
  }
}

// lance au démarrage (affiche pas la galerie si elle est protégée par mdp)
loadGallery();


// -----------------------------
// Envoi / Génération QSL (POST /upload)
// -----------------------------
const genForm = document.getElementById("genForm");
if (genForm) {
  genForm.onsubmit = async (e) => {
    e.preventDefault();
    const preview = document.getElementById("genPreview");
    preview.innerHTML = "Génération et envoi…";

    const form = new FormData(genForm);

    try {
      const res = await fetch(API_URL + "/upload", {
        method: "POST",
        body: form
      });

      const data = await res.json();
      if (!data || !data.success) {
        preview.innerHTML = "Erreur : " + (data?.error || "serveur");
        return;
      }

      // Affiche l'image générée + infos
      preview.innerHTML = `
        <div class="previewBox">
          <img src="${data.qsl.url}" class="generatedQSL" alt="QSL générée">
          <div class="previewMeta"><strong>${data.qsl.indicatif}</strong><br><small>${data.qsl.date||""}</small></div>
        </div>
      `;

      // recharge la galerie
      loadGallery();

      // reset form (optionnel)
      genForm.reset();

    } catch (err) {
      console.error("upload error", err);
      preview.innerHTML = "Erreur réseau lors de l'envoi.";
    }
  };
}


// -----------------------------
// Recherche / Téléchargement
// -----------------------------
document.getElementById("btnSearch")?.addEventListener("click", async () => {
  const call = (document.getElementById("dlCall").value || "").trim().toUpperCase();
  const box = document.getElementById("dlPreview");
  if (!call) { alert("Entrez un indicatif"); return; }
  box.innerHTML = "Recherche…";

  try {
    // on récupère toute la liste et on filtre client-side (serveur renvoie seulement QSL du dossier créées via le site)
    const res = await fetch(API_URL + "/qsl");
    if (!res.ok) throw new Error("Erreur API");
    const list = await res.json();

    const matches = (list || []).filter(q => (q.indicatif || "").toUpperCase() === call);

    if (!matches.length) { box.innerHTML = "Aucune QSL trouvée."; return; }

    box.innerHTML = "";
    matches.forEach(q => {
      const wrap = document.createElement("div");
      wrap.className = "dlItem";

      const img = document.createElement("img");
      img.src = q.thumb || q.url;
      img.className = "dlThumb";
      img.alt = q.indicatif;

      const info = document.createElement("div");
      info.style.flex = "1";
      info.innerHTML = `<strong>${q.indicatif}</strong><br><small>${q.date || ""} ${q.time || ""}</small><br><small>${(q.note||"")}</small>`;

      // Visualiser
      const viewBtn = document.createElement("button");
      viewBtn.className = "primary";
      viewBtn.textContent = "Visualiser";
      viewBtn.onclick = () => window.open(q.url, "_blank");

      // Télécharger (tentative via server endpoint /file/:public_id — plus fiable)
      const dlBtn = document.createElement("button");
      dlBtn.className = "primary";
      dlBtn.textContent = "Télécharger";
      dlBtn.onclick = async () => {
        try {
          // préférence : télécharger via serveur (si présent) pour forcer mode 'attachment'
          const serverFileUrl = API_URL + "/file/" + encodeURIComponent(q.public_id || q.public_id || "");
          // make a HEAD or fetch to see if endpoint exists (fast)
          const head = await fetch(serverFileUrl, { method: "HEAD" });
          if (head.ok) {
            // server stream will send attachment; create an anchor to trigger browser download
            const a = document.createElement("a");
            a.href = serverFileUrl;
            a.download = `${q.indicatif || "qsl"}_${q.date || ""}.jpg`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            return;
          }
        } catch (err) {
          // ignore — fallback to direct cloudinary download below
        }

        // fallback direct (may open in new tab depending CORS/browser)
        try {
          const a2 = document.createElement("a");
          a2.href = q.url;
          a2.download = `${q.indicatif || "qsl"}_${q.date || ""}.jpg`;
          document.body.appendChild(a2);
          a2.click();
          a2.remove();
        } catch (err) {
          alert("Échec du téléchargement automatique. Le fichier s'ouvrira dans un nouvel onglet.");
          window.open(q.url, "_blank");
        }
      };

      wrap.appendChild(img);
      wrap.appendChild(info);
      wrap.appendChild(viewBtn);
      wrap.appendChild(dlBtn);

      box.appendChild(wrap);
    });

  } catch (err) {
    console.error("search/download error", err);
    box.innerHTML = "Erreur réseau";
  }
});
