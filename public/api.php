<?php

require_once dirname(__DIR__) . '/app/Helpers/bootstrap.php';
require_once dirname(__DIR__) . '/app/Helpers/http.php';

header('Cache-Control: no-store, private');

try {
    $admin = $adminAuth->currentAdmin();
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $action = (string) ($_GET['action'] ?? '');
        $payload = ['action' => $action];
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $adminAuth->assertCsrf((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
        $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
        if (!str_starts_with($contentType, 'application/json')) {
            sendJson(['error' => ['code' => 'json_content_type_required']], 415);
        }
        try {
            $payload = json_decode(
                file_get_contents('php://input') ?: '',
                true,
                32,
                JSON_THROW_ON_ERROR
            );
        } catch (JsonException) {
            sendJson(['error' => ['code' => 'invalid_json']], 400);
        }
        if (!is_array($payload) || array_is_list($payload)) {
            sendJson(['error' => ['code' => 'invalid_request_body']], 400);
        }
        $action = $payload['action'] ?? '';
        if (!is_string($action)) {
            sendJson(['error' => ['code' => 'action_required']], 400);
        }
    } else {
        sendJson(['error' => ['code' => 'method_not_allowed']], 405);
    }

    $payload['action'] = $action;
    unset($payload['csrf_token']);
    $response = $supabaseClient->invokeAdminApi(
        $_SESSION['access_token'],
        $payload
    );
    sendJson($response);
} catch (AdminAccessException $error) {
    sendJson(['error' => ['code' => 'administrator_access_required']], $error->httpStatus);
} catch (SupabaseException $error) {
    error_log('Admin API request failed: ' . $error->errorCode);
    $status = $error->httpStatus >= 400 && $error->httpStatus < 500
        ? $error->httpStatus
        : 502;
    sendJson(['error' => ['code' => $error->errorCode]], $status);
} catch (RuntimeException $error) {
    error_log('Admin API runtime failure: ' . $error->getMessage());
    sendJson(['error' => ['code' => 'admin_api_unavailable']], 503);
}
