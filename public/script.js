const API_URL = "https://tw-whisky-serveur.onrender.com";

// -----------------------------
// SECTIONS
// -----------------------------
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

// -----------------------------
// GALERIE
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

            const previewBtn = document.createElement("button");
            previewBtn.textContent = "Visualiser";
            previewBtn.onclick = () => openPreview(q.url);

            const downloadBtn = document.createElement("button");
            downloadBtn.textContent = "Télécharger";
            downloadBtn.onclick = () => downloadQSL(q.url);

            const div = document.createElement("div");
            div.appendChild(img);
            div.appendChild(previewBtn);
            div.appendChild(downloadBtn);
            box.appendChild(div);
        });
    } catch (e) {
        box.innerHTML = "Erreur de chargement.";
    }
}

// -----------------------------
// OUVERTURE PRÉVISUALISATION
// -----------------------------
function openPreview(url) {
    const imgPreview = document.createElement("img");
    imgPreview.src = url;
    imgPreview.style.maxWidth = "100%";
    imgPreview.style.maxHeight = "500px";

    const previewBox = document.createElement("div");
    previewBox.style.position = "fixed";
    previewBox.style.top = "0";
    previewBox.style.left = "0";
    previewBox.style.width = "100%";
    previewBox.style.height = "100%";
    previewBox.style.backgroundColor = "rgba(0,0,0,0.8)";
    previewBox.style.display = "flex";
    previewBox.style.justifyContent = "center";
    previewBox.style.alignItems = "center";
    previewBox.style.zIndex = "1000";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Fermer";
    closeBtn.style.position = "absolute";
    closeBtn.style.top = "10px";
    closeBtn.style.right = "10px";
    closeBtn.onclick = () => document.body.removeChild(previewBox);

    previewBox.appendChild(imgPreview);
    previewBox.appendChild(closeBtn);
    document.body.appendChild(previewBox);
}

// -----------------------------
// TÉLÉCHARGEMENT DIRECT
// -----------------------------
function downloadQSL(url) {
    const a = document.createElement("a");
    a.href = url;
    a.download = url.split("/").pop(); // Utilise le nom du fichier pour le téléchargement
    a.click();
}

// -----------------------------
// UPLOAD + GENERATION QSL
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
// DOWNLOAD PAR INDICATIF
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

            const a = document.createElement("a");
            a.href = q.url;
            a.download = `${q.indicatif}_${q.date}.jpg`;
            a.textContent = "Télécharger";
            a.className = "primary";

            wrap.appendChild(img);
            wrap.appendChild(a);

            box.appendChild(wrap);
        });
    } catch (e) {
        box.innerHTML = "Erreur réseau";
    }
};
