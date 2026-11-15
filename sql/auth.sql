-- إعداد التسجيل وتسجيل الدخول (آمن للتنفيذ أكثر من مرة).
-- نفّذه في Supabase → SQL Editor → New query.

-- 1) أسماء المستخدمين فريدة بغض النظر عن حالة الأحرف.
--    إن فشل الأمر بسبب تكرار موجود، اعرض التكرارات أولاً:
--    select lower(username), count(*) from public.profiles group by 1 having count(*) > 1;
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

-- 2) فحص توفر الاسم قبل التسجيل (يعمل حتى للزائر غير المسجّل ولا يكشف أي بيانات أخرى).
create or replace function public.username_available(u text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(u));
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
