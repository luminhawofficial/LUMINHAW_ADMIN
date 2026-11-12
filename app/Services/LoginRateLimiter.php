<?php

final class LoginRateLimiter
{
    public function __construct(
        private readonly string $directory,
        private readonly int $maximumAttempts = 8,
        private readonly int $windowSeconds = 900
    ) {
    }

    public function assertAllowed(string $clientAddress): void
    {
        $handle = $this->openAttemptFile($clientAddress);
        try {
            if (!flock($handle, LOCK_EX)) {
                throw new RuntimeException('Unable to check the login rate limit.');
            }

            $attempts = $this->readAttempts($handle);
            $recentAttempts = $this->recentAttempts($attempts);
            if (count($recentAttempts) >= $this->maximumAttempts) {
                throw new RuntimeException('Too many sign-in attempts. Try again later.');
            }
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    public function recordFailure(string $clientAddress): void
    {
        $handle = $this->openAttemptFile($clientAddress);
        try {
            if (!flock($handle, LOCK_EX)) {
                throw new RuntimeException('Unable to record the sign-in attempt.');
            }

            $attempts = $this->recentAttempts($this->readAttempts($handle));
            $attempts[] = time();
            rewind($handle);
            if (!ftruncate($handle, 0)) {
                throw new RuntimeException('Unable to save the sign-in attempt.');
            }
            $encoded = json_encode($attempts, JSON_THROW_ON_ERROR);
            if (fwrite($handle, $encoded) !== strlen($encoded)) {
                throw new RuntimeException('Unable to save the sign-in attempt.');
            }
            fflush($handle);
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    public function clear(string $clientAddress): void
    {
        $path = $this->filePath($clientAddress);
        if (is_file($path) && !unlink($path)) {
            throw new RuntimeException('Unable to clear the sign-in attempt counter.');
        }
    }

    private function openAttemptFile(string $clientAddress)
    {
        if (!is_dir($this->directory)
            && !mkdir($this->directory, 0700, true)
            && !is_dir($this->directory)
        ) {
            throw new RuntimeException('Login rate limiting is not available.');
        }

        $handle = fopen($this->filePath($clientAddress), 'c+');
        if ($handle === false) {
            throw new RuntimeException('Login rate limiting is not available.');
        }
        return $handle;
    }

    private function filePath(string $clientAddress): string
    {
        return rtrim($this->directory, DIRECTORY_SEPARATOR)
            . DIRECTORY_SEPARATOR
            . hash('sha256', $clientAddress)
            . '.json';
    }

    private function readAttempts($handle): array
    {
        rewind($handle);
        $contents = stream_get_contents($handle);
        if ($contents === false || $contents === '') {
            return [];
        }

        try {
            $attempts = json_decode($contents, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            throw new RuntimeException('Login rate-limit data is invalid.', 0, $error);
        }
        if (!is_array($attempts)) {
            throw new RuntimeException('Login rate-limit data is invalid.');
        }
        return $attempts;
    }

    private function recentAttempts(array $attempts): array
    {
        $cutoff = time() - $this->windowSeconds;
        return array_values(array_filter(
            $attempts,
            fn ($attempt): bool => is_int($attempt) && $attempt >= $cutoff
        ));
    }
}
