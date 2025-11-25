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
            box.appendChild(img);
        });
    } catch (e) {
        box.innerHTML = "Erreur de chargement.";
    }
}

// -----------------------------
// UPLOAD + GENERATION
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
// DOWNLOAD : VISUALISER + TELECHARGER
// -----------------------------
document.getElementById("btnSearch").onclick = async () => {
    const call = document.getElementById("dlCall").value.trim().toUpperCase();
    const box = document.getElementById("dlPreview");

    if (!call) return alert("Entrez un indicatif");

    box.innerHTML = "Recherche…";

    try {
        const res = await fetch(API_URL + "/qsl");
        const all = await res.json();

        // liste filtrée par indicatif
        const list = all.filter(q => q.indicatif.toUpperCase() === call);

        if (!list.length) {
            box.innerHTML = "Aucune QSL trouvée.";
            return;
        }

        box.innerHTML = `<h3>${list.length} QSL trouvée(s) pour ${call}</h3>`;

        list.forEach(q => {
            const div = document.createElement("div");
            div.style.margin = "10px";
            div.style.padding = "10px";
            div.style.background = "rgba(0,0,0,0.5)";
            div.style.borderRadius = "8px";
            div.style.display = "inline-block";
            div.style.textAlign = "center";

            // miniature
            const img = document.createElement("img");
            img.src = q.thumb;
            img.style.width = "200px";
            img.style.borderRadius = "6px";

            // bouton Visualiser
            const viewBtn = document.createElement("button");
            viewBtn.textContent = "Visualiser";
            viewBtn.className = "primary";
            viewBtn.style.marginTop = "10px";
            viewBtn.onclick = () => {
                window.open(q.url, "_blank");
            };

            // bouton Télécharger
            const dlBtn = document.createElement("button");
            dlBtn.textContent = "Télécharger";
            dlBtn.className = "primary";
            dlBtn.style.marginLeft = "10px";

            dlBtn.onclick = () => {
                const a = document.createElement("a");
                a.href = API_URL + "/download/" + q.indicatif;
                a.setAttribute("download", `${q.indicatif}_${q.date}.jpg`);
                document.body.appendChild(a);
                a.click();
                a.remove();
            };

            div.appendChild(img);
            div.appendChild(document.createElement("br"));
            div.appendChild(viewBtn);
            div.appendChild(dlBtn);
            box.appendChild(div);
        });

    } catch (e) {
        box.innerHTML = "Erreur réseau";
    }
};
