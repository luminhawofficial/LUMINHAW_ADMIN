<?php

require_once dirname(__DIR__) . '/app/Helpers/bootstrap.php';
require_once dirname(__DIR__) . '/app/Helpers/http.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    exit('Method not allowed.');
}

try {
    $adminAuth->assertCsrf((string) ($_POST['csrf_token'] ?? ''));
    $logoutMessage = $adminAuth->signOut();
    redirect($logoutMessage === null ? 'login.php?signed_out=1' : 'login.php?signout_error=1');
} catch (AdminAccessException $error) {
    http_response_code($error->httpStatus);
    exit(e($error->getMessage()));
}
