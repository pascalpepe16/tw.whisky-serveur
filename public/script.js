const API_URL = "https://tw-whisky-serveur.onrender.com";

// --------------- NAVIGATION ---------------
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

// --------------- GALERIE ---------------
async function loadGallery() {
    const box = document.getElementById("galleryContent");
    box.innerHTML = "Chargement…";

    try {
        const res = await fetch(API_URL + "/qsl");
        const list = await res.json();

        if (!list.length) return box.innerHTML = "Aucune QSL.";

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

// --------------- CREATION QSL ---------------
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

// --------------- TELECHARGEMENT DIRECT ---------------
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

        window.location.href = API_URL + "/direct-download/" + qsl.id;

        box.innerHTML = "<p>Téléchargement lancé !</p>";

    } catch (e) {
        box.innerHTML = "Erreur réseau";
    }
};
