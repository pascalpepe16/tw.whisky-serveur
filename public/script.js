const API_URL = location.origin; // si frontend et API servis sur même domaine

function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  if (id === "gallery") loadGallery();
}

let sectionToOpen = null;
function openGallery() { showPassword('gallery'); }
function openCreate()  { showPassword('create'); }

function showPassword(target) {
  sectionToOpen = target;
  const box = document.getElementById("passwordBox");
  box.classList.remove("hidden");
  box.setAttribute("aria-hidden", "false");
}
function verifyPassword() {
  if (document.getElementById("pwd").value === "123456") {
    const box = document.getElementById("passwordBox");
    box.classList.add("hidden");
    box.setAttribute("aria-hidden", "true");
    showSection(sectionToOpen);
  } else alert("Mot de passe incorrect");
}

// Galerie
async function loadGallery(){
  const box = document.getElementById("galleryContent");
  box.innerHTML = "Chargement…";
  try {
    const res = await fetch(API_URL + "/qsl");
    const list = await res.json();
    if (!list || !list.length) { box.innerHTML = "Aucune QSL"; return; }
    box.innerHTML = "";
    list.forEach(q => {
      const div = document.createElement("div");
      div.className = "thumbWrap";
      const img = document.createElement("img");
      img.src = q.thumb || q.url;
      img.title = `${q.indicatif || ''} ${q.date || ''}`;
      div.appendChild(img);
      box.appendChild(div);
    });
  } catch (e) {
    box.innerHTML = "Erreur de chargement";
  }
}
loadGallery();

// Génération + upload
document.getElementById("genForm").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const preview = document.getElementById("genPreview");
  preview.innerHTML = "Génération…";
  try {
    const res = await fetch(API_URL + "/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!data.success) { preview.innerHTML = "Erreur: " + (data.error || "inconnu"); return; }
    preview.innerHTML = `<img src="${data.qsl.url}" style="max-width:100%;">`;
    e.target.reset();
    loadGallery();
  } catch(err) {
    preview.innerHTML = "Erreur réseau";
  }
};

// Rechercher & télécharger
document.getElementById("btnSearch").onclick = async () => {
  const call = (document.getElementById("dlCall").value || "").trim().toUpperCase();
  if (!call) return alert("Entrez un indicatif");
  const box = document.getElementById("dlPreview");
  box.innerHTML = "Recherche…";
  try {
    const res = await fetch(API_URL + "/download/" + call);
    const list = await res.json();
    if (!list || !list.length) { box.innerHTML = "Aucune QSL trouvée"; return; }
    box.innerHTML = "";
    list.forEach(q => {
      const wrap = document.createElement("div");
      wrap.className = "dlWrap";

      const img = document.createElement("img");
      img.src = q.thumb || q.url;
      img.className = "dlThumb";
      wrap.appendChild(img);

      const view = document.createElement("button");
      view.textContent = "Visualiser";
      view.className = "primary";
      view.onclick = () => window.open(q.url, "_blank");

      const dl = document.createElement("button");
      dl.textContent = "Télécharger";
      dl.className = "primary";
      dl.onclick = () => {
        // download direct via server endpoint that returns bytes with attachment
        const a = document.createElement("a");
        a.href = API_URL + "/file?pid=" + encodeURIComponent(q.public_id);
        a.download = `${(q.indicatif||'qsl')}_${(q.date||'')}.jpg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      };

      wrap.appendChild(view);
      wrap.appendChild(dl);
      box.appendChild(wrap);
    });
  } catch(e) {
    box.innerHTML = "Erreur réseau";
  }
};
