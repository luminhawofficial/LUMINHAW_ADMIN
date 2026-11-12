<?php

require_once __DIR__ . '/config.php';
$url = getenv('SUPABASE_URL') ?: '';
$publishableKey = getenv('SUPABASE_PUBLISHABLE_KEY') ?: '';

if ($url === '' || filter_var($url, FILTER_VALIDATE_URL) === false) {
    throw new RuntimeException('SUPABASE_URL is missing or invalid. Configure it in .env.');
}

$scheme = parse_url($url, PHP_URL_SCHEME);
if (!in_array($scheme, ['https', 'http'], true)) {
    throw new RuntimeException('SUPABASE_URL must use HTTPS (HTTP is allowed for local development).');
}

if ($publishableKey === '') {
    throw new RuntimeException('SUPABASE_PUBLISHABLE_KEY is missing. Configure it in .env.');
}

return [
    'url' => rtrim($url, '/'),
    'publishable_key' => $publishableKey,
];
