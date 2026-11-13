-- Preserve existing non-billing access; purchased workspaces use their latest snapshot.
alter function public.reserve_ai_usage(uuid,text,text,text,integer,integer) rename to reserve_ai_usage_before_billing;
revoke all on function public.reserve_ai_usage_before_billing(uuid,text,text,text,integer,integer) from public,anon,authenticated,service_role;
create function public.reserve_ai_usage(p_id uuid,p_brand_id text,p_channel text,p_model text,p_reserved_tokens integer,p_global_max_tokens integer)
returns text language plpgsql security definer set search_path=public as $$
declare purchased_features jsonb; begin
 select features into purchased_features from public.billing_orders
 where brand_id=p_brand_id and status='activated' order by activated_at desc,id desc limit 1;
 if found and not (purchased_features ? p_channel) then return 'channel_not_in_plan'; end if;
 return public.reserve_ai_usage_before_billing(p_id,p_brand_id,p_channel,p_model,p_reserved_tokens,p_global_max_tokens);
end $$;
revoke all on function public.reserve_ai_usage(uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.reserve_ai_usage(uuid,text,text,text,integer,integer) to service_role;
