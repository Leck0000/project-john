import { test, expect } from '@playwright/test';

// Navigation is relative to baseURL (playwright.config.ts: http://localhost:3000${VITE_BASE ?? '/'}),
// so these specs work for both the local build ('/') and the Pages build ('/<repo>/').

test('app smoke test - page loads and root element renders', async ({ page }) => {
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  // Check that the app root element is present
  await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 15000 });
  // Check that the page has proper title
  await expect(page).toHaveTitle(/Project:John/);
});

test('theme toggle exists and is accessible', async ({ page }) => {
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  // Theme toggle should be present
  await expect(page.getByRole('button', { name: /theme|dark|light/i })).toBeVisible({ timeout: 15000 });
  // Check that CSS variables are set (no hardcoded colors)
  const bg = await page.evaluate(() => {
    return getComputedStyle(document.documentElement).getPropertyValue('--bg');
  });
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(bg).not.toBe('');
});

test('responsive layout - sidebar is a drawer below 1024px and a fixed column above', async ({ page }) => {
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  const menu = page.getByRole('button', { name: 'Open filters and tools' });

  // Desktop: the sidebar is a visible column and the drawer button is hidden.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./?demo=1');
  await expect(sidebar).toBeInViewport();
  await expect(menu).toBeHidden();

  // Below 1024px: the sidebar is off-canvas until the menu button opens it.
  await page.setViewportSize({ width: 800, height: 800 });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebar).not.toBeInViewport();

  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(sidebar).toBeInViewport();
  await expect(sidebar.getByRole('list', { name: 'Windows tools' })).toBeVisible();

  // Escape closes the drawer again.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebar).not.toBeInViewport();
});

test('ticket queue loads and displays tickets', async ({ page }) => {
  await page.goto('./?demo=1');
  const queue = page.getByRole('region', { name: /Ticket queue/ });
  await expect(queue).toBeVisible();
  // Demo mode seeds 5 tickets (src/app/demo.ts DEMO_TICKETS).
  await expect(queue.getByRole('heading', { name: 'Ticket queue (5)' })).toBeVisible();
  const cards = page.getByRole('list', { name: 'Tickets' }).getByRole('button');
  await expect(cards).toHaveCount(5);

  // Selecting a ticket shows it in the detail pane.
  const first = cards.filter({ hasText: 'User locked out after password reset' });
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('ticket-detail').getByRole('heading', { level: 1 })).toContainText(
    'User locked out after password reset'
  );
});

test('authentication flows - /login form posts credentials to /auth/login', async ({ page }) => {
  // No backend in this test: capture the request instead.
  const posted: unknown[] = [];
  await page.route('**/auth/login', async (route) => {
    posted.push(route.request().postDataJSON());
    await route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"bad credentials"}' });
  });

  // The login form is only reachable by URL: nothing in the app links to /login.
  await page.goto('./login');
  const form = page.getByRole('form', { name: 'Authentication' });
  await expect(form).toBeVisible();
  await expect(form.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  // The field-group <div>s also carry aria-labels, so target the inputs themselves.
  const email = form.getByRole('textbox', { name: /^Email/ });
  const password = form.locator('input#password[type=password]');
  const submit = form.getByRole('button', { name: 'Sign in' });

  // Browser validation blocks an invalid email: nothing is sent.
  await email.fill('not-an-email');
  await password.fill('secret');
  await submit.click();
  expect(await email.evaluate((el) => (el as HTMLInputElement).validity.valid)).toBe(false);
  expect(posted).toHaveLength(0);

  // Valid credentials are POSTed to the auth API.
  await email.fill('tech1@example.com');
  await submit.click();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0]).toEqual({ email: 'tech1@example.com', password: 'secret' });
});
