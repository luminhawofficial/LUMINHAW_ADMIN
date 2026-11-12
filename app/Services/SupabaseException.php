<?php

final class SupabaseException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $httpStatus,
        public readonly string $errorCode,
        ?Throwable $previous = null
    ) {
        parent::__construct($message, 0, $previous);
    }
}
