import { 
  hashPassword, 
  generateSalt, 
  signJWT, 
  getAuthUser, 
  readRequestBody, 
  corsHeaders 
} from './_utils.js';

export async function onRequestOptions() {
  return new Response(null, {
    headers: corsHeaders
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

  try {
    if (request.method === 'POST' && action === 'register') {
      const body = await readRequestBody(request);
      const { username, password, display_name } = body;
      
      if (!username || !password) {
        return json({ error: '用户名和密码必填' }, 400);
      }
      
      // Check if user exists
      const existingUser = await env.DB.prepare('SELECT id FROM users WHERE username = ?')
        .bind(username).first();
        
      if (existingUser) {
        return json({ error: '用户名已存在' }, 400);
      }
      
      const salt = generateSalt();
      const password_hash = await hashPassword(password, salt);
      
      const result = await env.DB.prepare(
        'INSERT INTO users (username, password_hash, salt, display_name) VALUES (?, ?, ?, ?) RETURNING id'
      ).bind(username, password_hash, salt, display_name || username).first();
      
      return json({ success: true, userId: result.id });
    }

    if (request.method === 'POST' && action === 'init_admin') {
      // 检查 admin 是否已存在
      let adminUser = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind('admin').first();
      
      if (!adminUser) {
        // 创建 admin
        const salt = generateSalt();
        const password_hash = await hashPassword('yyx@781202', salt);
        const result = await env.DB.prepare(
          'INSERT INTO users (username, password_hash, salt, display_name) VALUES (?, ?, ?, ?) RETURNING id'
        ).bind('admin', password_hash, salt, '管理员').first();
        adminUser = { id: result.id };
      }
      
      // 迁移无 owner 的数据给 admin
      const updateResult = await env.DB.prepare('UPDATE trips SET owner_id = ? WHERE owner_id IS NULL')
        .bind(adminUser.id).run();
        
      return json({ 
        success: true, 
        message: 'Admin initialized and data migrated', 
        migrated_trips: updateResult.meta.changes 
      });
    }

    if (request.method === 'POST' && action === 'login') {
      const body = await readRequestBody(request);
      const { username, password } = body;
      
      if (!username || !password) {
        return json({ error: '用户名和密码必填' }, 400);
      }
      
      const user = await env.DB.prepare('SELECT id, username, password_hash, salt, display_name FROM users WHERE username = ?')
        .bind(username).first();
        
      if (!user) {
        return json({ error: '用户名或密码错误' }, 401);
      }
      
      const inputHash = await hashPassword(password, user.salt);
      if (inputHash !== user.password_hash) {
        return json({ error: '用户名或密码错误' }, 401);
      }
      
      // Create JWT
      const secret = env.JWT_SECRET || 'fallback_secret_for_dev_only';
      const exp = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days
      
      const token = await signJWT({
        userId: user.id,
        username: user.username,
        displayName: user.display_name,
        exp: exp
      }, secret);
      
      return json({ 
        success: true, 
        token, 
        user: { 
          id: user.id, 
          username: user.username, 
          displayName: user.display_name 
        } 
      });
    }

    if (request.method === 'GET' && action === 'me') {
      const user = await getAuthUser(request, env);
      if (!user) {
        return json({ error: '未登录或登录已过期' }, 401);
      }
      
      // Fetch latest user info just in case
      const dbUser = await env.DB.prepare('SELECT id, username, display_name FROM users WHERE id = ?')
        .bind(user.userId).first();
        
      if (!dbUser) {
        return json({ error: '用户不存在' }, 404);
      }
      
      return json({
        user: {
          id: dbUser.id,
          username: dbUser.username,
          displayName: dbUser.display_name
        }
      });
    }

    return json({ error: '未知的操作' }, 404);

  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
