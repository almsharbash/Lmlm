// دالة إنشاء "الحساب الفوري" (اسم مستخدم + كلمة مرور بلا بريد).
// النشر:  supabase functions deploy clever-processor --no-verify-jwt
// ملاحظة: مفاتيح sb_publishable_* ليست JWT، لذلك يجب تعطيل Verify JWT لهذه الدالة،
// وإلا يرفضها Supabase بخطأ 401 قبل أن تعمل.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body: { username?: unknown; password?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }

  const username = String(body.username ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return json({ error: 'invalid username' }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: 'invalid password' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // اسم محجوز؟
  const { data: taken } = await admin.from('profiles').select('id').ilike('username', username).maybeSingle();
  if (taken) return json({ error: 'username taken' }, 409);

  // إنشاء المستخدم مؤكَّداً (لا يحتاج بريداً حقيقياً)
  const { data, error } = await admin.auth.admin.createUser({
    email: `${username}@lmlm.local`,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error || !data.user) {
    const dup = /already|registered|exists/i.test(error?.message ?? '');
    return json({ error: dup ? 'username taken' : (error?.message ?? 'create failed') }, dup ? 409 : 400);
  }

  // الملف الشخصي (وإن وُجد trigger يفعل ذلك فالـ upsert آمن)
  const { error: pe } = await admin.from('profiles')
    .upsert({ id: data.user.id, username, name: username }, { onConflict: 'id' });
  if (pe) {
    await admin.auth.admin.deleteUser(data.user.id); // لا نترك حساباً بلا ملف
    return json({ error: 'profile: ' + pe.message }, pe.code === '23505' ? 409 : 500);
  }
  return json({ ok: true });
});
