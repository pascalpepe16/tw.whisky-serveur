const API_URL = location.origin;

// switch section
function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  if (id === "gallery") loadGallery();
}
let sectionToOpen = null;

// password
function showPassword(target) { sectionToOpen = target; document.getElementById("passwordBox").classList.remove("hidden"); }
function verifyPassword() { if (document.getElementById("pwd").value === "123456") { document.getElementById("passwordBox").classList.add("hidden"); showSection(sectionToOpen); } else alert("Mot de passe incorrect !"); }

// --------------------------------------------
//  GALERIE
// --------------------------------------------
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
      img.className = "galleryThumb";
      img.title = q.indicatif + " " + q.date;
      box.appendChild(img);
    });
  } catch {
    box.innerHTML = "Erreur de chargement.";
  }
}
loadGallery();

// --------------------------------------------
//  UPLOAD (FIXED: form sends ALL fields)
// --------------------------------------------
document.getElementById("genForm").onsubmit = async (e) => {
  e.preventDefault();

  const form = new FormData();

  form.append("qsl", document.getElementById("qslFile").files[0]);

  form.append("indicatif", document.getElementById("indicatif").value.trim().toUpperCase());
  form.append("date", document.getElementById("date").value.trim());
  form.append("time", document.getElementById("time").value.trim());
  form.append("band", document.getElementById("band").value.trim());
  form.append("mode", document.getElementById("mode").value.trim());
  form.append("report", document.getElementById("report").value.trim());
  form.append("note", document.getElementById("note").value.trim());

  const preview = document.getElementById("genPreview");
  preview.innerHTML = "Génération…";

  try {
    const res = await fetch(API_URL + "/upload", { method: "POST", body: form });
    const data = await res.json();

    if (!data.success) {
      preview.innerHTML = "Erreur : " + data.error;
      return;
    }

    preview.innerHTML = `<img src="${data.qsl.url}" class="generatedQSL">`;
    loadGallery();

  } catch {
    preview.innerHTML = "Erreur réseau";
  }
};

// --------------------------------------------
//  SEARCH / DOWNLOAD
// --------------------------------------------
document.getElementById("btnSearch").onclick = async () => {
  const call = document.getElementById("dlCall").value.trim().toUpperCase();
  const box = document.getElementById("dlPreview");

  if (!call) return alert("Entrez un indicatif");

  box.innerHTML = "Recherche…";

  try {
    const res = await fetch(API_URL + "/download/" + call);
    const list = await res.json();

    if (!list.length){
      box.innerHTML = "Aucune QSL trouvée.";
      return;
    }

    box.innerHTML = "";

    list.forEach(q => {
      const wrap = document.createElement("div");
      wrap.className = "dlItem";

      const img = document.createElement("img");
      img.src = q.thumb;
      img.className = "dlThumb";
      wrap.appendChild(img);

      const viewBtn = document.createElement("button");
      viewBtn.textContent = "Visualiser";
      viewBtn.onclick = () => window.open(q.url, "_blank");
      wrap.appendChild(viewBtn);

      const dlBtn = document.createElement("button");
      dlBtn.textContent = "Télécharger";
      dlBtn.onclick = () => {
        const a = document.createElement("a");
        a.href = API_URL + "/file/" + encodeURIComponent(q.public_id);
        a.download = q.indicatif + "_" + q.date + ".jpg";
        document.body.appendChild(a);
        a.click();
        a.remove();
      };
      wrap.appendChild(dlBtn);

      box.appendChild(wrap);
    });

  } catch {
    box.innerHTML = "Erreur réseau";
  }
};
