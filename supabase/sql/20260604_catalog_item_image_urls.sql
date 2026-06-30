do $$
begin
  if to_regclass('public.catalog_items') is not null then
    execute 'alter table public.catalog_items add column if not exists image_urls text[] not null default ''{}''::text[]';
    execute 'update public.catalog_items set image_urls = array_remove(array[image_url], null) where coalesce(array_length(image_urls, 1), 0) = 0 and image_url is not null';
  end if;

  if to_regclass('campus_market.catalog_items') is not null then
    execute 'alter table campus_market.catalog_items add column if not exists image_urls text[] not null default ''{}''::text[]';
    execute 'update campus_market.catalog_items set image_urls = array_remove(array[image_url], null) where coalesce(array_length(image_urls, 1), 0) = 0 and image_url is not null';
  end if;
end $$;
