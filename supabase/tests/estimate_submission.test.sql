begin;
create extension if not exists pgtap with schema extensions;
select plan(3);
select ok(not has_function_privilege('anon', 'public.submit_estimate_request(uuid,text,jsonb,uuid,text[])', 'execute'), 'Anonymous cannot bypass submit validation');
select ok(not has_function_privilege('authenticated', 'public.submit_estimate_request(uuid,text,jsonb,uuid,text[])', 'execute'), 'Authenticated browser cannot bypass submit validation');
select ok(has_function_privilege('service_role', 'public.submit_estimate_request(uuid,text,jsonb,uuid,text[])', 'execute'), 'Trusted server can save atomically');
select * from finish();
rollback;
