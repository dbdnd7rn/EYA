-- Server-authoritative pricing foundation for Food/Marketplace checkout.
-- Existing Marketplace doorstep orders consistently use MWK 2,500. Food has
-- no live order history proving a doorstep fee, so that value remains unset
-- and fails closed until explicitly configured.

create table if not exists public.commerce_checkout_controls (
  channel text primary key check (channel in ('market','food')),
  service_fee_bps integer not null default 300 check (service_fee_bps between 0 and 5000),
  doorstep_delivery_fee_mwk numeric(14,2),
  status text not null default 'active' check (status in ('active','frozen')),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id)
);

alter table public.commerce_checkout_controls enable row level security;
revoke all privileges on table public.commerce_checkout_controls from anon, authenticated;
grant select, insert, update, delete on table public.commerce_checkout_controls to service_role;

insert into public.commerce_checkout_controls(channel, service_fee_bps, doorstep_delivery_fee_mwk, status)
values
  ('market', 300, 2500, 'active'),
  ('food', 300, null, 'active')
on conflict (channel) do nothing;

create or replace function public.quote_campus_market_checkout(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_vendor_id uuid;
  v_channel text;
  v_delivery_mode text;
  v_lines jsonb;
  v_line jsonb;
  v_item public.catalog_items%rowtype;
  v_item_id uuid;
  v_quantity integer;
  v_unit_price numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_service_fee numeric(14,2) := 0;
  v_delivery_fee numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_controls public.commerce_checkout_controls%rowtype;
  v_normalized_lines jsonb := '[]'::jsonb;
  v_food_customization jsonb;
  v_selection_map jsonb;
  v_marker text := '[[eya:food-menu]]';
  v_marker_pos integer;
  v_menu_text text;
  v_menu jsonb;
  v_sections jsonb;
  v_section jsonb;
  v_section_id text;
  v_section_mode text;
  v_section_required boolean;
  v_selected jsonb;
  v_selected_id text;
  v_option jsonb;
  v_option_found boolean;
  v_selected_count integer;
  v_delta numeric(14,2);
  v_selected_names text[];
begin
  if p_order is null or jsonb_typeof(p_order) <> 'object' then
    raise exception 'Checkout order must be a JSON object.';
  end if;

  begin
    v_vendor_id := nullif(trim(p_order->>'vendor_id'),'')::uuid;
  exception when others then
    raise exception 'Checkout vendor_id is invalid.';
  end;
  if v_vendor_id is null then raise exception 'Checkout vendor_id is required.'; end if;

  v_channel := lower(trim(coalesce(p_order->>'channel','')));
  if v_channel not in ('market','food') then raise exception 'Checkout channel is invalid.'; end if;

  v_delivery_mode := lower(trim(coalesce(p_order->>'delivery_mode','pickup')));
  if v_delivery_mode not in ('pickup','doorstep') then raise exception 'Checkout delivery mode is invalid.'; end if;

  select * into v_controls
  from public.commerce_checkout_controls
  where channel = v_channel;
  if not found or v_controls.status <> 'active' then
    raise exception 'Checkout is not available for this channel.';
  end if;

  if v_delivery_mode = 'pickup' then
    v_delivery_fee := 0;
  else
    if v_controls.doorstep_delivery_fee_mwk is null then
      raise exception 'Doorstep delivery pricing is not configured for this channel.';
    end if;
    v_delivery_fee := v_controls.doorstep_delivery_fee_mwk;
  end if;

  v_lines := coalesce(p_order->'lines','[]'::jsonb);
  if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) < 1 or jsonb_array_length(v_lines) > 25 then
    raise exception 'Checkout must include between 1 and 25 line items.';
  end if;

  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    if jsonb_typeof(v_line) <> 'object' then raise exception 'Checkout line item is invalid.'; end if;

    begin
      v_item_id := nullif(trim(v_line->>'item_id'),'')::uuid;
    exception when others then
      raise exception 'Checkout item_id is invalid.';
    end;

    begin
      v_quantity := (v_line->>'quantity')::integer;
    exception when others then
      raise exception 'Checkout quantity must be a whole number.';
    end;
    if v_quantity < 1 or v_quantity > 99 then
      raise exception 'Checkout quantity must be between 1 and 99.';
    end if;

    select * into v_item
    from public.catalog_items
    where id = v_item_id and is_active = true;
    if not found then raise exception 'A checkout item is unavailable.'; end if;
    if v_item.vendor_id <> v_vendor_id then raise exception 'All checkout items must belong to the selected vendor.'; end if;
    if v_item.channel::text <> v_channel then raise exception 'A checkout item does not match the selected channel.'; end if;

    v_unit_price := greatest(round(coalesce(v_item.price_mwk,0)),0);
    v_food_customization := coalesce(v_line->'food_customization','{}'::jsonb);

    if v_channel = 'food' then
      v_marker_pos := strpos(coalesce(v_item.description,''), v_marker);
      if v_marker_pos > 0 then
        v_menu_text := btrim(substr(coalesce(v_item.description,''), v_marker_pos + length(v_marker)));
        begin
          v_menu := v_menu_text::jsonb;
        exception when others then
          raise exception 'Food item pricing configuration is invalid.';
        end;
        v_sections := coalesce(v_menu->'sections','[]'::jsonb);
        if jsonb_typeof(v_sections) <> 'array' then raise exception 'Food item pricing configuration is invalid.'; end if;
        v_selection_map := coalesce(v_food_customization->'selection_map','{}'::jsonb);
        if jsonb_typeof(v_selection_map) <> 'object' then raise exception 'Food selection is invalid.'; end if;
        v_selected_names := array[]::text[];

        for v_section in select value from jsonb_array_elements(v_sections)
        loop
          v_section_id := nullif(trim(v_section->>'id'),'');
          if v_section_id is null then raise exception 'Food item section is invalid.'; end if;
          v_section_mode := case when lower(v_section->>'selection')='multiple' then 'multiple' else 'single' end;
          v_section_required := coalesce((v_section->>'required')::boolean,false);
          v_selected := coalesce(v_selection_map->v_section_id,'[]'::jsonb);
          if jsonb_typeof(v_selected) <> 'array' then raise exception 'Food selection is invalid.'; end if;

          select count(distinct value) into v_selected_count
          from jsonb_array_elements_text(v_selected);
          if v_section_mode='single' and v_selected_count > 1 then
            raise exception 'Only one option may be selected for a single-choice food section.';
          end if;
          if v_section_required and v_selected_count = 0 then
            raise exception 'A required food option is missing.';
          end if;

          for v_selected_id in select distinct value from jsonb_array_elements_text(v_selected)
          loop
            v_option_found := false;
            for v_option in select value from jsonb_array_elements(coalesce(v_section->'options','[]'::jsonb))
            loop
              if v_option->>'id' = v_selected_id then
                v_option_found := true;
                begin
                  v_delta := greatest(round(coalesce((v_option->>'priceDelta')::numeric,0)),0);
                exception when others then
                  raise exception 'Food option price is invalid.';
                end;
                v_unit_price := v_unit_price + v_delta;
                v_selected_names := array_append(v_selected_names, coalesce(nullif(trim(v_option->>'name'),''),v_selected_id));
                exit;
              end if;
            end loop;
            if not v_option_found then raise exception 'A selected food option is invalid.'; end if;
          end loop;
        end loop;
      elsif jsonb_typeof(coalesce(v_food_customization->'selection_map','{}'::jsonb))='object'
            and coalesce(v_food_customization->'selection_map','{}'::jsonb) <> '{}'::jsonb then
        raise exception 'This food item does not support priced selections.';
      end if;
    end if;

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
    v_normalized_lines := v_normalized_lines || jsonb_build_array(
      jsonb_build_object(
        'item_id', v_item_id,
        'quantity', v_quantity,
        'food_customization', case when v_channel='food' then v_food_customization else null end,
        'unit_price_mwk', v_unit_price
      )
    );
  end loop;

  v_service_fee := round(v_subtotal * v_controls.service_fee_bps / 10000.0);
  v_total := v_subtotal + v_delivery_fee + v_service_fee;
  if v_total <= 0 or trunc(v_total) <> v_total then raise exception 'Checkout total is invalid.'; end if;

  return jsonb_build_object(
    'channel', v_channel,
    'subtotal_mwk', v_subtotal,
    'delivery_fee_mwk', v_delivery_fee,
    'service_fee_mwk', v_service_fee,
    'total_mwk', v_total,
    'order', jsonb_build_object(
      'vendor_id', v_vendor_id,
      'channel', v_channel,
      'delivery_mode', v_delivery_mode,
      'delivery_fee_mwk', v_delivery_fee,
      'service_fee_mwk', v_service_fee,
      'lines', v_normalized_lines
    )
  );
end;
$function$;

revoke execute on function public.quote_campus_market_checkout(jsonb) from public, anon, authenticated;
grant execute on function public.quote_campus_market_checkout(jsonb) to service_role;