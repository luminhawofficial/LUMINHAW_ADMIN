<?php

require_once __DIR__ . '/AdminAccessException.php';
require_once __DIR__ . '/SupabaseClient.php';

final class AdminAuth
{
    private const IDLE_TIMEOUT = 1800;
    private const ABSOLUTE_TIMEOUT = 28800;

    public function __construct(private readonly SupabaseClient $supabase)
    {
    }

    public function signIn(string $email, string $password): array
    {
        try {
            $session = $this->supabase->signIn($email, $password);
        } catch (SupabaseException $error) {
            if (in_array($error->httpStatus, [400, 401, 422], true)) {
                throw new AdminAccessException('Email or password is incorrect.', 401);
            }
            throw $error;
        }

        if (!isset(
            $session['access_token'],
            $session['refresh_token'],
            $session['expires_in'],
            $session['user']['id']
        )) {
            throw new RuntimeException('Supabase returned an incomplete sign-in session.');
        }
        if (empty($session['user']['email_confirmed_at'])) {
            $this->supabase->signOut($session['access_token']);
            throw new AdminAccessException('Verify your email before signing in.', 403);
        }

        session_regenerate_id(true);
        $_SESSION = [
            'access_token' => $session['access_token'],
            'refresh_token' => $session['refresh_token'],
            'token_expires_at' => time() + (int) $session['expires_in'],
            'user_id' => $session['user']['id'],
            'created_at' => time(),
            'last_activity_at' => time(),
            'csrf_token' => bin2hex(random_bytes(32)),
        ];

        try {
            $context = $this->loadAdminContext();
        } catch (AdminAccessException | SupabaseException $error) {
            $this->destroyLocalSession();
            throw $error;
        }

        return ['user' => $session['user']] + $context;
    }

    public function currentAdmin(): array
    {
        if (!$this->hasValidLocalSession()) {
            $this->destroyLocalSession();
            throw new AdminAccessException('Sign in to continue.', 401);
        }

        if ($_SESSION['token_expires_at'] <= time() + 60) {
            $this->refreshSession();
        }

        try {
            $user = $this->supabase->getUser($_SESSION['access_token']);
        } catch (SupabaseException $error) {
            if ($error->httpStatus === 403) {
                $this->destroyLocalSession();
                throw new AdminAccessException('Your administrator account is not active.', 403);
            }
            if ($error->httpStatus !== 401) {
                throw $error;
            }
            $this->refreshSession();
            $user = $this->supabase->getUser($_SESSION['access_token']);
        }

        if (($user['id'] ?? null) !== $_SESSION['user_id']
            || empty($user['email_confirmed_at'])
        ) {
            $this->destroyLocalSession();
            throw new AdminAccessException('Your administrator session is invalid.', 401);
        }

        $context = $this->loadAdminContext();
        $_SESSION['last_activity_at'] = time();
        return ['user' => $user] + $context;
    }

    public function csrfToken(): string
    {
        if (!isset($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf_token'];
    }

    public function assertCsrf(string $submittedToken): void
    {
        if (!isset($_SESSION['csrf_token'])
            || !hash_equals($_SESSION['csrf_token'], $submittedToken)
        ) {
            throw new AdminAccessException('Your request token expired. Refresh and retry.', 419);
        }
    }

    public function signOut(): ?string
    {
        $accessToken = $_SESSION['access_token'] ?? null;
        $errorMessage = null;
        if (is_string($accessToken) && $accessToken !== '') {
            try {
                $this->supabase->signOut($accessToken);
            } catch (SupabaseException $error) {
                error_log('Supabase sign-out failed: ' . $error->getMessage());
                $errorMessage = 'The local session was closed, but remote sign-out could not be confirmed.';
            }
        }
        $this->destroyLocalSession();
        return $errorMessage;
    }

    private function loadAdminContext(): array
    {
        try {
            $context = $this->supabase->invokeAdminApi(
                $_SESSION['access_token'],
                ['action' => 'session']
            );
        } catch (SupabaseException $error) {
            if ($error->httpStatus === 401 || $error->httpStatus === 403) {
                throw new AdminAccessException(
                    'This account does not have active administrator access.',
                    403
                );
            }
            throw $error;
        }

        if (($context['user_id'] ?? null) !== $_SESSION['user_id']
            || !in_array($context['role'] ?? null, ['admin', 'moderator'], true)
        ) {
            throw new AdminAccessException('This account does not have active administrator access.', 403);
        }
        return $context;
    }

    private function refreshSession(): void
    {
        try {
            $session = $this->supabase->refreshSession($_SESSION['refresh_token']);
        } catch (SupabaseException $error) {
            $this->destroyLocalSession();
            throw new AdminAccessException('Your session expired. Sign in again.', 401);
        }

        if (!isset($session['access_token'], $session['refresh_token'], $session['expires_in'])) {
            $this->destroyLocalSession();
            throw new AdminAccessException('Your session expired. Sign in again.', 401);
        }
        $_SESSION['access_token'] = $session['access_token'];
        $_SESSION['refresh_token'] = $session['refresh_token'];
        $_SESSION['token_expires_at'] = time() + (int) $session['expires_in'];
    }

    private function hasValidLocalSession(): bool
    {
        if (!isset(
            $_SESSION['access_token'],
            $_SESSION['refresh_token'],
            $_SESSION['token_expires_at'],
            $_SESSION['user_id'],
            $_SESSION['created_at'],
            $_SESSION['last_activity_at']
        )) {
            return false;
        }

        $now = time();
        return $now - $_SESSION['last_activity_at'] <= self::IDLE_TIMEOUT
            && $now - $_SESSION['created_at'] <= self::ABSOLUTE_TIMEOUT;
    }

    private function destroyLocalSession(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $params['path'],
                'domain' => $params['domain'],
                'secure' => $params['secure'],
                'httponly' => $params['httponly'],
                'samesite' => $params['samesite'] ?? 'Strict',
            ]);
        }
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
    }
}
