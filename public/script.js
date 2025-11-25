// -----------------------------------
// CONFIG API
// -----------------------------------
const API_URL = "https://tw-eqsl-server.onrender.com";

// -----------------------------------
// GESTION DES SECTIONS
// -----------------------------------
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

// -----------------------------------
// GALERIE
// -----------------------------------
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
            img.src = q.thumb || q.url;
            img.title = q.indicatif;
            box.appendChild(img);
        });
    } catch (e) {
        box.innerHTML = "Erreur de chargement.";
    }
}

// Charge galerie au démarrage
loadGallery();

// -----------------------------------
// CREATION / UPLOAD QSL
// -----------------------------------
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

    } catch (err) {
        preview.innerHTML = "Erreur réseau";
    }
};

// -----------------------------------
// TELECHARGEMENT DIRECT
// -----------------------------------
document.getElementById("btnSearch").onclick = async () => {
    const call = document.getElementById("dlCall").value.trim().toUpperCase();
    const box = document.getElementById("dlPreview");

    if (!call) return alert("Entrez un indicatif");

    box.innerHTML = "Recherche…";

    try {
        const res = await fetch(API_URL + "/qsl");
        const list = await res.json();

        const filtered = list.filter(q => q.indicatif.toUpperCase() === call);

        if (!filtered.length) {
            box.innerHTML = "Aucune QSL trouvée.";
            return;
        }

        const qsl = filtered[filtered.length - 1];

        // Téléchargement direct comme un fichier
        const a = document.createElement("a");
        a.href = qsl.url;
        a.download = `${qsl.indicatif}_${qsl.date}.jpg`;
        document.body.appendChild(a);
        a.click();
        a.remove();

        // Feedback visuel
        box.innerHTML = `<p>Téléchargement lancé !</p>`;

    } catch (e) {
        box.innerHTML = "Erreur réseau";
    }
};
