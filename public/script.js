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
// GALERIE CLOUDINARY
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
            img.className = "galleryItem";

            // Preview popup
            img.onclick = () => {
                const w = window.open("", "_blank");
                w.document.write(`<img src="${q.url}" style="width:100%;">`);
            };

            box.appendChild(img);
        });
    }
    catch (e) {
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

        preview.innerHTML = `<img src="${data.qsl.url}" style="max-width:450px;">`;

        loadGallery();
    }
    catch (err) {
        preview.innerHTML = "Erreur réseau";
    }
};

// -----------------------------
// DOWNLOAD WITH VISUALIZE + DIRECT FILE
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
            wrap.className = "dlBox";

            const img = document.createElement("img");
            img.src = q.thumb;
            img.className = "thumb";

            // PREVIEW BUTTON
            const btnView = document.createElement("button");
            btnView.textContent = "Visualiser";
            btnView.className = "primary";
            btnView.onclick = () => {
                const w = window.open("", "_blank");
                w.document.write(`<img src="${q.url}" style="width:100%;">`);
            };

            // DOWNLOAD DIRECT BUTTON
            const btnDl = document.createElement("button");
            btnDl.textContent = "Télécharger";
            btnDl.className = "primary";
            btnDl.onclick = () => {
                const a = document.createElement("a");
                a.href = API_URL + "/file/" + q.id;   // direct server file
                a.download = `${q.indicatif}_${q.date}.jpg`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            };

            wrap.appendChild(img);
            wrap.appendChild(btnView);
            wrap.appendChild(btnDl);

            box.appendChild(wrap);
        });

    } catch (e) {
        box.innerHTML = "Erreur réseau";
    }
};
