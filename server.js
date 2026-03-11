/**
 * Backend contact form : envoi vers Mailchimp + Odoo CRM
 * Variables d'environnement requises : voir .env.example
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xmlrpc = require('xmlrpc');

const app = express();

// Sécurité : en-têtes HTTP
app.use(helmet({
  contentSecurityPolicy: false // CSP désactivé : scripts inline présents dans index.html (à activer si refacto)
}));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Limite de taille du body (éviter les payloads énormes)
app.use(express.json({ limit: '15kb' }));

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim());
app.use(cors({
  origin: function(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Origine non autorisée: ' + origin));
  },
  methods: ['GET', 'POST', 'OPTIONS']
}));

// Rate limiting : max 10 envois de formulaire par IP par 15 minutes
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, message: 'Trop de demandes. Réessayez dans quelques minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Routes API avant static pour éviter que /api/* soit intercepté
app.get('/api/ping', (req, res) => res.json({ ok: true }));
app.get('/api/odoo/stages', (req, res) => {
  odooSearchRead('crm.stage', ['id', 'name'])
    .then(data => res.json(data))
    .catch(err => res.status(500).json({ error: err.message }));
});
app.get('/api/odoo/teams', (req, res) => {
  odooSearchRead('crm.team', ['id', 'name'])
    .then(data => res.json(data))
    .catch(err => res.status(500).json({ error: err.message }));
});

/** Lire une action (ex: action=405 dans l'URL) pour voir le contexte/équipe du pipeline. */
app.get('/api/odoo/action/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide' });
  odooRead('ir.actions.act_window', [id], ['name', 'context', 'domain', 'res_model'])
    .then(data => res.json(data && data[0] ? data[0] : data))
    .catch(err => res.status(500).json({ error: err.message }));
});

/** Champs du modèle crm.lead (noms techniques pour ODOO_FIELD_ORGANISATION / ODOO_FIELD_PROGRAMME). */
app.get('/api/odoo/lead-fields', (req, res) => {
  odooFieldsGet('crm.lead')
    .then(data => res.json(data))
    .catch(err => res.status(500).json({ error: err.message }));
});

app.use(express.static('.'));

const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY;
// Le datacenter est souvent dans la clé (ex: xxx-us21) ; sinon mettre MAILCHIMP_SERVER=us21 dans .env
const MAILCHIMP_SERVER = process.env.MAILCHIMP_SERVER || (MAILCHIMP_API_KEY && MAILCHIMP_API_KEY.includes('-') ? MAILCHIMP_API_KEY.split('-').pop() : '');
const MAILCHIMP_LIST_ID = process.env.MAILCHIMP_LIST_ID;
const ODOO_URL = process.env.ODOO_URL;       // ex: https://votre-odoo.com
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USER = process.env.ODOO_USER;
// Avec 2FA activée, utilisez une clé API Odoo (Compte → Préférences → Comptes → Clés API)
const ODOO_PASSWORD = process.env.ODOO_PASSWORD;
const ODOO_API_KEY = process.env.ODOO_API_KEY;
const odooSecret = ODOO_API_KEY || ODOO_PASSWORD;
// Optionnel : pour placer les leads dans l’étape "1-Nouvelle demande arrivée" (ID visible dans l’URL de l’étape)
const ODOO_STAGE_ID = process.env.ODOO_STAGE_ID ? parseInt(process.env.ODOO_STAGE_ID, 10) : null;
const ODOO_TEAM_ID = process.env.ODOO_TEAM_ID ? parseInt(process.env.ODOO_TEAM_ID, 10) : null;
// Noms techniques des champs crm.lead pour école et programme (voir GET /api/odoo/lead-fields)
const ODOO_FIELD_ORGANISATION = (process.env.ODOO_FIELD_ORGANISATION || '').trim() || null;
const ODOO_FIELD_PROGRAMME = (process.env.ODOO_FIELD_PROGRAMME || '').trim() || null;

function addToMailchimp(body) {
  if (!MAILCHIMP_API_KEY || !MAILCHIMP_SERVER || !MAILCHIMP_LIST_ID) {
    return Promise.resolve({ skip: true, reason: 'Mailchimp non configuré' });
  }
  const url = `https://${MAILCHIMP_SERVER}.api.mailchimp.com/3.0/lists/${MAILCHIMP_LIST_ID}/members`;
  const auth = Buffer.from('anystring:' + MAILCHIMP_API_KEY).toString('base64');
  const payload = {
    email_address: body.email,
    status: 'subscribed',
    merge_fields: {
      FNAME: body.prenom || '',
      LNAME: body.nom || '',
      PHONE: body.tel || '',
      ORG: body.ecole || '',
      PROGRAM: body.programme || '',
      MESSAGE: body.message || ''
    }
  };
  return fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
    .then(res => res.json().then(data => ({ status: res.status, data })))
    .then(({ status, data }) => {
      if (status === 400 && data.title === 'Member Exists') return { mailchimp: { id: data.detail } };
      if (status >= 400) return { mailchimpError: data.detail || data.title || 'Erreur Mailchimp' };
      return { mailchimp: data };
    })
    .catch(err => ({ mailchimpError: err.message }));
}

/** Crée les clients XML-RPC Odoo et authentifie. Retourne { uid, client } ou rejette. */
function getOdooClient() {
  if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !odooSecret) {
    return Promise.reject(new Error('Odoo non configuré'));
  }
  const u = new URL(ODOO_URL.replace(/\/$/, '') || 'https://localhost');
  const host = u.hostname;
  const pathBase = (u.pathname || '/').replace(/\/$/, '') || '';
  const client = xmlrpc.createSecureClient({
    host: host,
    port: u.port ? parseInt(u.port, 10) : 443,
    path: pathBase + '/xmlrpc/2/object'
  });
  const common = xmlrpc.createSecureClient({
    host: host,
    port: u.port ? parseInt(u.port, 10) : 443,
    path: pathBase + '/xmlrpc/2/common'
  });
  return new Promise((resolve, reject) => {
    common.methodCall('authenticate', [ODOO_DB, ODOO_USER, odooSecret, {}], (err, uid) => {
      if (err) return reject(err);
      if (!uid) return reject(new Error('Authentification Odoo échouée'));
      resolve({ uid, client });
    });
  });
}

/** execute_kw sur le modèle Odoo (ex: search_read). */
function odooSearchRead(model, fields) {
  return getOdooClient().then(({ uid, client }) => {
    return new Promise((resolve, reject) => {
      client.methodCall('execute_kw', [
        ODOO_DB, uid, odooSecret,
        model, 'search_read',
        [[]],
        { fields }
      ], (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
  });
}

/** Lire une action Odoo par ID (ex: action=405 dans l'URL du pipeline). */
function odooRead(model, ids, fields) {
  return getOdooClient().then(({ uid, client }) => {
    return new Promise((resolve, reject) => {
      client.methodCall('execute_kw', [
        ODOO_DB, uid, odooSecret,
        model, 'read',
        [ids],
        { fields }
      ], (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
  });
}

/** Liste des champs d'un modèle (pour trouver les noms techniques, ex. Programme / École). */
function odooFieldsGet(model) {
  return getOdooClient().then(({ uid, client }) => {
    return new Promise((resolve, reject) => {
      client.methodCall('execute_kw', [
        ODOO_DB, uid, odooSecret,
        model, 'fields_get',
        [],
        {}
      ], (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
  });
}

function createOdooLead(body) {
  if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !odooSecret) {
    return Promise.resolve({ skip: true, reason: 'Odoo non configuré' });
  }
  return getOdooClient().then(({ uid, client }) => {
    return new Promise((resolve, reject) => {
      const contactName = [body.prenom, body.nom].filter(Boolean).join(' ') || body.email || 'Contact LP';
      const description = [
        body.ecole ? `École/Organisation: ${body.ecole}` : '',
        body.programme ? `Programme: ${body.programme}` : '',
        body.message ? `Message: ${body.message}` : ''
      ].filter(Boolean).join('\n');
      const leadData = {
        name: 'Lead-LP_solutions',
        contact_name: contactName,
        partner_name: body.ecole || '',   // Company Name / École-Organisation (champ standard Odoo)
        email_from: body.email || '',
        phone: body.tel || '',
        description: description,
        type: 'opportunity'   // pipeline action 405 affiche uniquement les opportunités
      };
      if (ODOO_STAGE_ID) leadData.stage_id = ODOO_STAGE_ID;
      if (ODOO_TEAM_ID) leadData.team_id = ODOO_TEAM_ID;
      if (ODOO_FIELD_ORGANISATION && body.ecole) leadData[ODOO_FIELD_ORGANISATION] = body.ecole;
      if (ODOO_FIELD_PROGRAMME && body.programme) leadData[ODOO_FIELD_PROGRAMME] = body.programme;
      // ODOO_TEAM_ID vide = lead sans équipe (visible à toutes les équipes, assignation par élimination ensuite)
      console.log('[Odoo] Création lead → team_id:', ODOO_TEAM_ID ?? '(toutes les équipes)', '| stage_id:', ODOO_STAGE_ID || '(non défini)');
      client.methodCall('execute_kw', [
        ODOO_DB, uid, odooSecret,
        'crm.lead', 'create',
        [leadData]
      ], (err2, id) => {
        if (err2) return reject(err2);
        console.log('[Odoo] Lead créé, id:', id, '| Titre: Lead-LP_solutions | Contact:', contactName, '| Email:', body.email);
        resolve({ odooLeadId: id });
      });
    });
  }).catch(err => ({ odooError: err.message }));
}

const { handleContact } = require('./lib/contact');

app.post('/api/contact', contactLimiter, (req, res) => {
  handleContact(req.body || {})
    .then(({ statusCode, body }) => res.status(statusCode).json(body))
    .catch(err => {
      console.error('[Contact] Exception:', err);
      res.status(500).json({
        ok: false,
        message: err.message || 'Une erreur est survenue. Réessayez ou contactez-nous directement.'
      });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Serveur contact LP sur http://localhost:' + PORT);
  if (!MAILCHIMP_LIST_ID) console.warn('MAILCHIMP_LIST_ID non défini → Mailchimp désactivé');
  if (!ODOO_DB) console.warn('ODOO_* non défini → Odoo désactivé');
});
