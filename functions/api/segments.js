// Cloudflare Pages Function: /api/segments
// Handles GET (list), POST (add), PUT (update), DELETE (remove) for trip segments

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
      const tripId = url.searchParams.get('trip_id') || 'qianmin';

      // Auto-prepopulate if table is completely empty
      const countResult = await db.prepare('SELECT COUNT(*) as count FROM trip_segments').first();
      if (countResult && countResult.count === 0) {
        await prepopulate(db);
      }

      const { results } = await db
        .prepare('SELECT * FROM trip_segments WHERE trip_id = ? ORDER BY sort_order, created_at')
        .bind(tripId)
        .all();
      return json(results);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { from_st, to_st, date, dep_time, train_no, price, note, sort_order, trip_id } = body;
      const tripId = trip_id || 'qianmin';
      
      const result = await db
        .prepare(
          'INSERT INTO trip_segments (from_st, to_st, date, dep_time, train_no, price, note, sort_order, trip_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(from_st, to_st, date ?? null, dep_time ?? null, train_no ?? null, price ?? null, note ?? null, sort_order ?? 0, tripId)
        .run();
      return json({ id: result.meta.last_row_id }, 201);
    }

    if (request.method === 'PUT') {
      const body = await request.json();
      const { id, from_st, to_st, date, dep_time, train_no, price, note, trip_id } = body;
      const tripId = trip_id || 'qianmin';
      
      if (!id) return json({ error: 'id required' }, 400);
      
      await db
        .prepare(
          'UPDATE trip_segments SET from_st = ?, to_st = ?, date = ?, dep_time = ?, train_no = ?, price = ?, note = ?, trip_id = ? WHERE id = ?'
        )
        .bind(from_st, to_st, date ?? null, dep_time ?? null, train_no ?? null, price ?? null, note ?? null, tripId, id)
        .run();
      return json({ ok: true });
    }

    if (request.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id required' }, 400);
      await db.prepare('DELETE FROM trip_segments WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

async function prepopulate(db) {
  const segments = [
    { from_st: '都匀东', to_st: '广州南', date: '2026-07-11', dep_time: '09:24', train_no: 'G3701', price: 318, note: '贵州出发高效中转车次', sort_order: 1 },
    { from_st: '广州南', to_st: '潮汕', date: '2026-07-11', dep_time: '14:30', train_no: 'G6313', price: 228, note: '粤东大枢纽，可达潮/汕/揭', sort_order: 2 },
    { from_st: '潮汕', to_st: '三明北', date: '2026-07-12', dep_time: '18:10', train_no: 'D2329', price: 165, note: '潮汕直达三明北备选', sort_order: 3 },
    { from_st: '饶平', to_st: '三明', date: '2026-07-12', dep_time: '08:45', train_no: 'D2312', price: 172, note: '闽粤边界车站直达三明备选', sort_order: 4 }
  ];

  for (const seg of segments) {
    await db
      .prepare(
        'INSERT INTO trip_segments (from_st, to_st, date, dep_time, train_no, price, note, sort_order, trip_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(seg.from_st, seg.to_st, seg.date, seg.dep_time, seg.train_no, seg.price, seg.note, seg.sort_order, 'qianmin')
      .run();
  }
}
