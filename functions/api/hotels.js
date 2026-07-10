// Cloudflare Pages Function: /api/hotels
// Handles GET (list), POST (add), DELETE (remove) for hotel bookings

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    if (request.method === 'GET') {
      const { results } = await db
        .prepare('SELECT * FROM booked_hotels ORDER BY checkin, created_at')
        .all();
      return json(results);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { city, name, checkin, checkout, address, price } = body;
      
      if (!city || !name || !checkin || !checkout || !address || price === undefined) {
        return json({ error: 'Missing required fields' }, 400);
      }

      const result = await db
        .prepare(
          'INSERT INTO booked_hotels (city, name, checkin, checkout, address, price) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(city, name, checkin, checkout, address, Number(price))
        .run();
      return json({ id: result.meta.last_row_id }, 201);
    }

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id required' }, 400);
      await db.prepare('DELETE FROM booked_hotels WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
