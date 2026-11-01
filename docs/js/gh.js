// GitHub REST calls made straight from the browser with the reader's own token.
// The token never leaves this device except in the Authorization header to api.github.com.

const API = () => localStorage.getItem('dev.api') || 'https://api.github.com';

export class GitHubError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function token() { return localStorage.getItem('gh.token') || ''; }

async function call(path, { method = 'GET', accept = 'application/vnd.github+json', body } = {}) {
  const headers = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(API() + path, { method, headers, body: body && JSON.stringify(body), cache: 'no-store' });
  } catch {
    throw new GitHubError(0, '连不上 GitHub，请检查网络。Can’t reach GitHub.');
  }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).message || ''; } catch {}
    throw new GitHubError(res.status, explain(res.status, msg));
  }
  return res;
}

function explain(status, msg) {
  if (status === 401) return '令牌无效或已过期，请在设置里重新粘贴。The token is invalid or expired.';
  if (status === 403 && /rate limit/i.test(msg)) return 'GitHub 请求次数暂时用完，请过一会儿再试。Rate limited.';
  if (status === 403) return '令牌没有这个仓库的权限。The token can’t access this repository.';
  if (status === 404) return '找不到这个仓库或文件（也可能是令牌没有它的权限）。Not found.';
  return `GitHub ${status}${msg ? '：' + msg : ''}`;
}

const enc = s => s.split('/').map(encodeURIComponent).join('/');

/** The branch's current commit, or null for an empty repository. */
export async function headCommit(repo, branch = 'main') {
  try {
    const res = await call(`/repos/${repo}/commits/${encodeURIComponent(branch)}`, { accept: 'application/vnd.github.sha' });
    return (await res.text()).trim();
  } catch (e) {
    if (e.status === 409 || e.status === 404 || e.status === 422) {
      // 409: empty repo. 404/422: branch missing — but the repo itself must exist.
      await call(`/repos/${repo}`);
      return null;
    }
    throw e;
  }
}

export async function raw(repo, path, ref) {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const res = await call(`/repos/${repo}/contents/${enc(path)}${q}`, { accept: 'application/vnd.github.raw+json' });
  return res.text();
}

/** Files in a folder ("" = root): [{name, path, sha, type}]. */
export async function list(repo, path = '', ref) {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  try {
    const res = await call(`/repos/${repo}/contents/${enc(path)}${q}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    if (e.status === 404) return [];
    throw e;
  }
}

function base64(text) {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Creates or replaces one file. `sha` is the current blob sha (omit to create). Returns the new sha. */
export async function put(repo, path, text, { sha, message, branch } = {}) {
  const body = { message: message || `Update ${path}`, content: base64(text) };
  if (sha) body.sha = sha;
  if (branch) body.branch = branch;
  const res = await call(`/repos/${repo}/contents/${enc(path)}`, { method: 'PUT', body });
  return (await res.json()).content?.sha;
}

/** Who the token belongs to (for the setup check). */
export async function whoami() {
  return (await call('/user')).json();
}
