// دالة إنشاء "الحساب الفوري" (بلا بريد حقيقي): معرّف دخول + كلمة مرور.
// الاسم المعروض حرّ (عربي/مكرر مسموح)، أما المعرّف فيجب أن يكون فريداً.
//
// النشر:  supabase functions deploy clever-processor --no-verify-jwt
// ملاحظة: مفاتيح sb_publishable_* ليست JWT، لذلك يجب تعطيل Verify JWT لهذه الدالة،
// وإلا يرفضها Supabase بخطأ 401 قبل أن تعمل.
//
// الطلب:  { username?: string, password: string, name?: string }
// الرد:   { ok: true, username }  أو  { error } مع 400/409/500
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const BIDI = /[​-‏‪-‮⁦-⁩﻿]/g;
const rand8 = () => String(Math.floor(Math.random() * 1e8)).padStart(8, '0');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body: { username?: unknown; password?: unknown; name?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }

  const password = String(body.password ?? '');
  const name = String(body.name ?? '').replace(BIDI, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  let username = String(body.username ?? '').trim().toLowerCase();
  if (password.length < 8 || password.length > 72) return json({ error: 'invalid password' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const taken = async (u: string) => {
    const { data } = await admin.from('profiles').select('id').ilike('username', u).maybeSingle();
    return !!data;
  };

  if (username) {
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return json({ error: 'invalid username' }, 400);
    if (await taken(username)) return json({ error: 'username taken' }, 409);
  } else {
    // معرّف تلقائي فريد
    for (let i = 0; i < 8 && !username; i++) {
      const c = 'u' + rand8();
      if (!(await taken(c))) username = c;
    }
    if (!username) return json({ error: 'could not generate username' }, 500);
  }

  // إنشاء المستخدم مؤكَّداً (لا يحتاج بريداً حقيقياً). الـ Trigger في setup.sql ينشئ الملف الشخصي.
  const { data, error } = await admin.auth.admin.createUser({
    email: `${username}@lmlm.local`,
    password,
    email_confirm: true,
    user_metadata: { username, name: name || username },
  });
  if (error || !data.user) {
    const dup = /already|registered|exists|taken|23505/i.test(error?.message ?? '');
    return json({ error: dup ? 'username taken' : (error?.message ?? 'create failed') }, dup ? 409 : 400);
  }

  // احتياطي إن لم يكن الـ Trigger مثبّتاً: نضمن وجود الملف الشخصي بالاسم المختار
  const { error: pe } = await admin.from('profiles')
    .upsert({ id: data.user.id, username, name: name || username }, { onConflict: 'id' });
  if (pe) {
    await admin.auth.admin.deleteUser(data.user.id); // لا نترك حساباً بلا ملف
    return json({ error: 'profile: ' + pe.message }, pe.code === '23505' ? 409 : 500);
  }
  return json({ ok: true, username });
});
