<?php

require_once dirname(__DIR__) . '/Config/config.php';
$projectRoot = dirname(__DIR__, 2);
$isProduction = getenv('APP_ENV') === 'production';
ini_set('display_errors', $isProduction ? '0' : '1');
ini_set('log_errors', '1');

$sessionDirectory = $projectRoot . DIRECTORY_SEPARATOR . 'storage'
    . DIRECTORY_SEPARATOR . 'sessions';
if (!is_dir($sessionDirectory)
    && !mkdir($sessionDirectory, 0700, true)
    && !is_dir($sessionDirectory)
) {
    throw new RuntimeException('Secure PHP session storage is unavailable.');
}
if (!is_writable($sessionDirectory)) {
    throw new RuntimeException('Secure PHP session storage is not writable.');
}

session_name('luminhaw_admin');
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.use_trans_sid', '0');
session_save_path($sessionDirectory);
$secureCookie = $isProduction || (
    isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== '' && $_SERVER['HTTPS'] !== 'off'
);
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $secureCookie,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

require_once dirname(__DIR__) . '/Services/SupabaseClient.php';
require_once dirname(__DIR__) . '/Services/AdminAuth.php';

$supabaseConfig = require dirname(__DIR__) . '/Config/supabase.php';
$supabaseClient = new SupabaseClient(
    $supabaseConfig['url'],
    $supabaseConfig['publishable_key']
);
$adminAuth = new AdminAuth($supabaseClient);

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
