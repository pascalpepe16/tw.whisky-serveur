
TW-eQSL - mini serveur + front
1) mettre les variables Cloudinary en env (Render / .env local)
2) npm install
3) npm start

Endpoints:
- GET /qsl -> liste tout (Cloudinary)
- POST /upload -> envoie form-data (qsl file + indicatif,date,time,band,mode,report,note)
- GET /download/:CALL -> recherche par indicatif
- GET /file?pid=PUBLIC_ID -> renvoie l'image en attachment (download direct)

# tw.whisky-serveur
