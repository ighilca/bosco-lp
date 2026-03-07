# Formulaire contact → Mailchimp + Odoo

Quand quelqu’un envoie le formulaire de la landing page, les données sont envoyées à **Mailchimp** (inscription à la liste) et à **Odoo** (création d’un lead CRM).

## Démarrage

1. **Copier la config**  
   Copiez `.env.example` en `.env` et remplissez les valeurs (voir ci‑dessous).

2. **Installer les dépendances**  
   ```powershell
   npm install
   ```

3. **Lancer le serveur**  
   ```powershell
   npm start
   ```
   Le serveur écoute sur `http://localhost:3000` (ou le `PORT` défini dans `.env`).  
   La page `index.html` est servie à la racine ; le formulaire envoie en AJAX vers `POST /api/contact`.

## Configuration

- **Mailchimp** : clé API, préfixe serveur (ex. `us21`), ID de la liste. Si une variable est absente, Mailchimp est ignoré.
- **Odoo** : URL de l’instance, base, utilisateur, mot de passe. Si une variable est absente, Odoo est ignoré.

Détails et noms des variables dans `.env.example`.

## Déploiement Vercel (GitHub)

Déployez depuis GitHub : Vercel expose **POST /api/contact** via `api/contact.js`. Ajoutez les variables (ODOO_*, MAILCHIMP_*) dans Vercel → Settings → Environment Variables.

## Hébergement

Sur un hébergeur (Node.js), définissez les variables d’environnement (`.env` ou panneau d’hébergement), puis lancez `npm start` (ou `node server.js`).

Si la landing est servie ailleurs (ex. WordPress), pointez le formulaire vers l’URL de cette API en ajoutant sur la balise `<form>` :  
`data-api-url="https://votre-domaine.com/api/contact"`.
