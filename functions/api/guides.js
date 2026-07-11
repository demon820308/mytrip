// Cloudflare Pages Function: /api/guides
// Handles GET (list), POST (add), PUT (update), DELETE (remove) for guides (Eat and Play items)

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
      const countResult = await db.prepare('SELECT COUNT(*) as count FROM guide_items').first();
      if (countResult && countResult.count === 0) {
        await prepopulate(db);
      }

      const { results } = await db
        .prepare('SELECT * FROM guide_items WHERE trip_id = ? ORDER BY created_at')
        .bind(tripId)
        .all();
      return json(results);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { category, city, name, type, address, desc, avoid, is_special, trip_id } = body;
      const tripId = trip_id || 'qianmin';
      
      if (!category || !city || !name || !address || !desc) {
        return json({ error: 'Missing required fields' }, 400);
      }

      const result = await db
        .prepare(
          'INSERT INTO guide_items (category, city, name, type, address, desc, avoid, is_special, trip_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(category, city, name, type ?? null, address, desc, avoid ?? null, is_special ? 1 : 0, tripId)
        .run();
      return json({ id: result.meta.last_row_id }, 201);
    }

    if (request.method === 'PUT') {
      const body = await request.json();
      const { id, category, city, name, type, address, desc, avoid, is_special, trip_id } = body;
      const tripId = trip_id || 'qianmin';
      
      if (!id || !category || !city || !name || !address || !desc) {
        return json({ error: 'Missing required fields' }, 400);
      }

      await db
        .prepare(
          'UPDATE guide_items SET category = ?, city = ?, name = ?, type = ?, address = ?, desc = ?, avoid = ?, is_special = ?, trip_id = ? WHERE id = ?'
        )
        .bind(category, city, name, type ?? null, address, desc, avoid ?? null, is_special ? 1 : 0, tripId, id)
        .run();
      return json({ ok: true });
    }

    if (request.method === 'DELETE') {
      const clear = url.searchParams.get('clear');
      const tripId = url.searchParams.get('trip_id') || 'qianmin';
      
      if (clear === 'all') {
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
      await db.prepare('DELETE FROM guide_items WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

async function prepopulate(db) {
  const eats = [
    { city: '揭阳', name: '贤德乒乓粿（老字号）', type: '糕点', address: '榕城区 西马路与北直街交叉口向北50米', desc: '老街坊逢年过节必去的打包店。纯手工制作，外皮极其软糯，下锅煎到两面微焦，内馅裹满芝麻、花生和少许咸香肉脯，甜咸交织，是最传统的揭阳配方。' },
    { city: '揭阳', name: '西马路尖米丸/尖米粿摊', type: '粿条', address: '榕城区 西马路中段', desc: '如果想吃咸口，就去西马路找这种老牌大排档。纯米浆手工搓成两头尖尖的“尖米丸”，配上鲜美的猪骨汤、肉碎和芹芹菜粒，汤头极其清鲜。' },
    { city: '揭阳', name: '真好食反沙店', type: '甜品', address: '榕城区 中山路老街与韩祠路交汇处附近（原旧百货大楼斜对面）', desc: '本地人吃反沙的老牌首选。老一辈揭阳人讲究糖霜要厚而不硬，芋头要粉糯。除了经典的“反沙芋头番薯”，千万别错过他们家的反沙咸蛋黄，沙沙咸咸外裹一层脆糖霜，味道绝妙。' },
    { city: '揭阳', name: '榕城老街无名糖水摊', type: '甜品', address: '榕城区 韩祠路/榕华大道周边的老居民区巷子口', desc: '晚上阿公阿嬷推车出来卖的五果汤、姜薯汤，几块钱一碗，润喉清甜，满是古早味。' },
    { city: '揭阳', name: '榕水牛肉店', type: '牛肉/火锅', address: '榕城区 天福路与榕华大道交叉口西行100米路北', desc: '开了几十年的老店，没有花哨摆盘。牛骨汤底熬得极其清亮浓郁，牛肉和牛杂都是下午现宰现运、现点现切，纯靠肉质本身取胜。' },
    { city: '揭阳', name: '仙桥老牌牛肉', type: '牛肉/火锅', address: '榕城区 仙桥街道仙桥路（仙桥卫生院附近居民区）', desc: '偏离景区的仙桥街道社区店，全是周围居民在吃，特调沙茶酱极其浓郁，是本地人的深夜食堂。' },
    { city: '潮州', name: '溪口刘卜卤鹅', type: '卤鹅', address: '湘桥区 意溪镇溪口四村中路（建议在古城打车前往）', desc: '在本地人心目中地位极高的老字号。溪口流派的卤汁味道更偏向于浓郁咸香，一定要让他们现切一些鹅八珍、鹅肝（神级口感，像豆腐一样嫩）和带骨鹅肉，老卤汁回甘明显。' },
    { city: '潮州', name: '阿八卤鹅（西新店）', type: '卤鹅', address: '湘桥区 西新路与新桥东路交叉口向南80米路东（西新住宅区楼下）', desc: '深受周边社区街坊信任的档口，价格极其公道，老卤汁香气铺鼻，本地人经常排队称半只回家加餐。' },
    { city: '潮州', name: '西新老牌肠粉', type: '肠粉', address: '湘桥区 西新路中段（西新中心小学斜对面居民楼下）', desc: '潮州传统花生酱肠粉的杰出代表，酱汁浓厚到可以挂盘。肠粉皮薄，里面裹着牛肉、大片西洋菜（或白菜）和肉碎，最后淋上一大勺浓浓的花生酱，香气能飘半条街。' },
    { city: '潮州', name: '传统竹蓬肠粉', type: '肠粉', address: '湘桥区 义安路与昌黎路交叉口向北（开元寺旁巷里）', desc: '依然保留了用传统竹蔑蓬蒸肠粉的工艺，肠粉皮带着淡淡的竹香和极高的韧性。' },
    { city: '潮州', name: '新桥老牌沙茶牛肉粿', type: '沙茶牛肉/粿条', address: '湘桥区 新桥路与西荣路交叉口后巷内（城西中学附近）', desc: '藏在老居民楼下面，一到中午全是学生和上班族。抓一把粿条烫熟，铺上大片鲜牛肉，最后两大勺浓到像芝麻酱一样的沙茶酱猛地浇上去，狠狠拌匀，每一口都是花生和沙茶的狂欢。' },
    { city: '潮州', name: '大门沙茶牛肉', type: '沙茶牛肉/粿条', address: '湘桥区 城新西路与环城西路交叉口', desc: '开了几十年的老号，这里的沙茶牛肉汤粿条非常出名，汤底里融入了适量的沙茶，既保留了牛骨汤的现熬鲜美，又有沙茶的惹味。' },
    { city: '潮州', name: '开元老牌牛肉粿条', type: '牛肉/粿条', address: '湘桥区 开元广场后巷', desc: '开元寺后巷的小苍蝇馆子，本地人中午和晚上的快餐首选。一大碗沙茶牛肉粿条，肉量给得非常实在。' },
    { city: '汕头', name: '飞厦老二手槌牛肉丸', type: '牛肉火锅/丸子', address: '金平区 飞厦北路1号104格', desc: '汕头本地极富盛名的老牌牛肉丸店，告别营销型网红店的首选。手槌牛肉丸一口爆汁，能吃到明显的肉汁和极为筋道的纤维感，粿条汤底极其鲜美。' },
    { city: '汕头', name: '大华老洋牛肉店', type: '牛肉火锅', address: '金平区 大华路与长平路交叉口往南150米', desc: '藏在老居民区里，没有花里胡哨的宣传。牛胸朥（牛胸口的脂肪，煮完又脆又香）和五花趾是这里的必点。' },
    { city: '汕头', name: '爱西干面（小公园总店）', type: '干面', address: '金平区 国平路1号（靠近小公园中山亭）', desc: '百年老字号，老老人神级早餐。干面灵魂在秘制沙茶酱。把面条、沙茶酱和几片现汆烫的鲜嫩牛肉拌匀，配上一碗加了酸菜的牛杂汤，绝配。' },
    { city: '汕头', name: '新埔汕特湿炒牛肉粿条', type: '湿炒/粿条', address: '金平区 金砂路新埔民居区内', desc: '纯正的苍蝇馆子，主打“湿炒”。大火把粿条炒出焦香，然后把新鲜牛肉和芥兰倒进浓郁的沙茶酱汁里快速勾芡盖在粿条上。浓稠的沙茶汁裹满每一根粿条，牛肉嫩到爆汁。' },
    { city: '汕头', name: '打蓬沙茶牛肉', type: '沙茶牛肉/火锅', address: '龙湖区 老街居民区内', desc: '老街坊的宝藏店。他们家的沙茶酱是自己熬的，里面加了大量的扁鱼干和虾米碎，带有一股极为霸道的海鲜鲜味。' },
    { city: '汕头', name: '金二顺潮汕生腌', type: '生腌/海鲜', address: '金平区 龙眼路新西里5栋101号（龙眼市场附近）', desc: '生腌大虾￥30-45/份（像果冻，新手必点）；生腌血蚌￥25-35/盘；生腌皮皮虾￥35-50/盘；生腌三目蟹￥30-45/只（平价蟹首选）。明码标价，拒绝刺客。', isSpecial: true },
    { city: '汕头', name: '瑞娇嫲嫲潮汕生腌（龙眼店）', type: '生腌/海鲜', address: '金平区 龙眼路北段（龙眼小学斜对面）', desc: '生腌去壳虾仁￥30-40/份（肉质极其黏糯）；生腌泥蚶（血蚌）￥25-35/盘；生腌皮皮虾￥35-45/盘。像食堂打菜一样明档摆在冰柜里。', isSpecial: true },
    { city: '汕头', name: '长平肥姐生腌', type: '生腌/炒海鲜', address: '金平区 长平路与平东一街交叉口（金新大厦内巷）', desc: '大火炒薄壳/花蛤￥15-25/盘（九层塔大火猛炒，真正的市井价）；生腌三目蟹￥30-50/只；生腌生蚝￥30-40/份（肥美不腥）。', isSpecial: true },
    { city: '汕头', name: '老白夜粥', type: '夜粥/生腌', address: '金平区 滨江路与飞厦锦绣路交叉口附近（晚上9点半后出摊）', desc: '几张折叠桌摆在路边，本地打工仔最爱。生腌大虾、血蚌、炒薄壳一盘只要十几二十块钱，叫上一碗1-2块钱的白粥，二三十块钱就能在江风里吃得极饱。', isSpecial: true },
    { city: '汕头', name: '建业夜粥', type: '夜粥/排档', address: '金平区 文兴路与长平路交汇处内巷', desc: '生腌是一大盆一大盆摆出来的，价格非常透明。生腌皮皮虾和大虾肉质极黏糯，极下饭，炒海鲜镬气十足。', isSpecial: true },
    { city: '汕头', name: '同益老牌粿汁', type: '粿汁', address: '金平区 同益路附近', desc: '米浆做成的粿皮，淋上浓郁的药膳卤汁。肥肠处理得极干净，卤到软烂入味，是老汕头人的标准早餐。' },
    { city: '东山岛', name: '铜陵阿龙海鲜排档', type: '海鲜排档', address: '东山县 铜陵镇团结路266号（近大澳渔港）', desc: '海鲜都是码头直接送来的。白灼小管（小鱿鱼）必须点，因为足够新鲜，咬下去里面还有膏，自带海水的清甜。酱油水小石斑、椒盐虾菇也是雷打不动的招牌，价格非常老实。' },
    { city: '东山岛', name: '小吉海鲜小吃', type: '海鲜大排档', address: '东山县 铜陵镇前街（顶街文化区旁巷内）', desc: '藏在老街巷里的苍蝇馆子，大排档风格，本地渔民干完活经常在这聚餐，食材极其新鲜。' },
    { city: '东山岛', name: '前街老牌猫仔粥', type: '猫仔粥', address: '东山县 铜陵镇前街与打铁街交叉口', desc: '老两口开了几十年的小摊。现点现滚的生滚海鲜粥，里面有虾仁、鱿鱼、生蚝、猪肝、肉丸。汤清米糯，加了淡淡的芹菜和冬菜香，一大碗只要十几块钱。' },
    { city: '东山岛', name: '一品海鲜猫仔粥', type: '猫仔粥', address: '东山县 铜陵镇老街商圈内', desc: '另一家备受本地人喜爱的砂锅粥店，现点现熬，海鲜的原汁原味完全渗入粥中。' },
    { city: '泉州', name: '阿秋牛排店（湖心街总店）', type: '中式牛排', address: '丰泽区 湖心街中段（湖心菜市场斜对面）', desc: '在本地拥有极高的人气与极佳的口碑。中式炖牛排（带骨牛肋排）药膳味与咖喱风味平衡得极为完美，牛肉羹汤头姜丝给得足，非常暖胃。' },
    { city: '泉州', name: '阿波牛肉店（宝洲店）', type: '中式牛排', address: '丰泽区 宝洲路与乌洲路交叉口', desc: '本地老饕极为推崇的社区神店。牛肉羹的滑嫩程度和牛排的浓郁多汁在泉州老城名列前茅，一定要用牛排汤汁拌咸饭（加了香菇、五花肉、红葱头焖制的米饭）吃。' },
    { city: '泉州', name: '东兴牛肉店（庄府巷店）', type: '中式牛排', address: '鲤城区 庄府巷24号', desc: '传统老字号，他们的牛排香料味更传统、更含蓄，牛肉羹汤头姜丝给得足，非常暖胃。' },
    { city: '泉州', name: '阿泉全牛馆（泉州总店）', type: '牛肉羹/全牛宴', address: '鲤城区 兴贤路', desc: '如果想体验一顿完整的“全牛宴”，来这里准没错。牛舌、牛蹄、牛筋到牛杂汤，调味极其地道，全是闽南中药材的醇香。' },
    { city: '泉州', name: '后城面线糊', type: '面线糊', address: '鲤城区 百源路后城古玩街口', desc: '这家店的面线糊糊而不烂，汤汁用大骨和海鲜熬得极鲜甜。本地人最爱往里加刚炸好的醋肉和卤大肠，再配上一根刚出锅的油条传统吃法。' },
    { city: '泉州', name: '水门国仔面线糊（学府店）', type: '面线糊', address: '鲤城区 学府路与中山北路交叉口', desc: '代表性老字号，大骨与海鲜熬制的基础汤底极为鲜美。' },
    { city: '泉州', name: '罗记面线糊', type: '面线糊', address: '鲤城区 县后路', desc: '深受周边居民喜爱的社区面线糊店，每天早上都有许多老街坊在此排队。' }
  ];

  const plays = [
    { city: '广州', name: '广州塔（小蛮腰）', address: '海珠区 阅江西路222号（地铁直达）', desc: '全高604米，大湾区的绝对地标。中转时间短可以在塔下花城广场拍摄全景（夜景极佳）；时间充裕可上塔体验摩天轮。', avoid: '千万别在黄昏排队上塔，那是人流高峰；塔底拉客的合影摊贩别信，推销高价且拍得丑，自己广角仰拍更优。' },
    { city: '广州', name: '花城广场与珠江新城', address: '天河区 珠江新城CBD核心区', desc: '广州城市客厅，两侧是东塔西塔等摩天大楼。晚上可以沿着中轴线散步，欣赏绝美的珠江两岸灯光秀，现代感与赛博朋克风拉满。', avoid: '周边高端餐厅物价极高。如果吃正宗高性价比广式点心，别在珠江新城吃，去老城区（公园前、长寿路）的陶陶居、点都德老店或惠福东路。' },
    { city: '揭阳', name: '进贤门城楼', address: '榕城区 进贤门大道与环城正街交汇处', desc: '揭阳古城地标，始建于明代，是潮汕地区唯一保留的古城门。城楼建筑精巧，带有浓郁的岭南古典韵味，适合傍晚亮灯拍摄。', avoid: '城楼周边马路车流极大，电动车较乱。拍照注意安全，不要站到路中央。周边兜售塑料玩具的小贩较多，建议直接忽视。' },
    { city: '揭阳', name: '揭阳学宫（孔庙）', address: '榕城区 韩祠路中段', desc: '岭南地区规模最大、保存最完整的孔庙建筑群。红墙黄瓦，飞檐翘角，内部的木雕和石刻手艺极精湛，非常适合新中式出片。', avoid: '注意时间：每周一闭馆，平时下午5点停止入场。拒绝景区门外所谓的“野生导游”，会变相推销高价香火。' },
    { city: '潮州', name: '广济桥（湘子桥）', address: '湘桥区 广济门外', desc: '中国四大古桥之一，“十八梭船廿四洲”的启闭式浮桥奇观。下午拆船让大船通航，夜间有震撼的古桥灯光秀。', avoid: '没必要买票上桥（￥20），人挤人根本无法拍照。最佳免费机位在广济门城楼上或沿江长廊。看好8点左右的灯光秀，提早半小时去占位。' },
    { city: '潮州', name: '牌坊街', address: '湘桥区 太平路古城区内', desc: '古城中轴线，长近2公里，矗立22座明清石牌坊，两侧是南洋骑楼。', avoid: '绝对不要在主街买特产、吃正餐，90%都是游客定制店，价格高且不好吃。避开拉客的黄包车，会带进高价店消费。' },
    { city: '潮州', name: '开元寺', address: '湘桥区 开元路2号', desc: '粤东第一古刹，始建于唐代。屋顶上的非遗嵌瓷（彩色瓷片拼贴）精美绝伦。', avoid: '寺庙免费开放！不需要门票！门口有很多塞佛珠的老太太，千万不要接，接了会被索要功德钱。内有免费赠香处。' },
    { city: '汕头', name: '小公园历史文化街区', address: '金平区 升平路与国平路交汇处', desc: '中国唯一呈放射状格局的骑楼群，核心是中山亭和百货大楼。夜幕降临全街亮灯，复古年代感爆表。', avoid: '周边交通拥堵，单行道多。千万别打车直达中山亭，建议在【外马路】提早下车步行进入。旅拍流水线妆容防雷，建议自备复古服饰。' },
    { city: '汕头', name: '南澳岛', address: '南澳县（有环岛公交/可自驾）', desc: '国家级美丽海岛，拥有一条极唯美的环岛公路，沿途有长山尾红灯塔、三囱崖红白灯塔等，日落有梦幻新海诚般的色调。', avoid: '节假日切忌上午10点-下午3点进岛，大桥常堵三小时。租小电驴务必看清续航，有些山路陡。玩水上娱乐项目上车前必须录音说好价格，防宰。' },
    { city: '东山岛', name: '南门湾', address: '东山县 铜陵镇南门湾（《左耳》拍摄地）', desc: '一侧是错落有致的彩色闽南民居，一侧是月牙形的蔚蓝海湾，有海堤公路。', avoid: '海堤边的天台咖啡馆强制消费且难喝。顺着后山小巷直接走到【文公祠】前的观景台，不仅全景免费，而且视野更为开阔。' },
    { city: '东山岛', name: '苏峰山环岛路', address: '东山县 苏峰山风景区', desc: '建在悬崖边缘的蓝色梦幻公路，一边是悬崖峭壁，一边是万顷碧波。', avoid: '大路极窄，严禁停车拍照（交警驱赶），必须去专用观景台。山上风力极大，骑车必须戴头盔，不可单手操作。' },
    { city: '泉州', name: '西街与开元寺（泉州）', address: '鲤城区 西街', desc: '泉州保存最完整的古街区，尽头是开元寺。寺内有我国现存最高的仿木结构石塔：东西双塔。', avoid: '不要花钱去网红咖啡馆天台拍双塔。去【泉州影剧院】旁边的钟楼天桥，或西街免费的游客中心天台。主街小吃不地道，吃传统美食往内巷深处走。' },
    { city: '泉州', name: '洛阳桥', address: '洛江区 洛阳江水道上', desc: '中国古代著名海港大石桥，北宋时期的工程奇迹，采用独特的“筏形基础”和“养蛎固基”技术。', avoid: '桥长一公里无遮蔽。千万别在11点-15点暴晒时段去。建议下午5点左右前往，江风徐徐，夕阳余晖洒在桥石上极其壮丽。' }
  ];

  for (const item of eats) {
    await db
      .prepare(
        'INSERT INTO guide_items (category, city, name, type, address, desc, avoid, is_special, trip_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind('eat', item.city, item.name, item.type, item.address, item.desc, null, item.isSpecial ? 1 : 0, 'qianmin')
      .run();
  }

  for (const item of plays) {
    await db
      .prepare(
        'INSERT INTO guide_items (category, city, name, type, address, desc, avoid, is_special, trip_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind('play', item.city, item.name, null, item.address, item.desc, item.avoid, 0, 'qianmin')
      .run();
  }
}
