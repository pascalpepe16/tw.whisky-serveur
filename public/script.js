// -----------------------------
// CONFIG
// -----------------------------
const API_URL = location.origin; // même domaine (Render frontend + backend)

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
    } else {
        alert("Mot de passe incorrect !");
    }
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
            img.className = "galleryThumb";
            img.title = `${q.indicatif} — ${q.date}`;
            box.appendChild(img);
        });

    } catch (e) {
        box.innerHTML = "Erreur de chargement.";
    }
}

// Charger la galerie au démarrage
loadGallery();

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

        preview.innerHTML = `<img src="${data.qsl.url}" class="generatedQSL">`;

        loadGallery(); // recharge la galerie automatiquement

    } catch {
        preview.innerHTML = "Erreur réseau";
    }
};

// -----------------------------
// TELECHARGEMENT PAR INDICATIF
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
            const container = document.createElement("div");
            container.className = "dlItem";

            const img = document.createElement("img");
            img.src = q.thumb;
            img.className = "dlThumb";

            // Bouton visualiser
            const viewBtn = document.createElement("button");
            viewBtn.className = "primary";
            viewBtn.textContent = "Visualiser";
            viewBtn.onclick = () => window.open(q.url, "_blank");

            // Bouton télécharger version directe (stream)
            const dlBtn = document.createElement("button");
            dlBtn.className = "primary";
            dlBtn.textContent = "Télécharger";

            dlBtn.onclick = () => {
                const a = document.createElement("a");
                a.href = API_URL + "/file/" + q.public_id; // appel serveur direct
                a.download = `${q.indicatif}_${q.date}.jpg`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            };

            container.appendChild(img);
            container.appendChild(viewBtn);
            container.appendChild(dlBtn);

            box.appendChild(container);
        });

    } catch (e) {
        box.innerHTML = "Erreur réseau";
    }
};
