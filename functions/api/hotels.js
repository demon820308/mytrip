// Cloudflare Pages Function: /api/hotels
// Handles GET (list), POST (add), DELETE (remove) for hotel bookings

import { getAuthUser, readRequestBody, corsHeaders } from './_utils.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

async function checkTripOwner(db, tripId, userId) {
  const trip = await db.prepare('SELECT owner_id FROM trips WHERE id = ?').bind(tripId).first();
  return trip && (trip.owner_id === userId || trip.owner_id === null);
}

async function checkItemOwner(db, itemId, userId) {
  const trip = await db.prepare('SELECT t.owner_id FROM booked_hotels h JOIN trips t ON h.trip_id = t.id WHERE h.id = ?').bind(itemId).first();
  return trip && (trip.owner_id === userId || trip.owner_id === null);
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
      const tripId = url.searchParams.get('trip_id');
      if (!tripId) return json({ error: 'Missing trip_id' }, 400);

      if (!(await checkTripOwner(db, tripId, user.userId))) {
        return json({ error: '无权访问此行程' }, 403);
      }

      const { results } = await db
        .prepare('SELECT * FROM booked_hotels WHERE trip_id = ? ORDER BY checkin, created_at')
        .bind(tripId)
        .all();
      return json(results);
    }

    if (request.method === 'POST') {
      const body = await readRequestBody(request);
      const { city, name, checkin, checkout, address, price, trip_id } = body;
      const tripId = trip_id;
      
      if (!city || !name || !checkin || !checkout || !address || price === undefined || !tripId) {
        return json({ error: 'Missing required fields' }, 400);
      }

      if (!(await checkTripOwner(db, tripId, user.userId))) {
        return json({ error: '无权修改此行程' }, 403);
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
      
      if (!(await checkItemOwner(db, id, user.userId))) {
        return json({ error: '无权删除此数据' }, 403);
      }

      await db.prepare('DELETE FROM booked_hotels WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
