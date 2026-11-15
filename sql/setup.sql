-- =====================================================================
--  LMLM — إعداد قاعدة بيانات Supabase الكامل
--  الاستخدام: Supabase → SQL Editor → New query → الصق الملف كاملاً → Run
--  آمن للتنفيذ أكثر من مرة (idempotent) ولا يحذف بيانات المستخدمين.
--
--  ما يفعله:
--   1) ينشئ/يُكمل الجداول: الملفات الشخصية، المحادثات، الرسائل، التفاعلات...
--   2) يفعّل Row Level Security ويعيد بناء السياسات بشكل صارم
--   3) ينشئ ملفاً شخصياً تلقائياً عند كل تسجيل (Trigger) بمعرّف فريد تلقائي
--   4) الاسم المعروض حرّ (عربي، مكرّر مسموح)، والتمييز بين الحسابات بالبريد/المعرّف
--   5) دوال RPC: إنشاء محادثة، بحث بالهاتف/البريد، ملخص المحادثات، حذف الحساب
--   6) حاوية التخزين media والنشر اللحظي (Realtime)
--
--  تنبيه: يحذف السياسات القديمة على جداول LMLM فقط (لا يمس جداول أخرى)
--  ثم ينشئ سياسات جديدة.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) الجداول
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null,                 -- المعرّف الفريد (@handle) ثابت بعد الإنشاء
  name        text,                          -- الاسم المعروض: حرّ وغير فريد
  photo       text,
  bio         text,
  city        text,
  link        text,
  birth       date,                          -- قديم: صار تاريخ الميلاد في profile_private
  last_seen   timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.profiles add column if not exists name       text;
alter table public.profiles add column if not exists photo      text;
alter table public.profiles add column if not exists bio        text;
alter table public.profiles add column if not exists city       text;
alter table public.profiles add column if not exists link       text;
alter table public.profiles add column if not exists birth      date;
alter table public.profiles add column if not exists last_seen  timestamptz;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

create table if not exists public.profile_private (
  id            uuid primary key references public.profiles(id) on delete cascade,
  email         text,
  phone         text,
  birth         date,
  discoverable  boolean not null default true,  -- السماح بالعثور عليّ بالبريد/الهاتف
  updated_at    timestamptz not null default now()
);
alter table public.profile_private add column if not exists email        text;
alter table public.profile_private add column if not exists phone        text;
alter table public.profile_private add column if not exists birth        date;
alter table public.profile_private add column if not exists discoverable boolean not null default true;
alter table public.profile_private add column if not exists updated_at   timestamptz not null default now();

create table if not exists public.chats (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'direct',
  name        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
alter table public.chats add column if not exists kind       text not null default 'direct';
alter table public.chats add column if not exists name       text;
alter table public.chats add column if not exists created_by uuid default auth.uid();
alter table public.chats add column if not exists created_at timestamptz not null default now();

create table if not exists public.chat_members (
  chat_id    uuid not null references public.chats(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member',
  joined_at  timestamptz not null default now(),
  primary key (chat_id, user_id)
);
alter table public.chat_members add column if not exists role      text not null default 'member';
alter table public.chat_members add column if not exists joined_at timestamptz not null default now();

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  chat_id     uuid not null references public.chats(id) on delete cascade,
  sender_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind        text not null default 'text',
  body        text,
  media_url   text,
  reply_to    uuid references public.messages(id) on delete set null,
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);
alter table public.messages add column if not exists kind       text not null default 'text';
alter table public.messages add column if not exists body       text;
alter table public.messages add column if not exists media_url  text;
alter table public.messages add column if not exists reply_to   uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists edited_at  timestamptz;

create table if not exists public.message_reactions (
  message_id  uuid not null references public.messages(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table if not exists public.chat_reads (
  chat_id       uuid not null references public.chats(id) on delete cascade,
  user_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create table if not exists public.user_blocks (
  blocker     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker, blocked)
);

create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter       uuid default auth.uid() references public.profiles(id) on delete set null,
  reported_user  uuid references public.profiles(id) on delete set null,
  reason         text,
  created_at     timestamptz not null default now()
);
alter table public.reports add column if not exists reporter      uuid default auth.uid();
alter table public.reports add column if not exists reported_user uuid;
alter table public.reports add column if not exists reason        text;
alter table public.reports add column if not exists created_at    timestamptz not null default now();

create table if not exists public.contacts (
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  contact_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (owner_id, contact_id)
);

-- ---------------------------------------------------------------------
-- 2) قيود سلامة البيانات (NOT VALID: لا تفحص الصفوف القديمة ولا تفشل بسببها)
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'lmlm_profiles_chk') then
    alter table public.profiles add constraint lmlm_profiles_chk check (
      username ~ '^[A-Za-z0-9_]{3,20}$'
      and char_length(coalesce(name, '')) <= 60
      and char_length(coalesce(bio,  '')) <= 300
      and char_length(coalesce(city, '')) <= 60
      and char_length(coalesce(link, '')) <= 300
      and (link is null or link = '' or link ~* '^https?://')
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lmlm_chats_kind_chk') then
    alter table public.chats add constraint lmlm_chats_kind_chk check (kind in ('direct', 'group')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lmlm_messages_chk') then
    alter table public.messages add constraint lmlm_messages_chk check (
      kind in ('text', 'image', 'video', 'voice')
      and char_length(coalesce(body, '')) <= 4000
      and (body is not null or media_url is not null)
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lmlm_reactions_chk') then
    alter table public.message_reactions add constraint lmlm_reactions_chk check (char_length(emoji) between 1 and 16) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lmlm_contacts_chk') then
    alter table public.contacts add constraint lmlm_contacts_chk check (owner_id <> contact_id) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3) الفهارس
-- ---------------------------------------------------------------------
-- المعرّف فريد بغض النظر عن حالة الأحرف. إن وُجد تكرار قديم يُكتفى بتنبيه.
do $$ begin
  create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));
exception when others then
  raise notice 'تعذّر إنشاء فهرس المعرّفات الفريدة (يوجد تكرار؟): %', sqlerrm;
end $$;
create index if not exists profiles_name_idx            on public.profiles (lower(name));
create index if not exists messages_chat_created_idx    on public.messages (chat_id, created_at desc);
create index if not exists chat_members_user_idx        on public.chat_members (user_id);
create index if not exists reactions_message_idx        on public.message_reactions (message_id);
create index if not exists profile_private_email_idx    on public.profile_private (lower(email));
create index if not exists contacts_owner_idx           on public.contacts (owner_id);

-- ---------------------------------------------------------------------
-- 4) ترحيل تاريخ الميلاد القديم إلى الجدول الخاص (لا يراه غير صاحبه)
-- ---------------------------------------------------------------------
insert into public.profile_private (id, birth)
select id, birth from public.profiles where birth is not null
on conflict (id) do update set birth = coalesce(public.profile_private.birth, excluded.birth);

-- ---------------------------------------------------------------------
-- 5) دوال مساعدة (SECURITY DEFINER لتجنب تداخل سياسات RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_chat_member(cid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.chat_members where chat_id = cid and user_id = auth.uid());
$$;

create or replace function public.msg_chat_member(mid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.messages m
    join public.chat_members cm on cm.chat_id = m.chat_id and cm.user_id = auth.uid()
    where m.id = mid);
$$;

-- يحق لي الإرسال إن كنت عضواً ولم يحظرني الطرف الآخر (في المحادثات الخاصة)
create or replace function public.can_send(cid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_chat_member(cid) and not exists (
    select 1
    from public.chats c
    join public.chat_members m on m.chat_id = c.id and m.user_id <> auth.uid()
    join public.user_blocks b on b.blocker = m.user_id and b.blocked = auth.uid()
    where c.id = cid and c.kind = 'direct');
$$;

-- هل المعرّف متاح؟ (يعمل للزائر قبل التسجيل ولا يكشف أي بيانات أخرى)
create or replace function public.username_available(u text)
returns boolean language sql security definer stable set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(btrim(u)));
$$;

-- ---------------------------------------------------------------------
-- 6) إنشاء الملف الشخصي تلقائياً عند كل تسجيل
--    • الاسم المعروض من user_metadata.name (حرّ، عربي، يتكرر)
--    • المعرّف من user_metadata.username إن كان صالحاً ومتاحاً، وإلا يُولَّد تلقائياً
--    • الحسابات الفورية (…@lmlm.local): المعرّف = اسم الدخول
-- ---------------------------------------------------------------------
create or replace function public.ensure_profile_row(uid uuid, mail text, meta jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  want  text := lower(btrim(coalesce(meta ->> 'username', '')));
  disp  text := btrim(coalesce(meta ->> 'name', ''));
  uname text;
  tries int := 0;
begin
  if exists (select 1 from public.profiles where id = uid) then return; end if;

  if mail is not null and lower(mail) like '%@lmlm.local' then
    want := lower(split_part(mail, '@', 1));
  end if;
  if want !~ '^[a-z0-9_]{3,20}$' then want := ''; end if;

  uname := want;
  if uname = '' then
    uname := 'u' || lpad((floor(random() * 100000000))::bigint::text, 8, '0');
  end if;
  while exists (select 1 from public.profiles where lower(username) = uname) and tries < 30 loop
    tries := tries + 1;
    uname := left(case when want <> '' then want else 'u' end, 12)
             || lpad((floor(random() * 100000000))::bigint::text, 8, '0');
  end loop;

  if disp = '' then disp := uname; end if;
  insert into public.profiles (id, username, name) values (uid, uname, left(disp, 40))
  on conflict (id) do nothing;

  if mail is not null and lower(mail) not like '%@lmlm.local' then
    insert into public.profile_private (id, email) values (uid, lower(mail))
    on conflict (id) do nothing;
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- حساب فوري بمعرّف محجوز: نفشل الإنشاء كاملاً حتى لا يختلف المعرّف عن اسم الدخول
  if new.email is not null and lower(new.email) like '%@lmlm.local'
     and exists (select 1 from public.profiles
                 where lower(username) = lower(split_part(new.email, '@', 1))) then
    raise exception 'username taken' using errcode = '23505';
  end if;
  begin
    perform public.ensure_profile_row(new.id, new.email, coalesce(new.raw_user_meta_data, '{}'::jsonb));
  exception when others then
    -- لا نمنع التسجيل: التطبيق ينشئ الملف الشخصي احتياطياً عند أول دخول
    raise warning 'handle_new_user: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists lmlm_on_auth_user_created on auth.users;
create trigger lmlm_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ملفات شخصية للحسابات الموجودة مسبقاً بلا ملف
do $$
declare r record;
begin
  for r in select u.id, u.email, u.raw_user_meta_data as meta
           from auth.users u
           where not exists (select 1 from public.profiles p where p.id = u.id)
  loop
    perform public.ensure_profile_row(r.id, r.email, coalesce(r.meta, '{}'::jsonb));
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7) دوال RPC يستدعيها التطبيق
-- ---------------------------------------------------------------------
drop function if exists public.create_chat(text, text, uuid[]);
create function public.create_chat(p_kind text, p_name text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  cid    uuid;
  others uuid[];
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_kind not in ('direct', 'group') then raise exception 'bad kind'; end if;

  select array_agg(distinct x) into others
  from unnest(coalesce(p_members, '{}'::uuid[])) as x
  where x is not null and x <> uid and exists (select 1 from public.profiles where id = x);

  if others is null or array_length(others, 1) is null then raise exception 'no members'; end if;

  if p_kind = 'direct' then
    if array_length(others, 1) <> 1 then raise exception 'direct chat needs exactly one member'; end if;
    select c.id into cid
    from public.chats c
    where c.kind = 'direct'
      and exists (select 1 from public.chat_members a where a.chat_id = c.id and a.user_id = uid)
      and exists (select 1 from public.chat_members b where b.chat_id = c.id and b.user_id = others[1])
    limit 1;
    if cid is not null then return cid; end if;
  else
    if array_length(others, 1) > 255 then raise exception 'too many members'; end if;
    if btrim(coalesce(p_name, '')) = '' then raise exception 'group name required'; end if;
  end if;

  insert into public.chats (kind, name, created_by)
  values (p_kind, case when p_kind = 'group' then left(btrim(p_name), 60) end, uid)
  returning id into cid;

  insert into public.chat_members (chat_id, user_id, role) values (cid, uid, 'owner');
  insert into public.chat_members (chat_id, user_id) select cid, x from unnest(others) as x;
  return cid;
end $$;

drop function if exists public.find_by_phone(text);
create function public.find_by_phone(p_phone text)
returns table (id uuid, username text, name text, photo text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.name, p.photo
  from public.profile_private pp
  join public.profiles p on p.id = pp.id
  where auth.uid() is not null
    and pp.discoverable
    and p.id <> auth.uid()
    -- نقارن الأرقام فقط وبلا أصفار البداية، فيتطابق +963… مع 00963…
    and length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) >= 6
    and regexp_replace(regexp_replace(coalesce(pp.phone, ''), '[^0-9]', '', 'g'), '^0+', '')
        = regexp_replace(regexp_replace(p_phone, '[^0-9]', '', 'g'), '^0+', '')
  limit 5;
$$;

drop function if exists public.find_by_email(text);
create function public.find_by_email(p_email text)
returns table (id uuid, username text, name text, photo text)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.name, p.photo
  from public.profile_private pp
  join public.profiles p on p.id = pp.id
  where auth.uid() is not null
    and pp.discoverable
    and p.id <> auth.uid()
    and length(btrim(coalesce(p_email, ''))) >= 5
    and lower(pp.email) = lower(btrim(p_email))
  limit 1;
$$;

-- ملخص المحادثات: آخر رسالة وعدد غير المقروء لكل محادثة في استعلام واحد
drop function if exists public.chat_overview();
create function public.chat_overview()
returns table (chat_id uuid, last_id uuid, last_kind text, last_body text, last_media_url text,
               last_sender uuid, last_at timestamptz, unread bigint)
language sql security definer stable set search_path = public as $$
  select m.chat_id, lm.id, lm.kind, lm.body, lm.media_url, lm.sender_id, lm.created_at,
         (select count(*) from public.messages x
           where x.chat_id = m.chat_id
             and x.sender_id <> auth.uid()
             and x.created_at > coalesce((select r.last_read_at from public.chat_reads r
                                          where r.chat_id = m.chat_id and r.user_id = auth.uid()),
                                         'epoch'::timestamptz)) as unread
  from public.chat_members m
  left join lateral (select l.* from public.messages l
                     where l.chat_id = m.chat_id order by l.created_at desc limit 1) lm on true
  where m.user_id = auth.uid();
$$;

-- حذف الحساب نهائياً (الملف الشخصي والرسائل والجهات تُحذف بالتسلسل)
drop function if exists public.delete_my_account();
create function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  delete from public.profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- 8) RLS: نحذف السياسات القديمة على جداول LMLM ثم نبني الجديدة
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public'
             and tablename in ('profiles','profile_private','chats','chat_members','messages',
                               'message_reactions','chat_reads','user_blocks','reports','contacts')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.profiles          enable row level security;
alter table public.profile_private   enable row level security;
alter table public.chats             enable row level security;
alter table public.chat_members      enable row level security;
alter table public.messages          enable row level security;
alter table public.message_reactions enable row level security;
alter table public.chat_reads        enable row level security;
alter table public.user_blocks       enable row level security;
alter table public.reports           enable row level security;
alter table public.contacts          enable row level security;

-- الملفات الشخصية: يراها كل مستخدم مسجّل، ويعدّل صاحبها ملفه فقط
create policy lmlm_profiles_select on public.profiles for select to authenticated using (true);
create policy lmlm_profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy lmlm_profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- البيانات الخاصة: لصاحبها فقط
create policy lmlm_private_all on public.profile_private for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- المحادثات والأعضاء: للأعضاء فقط (الإنشاء عبر create_chat)
create policy lmlm_chats_select on public.chats for select to authenticated using (public.is_chat_member(id));
create policy lmlm_members_select on public.chat_members for select to authenticated using (public.is_chat_member(chat_id));
create policy lmlm_members_leave on public.chat_members for delete to authenticated using (user_id = auth.uid());

-- الرسائل
create policy lmlm_messages_select on public.messages for select to authenticated using (public.is_chat_member(chat_id));
create policy lmlm_messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.can_send(chat_id));
create policy lmlm_messages_update on public.messages for update to authenticated
  using (sender_id = auth.uid()) with check (sender_id = auth.uid());
create policy lmlm_messages_delete on public.messages for delete to authenticated using (sender_id = auth.uid());

-- التفاعلات
create policy lmlm_reactions_select on public.message_reactions for select to authenticated using (public.msg_chat_member(message_id));
create policy lmlm_reactions_insert on public.message_reactions for insert to authenticated
  with check (user_id = auth.uid() and public.msg_chat_member(message_id));
create policy lmlm_reactions_delete on public.message_reactions for delete to authenticated using (user_id = auth.uid());

-- القراءة
create policy lmlm_reads_select on public.chat_reads for select to authenticated using (public.is_chat_member(chat_id));
create policy lmlm_reads_insert on public.chat_reads for insert to authenticated
  with check (user_id = auth.uid() and public.is_chat_member(chat_id));
create policy lmlm_reads_update on public.chat_reads for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- الحظر والبلاغات وجهات الاتصال
create policy lmlm_blocks_select on public.user_blocks for select to authenticated using (blocker = auth.uid());
create policy lmlm_blocks_insert on public.user_blocks for insert to authenticated with check (blocker = auth.uid());
create policy lmlm_blocks_delete on public.user_blocks for delete to authenticated using (blocker = auth.uid());
create policy lmlm_reports_insert on public.reports for insert to authenticated with check (reporter = auth.uid());
create policy lmlm_contacts_all on public.contacts for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- 9) الصلاحيات (Grants): أقل ما يلزم، وبالأعمدة حيث يهم
--    • الزائر غير المسجّل لا يصل لأي جدول
--    • المعرّف username والبريد وتاريخ الميلاد لا تتغير/لا تُقرأ من الآخرين
--    • لا يمكن تزوير sender_id أو created_at للرسائل
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.profile_private, public.chats, public.chat_members,
              public.messages, public.message_reactions, public.chat_reads, public.user_blocks,
              public.reports, public.contacts from anon, authenticated;

grant select (id, username, name, photo, bio, city, link, last_seen, created_at) on public.profiles to authenticated;
grant insert (id, username, name)                                                on public.profiles to authenticated;
grant update (name, photo, bio, city, link, last_seen)                           on public.profiles to authenticated;

grant select, insert, update, delete on public.profile_private to authenticated;

grant select on public.chats to authenticated;
grant select, delete on public.chat_members to authenticated;

grant select, delete on public.messages to authenticated;
grant insert (id, chat_id, kind, body, media_url, reply_to) on public.messages to authenticated;
grant update (body, edited_at) on public.messages to authenticated;

grant select, insert, delete on public.message_reactions to authenticated;
grant select, insert, update on public.chat_reads to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
grant insert (reported_user, reason) on public.reports to authenticated;
grant select, insert, delete on public.contacts to authenticated;

revoke all on function public.is_chat_member(uuid)             from public;
revoke all on function public.msg_chat_member(uuid)            from public;
revoke all on function public.can_send(uuid)                   from public;
revoke all on function public.ensure_profile_row(uuid, text, jsonb) from public;
revoke all on function public.handle_new_user()                from public;
revoke all on function public.username_available(text)         from public;
revoke all on function public.create_chat(text, text, uuid[])  from public;
revoke all on function public.find_by_phone(text)              from public;
revoke all on function public.find_by_email(text)              from public;
revoke all on function public.chat_overview()                  from public;
revoke all on function public.delete_my_account()              from public;

grant execute on function public.is_chat_member(uuid)            to authenticated;
grant execute on function public.msg_chat_member(uuid)           to authenticated;
grant execute on function public.can_send(uuid)                  to authenticated;
grant execute on function public.username_available(text)        to anon, authenticated;
grant execute on function public.create_chat(text, text, uuid[]) to authenticated;
grant execute on function public.find_by_phone(text)             to authenticated;
grant execute on function public.find_by_email(text)             to authenticated;
grant execute on function public.chat_overview()                 to authenticated;
grant execute on function public.delete_my_account()             to authenticated;

-- ---------------------------------------------------------------------
-- 10) التخزين: حاوية media عامة القراءة، والرفع داخل مجلد المستخدم فقط
--     بامتدادات صور/صوت/فيديو معروفة وحد أقصى 25 ميغابايت
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 26214400)
on conflict (id) do update set public = true, file_size_limit = 26214400;

drop policy if exists lmlm_media_insert on storage.objects;
drop policy if exists lmlm_media_delete on storage.objects;
drop policy if exists lmlm_media_select on storage.objects;

create policy lmlm_media_select on storage.objects for select to authenticated
  using (bucket_id = 'media');
create policy lmlm_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~* '\.(jpe?g|png|webp|gif|mp4|webm|mov|m4a|mp3|ogg|oga|wav|aac)$'
  );
create policy lmlm_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- 11) النشر اللحظي (Realtime): يحترم سياسات RLS فلا يصل الحدث إلا للأعضاء
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages', 'message_reactions', 'chat_reads'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- تم. اختبر من التطبيق: إنشاء حساب ثم محادثة ثم إرسال رسالة.
