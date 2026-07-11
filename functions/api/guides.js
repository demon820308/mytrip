// Cloudflare Pages Function: /api/guides
// Handles GET (list), POST (add), PUT (update), DELETE (remove) for guides (Eat and Play items)

import { getAuthUser, readRequestBody, corsHeaders } from './_utils.js';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

async function checkTripOwner(db, tripId, userId) {
  const trip = await db.prepare('SELECT owner_id FROM trips WHERE id = ?').bind(tripId).first();
  return trip && (trip.owner_id === userId || trip.owner_id === null);
}

async function checkItemOwner(db, itemId, userId) {
  const trip = await db.prepare('SELECT t.owner_id FROM guide_items g JOIN trips t ON g.trip_id = t.id WHERE g.id = ?').bind(itemId).first();
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

      // Auto-prepopulate if table for this trip is completely empty
      const countResult = await db.prepare('SELECT COUNT(*) as count FROM guide_items WHERE trip_id = ?').bind(tripId).first();
      if (countResult && countResult.count === 0) {
        await prepopulate(db, tripId);
      }

      const { results } = await db
        .prepare('SELECT * FROM guide_items WHERE trip_id = ? ORDER BY created_at')
        .bind(tripId)
        .all();
      return json(results);
    }

    if (request.method === 'POST') {
      const body = await readRequestBody(request);
      const { category, city, name, type, address, desc, avoid, is_special, trip_id, image } = body;
      const tripId = trip_id;
      
      if (!category || !city || !name || !address || !desc || !tripId) {
        return json({ error: 'Missing required fields' }, 400);
      }

      if (!(await checkTripOwner(db, tripId, user.userId))) {
        return json({ error: '无权访问此行程' }, 403);
      }

      const result = await db
        .prepare(
          'INSERT INTO guide_items (category, city, name, type, address, desc, avoid, is_special, trip_id, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(category, city, name, type ?? null, address, desc, avoid ?? null, is_special ? 1 : 0, tripId, image ?? null)
        .run();
      return json({ id: result.meta.last_row_id }, 201);
    }

    if (request.method === 'PUT') {
      const body = await readRequestBody(request);
      const { id, category, city, name, type, address, desc, avoid, is_special, trip_id, image } = body;
      const tripId = trip_id;
      
      if (!id || !category || !city || !name || !address || !desc || !tripId) {
        return json({ error: 'Missing required fields' }, 400);
      }

      if (!(await checkItemOwner(db, id, user.userId))) {
        return json({ error: '无权修改此数据' }, 403);
      }

      await db
        .prepare(
          'UPDATE guide_items SET category = ?, city = ?, name = ?, type = ?, address = ?, desc = ?, avoid = ?, is_special = ?, trip_id = ?, image = ? WHERE id = ?'
        )
        .bind(category, city, name, type ?? null, address, desc, avoid ?? null, is_special ? 1 : 0, tripId, image ?? null, id)
        .run();
      return json({ ok: true });
    }

    if (request.method === 'DELETE') {
      const clear = url.searchParams.get('clear');
      
      if (clear === 'all') {
        const tripId = url.searchParams.get('trip_id');
        if (!tripId) return json({ error: 'Missing trip_id' }, 400);

        if (!(await checkTripOwner(db, tripId, user.userId))) {
          return json({ error: '无权操作此行程' }, 403);
        }

        const category = url.searchParams.get('category');
        if (category === 'eat' || category === 'play') {
          await db
            .prepare('DELETE FROM guide_items WHERE trip_id = ? AND category = ?')
            .bind(tripId, category)
            .run();
        } else {
          await db
            .prepare('DELETE FROM guide_items WHERE trip_id = ?')
            .bind(tripId)
            .run();
        }
        return json({ ok: true });
      }

      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id required' }, 400);
      
      if (!(await checkItemOwner(db, id, user.userId))) {
        return json({ error: '无权删除此数据' }, 403);
      }

      await db.prepare('DELETE FROM guide_items WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

async function prepopulate(db, targetTripId) {
  const eats = [
    { city: '揭阳', name: '贤德乒乓粿（老字号）', type: '糕点', address: '榕城区 西马路与北直街交叉口向北50米', desc: '老街坊逢年过节必去的打包店。纯手工制作，外皮极其软糯，下锅煎到两面微焦，内馅裹满芝麻、花生和少许咸香肉脯，甜咸交织，是最传统的揭阳配方。' },
    { city: '揭阳', name: '西马路尖米丸/尖米粿摊', type: '粿条', address: '榕城区 西马路中段', desc: '如果想吃咸口，就去西马路找这种老牌大排档。纯米浆手工搓成两头尖尖的“尖米丸”，配上鲜美的猪骨汤、肉碎和芹芹菜粒，汤头极其清鲜。' },
    { city: '潮州', name: '溪口刘卜卤鹅', type: '卤鹅', address: '湘桥区 意溪镇溪口四村中路（建议在古城打车前往）', desc: '在本地人心目中地位极高的老字号。溪口流派的卤汁味道更偏向于浓郁咸香，一定要让他们现切一些鹅八珍、鹅肝（神级口感，像豆腐一样嫩）和带骨鹅肉，老卤汁回甘明显。' },
    { city: '汕头', name: '新埔汕特湿炒牛肉粿条', type: '湿炒/粿条', address: '金平区 金砂路新埔民居区内', desc: '纯正的苍蝇馆子，主打“湿炒”。大火把粿条炒出焦香，然后把新鲜牛肉和芥兰倒进浓郁的沙茶酱汁里快速勾芡盖在粿条上。浓稠的沙茶汁裹满每一根粿条，牛肉嫩到爆汁。' }
  ];

  const plays = [
    { city: '广州', name: '广州塔（小蛮腰）', address: '海珠区 阅江西路222号（地铁直达）', desc: '全高604米，大湾区的绝对地标。中转时间短可以在塔下花城广场拍摄全景（夜景极佳）；时间充裕可上塔体验摩天轮。', avoid: '千万别在黄昏排队上塔，那是人流高峰；塔底拉客的合影摊贩别信，推销高价且拍得丑，自己广角仰拍更优。' },
    { city: '揭阳', name: '进贤门城楼', address: '榕城区 进贤门大道与环城正街交汇处', desc: '揭阳古城地标，始建于明代，是潮汕地区唯一保留的古城门。城楼建筑精巧，带有浓郁的岭南古典韵味，适合傍晚亮灯拍摄。', avoid: '城楼周边马路车流极大，电动车较乱。拍照注意安全，不要站到路中央。周边兜售塑料玩具的小贩较多，建议直接忽视。' },
    { city: '泉州', name: '西街与开元寺（泉州）', address: '鲤城区 西街', desc: '泉州保存最完整的古街区，尽头是开元寺。寺内有我国现存最高的仿木结构石塔：东西双塔。', avoid: '不要花钱去网红咖啡馆天台拍双塔。去【泉州影剧院】旁边的钟楼天桥，或西街免费的游客中心天台。主街小吃不地道，吃传统美食往内巷深处走。' }
  ];

  for (const item of eats) {
    await db
      .prepare(
        'INSERT INTO guide_items (category, city, name, type, address, desc, avoid, is_special, trip_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind('eat', item.city, item.name, item.type, item.address, item.desc, null, item.isSpecial ? 1 : 0, targetTripId)
      .run();
  }

  for (const item of plays) {
    await db
      .prepare(
        'INSERT INTO guide_items (category, city, name, type, address, desc, avoid, is_special, trip_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind('play', item.city, item.name, null, item.address, item.desc, item.avoid, 0, targetTripId)
      .run();
  }
}
