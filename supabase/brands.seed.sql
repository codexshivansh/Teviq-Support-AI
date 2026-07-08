insert into public.brands (
  id,
  brand_name,
  brand_category,
  support_language,
  escalation_whatsapp,
  shopify_store_url,
  shopify_token_encrypted,
  is_active
) values
  (
    'vastra-demo',
    'Teviq Vastra Demo',
    'Fashion',
    'Hinglish',
    '+91 98765 00011',
    null,
    null,
    true
  ),
  (
    'urban-demo',
    'Urban Gadgets Demo',
    'Electronics',
    'English',
    '+91 98765 11122',
    null,
    null,
    true
  ),
  (
    'beauty-demo',
    'Beauty Demo',
    'Beauty',
    'Hinglish',
    '+91 98765 22233',
    null,
    null,
    true
  )
on conflict (id) do update set
  brand_name = excluded.brand_name,
  brand_category = excluded.brand_category,
  support_language = excluded.support_language,
  escalation_whatsapp = excluded.escalation_whatsapp,
  is_active = excluded.is_active;
