// FRONTEND JS with popup preview + download
const API_URL = ""; // empty = same origin (Render)

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
function verifyPassword() {
  if (document.getElementById("pwd").value === "123456") {
    document.getElementById("passwordBox").classList.add("hidden");
    showSection(sectionToOpen);
  } else alert("Mot de passe incorrect !");
}

// Gallery
async function loadGallery() {
  const box = document.getElementById("galleryContent");
  box.innerHTML = "Chargement…";
  try {
    const res = await fetch(API_URL + "/qsl");
    const list = await res.json();
    if (!list.length) { box.innerHTML = "Aucune QSL pour l'instant"; return; }
    box.innerHTML = "";
    list.forEach(q => {
      const wrap = document.createElement("div");
      wrap.className = "thumb-wrap";
      const img = document.createElement("img");
      img.src = q.thumb || q.url;
      img.title = q.indicatif;
      img.onclick = () => openPreview(q.url);
      const caption = document.createElement("div");
      caption.className = "cap";
      caption.textContent = q.indicatif;
      wrap.appendChild(img);
      wrap.appendChild(caption);
      box.appendChild(wrap);
    });
  } catch (e) {
    box.innerHTML = "Erreur de chargement.";
  }
}

// popup preview
function openPreview(url) {
  const modal = document.getElementById("modalPreview");
  document.getElementById("modalImg").src = url;
  document.getElementById("modalDownload").href = url;
  document.getElementById("modalDownload").setAttribute("download", "QSL.jpg");
  modal.classList.remove("hidden");
}
function closePreview() {
  document.getElementById("modalPreview").classList.add("hidden");
  document.getElementById("modalImg").src = "";
}

// Create / upload
document.getElementById("genForm").onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const preview = document.getElementById("genPreview");
  preview.innerHTML = "Génération…";
  try {
    const res = await fetch(API_URL + "/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!data.success) { preview.innerHTML = "Erreur: " + data.error; return; }
    preview.innerHTML = `<div class="ok">QSL générée</div>`;
    loadGallery();
    // open popup preview
    openPreview(data.qsl.url);
  } catch (err) {
    preview.innerHTML = "Erreur réseau";
  }
};

// Download search
document.getElementById("btnSearch").onclick = async () => {
  const call = document.getElementById("dlCall").value.trim().toUpperCase();
  const box = document.getElementById("dlPreview");
  if (!call) return alert("Entrez un indicatif");
  box.innerHTML = "Recherche…";
  try {
    const res = await fetch(API_URL + "/download/" + call);
    const list = await res.json();
    if (!list.length) return box.innerHTML = "Aucune QSL trouvée";
    box.innerHTML = "";
    list.forEach(q => {
      const d = document.createElement("div");
      d.className = "dl-item";
      const img = document.createElement("img"); img.src = q.thumb || q.url;
      const btn = document.createElement("button");
      btn.textContent = "Aperçu & Télécharger";
      btn.className = "primary";
      btn.onclick = () => openPreview(q.url);
      d.append(img, btn);
      box.appendChild(d);
    });
  } catch {
    box.innerHTML = "Erreur réseau";
  }
};

// close modal binding
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "modalClose") closePreview();
});
