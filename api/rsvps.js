// Vercel Serverless Function for the CEREHE RSVP guest list.
// Supabase credentials stay server-side in Vercel environment variables.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RSVP_ADMIN_PASSWORD = process.env.RSVP_ADMIN_PASSWORD;

function json(res, status, body) {
  res.status(status).json(body);
}

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RSVP_ADMIN_PASSWORD) {
    return json(res, 500, { error: 'RSVP service is not configured yet.' });
  }

  try {
    if (req.method === 'GET') {
      const adminAuthorized = req.headers['x-admin-password'] === RSVP_ADMIN_PASSWORD;
      const select = adminAuthorized
        ? 'id,name,party_size,attendance,message,message_approved,created_at'
        : 'id,message,message_approved,created_at';

      const filters = adminAuthorized
        ? '&order=created_at.desc'
        : '&message_approved=eq.true&message=not.is.null&order=created_at.desc';

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/rsvps?select=${select}&attendance=eq.Yes%2C%20absolutely!%20%F0%9F%8E%89${filters}`,
        { headers: supabaseHeaders() }
      );

      if (!response.ok) {
        const details = await response.text();
        console.error('Supabase GET error:', details);
        return json(res, 500, { error: 'Unable to load guest list.' });
      }

      const guests = await response.json();
      return json(res, 200, adminAuthorized ? { adminAuthorized: true, guests } : guests);ts);
    }

    if (req.method === 'POST') {
      const { name, party_size = 1, attendance, message = '' } = req.body || {};

      if (!name || !String(name).trim()) {
        return json(res, 400, { error: 'Please enter your name.' });
      }

      if (!attendance) {
        return json(res, 400, { error: 'Please select your attendance.' });
      }

      const response = await fetch(`${SUPABASE_URL}/rest/v1/rsvps`, {
        method: 'POST',
        headers: { ...supabaseHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify([{
          name: String(name).trim(),
          party_size: Number(party_size) || 1,
          attendance: String(attendance),
          message: String(message || '').trim().slice(0, 500),
          message_approved: false,
        }]),
      });

      if (!response.ok) {
        const details = await response.text();
        console.error('Supabase POST error:', details);
        return json(res, 500, { error: 'Unable to save RSVP.' });
      }

      const created = await response.json();
      return json(res, 201, created[0]);
    }

    if (req.method === 'PATCH') {
      if (req.headers['x-admin-password'] !== RSVP_ADMIN_PASSWORD) {
        return json(res, 401, { error: 'Incorrect admin pass.' });
      }

      const { id, message_approved } = req.body || {};
      if (!id || typeof message_approved !== 'boolean') {
        return json(res, 400, { error: 'Message ID and approval status are required.' });
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/rsvps?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { ...supabaseHeaders(), Prefer: 'return=representation' },
          body: JSON.stringify({ message_approved }),
        }
      );

      if (!response.ok) {
        const details = await response.text();
        console.error('Supabase PATCH error:', details);
        return json(res, 500, { error: 'Unable to update message approval.' });
      }

      const updated = await response.json();
      return json(res, 200, updated[0] || { success: true });
    }

    if (req.method === 'DELETE') {
      if (req.headers['x-admin-password'] !== RSVP_ADMIN_PASSWORD) {
        return json(res, 401, { error: 'Incorrect admin pass.' });
      }

      const { id } = req.body || {};
      if (!id) return json(res, 400, { error: 'Guest ID is required.' });

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/rsvps?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
        }
      );

      if (!response.ok) {
        const details = await response.text();
        console.error('Supabase DELETE error:', details);
        return json(res, 500, { error: 'Unable to remove guest.' });
      }

      return json(res, 200, { success: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    console.error('RSVP API error:', error);
    return json(res, 500, { error: 'Unexpected RSVP service error.' });
  }
}
