// Only remove this console's data: hosted installs share an origin with other sites.
const owned = /^(?:ps5[-:]|gsn[-:]|neo[-_:]|noc[-:]|cherri[-:]|music-|movies-)/;
const legacy = new Set(['volume', 'muted']);
export const isConsoleKey = name => owned.test(name) || legacy.has(name);

export async function clearConsoleData(scope = window) {
  const failures = [];
  for (const name of ['localStorage', 'sessionStorage']) {
    try {
      const storage = scope[name];
      const keys = Array.from({length: storage.length}, (_, i) => storage.key(i));
      for (const key of keys) if (isConsoleKey(key)) storage.removeItem(key);
    } catch { failures.push(name); }
  }
  try {
    const paths = new Set(['/']);
    let path = '';
    for (const part of scope.location.pathname.split('/').filter(Boolean)) {
      path += '/' + part; paths.add(path); paths.add(path + '/');
    }
    const domains = ['', scope.location.hostname, '.' + scope.location.hostname];
    for (const cookie of scope.document.cookie.split(';')) {
      const name = cookie.trim().split('=')[0];
      if (!isConsoleKey(name)) continue;
      for (const path of paths) for (const domain of domains) {
        scope.document.cookie = `${name}=; Max-Age=0; Path=${path}${domain ? '; Domain=' + domain : ''}; SameSite=Lax`;
      }
    }
  } catch { failures.push('cookies'); }
  try {
    if (scope.indexedDB?.databases) {
      for (const {name} of await scope.indexedDB.databases()) {
        if (!isConsoleKey(name)) continue;
        await new Promise((resolve, reject) => {
          const request = scope.indexedDB.deleteDatabase(name);
          const timer = setTimeout(() => reject(Error('Database is still open')), 3000);
          request.onsuccess = () => { clearTimeout(timer); resolve(); };
          request.onerror = request.onblocked = () => { clearTimeout(timer); reject(Error('Database unavailable')); };
        });
      }
    }
  } catch { failures.push('databases'); }
  if (failures.length) throw Error('Could not clear ' + failures.join(', ') + '. Close other GSN tabs and try again.');
}
