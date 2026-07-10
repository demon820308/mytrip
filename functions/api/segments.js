// Cloudflare Pages Function: /api/segments
// Handles GET (list), POST (add), DELETE (remove) for trip segments

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
        .prepare('SELECT * FROM trip_segments ORDER BY sort_order, created_at')
        .all();
      return json(results);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { from_st, to_st, date, dep_time, train_no, price, note, sort_order } = body;
      const result = await db
        .prepare(
          'INSERT INTO trip_segments (from_st, to_st, date, dep_time, train_no, price, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(from_st, to_st, date ?? null, dep_time ?? null, train_no ?? null, price ?? null, note ?? null, sort_order ?? 0)
        .run();
      return json({ id: result.meta.last_row_id }, 201);
    }

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
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
