// Fake secrets for the hook tests, assembled at runtime so that this file does
// not itself look like it contains one (the pre-commit hook would block it).

const body = 'Abc123Def456Ghi789Jkl012Mno345Pqr678';

export const fakeSecrets: Readonly<Record<string, string>> = {
  'API key (sk-...)': ['sk', body].join('-'),
  'AWS access key': ['AKIA', 'ABCDEFGHIJKLMNOP'].join(''),
  'GitHub token': ['ghp', body].join('_'),
  'private key': ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' '),
  'token assignment': ['ANTHROPIC_API_KEY', body].join('='),
};

export const fakeKey = fakeSecrets['API key (sk-...)'] ?? '';
