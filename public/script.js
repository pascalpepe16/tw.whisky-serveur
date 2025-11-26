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
            img.title = q.indicatif + " - " + q.date;
            img.className = "galleryThumb";
            box.appendChild(img);
        });

    } catch (err) {
        box.innerHTML = "Erreur de chargement.";
    }
}

// -----------------------------
// UPLOAD – Génération QSL
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

        preview.innerHTML = `<img src="${data.qsl.url}" class="generatedQSL">`;

        loadGallery();

    } catch (err) {
        preview.innerHTML = "Erreur réseau";
    }
};

// -----------------------------
// DOWNLOAD – Recherche QSL
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
            box.innerHTML = "Aucune QSL trouvée pour : " + call;
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

            // ------- VISUALISER ---------
            const viewBtn = document.createElement("button");
            viewBtn.textContent = "Visualiser";
            viewBtn.className = "primary";
            viewBtn.onclick = () => window.open(q.url, "_blank");

            // ------- TELECHARGER DIRECT --------
            const dlBtn = document.createElement("button");
            dlBtn.textContent = "Télécharger";
            dlBtn.className = "primary";
            dlBtn.onclick = () => {
                // passe toujours par /file/:id pour telechargement direct + compteur
                window.location.href = API_URL + "/file/" + q.id;
            };

            wrap.appendChild(viewBtn);
            wrap.appendChild(dlBtn);

            box.appendChild(wrap);
        });

    } catch (err) {
        box.innerHTML = "Erreur réseau";
    }
};
