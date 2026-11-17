import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../youtube.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];

for (const cached of [false, true]) {
  for (let launch = 0; launch < 3; launch++) {
    const messages = [];
    const timers = new Set();
    const listeners = new Map();
    const readyCallbacks = [];
    let creates = 0;
    let destroyed = 0;
    let onReady;
    const context = vm.createContext({
      location: {
        href: `https://example.com/youtube.html?bridgeId=qa${launch}&videoId=aqz-KE-bpKQ`,
        origin: 'https://example.com',
      },
      parent: { postMessage: message => messages.push(message) },
      document: { getElementById: () => ({ style: {} }) },
      setInterval(callback) { timers.add(callback); return callback; },
      clearInterval(callback) { timers.delete(callback); },
      addEventListener(type, callback) { listeners.set(type, callback); },
      innerWidth: 1280,
      innerHeight: 720,
    });
    context.window = context;
    const apiReady = () => {
      context.YT.loaded = 1;
      context.YT.Player = function (_element, options) {
        creates++;
        onReady = options.events.onReady;
        return {
          getCurrentTime: () => 1,
          getDuration: () => 60,
          getPlayerState: () => 1,
          destroy() { destroyed++; },
        };
      };
      context.onYouTubeIframeAPIReady?.();
      for (const callback of readyCallbacks) callback();
    };
    for (const [, attributes, source] of scripts) {
      if (/src=/.test(attributes)) {
        assert.match(attributes, /youtube\.com\/iframe_api/);
        context.YT = {
          loaded: 0,
          ready(callback) {
            if (this.loaded) callback();
            else readyCallbacks.push(callback);
          },
        };
        if (cached) apiReady();
      } else vm.runInContext(source, context);
    }
    if (!cached) apiReady();
    assert.equal(creates, 1, `Exactly one player: cached=${cached}, launch=${launch}`);
    assert.ok(context.player, 'The initialized player must remain assigned');
    onReady();
    assert.ok(messages.some(message => message.type === 'ready'));
    assert.equal(timers.size, 1);
    listeners.get('message')({ data: { bridgeId: `qa${launch}`, type: 'destroy', data: {} } });
    assert.equal(destroyed, 1);
    assert.equal(context.player, null);
    assert.equal(timers.size, 0);
  }
}
console.log('YouTube bridge: cold/cached API, repeated launches, single initialization and cleanup passed');
