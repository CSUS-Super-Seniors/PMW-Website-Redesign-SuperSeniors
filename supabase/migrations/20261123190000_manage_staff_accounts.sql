create function public.manage_staff_profile(
  p_actor_id uuid,
  p_target_id uuid,
  p_new_role text,
  p_remove boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_target_role text;
  v_target_status text;
  v_active_owners bigint;
  v_revoked_sessions integer := 0;
begin
  if p_actor_id is null or p_target_id is null then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  if p_remove is null or (p_remove and p_new_role is not null) or
     (not p_remove and
       (p_new_role is null or p_new_role not in ('owner', 'employee'))) then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  -- Serialize all staff mutations so concurrent demotions/removals cannot
  -- both pass the last-active-owner check.
  perform pg_catalog.pg_advisory_xact_lock(330294, 1);

  select role into v_actor_role
  from public.staff_profiles
  where id = p_actor_id and status = 'active'
  for update;

  if v_actor_role is distinct from 'owner' then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  select role, status into v_target_role, v_target_status
  from public.staff_profiles
  where id = p_target_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if p_actor_id = p_target_id and
     (p_remove or (p_new_role is not null and p_new_role <> 'owner')) then
    return jsonb_build_object('outcome', 'self_lockout');
  end if;

  if p_remove then
    if v_target_status = 'active' and v_target_role = 'owner' then
      select count(*) into v_active_owners
      from public.staff_profiles
      where role = 'owner' and status = 'active';

      if v_active_owners <= 1 then
        return jsonb_build_object('outcome', 'last_owner');
      end if;
    end if;

    update public.staff_profiles
    set status = 'inactive'
    where id = p_target_id;

    delete from auth.sessions where user_id = p_target_id;
    get diagnostics v_revoked_sessions = row_count;

    return jsonb_build_object(
      'outcome', 'removed',
      'revoked_sessions', v_revoked_sessions
    );
  end if;

  if v_target_status = 'active' and v_target_role = 'owner' and p_new_role = 'employee' then
    select count(*) into v_active_owners
    from public.staff_profiles
    where role = 'owner' and status = 'active';

    if v_active_owners <= 1 then
      return jsonb_build_object('outcome', 'last_owner');
    end if;
  end if;

  update public.staff_profiles
  set role = p_new_role
  where id = p_target_id;

  return jsonb_build_object('outcome', 'updated', 'role', p_new_role);
end;
$$;

-- Admin signOut requires the target user's JWT. Removing their Auth session rows
-- invalidates their refresh sessions; server requests also re-check staff status.
revoke all on function public.manage_staff_profile(uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.manage_staff_profile(uuid, uuid, text, boolean)
  to service_role;
