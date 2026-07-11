// Cloudflare Pages Function: /api/trips
// Handles GET (list), POST (add), PUT (update), DELETE (remove) for trips configurations

import { getAuthUser, readRequestBody, corsHeaders } from './_utils.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  // Verify Auth for ALL requests
  const user = await getAuthUser(request, env);
  if (!user) {
    return json({ error: '未登录或登录已过期' }, 401);
  }

  try {
    if (request.method === 'GET') {
      const { results } = await db
        .prepare('SELECT * FROM trips WHERE owner_id = ? OR owner_id IS NULL ORDER BY created_at')
        .bind(user.userId)
        .all();
      return json(results);
    }

    if (request.method === 'POST') {
      const body = await readRequestBody(request);
      const { id, title, subtitle, banner_image, route_json } = body;

      if (!id || !title || !route_json) {
        return json({ error: 'Missing required fields (id, title, route_json)' }, 400);
      }

      // Check if ID already exists globally
      const existing = await db.prepare('SELECT id FROM trips WHERE id = ?').bind(id).first();
      if (existing) {
        return json({ error: '行程ID已存在，请使用其他缩写或ID' }, 400);
      }

      await db
        .prepare(
          'INSERT INTO trips (id, title, subtitle, banner_image, route_json, owner_id) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(id, title, subtitle || '', banner_image || 'images/hero_banner.webp', route_json, user.userId)
        .run();

      return json({ success: true, id });
    }

    if (request.method === 'PUT') {
      const body = await readRequestBody(request);
      const { id, title, subtitle, banner_image, route_json } = body;

      if (!id || !title || !route_json) {
        return json({ error: 'Missing required fields (id, title, route_json)' }, 400);
      }

      const result = await db
        .prepare(
          'UPDATE trips SET title = ?, subtitle = ?, banner_image = ?, route_json = ? WHERE id = ? AND (owner_id = ? OR owner_id IS NULL)'
        )
        .bind(title, subtitle || '', banner_image || 'images/hero_banner.webp', route_json, id, user.userId)
        .run();
        
      if (!result.success || result.meta.changes === 0) {
        return json({ error: '更新失败，行程不存在或无权限' }, 403);
      }

      return json({ success: true, id });
    }

    if (request.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) {
        return json({ error: 'Missing trip id' }, 400);
      }
      
      const trip = await db.prepare('SELECT id FROM trips WHERE id = ? AND (owner_id = ? OR owner_id IS NULL)').bind(id, user.userId).first();
      if (!trip) {
        return json({ error: '删除失败，行程不存在或无权限' }, 403);
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
