import { describe, expect, it } from 'vitest';
import { checkInviteFlowUrl, isLoopbackHost, isPrivateIpv4 } from './support/inviteFlowTarget.js';

const NAME = 'INVITE_FLOW_SUPABASE_URL';

describe('invite flow target check', () => {
  it.each(['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321'])(
    'allows the loopback stack %s',
    (url) => {
      expect(checkInviteFlowUrl(NAME, url, undefined).toString()).toBe(new URL(url).toString());
    },
  );

  it.each([
    'https://abcdefghijklmnop.supabase.co',
    'http://abcdefghijklmnop.supabase.co',
    'http://example.com:54321',
    'http://192.168.0.93:54321',
    'http://10.0.0.5:54321',
    'http://8.8.8.8:54321',
    'https://127.0.0.1:54321',
    'http://user:secret@127.0.0.1:54321',
    'not a url',
  ])('refuses %s by default', (url) => {
    expect(() => checkInviteFlowUrl(NAME, url, undefined)).toThrow(NAME);
  });

  it('allows a private network address only when it is listed', () => {
    expect(checkInviteFlowUrl(NAME, 'http://192.168.0.93:54321', '192.168.0.93').hostname).toBe(
      '192.168.0.93',
    );
    expect(() => checkInviteFlowUrl(NAME, 'http://192.168.0.94:54321', '192.168.0.93')).toThrow(
      NAME,
    );
  });

  it.each(['abcdefghijklmnop.supabase.co', 'example.com', '8.8.8.8', '172.32.0.1'])(
    'refuses to allow the non-private host %s',
    (host) => {
      expect(() => checkInviteFlowUrl(NAME, `http://${host}:54321`, host)).toThrow(
        'INVITE_FLOW_ALLOWED_HOSTS',
      );
    },
  );

  it('recognises loopback and private ranges', () => {
    expect(isLoopbackHost('127.4.5.6')).toBe(true);
    expect(isLoopbackHost('128.0.0.1')).toBe(false);
    expect(isPrivateIpv4('172.16.0.1')).toBe(true);
    expect(isPrivateIpv4('172.31.255.255')).toBe(true);
    expect(isPrivateIpv4('172.15.0.1')).toBe(false);
    expect(isPrivateIpv4('192.169.0.1')).toBe(false);
    expect(isPrivateIpv4('10.256.0.1')).toBe(false);
  });
});
