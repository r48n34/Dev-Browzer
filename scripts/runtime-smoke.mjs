const CDP_ENDPOINT = 'http://127.0.0.1:9222/json/list';
const FIXTURE_ORIGIN = 'http://127.0.0.1:4173';
const EXPECTED_VIEWPORTS = new Set([
  '390x844',
  '844x390',
  '768x1024',
  '1024x768',
  '1920x1080',
  '2560x1440',
]);

const delay = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

async function readTargets() {
  const response = await fetch(CDP_ENDPOINT);
  if (!response.ok) {
    throw new Error(`CDP target discovery failed with HTTP ${response.status}.`);
  }
  return response.json();
}

async function waitForTargets(minimum, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let targets = [];
  while (Date.now() < deadline) {
    try {
      targets = (await readTargets()).filter(
        (target) => target.type === 'page' && target.webSocketDebuggerUrl,
      );
      if (targets.length >= minimum) {
        return targets;
      }
    } catch {
      // The WebView2 debugging endpoint may still be starting.
    }
    await delay(250);
  }
  throw new Error(`Expected at least ${minimum} WebView2 targets, found ${targets.length}.`);
}

async function cdpCommand(target, method, params = {}) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener(
      'error',
      () => reject(new Error(`Unable to connect to CDP target ${target.id}.`)),
      { once: true },
    );
  });

  const id = 1;
  const result = await new Promise((resolve, reject) => {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== id) {
        return;
      }
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  socket.close();
  return result;
}

async function evaluate(target, expression) {
  const result = await cdpCommand(target, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text);
  }
  return result.result.value;
}

async function inspectTargets() {
  const targets = await waitForTargets(7);
  return Promise.all(
    targets.map(async (target) => ({
      target,
      page: await evaluate(
        target,
        '({ url: location.href, title: document.title, width: innerWidth, height: innerHeight })',
      ),
    })),
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForPreviewUrl(expectedUrl, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  let previews = [];
  while (Date.now() < deadline) {
    const inspected = await inspectTargets();
    previews = inspected.filter(({ page }) => page.url.startsWith(FIXTURE_ORIGIN));
    if (previews.length === 6 && previews.every(({ page }) => page.url === expectedUrl)) {
      return previews;
    }
    await delay(200);
  }
  throw new Error(
    `Previews did not synchronize to ${expectedUrl}: ${previews
      .map(({ page }) => page.url)
      .join(', ')}`,
  );
}

const inspected = await inspectTargets();
const expectUnavailable = process.argv.includes('--expect-unavailable');
const navigateUrlArgument = process.argv.find((argument) => argument.startsWith('--navigate-url='));
const navigateTargetUrl = navigateUrlArgument?.slice('--navigate-url='.length);
const shell = inspected.find(({ page }) => page.title === 'Dev Browzer');
const previews =
  expectUnavailable || navigateTargetUrl
    ? inspected.filter(({ page }) => page.title !== 'Dev Browzer')
    : inspected.filter(({ page }) => page.url.startsWith(FIXTURE_ORIGIN));
const expectedUrlArgument = process.argv.find((argument) => argument.startsWith('--expected-url='));
const expectedPersistedUrl = expectedUrlArgument?.slice('--expected-url='.length);

assert(shell, 'The Dev Browzer shell target was not found.');
assert(previews.length === 6, `Expected 6 preview targets, found ${previews.length}.`);

const actualViewports = new Set(previews.map(({ page }) => `${page.width}x${page.height}`));
assert(
  [...EXPECTED_VIEWPORTS].every((viewport) => actualViewports.has(viewport)),
  `Unexpected preview dimensions: ${[...actualViewports].join(', ')}`,
);

if (expectedPersistedUrl) {
  assert(
    previews.every(({ page }) => page.url === expectedPersistedUrl),
    `Expected restored URL ${expectedPersistedUrl}, found ${previews
      .map(({ page }) => page.url)
      .join(', ')}`,
  );
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        checked: 'persisted workspace restart',
        previewCount: previews.length,
        restoredUrl: expectedPersistedUrl,
        viewports: [...actualViewports].sort(),
      },
      null,
      2,
    ),
  );
}

if (expectUnavailable) {
  const deadline = Date.now() + 10_000;
  let shellText = '';
  while (Date.now() < deadline) {
    shellText = await evaluate(shell.target, 'document.body.innerText');
    if (
      shellText.split('Preview unavailable').length - 1 === 6 &&
      shellText.split('Retry').length - 1 === 6
    ) {
      break;
    }
    await delay(200);
  }
  const unavailableCount = shellText.split('Preview unavailable').length - 1;
  const retryCount = shellText.split('Retry').length - 1;
  assert(
    unavailableCount === 6 && retryCount === 6,
    `Expected six recoverable preview errors, found ${unavailableCount} errors and ${retryCount} Retry actions.`,
  );
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        checked: 'packaged unavailable-server recovery',
        previewCount: previews.length,
        unavailableCount,
        retryCount,
      },
      null,
      2,
    ),
  );
}

if (navigateTargetUrl) {
  await evaluate(
    shell.target,
    `(() => {
      const input = document.querySelector('input[aria-label="Preview address"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(navigateTargetUrl)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
  );
  await delay(100);
  await evaluate(shell.target, `document.querySelector('button[type="submit"]')?.click()`);

  const expectedHost = new URL(navigateTargetUrl).hostname;
  const deadline = Date.now() + 20_000;
  let synchronizedPreviews = [];
  while (Date.now() < deadline) {
    const current = await inspectTargets();
    synchronizedPreviews = current.filter(({ page }) => page.title !== 'Dev Browzer');
    const urls = synchronizedPreviews.map(({ page }) => page.url);
    const hostMatches = urls.every((url) => {
      try {
        return new URL(url).hostname === expectedHost;
      } catch {
        return false;
      }
    });
    if (synchronizedPreviews.length === 6 && hostMatches && new Set(urls).size === 1) {
      break;
    }
    await delay(250);
  }

  const synchronizedUrls = synchronizedPreviews.map(({ page }) => page.url);
  assert(
    synchronizedPreviews.length === 6 &&
      synchronizedUrls.every((url) => new URL(url).hostname === expectedHost) &&
      new Set(synchronizedUrls).size === 1,
    `External previews did not synchronize: ${synchronizedUrls.join(', ')}`,
  );
  const shellText = await evaluate(shell.target, 'document.body.innerText');
  assert(
    !shellText.includes('Preview unavailable'),
    'The workbench reported an unavailable external preview.',
  );
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        checked: 'external HTTPS navigation',
        previewCount: synchronizedPreviews.length,
        synchronizedUrl: synchronizedUrls[0],
      },
      null,
      2,
    ),
  );
}

if (!expectedPersistedUrl && !expectUnavailable && !navigateTargetUrl) {
  const phone = previews.find(({ page }) => page.width === 390 && page.height === 844);
  assert(phone, 'The phone portrait preview was not found.');

  const spaUrl = `${FIXTURE_ORIGIN}/spa?source=phone#state`;
  await evaluate(
    phone.target,
    `history.pushState({}, '', ${JSON.stringify(spaUrl)}); location.href`,
  );
  await waitForPreviewUrl(spaUrl);

  await evaluate(shell.target, `document.querySelector('button[aria-label="Back"]')?.click()`);
  await waitForPreviewUrl(`${FIXTURE_ORIGIN}/`);

  await evaluate(shell.target, `document.querySelector('button[aria-label="Forward"]')?.click()`);
  await waitForPreviewUrl(spaUrl);

  const popupUrl = `${FIXTURE_ORIGIN}/popup?source=phone`;
  const refreshedPhone = (await inspectTargets()).find(
    ({ page }) => page.width === 390 && page.height === 844,
  );
  assert(refreshedPhone, 'The phone preview was lost after history navigation.');
  await evaluate(refreshedPhone.target, `window.open(${JSON.stringify(popupUrl)}, '_blank')`);
  await waitForPreviewUrl(popupUrl);

  await evaluate(
    shell.target,
    `document.querySelector('button[aria-label="Reload all previews"]')?.click()`,
  );
  await waitForPreviewUrl(popupUrl);

  console.log(
    JSON.stringify(
      {
        status: 'passed',
        previewCount: previews.length,
        viewports: [...actualViewports].sort(),
        synchronizedUrl: popupUrl,
        checked: [
          'exact viewport sizes',
          'SPA navigation',
          'back',
          'forward',
          'popup',
          'reload all',
        ],
      },
      null,
      2,
    ),
  );
}
