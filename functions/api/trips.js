// Cloudflare Pages Function: /api/trips
// Handles GET (list), POST (add), PUT (update), DELETE (remove) for trips configurations

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
  if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
    const inputPassword = request.headers.get('x-admin-password');
    if (inputPassword !== correctPassword) {
      return json({ error: '密码错误，无权修改数据' }, 403);
    }
  }

  try {
    if (request.method === 'GET') {
      const { results } = await db
        .prepare('SELECT * FROM trips ORDER BY created_at')
        .all();
      return json(results);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { id, title, subtitle, banner_image, route_json } = body;

      if (!id || !title || !route_json) {
        return json({ error: 'Missing required fields (id, title, route_json)' }, 400);
      }

      // Check if ID already exists
      const existing = await db.prepare('SELECT id FROM trips WHERE id = ?').bind(id).first();
      if (existing) {
        return json({ error: '行程ID已存在，请使用其他缩写或ID' }, 400);
      }

      await db
        .prepare(
          'INSERT INTO trips (id, title, subtitle, banner_image, route_json) VALUES (?, ?, ?, ?, ?)'
        )
        .bind(id, title, subtitle || '', banner_image || 'images/hero_banner.webp', route_json)
        .run();

      return json({ success: true, id });
    }

    if (request.method === 'PUT') {
      const body = await request.json();
      const { id, title, subtitle, banner_image, route_json } = body;

      if (!id || !title || !route_json) {
        return json({ error: 'Missing required fields (id, title, route_json)' }, 400);
      }

      await db
        .prepare(
          'UPDATE trips SET title = ?, subtitle = ?, banner_image = ?, route_json = ? WHERE id = ?'
        )
        .bind(title, subtitle || '', banner_image || 'images/hero_banner.webp', route_json, id)
        .run();

      return json({ success: true, id });
    }

    if (request.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) {
        return json({ error: 'Missing trip id' }, 400);
      }

      // Batch delete matching trip config, segments, hotels, and guides
      await db.batch([
        db.prepare('DELETE FROM trips WHERE id = ?').bind(id),
        db.prepare('DELETE FROM trip_segments WHERE trip_id = ?').bind(id),
        db.prepare('DELETE FROM booked_hotels WHERE trip_id = ?').bind(id),
        db.prepare('DELETE FROM guide_items WHERE trip_id = ?').bind(id)
      ]);

      return json({ success: true, id });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
