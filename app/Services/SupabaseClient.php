<?php

require_once __DIR__ . '/SupabaseException.php';

final class SupabaseClient
{
    public function __construct(
        private readonly string $url,
        private readonly string $publishableKey
    ) {
    }

    public function signIn(string $email, string $password): array
    {
        return $this->request(
            'POST',
            '/auth/v1/token?grant_type=password',
            ['email' => $email, 'password' => $password]
        );
    }

    public function refreshSession(string $refreshToken): array
    {
        return $this->request(
            'POST',
            '/auth/v1/token?grant_type=refresh_token',
            ['refresh_token' => $refreshToken]
        );
    }

    public function getUser(string $accessToken): array
    {
        return $this->request('GET', '/auth/v1/user', null, $accessToken);
    }

    public function signOut(string $accessToken): void
    {
        $this->request('POST', '/auth/v1/logout?scope=local', [], $accessToken);
    }

    public function invokeAdminApi(string $accessToken, array $payload): array
    {
        return $this->request(
            'POST',
            '/functions/v1/admin-api',
            $payload,
            $accessToken
        );
    }

    private function request(
        string $method,
        string $path,
        ?array $payload = null,
        ?string $accessToken = null
    ): array {
        $handle = curl_init($this->url . $path);
        if ($handle === false) {
            throw new RuntimeException('Unable to initialize the Supabase request.');
        }

        $headers = [
            'Accept: application/json',
            'apikey: ' . $this->publishableKey,
        ];
        if ($accessToken !== null) {
            $headers[] = 'Authorization: Bearer ' . $accessToken;
        }
        if ($payload !== null) {
            $headers[] = 'Content-Type: application/json';
        }

        $options = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ];
        if ($payload !== null) {
            $options[CURLOPT_POSTFIELDS] = json_encode(
                $payload,
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES
            );
        }
        curl_setopt_array($handle, $options);

        $responseBody = curl_exec($handle);
        $curlError = curl_errno($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        curl_close($handle);

        if ($responseBody === false || $curlError !== 0) {
            throw new SupabaseException(
                'The Supabase service could not be reached.',
                0,
                'supabase_unreachable'
            );
        }
        if ($responseBody === '') {
            $response = [];
        } else {
            try {
                $response = json_decode($responseBody, true, 512, JSON_THROW_ON_ERROR);
            } catch (JsonException $error) {
                throw new SupabaseException(
                    'The Supabase service returned an invalid response.',
                    $status,
                    'invalid_supabase_response',
                    $error
                );
            }
            if (!is_array($response)) {
                throw new SupabaseException(
                    'The Supabase service returned an invalid response.',
                    $status,
                    'invalid_supabase_response'
                );
            }
        }

        if ($status < 200 || $status >= 300) {
            $errorCode = $response['error_code']
                ?? $response['code']
                ?? $response['error']
                ?? 'supabase_request_failed';
            $message = $response['msg']
                ?? $response['message']
                ?? 'The Supabase request was rejected.';
            throw new SupabaseException(
                is_string($message) ? $message : 'The Supabase request was rejected.',
                $status,
                is_string($errorCode) ? substr($errorCode, 0, 100) : 'supabase_request_failed'
            );
        }

        return $response;
    }
}
