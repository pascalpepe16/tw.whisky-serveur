const API_URL = "";

// -----------------------------
// SECTIONS
// -----------------------------
function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");

  if (id === "gallery") loadGallery();
}

let sectionToOpen = null;

// -----------------------------
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

// -----------------------------
// GALERIE
// -----------------------------
async function loadGallery() {
  const box = document.getElementById("galleryContent");
  box.innerHTML = "Chargement…";

  try {
    const res = await fetch("/qsl");
    const list = await res.json();

    if (!list.length) return box.innerHTML = "Aucune QSL pour l'instant";

    box.innerHTML = "";
    list.forEach(q => {
      const img = document.createElement("img");
      img.src = q.thumb;
      img.title = q.indicatif;
      box.appendChild(img);
    });
  } catch (e) {
    box.innerHTML = "Erreur de chargement.";
  }
}
loadGallery();

// -----------------------------
// CREATION
// -----------------------------
document.getElementById("genForm").onsubmit = async (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);
  const preview = document.getElementById("genPreview");
  preview.innerHTML = "Génération…";

  try {
    const res = await fetch("/upload", {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (!data.success) {
      preview.innerHTML = "Erreur : " + data.error;
      return;
    }

    preview.innerHTML = `<img src="${data.qsl.url}">`;

    loadGallery();

  } catch (err) {
    preview.innerHTML = "Erreur réseau";
  }
};

// -----------------------------
// DOWNLOAD DIRECT
// -----------------------------
document.getElementById("btnSearch").onclick = async () => {
  const call = document.getElementById("dlCall").value.trim().toUpperCase();
  const box = document.getElementById("dlPreview");

  if (!call) return alert("Entrez un indicatif");

  box.innerHTML = "Recherche…";

  try {
    const res = await fetch("/download/" + call);
    const list = await res.json();

    if (!list.length) {
      box.innerHTML = "Aucune QSL trouvée.";
      return;
    }

    box.innerHTML = "";

    list.forEach(q => {
      const wrap = document.createElement("div");
      wrap.className = "dl-item";

      const img = document.createElement("img");
      img.src = q.thumb;

      const btn = document.createElement("button");
      btn.textContent = "Télécharger";
      btn.className = "primary";

      // téléchargement direct
      btn.onclick = () => {
        const a = document.createElement("a");
       a.href = `${API_URL}/direct?url=${encodeURIComponent(q.url)}&name=${q.indicatif}_${q.date}.jpg`;
a.target = "_blank";

        document.body.appendChild(a);
        a.click();
        a.remove();
      };

      wrap.appendChild(img);
      wrap.appendChild(btn);
      box.appendChild(wrap);
    });

  } catch (e) {
    box.innerHTML = "Erreur réseau";
  }
};
