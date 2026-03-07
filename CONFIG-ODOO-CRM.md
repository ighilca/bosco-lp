# Contexte : configuration Odoo CRM (formulaire contact → Pipeline)

Ce document décrit la **configuration validée** pour que les demandes envoyées depuis le formulaire de la landing page apparaissent dans le **Pipeline** Odoo 17 (vue Kanban CRM).

---

## 1. Comportement attendu

- Le formulaire envoie les données à **Odoo** (et optionnellement Mailchimp).
- Odoo crée un enregistrement **crm.lead** de type **opportunité**.
- L’opportunité doit apparaître dans la **vue Pipeline** (action 405), colonne **« Nouvelle demande arrivée »** (étape 23).

---

## 2. Configuration `.env` recommandée (Odoo)

| Variable        | Valeur recommandée | Rôle |
|-----------------|--------------------|------|
| `ODOO_URL`      | URL de l’instance (ex. `https://xxx.dev.odoo.com/`) | Connexion API XML-RPC |
| `ODOO_DB`       | Nom de la base     | Base Odoo ciblée |
| `ODOO_USER`     | Email de l’utilisateur | Compte Odoo (ou clé API si 2FA) |
| `ODOO_PASSWORD` ou `ODOO_API_KEY` | Mot de passe ou clé API | Authentification |
| **`ODOO_STAGE_ID`** | **23** | Étape « Nouvelle demande arrivée » dans le pipeline |
| **`ODOO_TEAM_ID`**  | **vide** (ne pas mettre d’ID) | Pas d’équipe assignée ; évite l’erreur si l’ID d’équipe n’existe pas |

Exemple dans le `.env` :

```env
ODOO_URL=https://votre-instance.dev.odoo.com/
ODOO_DB=votre_base
ODOO_USER=email@exemple.com
ODOO_API_KEY=votre_cle_api
ODOO_STAGE_ID=23
ODOO_TEAM_ID=
```

### Remplir École/Organisation et Programme sur la fiche (pas seulement dans les notes)

Pour que **École/Organisation** et **Programme** apparaissent dans les champs visibles de la fiche lead (et pas seulement dans la description) :

1. Récupérer les **noms techniques** des champs dans Odoo :
   ```powershell
   (Invoke-WebRequest -Uri "http://localhost:3000/api/odoo/lead-fields" -UseBasicParsing).Content
   ```
2. Dans la réponse JSON, repérer les champs dont le `string` correspond à « École », « Organisation », « Programme » (ou libellés équivalents). La **clé** (nom du champ) est le nom technique à utiliser.
3. Dans le `.env`, définir (exemple si les noms sont `x_studio_organisation` et `x_studio_programme`) :
   ```env
   ODOO_FIELD_ORGANISATION=x_studio_organisation
   ODOO_FIELD_PROGRAMME=x_studio_programme
   ```
4. Redémarrer le serveur. Les prochains leads auront ces champs remplis automatiquement.

Si ces variables sont vides, les valeurs restent uniquement dans la **description** (notes).

---

## 3. Pourquoi cette configuration

### Type : opportunité (et non lead)

- La vue **Pipeline** (action 405) filtre avec le domaine : **`type = 'opportunity'`**.
- Si on crée un **lead** (`type: 'lead'`), il n’apparaît pas dans cette vue.
- Le serveur crée donc des **opportunités** (`type: 'opportunity'`) pour que les demandes s’affichent dans le pipeline.

### Étape : `ODOO_STAGE_ID=23`

- L’ID **23** correspond à l’étape **« Nouvelle demande arrivée »** (ou équivalent) dans votre instance.
- Les nouvelles opportunités sont créées directement dans cette colonne du Kanban.

### Équipe : `ODOO_TEAM_ID` vide

- L’action 405 **n’impose pas** d’équipe dans son contexte (`default_team_id` absent).
- Mettre un `ODOO_TEAM_ID` dont l’équipe n’existe plus (ex. 19) provoque :  
  **« Record does not exist or has been deleted (crm.team(19)) »**.
- En laissant **`ODOO_TEAM_ID` vide**, on ne renseigne pas d’équipe : la création réussit et l’opportunité reste visible dans le pipeline.

Si vous voulez assigner une équipe plus tard, utilisez un **ID d’équipe valide** (voir section 5).

---

## 4. URL du Pipeline (référence)

Vue d’ensemble utilisée :

```
https://votre-instance.dev.odoo.com/web#action=405&model=crm.lead&view_type=kanban&cids=1&menu_id=285
```

- **action=405** : action qui définit la vue (domaine `type='opportunity'`, pas de filtre par équipe).
- **model=crm.lead** : modèle des leads/opportunités.
- **view_type=kanban** : affichage Pipeline.

---

## 5. Retrouver les bons IDs (API du serveur)

Le serveur expose des routes pour interroger Odoo (serveur lancé sur `http://localhost:3000`) :

| Route | Rôle |
|-------|------|
| `GET /api/odoo/stages` | Liste des étapes CRM (`id`, `name`) → choisir l’ID pour `ODOO_STAGE_ID` |
| `GET /api/odoo/teams`  | Liste des équipes (`id`, `name`) → choisir un ID valide pour `ODOO_TEAM_ID` si besoin |
| `GET /api/odoo/action/:id` | Détail d’une action (ex. 405) : `name`, `context`, `domain` → vérifier quel pipeline s’affiche |
| `GET /api/odoo/lead-fields` | Liste des champs du modèle `crm.lead` (noms techniques pour `ODOO_FIELD_ORGANISATION` / `ODOO_FIELD_PROGRAMME`) |

Exemples PowerShell :

```powershell
# Étapes (pour ODOO_STAGE_ID)
(Invoke-WebRequest -Uri "http://localhost:3000/api/odoo/stages" -UseBasicParsing).Content

# Équipes (pour ODOO_TEAM_ID si vous en assignez une)
(Invoke-WebRequest -Uri "http://localhost:3000/api/odoo/teams" -UseBasicParsing).Content

# Action 405 (contexte et domaine du pipeline)
(Invoke-WebRequest -Uri "http://localhost:3000/api/odoo/action/405" -UseBasicParsing).Content
```

---

## 6. Dépannage rapide

| Problème | Cause probable | Action |
|----------|----------------|--------|
| Les demandes n’apparaissent pas dans le Pipeline | Création en **lead** au lieu d’**opportunité** | Vérifier que le serveur utilise `type: 'opportunity'` (déjà en place). |
| Erreur « Record does not exist (crm.team(XX)) » | `ODOO_TEAM_ID` pointe vers une équipe supprimée ou inexistante | Mettre `ODOO_TEAM_ID=` (vide) ou un ID retourné par `/api/odoo/teams`. |
| Vue différente (autre pipeline) | Pas la même base / même instance | Vérifier que l’URL Odoo et la base dans `.env` correspondent à la fenêtre où vous regardez le pipeline. |
| Routes `/api/odoo/*` en 404 | Ancien processus ou mauvais dossier | Arrêter tout processus sur le port 3000, relancer `node server.js` depuis la racine du projet. |

---

## 7. Après modification du `.env`

Toute modification des variables (dont `ODOO_STAGE_ID` et `ODOO_TEAM_ID`) nécessite un **redémarrage du serveur** pour être prise en compte :

```powershell
# Dans le terminal où tourne le serveur : Ctrl+C puis
node server.js
```

---

## 8. Résumé (copier-coller mental)

- **Odoo** : créer des **opportunités** (`type: 'opportunity'`), étape **23**, **sans équipe** (`ODOO_TEAM_ID` vide).
- **Pipeline** : vue définie par l’**action 405** (domaine `type='opportunity'`), pas de filtre par équipe.
- **IDs** : stages et équipes récupérables via `GET /api/odoo/stages` et `GET /api/odoo/teams` ; détail de l’action via `GET /api/odoo/action/405`.
