const API_URL = "https://tw-whisky-serveur.onrender.com";

// -----------------------------
// SECTIONS
// -----------------------------
function showSection(id) {
  document.querySelectorAll(".section")
    .forEach(s => s.classList.add("hidden"));

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

// -----------------------------
// GALERIE (Cloudinary direct)
// -----------------------------
async function loadGallery() {
  const box = document.getElementById("galleryContent");
  box.innerHTML = "Chargement…";

  try {
    const res = await fetch(API_URL + "/qsl");
    const list = await res.json();

    if (!list.length) {
      box.innerHTML = "Aucune QSL pour l'instant";
      return;
    }

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

// -----------------------------
// UPLOAD + GÉNÉRATION QSL
// -----------------------------
document.getElementById("genForm").onsubmit = async (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);
  const preview = document.getElementById("genPreview");

  preview.innerHTML = "Génération…";

  try {
    const res = await fetch(API_URL + "/upload", {
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
  }
  catch (err) {
    preview.innerHTML = "Erreur réseau";
  }
};

// -----------------------------
// DOWNLOAD DIRECT (cloudinary redirect)
// -----------------------------
document.getElementById("btnSearch").onclick = async () => {
  const call = document.getElementById("dlCall").value.trim().toUpperCase();
  const box = document.getElementById("dlPreview");

  if (!call) return alert("Entrez un indicatif");

  box.innerHTML = "Recherche…";

  try {
    const res = await fetch(API_URL + "/qsl");
    const list = await res.json();

    const matched = list.filter(q =>
      q.indicatif.toUpperCase() === call
    );

    if (!matched.length) {
      box.innerHTML = "Aucune QSL trouvée.";
      return;
    }

    const qsl = matched[0];

    box.innerHTML = `
      <p>QSL trouvée :</p>
      <img src="${qsl.thumb}">
      <br><br>
      <button class="primary" id="forceDL">Télécharger</button>
    `;

    document.getElementById("forceDL").onclick = () => {
      window.location.href = API_URL + "/download/" + call;
    };

  } catch (e) {
    box.innerHTML = "Erreur réseau";
  }
};
