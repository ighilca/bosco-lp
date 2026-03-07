/**
 * Logique partagée du formulaire contact : Mailchimp + Odoo.
 * Utilisé par server.js (Express) et api/contact.js (Vercel serverless).
 */
const xmlrpc = require('xmlrpc');

const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY;
const MAILCHIMP_SERVER = process.env.MAILCHIMP_SERVER || (MAILCHIMP_API_KEY && MAILCHIMP_API_KEY.includes('-') ? MAILCHIMP_API_KEY.split('-').pop() : '');
const MAILCHIMP_LIST_ID = process.env.MAILCHIMP_LIST_ID;
const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USER = process.env.ODOO_USER;
const ODOO_PASSWORD = process.env.ODOO_PASSWORD;
const ODOO_API_KEY = process.env.ODOO_API_KEY;
const odooSecret = ODOO_API_KEY || ODOO_PASSWORD;
const ODOO_STAGE_ID = process.env.ODOO_STAGE_ID ? parseInt(process.env.ODOO_STAGE_ID, 10) : null;
const ODOO_TEAM_ID = process.env.ODOO_TEAM_ID ? parseInt(process.env.ODOO_TEAM_ID, 10) : null;
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
    headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/json' },
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

function getOdooClient() {
  if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !odooSecret) {
    return Promise.reject(new Error('Odoo non configuré'));
  }
  const u = new URL(ODOO_URL.replace(/\/$/, '') || 'https://localhost');
  const host = u.hostname;
  const pathBase = (u.pathname || '/').replace(/\/$/, '') || '';
  const client = xmlrpc.createSecureClient({
    host, port: u.port ? parseInt(u.port, 10) : 443,
    path: pathBase + '/xmlrpc/2/object'
  });
  const common = xmlrpc.createSecureClient({
    host, port: u.port ? parseInt(u.port, 10) : 443,
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
        partner_name: body.ecole || '',
        email_from: body.email || '',
        phone: body.tel || '',
        description,
        type: 'opportunity'
      };
      if (ODOO_STAGE_ID) leadData.stage_id = ODOO_STAGE_ID;
      if (ODOO_TEAM_ID) leadData.team_id = ODOO_TEAM_ID;
      if (ODOO_FIELD_ORGANISATION && body.ecole) leadData[ODOO_FIELD_ORGANISATION] = body.ecole;
      if (ODOO_FIELD_PROGRAMME && body.programme) leadData[ODOO_FIELD_PROGRAMME] = body.programme;
      client.methodCall('execute_kw', [
        ODOO_DB, uid, odooSecret,
        'crm.lead', 'create',
        [leadData]
      ], (err2, id) => {
        if (err2) return reject(err2);
        resolve({ odooLeadId: id });
      });
    });
  }).catch(err => ({ odooError: err.message }));
}

function sanitize(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, maxLen);
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

const ALLOWED_PROGRAMMES = new Set(['', 'blues', 'pastel', 'grd', 'tous']);

/**
 * Traite une soumission du formulaire contact.
 * @param {object} body - Données brutes (email, prenom, nom, tel, ecole, programme, message, website)
 * @returns {Promise<{ statusCode: number, body: object }>}
 */
async function handleContact(body) {
  const raw = body || {};
  if ((raw.website || raw.url || raw.comment || '').toString().trim()) {
    return { statusCode: 200, body: { ok: true, message: 'Merci ! Votre demande a bien été envoyée.' } };
  }
  const email = sanitize(raw.email || '', 254);
  const prenom = sanitize(raw.prenom || '', 120);
  const nom = sanitize(raw.nom || '', 120);
  if (!email) {
    return { statusCode: 400, body: { ok: false, message: 'Courriel requis.' } };
  }
  if (!isValidEmail(email)) {
    return { statusCode: 400, body: { ok: false, message: 'Courriel invalide.' } };
  }
  const programme = (raw.programme || '').toString().trim();
  if (!ALLOWED_PROGRAMMES.has(programme)) {
    return { statusCode: 400, body: { ok: false, message: 'Valeur programme invalide.' } };
  }
  const payload = {
    prenom,
    nom,
    email,
    tel: sanitize(raw.tel || '', 30),
    ecole: sanitize(raw.ecole || '', 300),
    programme,
    message: sanitize(raw.message || '', 2000)
  };

  const [mailchimpRes, odooRes] = await Promise.all([
    addToMailchimp(payload),
    createOdooLead(payload)
  ]);
  const mailchimpOk = !mailchimpRes.mailchimpError;
  const odooOk = !odooRes.odooError;
  if (!mailchimpOk && !odooOk) {
    const parts = [];
    if (mailchimpRes.mailchimpError) parts.push('Mailchimp: ' + mailchimpRes.mailchimpError);
    if (odooRes.odooError) parts.push('Odoo: ' + odooRes.odooError);
    return {
      statusCode: 500,
      body: { ok: false, message: parts.join(' — ') }
    };
  }
  return {
    statusCode: 200,
    body: {
      ok: true,
      message: 'Merci ! Votre demande a bien été envoyée. Un membre de notre équipe vous contactera.',
      mailchimp: mailchimpRes.skip ? 'non configuré' : (mailchimpOk ? 'ok' : 'échec'),
      odoo: odooRes.skip ? 'non configuré' : (odooOk ? 'ok' : 'échec')
    }
  };
}

module.exports = { handleContact, sanitize, isValidEmail };
