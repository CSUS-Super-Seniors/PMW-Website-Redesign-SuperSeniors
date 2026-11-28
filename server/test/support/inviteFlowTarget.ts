// Decides whether the staff invite flow test may run against a Supabase stack. The
// test creates and deletes Auth accounts, so it fails closed: only this machine
// (loopback) is allowed, plus a private network address listed on purpose in
// INVITE_FLOW_ALLOWED_HOSTS, such as a teammate's local stack on another computer.
// A hosted project is never a loopback or private address, so it is always refused.

const LOOPBACK_NAMES = new Set(['localhost', '[::1]']);

function ipv4Octets(host: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet <= 255) ? octets : null;
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_NAMES.has(host) || ipv4Octets(host)?.[0] === 127;
}

/** 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16. */
export function isPrivateIpv4(host: string): boolean {
  const octets = ipv4Octets(host);
  if (!octets) return false;
  const [a, b] = octets;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function allowedHostsFrom(value: string | undefined): string[] {
  const hosts = (value ?? '')
    .split(/[\s,;]+/)
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  for (const host of hosts) {
    if (!isPrivateIpv4(host)) {
      throw new Error(
        `INVITE_FLOW_ALLOWED_HOSTS may only list private network addresses (10.x, 172.16-31.x, 192.168.x), not ${host}.`,
      );
    }
  }
  return hosts;
}

/**
 * Parses one of the invite flow URLs and throws unless it points at a local stack:
 * plain http, no credentials in the URL, and a loopback host or an allowed private one.
 */
export function checkInviteFlowUrl(
  name: string,
  value: string,
  allowedHostsSetting: string | undefined,
): URL {
  let target: URL;
  try {
    target = new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL.`);
  }
  const allowedHosts = allowedHostsFrom(allowedHostsSetting);
  const host = target.hostname.toLowerCase();
  const local = isLoopbackHost(host) || allowedHosts.includes(host);
  if (target.protocol !== 'http:' || target.username || target.password || !local) {
    throw new Error(
      `${name} must be a local Supabase stack on this machine (localhost or 127.0.0.1), or a private address listed in INVITE_FLOW_ALLOWED_HOSTS. It creates and deletes accounts, so it never runs against ${target.host}.`,
    );
  }
  return target;
}
