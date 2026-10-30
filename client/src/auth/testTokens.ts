/** Builds an unsigned JWT-shaped token for tests. Supabase checks real ones on its server. */
export function fakeAccessToken(userId: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated' })}.signature`;
}
