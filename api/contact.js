/**
 * Vercel Serverless Function : POST /api/contact
 * Déployé avec le repo (GitHub → Vercel). Les variables d'environnement
 * (ODOO_*, MAILCHIMP_*) doivent être configurées dans le projet Vercel.
 */
const { handleContact } = require('../lib/contact');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Méthode non autorisée.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      res.status(400).json({ ok: false, message: 'JSON invalide.' });
      return;
    }
  }
  body = body || {};

  try {
    const { statusCode, body: json } = await handleContact(body);
    res.status(statusCode).json(json);
  } catch (err) {
    console.error('[Contact]', err);
    res.status(500).json({
      ok: false,
      message: err.message || 'Une erreur est survenue. Réessayez ou contactez-nous directement.'
    });
  }
};
