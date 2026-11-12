<?php

$projectRoot = dirname(__DIR__, 2);
$environmentFile = $projectRoot . DIRECTORY_SEPARATOR . '.env';

if (is_file($environmentFile)) {
    $lines = file($environmentFile, FILE_IGNORE_NEW_LINES);
    if ($lines === false) {
        throw new RuntimeException('Unable to read the .env file.');
    }

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }

        if (!preg_match('/^([A-Z][A-Z0-9_]*)=(.*)$/', $line, $matches)) {
            throw new RuntimeException('Invalid .env entry. Expected KEY=value.');
        }

        [$entry, $name, $value] = $matches;
        $value = trim($value);
        if ($value !== '' && ($value[0] === '"' || $value[0] === "'")) {
            $quote = $value[0];
            if (strlen($value) < 2 || substr($value, -1) !== $quote) {
                throw new RuntimeException("Unclosed quoted value for {$name} in .env.");
            }
            $value = substr($value, 1, -1);
        }

        if (getenv($name) === false) {
            putenv("{$name}={$value}");
            $_ENV[$name] = $value;
        }
    }
}

return [
    'app' => [
        'environment' => getenv('APP_ENV') ?: 'local',
    ],
];
