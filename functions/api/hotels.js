// Cloudflare Pages Function: /api/hotels
// Handles GET (list), POST (add), DELETE (remove) for hotel bookings

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  // Admin password check for write actions
  const correctPassword = env.ADMIN_PASSWORD || '123456';
  if (['POST', 'DELETE'].includes(request.method)) {
    const inputPassword = request.headers.get('x-admin-password');
    if (inputPassword !== correctPassword) {
      return json({ error: '密码错误，无权修改数据' }, 403);
    }
  }

  try {
    if (request.method === 'GET') {
      const tripId = url.searchParams.get('trip_id') || 'qianmin';
      const { results } = await db
        .prepare('SELECT * FROM booked_hotels WHERE trip_id = ? ORDER BY checkin, created_at')
        .bind(tripId)
        .all();
      return json(results);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { city, name, checkin, checkout, address, price, trip_id } = body;
      const tripId = trip_id || 'qianmin';
      
      if (!city || !name || !checkin || !checkout || !address || price === undefined) {
        return json({ error: 'Missing required fields' }, 400);
      }

      const result = await db
        .prepare(
          'INSERT INTO booked_hotels (city, name, checkin, checkout, address, price, trip_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(city, name, checkin, checkout, address, Number(price), tripId)
        .run();
      return json({ id: result.meta.last_row_id }, 201);
    }

    if (request.method === 'DELETE') {
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
