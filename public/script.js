const API_URL = location.origin; // same domain

function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  if (id === "gallery") loadGallery();
}
let sectionToOpen = null;
function showPassword(target) { sectionToOpen = target; document.getElementById("passwordBox").classList.remove("hidden"); }
function verifyPassword() { if (document.getElementById("pwd").value === "123456") { document.getElementById("passwordBox").classList.add("hidden"); showSection(sectionToOpen); } else alert("Mot de passe incorrect !"); }

async function loadGallery(){
  const box = document.getElementById("galleryContent");
  box.innerHTML = "Chargement…";
  try {
    const res = await fetch(API_URL + "/qsl");
    const list = await res.json();
    if (!list.length){ box.innerHTML = "Aucune QSL pour l'instant"; return; }
    box.innerHTML = "";
    list.forEach(q => {
      const img = document.createElement("img");
      img.src = q.thumb;
      img.title = `${q.indicatif} ${q.date}`;
      img.className = "galleryThumb";
      box.appendChild(img);
    });
  } catch (e) {
    box.innerHTML = "Erreur de chargement.";
  }
}
loadGallery();

document.getElementById("genForm").onsubmit = async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const preview = document.getElementById("genPreview");
  preview.innerHTML = "Génération…";
  try {
    const res = await fetch(API_URL + "/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!data.success) { preview.innerHTML = "Erreur : " + data.error; return; }
    preview.innerHTML = `<img src="${data.qsl.url}" style="max-width:100%;">`;
    e.target.reset();
    loadGallery();
  } catch (err) {
    preview.innerHTML = "Erreur réseau";
  }
};

document.getElementById("btnSearch").onclick = async () => {
  const call = (document.getElementById("dlCall").value||"").trim().toUpperCase();
  if (!call) return alert("Entrez un indicatif");
  const box = document.getElementById("dlPreview");
  box.innerHTML = "Recherche…";
  try {
    const res = await fetch(API_URL + "/download/" + call);
    const list = await res.json();
    if (!list.length){ box.innerHTML = "Aucune QSL trouvée."; return; }
    box.innerHTML = "";
    list.forEach(q => {
      const wrap = document.createElement("div");
      const img = document.createElement("img"); img.src = q.thumb; img.className = "dlThumb";
      const view = document.createElement("button"); view.className="primary"; view.textContent="Visualiser"; view.onclick = () => window.open(q.url, "_blank");
      const dl = document.createElement("button"); dl.className="primary"; dl.textContent="Télécharger";
      dl.onclick = () => {
        // direct download via server endpoint
        const a = document.createElement("a");
        a.href = API_URL + "/file/" + encodeURIComponent(q.public_id);
        a.download = `${q.indicatif}_${q.date}.jpg`;
        document.body.appendChild(a); a.click(); a.remove();
      };
      wrap.appendChild(img); wrap.appendChild(view); wrap.appendChild(dl);
      box.appendChild(wrap);
    });
  } catch {
    box.innerHTML = "Erreur réseau";
  }
};
