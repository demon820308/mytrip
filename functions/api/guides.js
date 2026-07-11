// Cloudflare Pages Function: /api/guides
// Handles GET (list), POST (add), PUT (update), DELETE (remove) for guides (Eat and Play items)

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
        .prepare('SELECT * FROM guide_items ORDER BY created_at')
        .all();
      return json(results);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { category, city, name, type, address, desc, avoid, is_special } = body;
      
      if (!category || !city || !name || !address || !desc) {
        return json({ error: 'Missing required fields' }, 400);
      }

      const result = await db
        .prepare(
          'INSERT INTO guide_items (category, city, name, type, address, desc, avoid, is_special) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(category, city, name, type ?? null, address, desc, avoid ?? null, is_special ? 1 : 0)
        .run();
      return json({ id: result.meta.last_row_id }, 201);
    }

    if (request.method === 'PUT') {
      const body = await request.json();
      const { id, category, city, name, type, address, desc, avoid, is_special } = body;
      
      if (!id || !category || !city || !name || !address || !desc) {
        return json({ error: 'Missing required fields' }, 400);
      }

      await db
        .prepare(
          'UPDATE guide_items SET category = ?, city = ?, name = ?, type = ?, address = ?, desc = ?, avoid = ?, is_special = ? WHERE id = ?'
        )
        .bind(category, city, name, type ?? null, address, desc, avoid ?? null, is_special ? 1 : 0, id)
        .run();
      return json({ ok: true });
    }

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id required' }, 400);
      await db.prepare('DELETE FROM guide_items WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
