const API_URL = location.origin;

function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  if (id === "gallery") loadGallery();
}

let sectionToOpen = null;
function openGallery() {
  sectionToOpen = "gallery";
  document.getElementById("passwordBox").classList.remove("hidden");
}
function openCreate() {
  sectionToOpen = "create";
  document.getElementById("passwordBox").classList.remove("hidden");
}

function verifyPassword() {
  if (document.getElementById("pwd").value === "123456") {
    document.getElementById("passwordBox").classList.add("hidden");
    showSection(sectionToOpen);
  } else {
    alert("Mot de passe incorrect");
  }
}

async function loadGallery() {
  const box = document.getElementById("galleryContent");
  box.innerHTML = "Chargement…";

  try {
    const res = await fetch(API_URL + "/qsl");
    const list = await res.json();

    if (!list.length) {
      box.innerHTML = "Aucune QSL";
      return;
    }

    box.innerHTML = "";
    list.forEach(q => {
      const div = document.createElement("div");
      div.className = "thumbWrap";
      const img = document.createElement("img");
      img.src = q.thumb;
      img.title = `${q.indicatif} ${q.date}`;
      div.appendChild(img);
      box.appendChild(div);
    });
  } catch {
    box.innerHTML = "Erreur de chargement";
  }
}

// GENERATION QSL
document.getElementById("genForm").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const preview = document.getElementById("genPreview");
  preview.innerHTML = "Génération…";

  try {
    const res = await fetch(API_URL + "/upload", {
      method: "POST",
      body: fd
    });

    const data = await res.json();

    if (!data.success) {
      preview.innerHTML = "Erreur: " + data.error;
      return;
    }

    preview.innerHTML = `<img src="${data.qsl.url}">`;
    e.target.reset();
    loadGallery();
  } catch {
    preview.innerHTML = "Erreur réseau";
  }
};

// TELECHARGEMENT
document.getElementById("btnSearch").onclick = async () => {
  const call = document.getElementById("dlCall").value.trim().toUpperCase();
  if (!call) return alert("Entrez un indicatif");

  const box = document.getElementById("dlPreview");
  box.innerHTML = "Recherche…";

  try {
    const res = await fetch(API_URL + "/download/" + call);
    const list = await res.json();

    if (!list.length) {
      box.innerHTML = "Aucune QSL trouvée";
      return;
    }

    box.innerHTML = "";

    list.forEach(q => {
      const wrap = document.createElement("div");
      wrap.className = "dlWrap";

      const img = document.createElement("img");
      img.src = q.thumb;
      img.className = "dlThumb";
      wrap.appendChild(img);

      const view = document.createElement("button");
      view.textContent = "Visualiser";
      view.onclick = () => window.open(q.url, "_blank");

      const dl = document.createElement("button");
      dl.textContent = "Télécharger";
      dl.onclick = () => {
        const a = document.createElement("a");
        a.href = API_URL + "/file?pid=" + encodeURIComponent(q.public_id);
        a.download = `${q.indicatif}_${q.date}.jpg`;
        a.click();
      };

      wrap.appendChild(view);
      wrap.appendChild(dl);
      box.appendChild(wrap);
    });

  } catch {
    box.innerHTML = "Erreur réseau";
  }
};
