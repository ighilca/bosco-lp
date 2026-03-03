# Intégration de la landing « Solutions » dans WordPress (boscoville.ca)

Guide pas à pas pour héberger la page à **boscoville.ca/solutions** sans casser le site, avec liberté de design et formulaire Gravity Forms.

---

## Vue d’ensemble

| Étape | Contenu |
|-------|--------|
| 1 | Prérequis et préparation |
| 2 | Structure des dossiers (child theme + landing) |
| 3 | Template de page « minimal » |
| 4 | Intégration du HTML, CSS et JS |
| 5 | Chemins des assets (images, logos) |
| 6 | Formulaire Gravity Forms |
| 7 | Page WordPress et attribution du template |
| 8 | Vérifications et mise en ligne |

---

## 1. Prérequis et préparation

### À avoir avant de commencer

- **Accès WordPress** au site boscoville.ca (admin).
- **Child theme** du thème actuel. Si tu n’en as pas :
  - Crée un dossier `boscoville-child` (ou nom du thème actuel + `-child`) dans `wp-content/themes/`.
  - À l’intérieur : `style.css` avec en-tête (Theme Name, Template: nom-du-parent, etc.) et éventuellement un `functions.php` minimal. Le child theme doit être activé.
- **Gravity Forms** installé et activé sur le site.
- **Accès aux fichiers** du thème (FTP, SFTP, ou déploiement Git sur WP Engine).

### À préparer côté projet actuel

- Le fichier **index.html** de la landing (contenu à reprendre dans le template).
- Le dossier **assets/** avec :
  - `assets/img/` (blues.jpg, pastel.jpg, grd.jpg)
  - `assets/logos/` (boscoville-horizontal.png, boscoville-vertical.png, blues.png, pastel.png, grd.png)
- Les **styles** : soit un fichier CSS dédié (ex. `solutions.css`) extrait du `<style>` de l’index, soit tu gardes le bloc dans le template (moins propre mais possible).
- Le **JavaScript** : extrait dans un fichier `solutions.js` (tout le script en bas de page : nav scroll, reveal, count-up, count-denom).

Tu ne codes rien dans le thème parent : tout se fait dans le **child theme**.

---

## 2. Structure des dossiers

Dans le **child theme**, organise ainsi (exemple avec un child theme nommé `boscoville-child`) :

```
wp-content/themes/boscoville-child/
├── style.css
├── functions.php
├── page-solutions.php          ← Template de page « Solutions »
├── assets/
│   ├── solutions/
│   │   ├── solutions.css       ← Styles de la landing
│   │   ├── solutions.js        ← Scripts (reveal, count-up, nav)
│   │   ├── img/
│   │   │   ├── blues.jpg
│   │   │   ├── pastel.jpg
│   │   │   └── grd.jpg
│   │   └── logos/
│   │       ├── boscoville-horizontal.png
│   │       ├── boscoville-vertical.png
│   │       ├── blues.png
│   │       ├── pastel.png
│   │       └── grd.png
```

- **page-solutions.php** : le template qui affiche toute la page (HTML de la landing).
- **assets/solutions/** : tout ce qui est propre à la page Solutions (CSS, JS, images, logos). Les chemins dans le template utiliseront l’URL du thème enfant.

---

## 3. Template de page « minimal »

### Créer le fichier `page-solutions.php`

- Dans le **child theme**, crée un fichier nommé exactement **page-solutions.php** (ou un nom de template personnalisé, voir plus bas).
- En tout début de fichier, mets le bloc d’en-tête de template WordPress :

```php
<?php
/**
 * Template Name: Solutions - Landing
 * Description: Page landing programmes en milieu scolaire (sans header/footer thème)
 */
```

Ainsi, dans l’éditeur de page tu pourras choisir **« Solutions - Landing »** dans « Modèle de page ».

### Structure minimale du template

Le template doit :

1. **Ne pas appeler** `get_header()` ni `get_footer()` du thème (pour ne pas afficher le header/footer du site sur cette page).
2. **Afficher** le doctype, `<html>`, `<head>`, puis `wp_head()`, puis fermer `</head>`, ouvrir `<body>` (et éventuellement `body_class()`).
3. **Inclure** tout le HTML de la landing (hero, sections, etc.) comme tu l’as dans l’index actuel.
4. **Charger** ton CSS et ton JS via `wp_enqueue_style` / `wp_enqueue_script` (idéalement dans une fonction branchée sur un hook, ou en vérifiant `is_page( 'solutions' )` ou le template).
5. **Appeler** `wp_footer()` avant `</body>` (nécessaire pour les scripts, Gravity Forms, etc.).
6. Fermer `</body>` et `</html>`.

Tu peux soit :

- Coller tout le contenu actuel de **index.html** dans ce template, en remplaçant :
  - le `<head>` : garder uniquement ce qui est utile (meta, titre), et remplacer les styles/scripts par des `wp_enqueue_*` (voir section 4),
  - les chemins des images/logos par des appels PHP (voir section 5),
  - le bloc du formulaire par le shortcode Gravity Forms (voir section 6),

soit

- Inclure un fichier PHP qui contient le HTML (ex. `solutions-markup.php`) pour garder le template lisible.

---

## 4. Intégration du HTML, CSS et JS

### CSS

- Copie tout le contenu du `<style>` de ton **index.html** dans **assets/solutions/solutions.css**.
- Dans le template (ou dans `functions.php` en ciblant la page Solutions), enqueue le fichier :

  - **Handle** : par ex. `solutions-styles`
  - **URL** : `get_stylesheet_directory_uri() . '/assets/solutions/solutions.css'`
  - **Dépendances** : aucune (ou `array()`)
  - **Version** : `filemtime( get_stylesheet_directory() . '/assets/solutions/solutions.css' )` pour éviter le cache en dev

Enqueue uniquement sur la page qui utilise ce template (par ex. avec `is_page( 'solutions' )` ou en vérifiant le template assigné à la page).

### JavaScript

- Copie tout le script de la landing (navbar scroll, IntersectionObserver reveal, count-up, count-denom) dans **assets/solutions/solutions.js**.
- Enqueue ce fichier :
  - **Handle** : `solutions-scripts`
  - **URL** : `get_stylesheet_directory_uri() . '/assets/solutions/solutions.js'`
  - **Dépendances** : `array( 'jquery' )` si tu utilises jQuery, sinon `array()`
  - **En footer** : `true`
  - **Version** : `filemtime( ... )` si tu veux

Comme pour le CSS, charge ce script seulement sur la page Solutions.

### HTML

- Le corps de la page (tout ce qui est actuellement entre `<body>` et `</body>` dans index.html) doit se retrouver dans le template entre l’ouverture du `<body>` et l’appel à `wp_footer()`.
- Supprime du HTML :
  - Les balises `<style>...</style>` (remplacées par le fichier CSS enqueue).
  - Le bloc `<script>...</script>` en bas (remplacé par solutions.js).
- Garde toute la structure : nav, hero, sections programmes, formulaire (qui sera remplacé par le shortcode GF), footer.

---

## 5. Chemins des assets (images et logos)

Dans le HTML intégré au template, chaque `src` ou `href` vers un asset doit utiliser l’URL du thème enfant.

### Principe

- **Racine des assets** :  
  `<?php echo esc_url( get_stylesheet_directory_uri() ); ?>/assets/solutions/`
- Donc par exemple :
  - Logo nav :  
    `<?php echo esc_url( get_stylesheet_directory_uri() ); ?>/assets/solutions/logos/boscoville-horizontal.png`
  - Image Blues :  
    `<?php echo esc_url( get_stylesheet_directory_uri() ); ?>/assets/solutions/img/blues.jpg`

### Liste des assets à remplacer

| Emplacement dans la page | Ancien chemin | Nouveau (dans le template) |
|--------------------------|---------------|-----------------------------|
| Favicon (dans `<head>`) | `logos/vertical-Bosco.png` ou `assets/logos/...` | `<?php echo esc_url( get_stylesheet_directory_uri() ); ?>/assets/solutions/logos/boscoville-vertical.png` |
| Nav – logo | `assets/logos/boscoville-horizontal.png` | idem avec `get_stylesheet_directory_uri() . '/assets/solutions/logos/boscoville-horizontal.png'` |
| Cartes programmes | `assets/logos/blues.png`, pastel.png, grd.png | idem avec `.../assets/solutions/logos/...` |
| Sections Blues / Pastel / GRD – logos | idem | idem |
| Images programmes | `assets/img/blues.jpg`, pastel.jpg, grd.jpg | `.../assets/solutions/img/blues.jpg` etc. |
| Footer – logo | `assets/logos/boscoville-vertical.png` | idem |

Tu peux définir une variable PHP en haut du template pour éviter de répéter :

```php
$assets = esc_url( get_stylesheet_directory_uri() ) . '/assets/solutions';
```

Puis dans le HTML : `src="<?php echo $assets; ?>/logos/blues.png"` etc.

---

## 6. Formulaire Gravity Forms

### Créer le formulaire dans WordPress

1. Dans l’admin : **Formulaires → Nouveau formulaire**.
2. Nomme-le (ex. « Contact Solutions »).
3. Ajoute les champs pour correspondre à la landing actuelle :
   - Prénom (texte, obligatoire)
   - Nom (texte, obligatoire)
   - Courriel (email, obligatoire)
   - Téléphone (téléphone ou texte)
   - École / Organisation (texte, obligatoire)
   - Programme d’intérêt (liste déroulante) : Blues, Pastel, GRD, Plusieurs / Tous
   - Message (paragraphe / textarea)
   - Bouton d’envoi (déjà présent par défaut)

4. Configure les notifications (email vers toi, confirmation visiteur) et la sauvegarde des entrées si besoin.

5. Note l’**ID du formulaire** (ex. 3). Tu en auras besoin pour le shortcode.

### Remplacer le formulaire HTML dans le template

- Dans le template, trouve toute la section du formulaire (la `<form>` actuelle avec les champs).
- Remplace **uniquement** le contenu du bloc formulaire (ou la div qui contient la form) par le shortcode Gravity Forms :

```php
<?php echo do_shortcode( '[gravityform id="3" title="false" description="false" ajax="true"]' ); ?>
```

Remplace `3` par l’ID réel de ton formulaire.  
Garde autour du shortcode la même structure HTML que tu as actuellement (titre « Implantez un programme Boscoville », bloc avec fond pêche, etc.) pour que le style reste cohérent.

### Styliser Gravity Forms comme la landing

- Gravity Forms ajoute des classes aux champs (ex. `gfield`, `ginput_container`, etc.). Dans **solutions.css**, ajoute des règles pour ces classes afin que :
  - Les champs aient la même taille, bordure, padding que ton design.
  - Le bouton ait la même apparence (couleur navy/corail, bordure arrondie, etc.).
- Tu peux cibler uniquement le formulaire de cette page avec un wrapper, par ex. `.form-section .gform_wrapper { ... }` pour ne pas affecter d’autres formulaires du site.

---

## 7. Page WordPress et attribution du template

### Créer la page

1. **Pages → Ajouter**.
2. **Titre** : par ex. « Solutions » (ou « Programmes en milieu scolaire » si tu préfères ; l’URL peut être personnalisée).
3. **Slug / permalien** : **solutions** pour obtenir boscoville.ca/solutions.
4. **Modèle de page** : choisis **« Solutions - Landing »** (le template que tu as créé).
5. Le contenu de la page (éditeur) peut rester vide : tout le contenu vient du template.
6. Publie.

### Vérifier l’URL

- Après publication, ouvre **boscoville.ca/solutions**.
- La page doit afficher ta landing (hero, programmes, formulaire GF, footer) sans le header/footer du reste du site.

---

## 8. Vérifications et mise en ligne

### Checklist avant mise en production

- [ ] Child theme actif, aucun fichier du thème parent modifié.
- [ ] Template **Solutions - Landing** assigné à la page dont le slug est **solutions**.
- [ ] Tous les chemins d’assets passent par `get_stylesheet_directory_uri()` (ou variable dérivée).
- [ ] CSS et JS chargés uniquement sur cette page (pas sur tout le site).
- [ ] Formulaire remplacé par le shortcode Gravity Forms ; ID du formulaire correct.
- [ ] Test d’envoi du formulaire : réception de l’email, pas d’erreur PHP/JS.
- [ ] Nav « Solutions » (ou équivalent) pointe vers `/solutions` si tu veux un lien dans le menu.
- [ ] Favicon : soit géré par ce template (lien vers boscoville-vertical.png dans le `<head>`), soit laissé au réglage global du site.

### WP Engine

- Déploie le child theme et les fichiers (Git ou interface WP Engine) comme d’habitude.
- Teste d’abord sur **staging**.
- Si tu as du cache (page ou objet), vide-le après mise à jour du template ou des assets. Pour une landing + GF, il est rare de devoir exclure `/solutions` du cache, mais si un souci apparaît, tu peux l’exclure dans les réglages de cache.

### En cas de problème

- **Page blanche** : vérifier les logs PHP (WP Engine fournit les logs), et que tu n’as pas d’erreur de syntaxe dans le template ou dans `functions.php`.
- **Images ou logos ne s’affichent pas** : vérifier que les fichiers sont bien dans `assets/solutions/img/` et `assets/solutions/logos/` et que les chemins dans le template utilisent bien `get_stylesheet_directory_uri()`.
- **Styles ou scripts ne se chargent pas** : vérifier les handles et que les enqueue sont bien exécutés sur la page Solutions (slug ou template).
- **Formulaire ne s’affiche pas** : vérifier que Gravity Forms est actif et que l’ID dans le shortcode correspond au bon formulaire.

---

## Résumé des fichiers à créer/modifier

| Fichier | Action |
|--------|--------|
| `wp-content/themes/boscoville-child/page-solutions.php` | Créer (template avec tout le HTML de la landing, chemins PHP, shortcode GF) |
| `wp-content/themes/boscoville-child/assets/solutions/solutions.css` | Créer (copier les styles de l’index) |
| `wp-content/themes/boscoville-child/assets/solutions/solutions.js` | Créer (copier les scripts de l’index) |
| `wp-content/themes/boscoville-child/assets/solutions/img/*` | Copier blues.jpg, pastel.jpg, grd.jpg |
| `wp-content/themes/boscoville-child/assets/solutions/logos/*` | Copier les 5 PNG |
| `functions.php` du child theme | Modifier pour enqueue solutions.css et solutions.js sur la page Solutions |
| WordPress : Formulaires | Créer le formulaire GF et noter son ID |
| WordPress : Pages | Créer la page « Solutions » (slug: solutions), modèle: Solutions - Landing |

Une fois tout cela en place, la landing actuelle sera servie sous **boscoville.ca/solutions**, sans casser le site et sans être prisonnier du thème, avec le formulaire géré par Gravity Forms.
