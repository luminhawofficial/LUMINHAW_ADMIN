<?php

require_once dirname(__DIR__) . '/app/Helpers/bootstrap.php';
require_once dirname(__DIR__) . '/app/Helpers/http.php';
require_once dirname(__DIR__) . '/app/Services/LoginRateLimiter.php';

if (isset($_SESSION['access_token'])) {
    try {
        $adminAuth->currentAdmin();
        redirect('index.php');
    } catch (AdminAccessException $error) {
        if ($error->httpStatus !== 401 && $error->httpStatus !== 403) {
            throw $error;
        }
    }
}

$errorMessage = '';
$httpStatus = 200;
$rateLimiter = new LoginRateLimiter(
    dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage'
        . DIRECTORY_SEPARATOR . 'rate-limits'
);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $adminAuth->assertCsrf((string) ($_POST['csrf_token'] ?? ''));
        $email = trim((string) ($_POST['email'] ?? ''));
        $password = (string) ($_POST['password'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)
            || $password === ''
            || strlen($email) > 254
            || strlen($password) > 1024
        ) {
            throw new AdminAccessException('Enter a valid email and password.', 400);
        }

        $clientAddress = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
        $rateLimiter->assertAllowed($clientAddress);
        $adminAuth->signIn($email, $password);
        $rateLimiter->clear($clientAddress);
        redirect('index.php');
    } catch (AdminAccessException $exception) {
        $httpStatus = $exception->httpStatus;
        if ($httpStatus === 401) {
            $rateLimiter->recordFailure((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
            $errorMessage = 'Email or password is incorrect, or administrator access is not active.';
        } else {
            $errorMessage = $exception->getMessage();
        }
    } catch (SupabaseException $exception) {
        error_log('Admin sign-in request failed: ' . $exception->errorCode);
        $httpStatus = 503;
        $errorMessage = 'Sign-in is temporarily unavailable. Please try again later.';
    } catch (RuntimeException $exception) {
        $httpStatus = str_contains($exception->getMessage(), 'Too many sign-in attempts') ? 429 : 503;
        $errorMessage = $httpStatus === 429
            ? $exception->getMessage()
            : 'Sign-in protection is unavailable. Please contact the system administrator.';
        error_log('Admin sign-in protection failed: ' . $exception->getMessage());
    }
}

http_response_code($httpStatus);
$csrfToken = $adminAuth->csrfToken();
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#F6F8F1">
    <title>Administrator sign in · LUMINHAW</title>
    <link rel="stylesheet" href="assets/css/admin.css">
</head>
<body class="login-page">
<main class="login-card">
    <a class="brand login-brand" href="login.php" aria-label="LUMINHAW Admin">
        <span class="brand-mark"><img src="assets/icons/logo.png" alt=""></span>
        <span class="brand-copy"><strong>LUMINHAW</strong><small>ADMIN CONSOLE</small></span>
    </a>
    <p class="eyebrow">SECURE ADMINISTRATION</p>
    <h1>Welcome back</h1>
    <p class="login-subtitle">Sign in with an authorized, verified LUMINHAW administrator account.</p>
    <?php if ($errorMessage !== ''): ?>
        <div class="form-alert" role="alert"><?= e($errorMessage) ?></div>
    <?php endif; ?>
    <form method="post" action="login.php" autocomplete="on">
        <input type="hidden" name="csrf_token" value="<?= e($csrfToken) ?>">
        <label for="email">Email address</label>
        <input id="email" name="email" type="email" autocomplete="username" maxlength="254" required>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" maxlength="1024" required>
        <button class="primary-button login-submit" type="submit">Sign in</button>
    </form>
    <p class="login-footnote">Access is limited to accounts assigned an active admin role.</p>
</main>
</body>
</html>
