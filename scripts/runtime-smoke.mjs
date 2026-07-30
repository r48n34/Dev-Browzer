const CDP_ENDPOINT = 'http://127.0.0.1:9222/json/list';
const FIXTURE_ORIGIN = 'http://127.0.0.1:4173';
const EXPECTED_VIEWPORTS = new Set(['390x844', '768x1024', '1920x1080']);
const EXPECTED_PREVIEW_COUNT = EXPECTED_VIEWPORTS.size;

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
  const targets = await waitForTargets(EXPECTED_PREVIEW_COUNT + 1);
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
    if (
      previews.length === EXPECTED_PREVIEW_COUNT &&
      previews.every(({ page }) => page.url === expectedUrl)
    ) {
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

async function prepareEssentialWorkspace(shell) {
  await evaluate(
    shell.target,
    `(() => {
      const essential = [...document.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === 'Essential',
      );
      essential?.click();
      const input = document.querySelector('input[aria-label="Preview address"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(`${FIXTURE_ORIGIN}/`)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('button[type="submit"]')?.click();
    })()`,
  );
  await waitForPreviewUrl(`${FIXTURE_ORIGIN}/`, 20_000);
  await evaluate(
    shell.target,
    `document.querySelector('button[aria-label="More layout actions"]')?.click()`,
  );
  await delay(100);
  // Use the product's 100% control so CDP assertions are independent of host fractional-DPI
  // rounding while still exercising the normal preview geometry path.
  await evaluate(
    shell.target,
    `[...document.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent?.includes('Actual size'),
    )?.click()`,
  );
  await delay(500);
}

let inspected = await inspectTargets();
const expectUnavailable = process.argv.includes('--expect-unavailable');
const prepareEssential = process.argv.includes('--prepare-essential');
const navigateUrlArgument = process.argv.find((argument) => argument.startsWith('--navigate-url='));
const navigateTargetUrl = navigateUrlArgument?.slice('--navigate-url='.length);
const shell = inspected.find(({ page }) => page.title === 'Dev Browzer');
assert(shell, 'The Dev Browzer shell target was not found.');

if (prepareEssential) {
  await prepareEssentialWorkspace(shell);
  inspected = await inspectTargets();
}

const previews =
  expectUnavailable || navigateTargetUrl
    ? inspected.filter(({ page }) => page.title !== 'Dev Browzer')
    : inspected.filter(({ page }) => page.url.startsWith(FIXTURE_ORIGIN));
const expectedUrlArgument = process.argv.find((argument) => argument.startsWith('--expected-url='));
const expectedPersistedUrl = expectedUrlArgument?.slice('--expected-url='.length);

assert(
  previews.length === EXPECTED_PREVIEW_COUNT,
  `Expected ${EXPECTED_PREVIEW_COUNT} preview targets, found ${previews.length}.`,
);

const actualViewports = new Set(previews.map(({ page }) => `${page.width}x${page.height}`));
const shellSurfaces = await evaluate(
  shell.target,
  `[...document.querySelectorAll('[data-preview-scale]')].map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      id: element.dataset.testid,
      scale: element.dataset.previewScale,
      width: rect.width,
      height: rect.height,
    };
  })`,
);
assert(
  [...EXPECTED_VIEWPORTS].every((viewport) => actualViewports.has(viewport)),
  `Unexpected preview dimensions: ${[...actualViewports].join(', ')}; surfaces: ${JSON.stringify(shellSurfaces)}`,
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
  await evaluate(
    shell.target,
    `document.querySelector('button[aria-label="Reload all previews"]')?.click()`,
  );
  const deadline = Date.now() + 10_000;
  let recovery = {
    unavailableCount: 0,
    previewRetryCount: 0,
    hasRetryAll: false,
    hasRetryFailed: false,
  };
  while (Date.now() < deadline) {
    recovery = await evaluate(
      shell.target,
      `(() => {
        const text = document.body.innerText;
        const labels = [...document.querySelectorAll('button')].map(
          (button) => button.textContent?.trim(),
        );
        return {
          unavailableCount: text.split('Preview unavailable').length - 1,
          previewRetryCount: labels.filter((label) => label === 'Retry').length,
          hasRetryAll: labels.includes('Retry all'),
          hasRetryFailed: labels.includes('Retry failed'),
        };
      })()`,
    );
    if (
      recovery.unavailableCount === EXPECTED_PREVIEW_COUNT &&
      recovery.previewRetryCount === EXPECTED_PREVIEW_COUNT &&
      recovery.hasRetryAll &&
      recovery.hasRetryFailed
    ) {
      break;
    }
    await delay(200);
  }
  assert(
    recovery.unavailableCount === EXPECTED_PREVIEW_COUNT &&
      recovery.previewRetryCount === EXPECTED_PREVIEW_COUNT &&
      recovery.hasRetryAll &&
      recovery.hasRetryFailed,
    `Expected ${EXPECTED_PREVIEW_COUNT} recoverable preview errors with card and aggregate Retry actions, found ${JSON.stringify(recovery)}.`,
  );
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        checked: 'packaged unavailable-server recovery',
        previewCount: previews.length,
        ...recovery,
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
    if (
      synchronizedPreviews.length === EXPECTED_PREVIEW_COUNT &&
      hostMatches &&
      new Set(urls).size === 1
    ) {
      break;
    }
    await delay(250);
  }

  const synchronizedUrls = synchronizedPreviews.map(({ page }) => page.url);
  assert(
    synchronizedPreviews.length === EXPECTED_PREVIEW_COUNT &&
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
