// Garante que AUTH_RATE_LIMIT_SECRET tem valor nos testes se não definido
if (!process.env.AUTH_RATE_LIMIT_SECRET) {
  process.env.AUTH_RATE_LIMIT_SECRET =
    'test_rate_limit_secret_minimum_32_chars_long_key_for_vitest';
}

console.log('Vitest setup file loaded.');