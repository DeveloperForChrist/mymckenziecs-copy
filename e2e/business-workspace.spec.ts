import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000'
const businessEmail = process.env.E2E_BUSINESS_EMAIL || ''
const businessPassword = process.env.E2E_BUSINESS_PASSWORD || ''
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const workspaceSections = [
  'clients',
  'documents',
  'notes',
  'calendar',
  'leads',
  'video',
  'messages',
  'notifications',
  'case-law',
  'profile',
  'directory',
  'settings',
  'feedback',
] as const

function buildInvitedEmail() {
  const timestamp = Date.now()
  if (!businessEmail.includes('@')) {
    return `client-portal-e2e-${timestamp}@example.com`
  }

  const atIndex = businessEmail.indexOf('@')
  const localPart = businessEmail.slice(0, atIndex)
  const domain = businessEmail.slice(atIndex + 1)
  return `${localPart}+client-portal-e2e-${timestamp}@${domain}`
}

async function buildAuthCookies(email: string, password: string) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session?.access_token || !data.session?.refresh_token) {
    throw new Error(error?.message || 'Unable to create a Supabase session for browser testing.')
  }

  const cookieJar: Array<{ name: string; value: string }> = []
  const upsertCookie = (name: string, value: string) => {
    const existingIndex = cookieJar.findIndex((cookie) => cookie.name === name)
    const nextCookie = { name, value }
    if (existingIndex === -1) {
      cookieJar.push(nextCookie)
      return
    }
    cookieJar[existingIndex] = nextCookie
  }

  const serverClient = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieJar
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          upsertCookie(cookie.name, cookie.value || '')
        }
      },
    },
  })

  const { error: sessionError } = await serverClient.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })

  if (sessionError) {
    throw new Error(sessionError.message)
  }

  const origin = new URL(baseURL).origin
  return cookieJar
    .filter((cookie) => cookie.value)
    .map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      url: origin,
    }))
}

async function createBusinessContext(browser: Browser) {
  const context = await browser.newContext()
  const cookies = await buildAuthCookies(businessEmail, businessPassword)
  await context.addCookies(cookies)
  return context
}

async function openBusinessWorkspace(page: Page) {
  await page.goto('/business/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/business\/dashboard/)
  await expect(page.getByRole('navigation', { name: 'Business workspace' })).toBeVisible()
}

async function expectBusinessUser(page: Page) {
  const payload = await page.evaluate(async () => {
    const response = await fetch('/api/user', { credentials: 'include', cache: 'no-store' })
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    }
  })

  expect(payload.status).toBe(200)
  expect(payload.body.accountType).toBe('business')
  expect(payload.body.hasBusinessWorkspace).toBe(true)
}

async function openWorkspaceSection(page: Page, sectionId: string) {
  await page.getByTestId(`business-nav-${sectionId}`).click()
  await expect(page).toHaveURL(new RegExp(`/business/dashboard\\?section=${sectionId.replace('-', '\\-')}`))
  await expect(page.getByTestId(`business-nav-${sectionId}`)).toHaveAttribute('aria-current', 'page')
  await expect(page).not.toHaveURL(/\/auth\/verify-email/)
}

async function createInviteFromInbox(page: Page, invitedEmail: string) {
  await openWorkspaceSection(page, 'messages')
  await page.getByTestId('invite-client-button').click()
  await page.getByLabel('Client email').fill(invitedEmail)
  await page.getByLabel(/Client name/i).fill('Portal E2E Client')

  const inviteResponsePromise = page.waitForResponse((response) => (
    response.url().includes('/api/business/client-invite') &&
    response.request().method() === 'POST'
  ))

  await page.getByTestId('send-client-invite').click()

  const inviteResponse = await inviteResponsePromise
  const invitePayload = await inviteResponse.json().catch(() => ({}))

  expect(inviteResponse.ok(), JSON.stringify(invitePayload)).toBeTruthy()
  expect(typeof invitePayload?.signupUrl).toBe('string')
  expect(String(invitePayload.signupUrl)).toContain('/auth/signup?token=')
  await expect(page.getByText('Invite sent!')).toBeVisible()

  return String(invitePayload.signupUrl)
}

async function completeInvitedSignup(page: Page, signupUrl: string, invitedEmail: string) {
  const invitedPassword = `Portal-E2E-${Date.now()}`

  await page.goto(signupUrl, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText(/invited you to join their client portal/i)).toBeVisible()
  await page.getByLabel('Full Name').fill('Portal E2E Client')
  await page.getByLabel('Password', { exact: true }).fill(invitedPassword)
  await page.getByLabel('Confirm Password').fill(invitedPassword)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /Create account and open portal/i }).click()

  await expect(page).toHaveURL(/\/client-portal/)
  await expect(page.getByRole('heading', { name: 'MyMcKenzieCS Client Portal' })).toBeVisible()

  const userPayload = await page.evaluate(async () => {
    const response = await fetch('/api/user', { credentials: 'include', cache: 'no-store' })
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    }
  })

  expect(userPayload.status).toBe(200)
  expect(String(userPayload.body.email || '').toLowerCase()).toBe(invitedEmail.toLowerCase())
  expect(userPayload.body.emailVerified).toBe(true)

  await page.goto('/auth/verify-email?redirect=%2Fclient-portal', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/client-portal/)
  const stableUrl = page.url()
  await page.waitForTimeout(3000)
  await expect(page).toHaveURL(stableUrl)
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  if (!businessEmail || !businessPassword || !supabaseUrl || !supabaseAnonKey) {
    throw new Error('Set the business test credentials and Supabase env vars before running Playwright tests.')
  }
})

test('business workspace navigation and document actions stay healthy', async ({ browser }, testInfo) => {
  const businessContext = await createBusinessContext(browser)
  const page = await businessContext.newPage()

  await openBusinessWorkspace(page)
  await expectBusinessUser(page)

  for (const section of workspaceSections) {
    await openWorkspaceSection(page, section)
  }

  await openWorkspaceSection(page, 'documents')

  const uploadPath = testInfo.outputPath(`business-workspace-${Date.now()}.txt`)
  await fs.writeFile(uploadPath, 'Business workspace E2E document upload.\n', 'utf8')
  const documentName = path.basename(uploadPath)

  await page.getByTestId('documents-upload-input').setInputFiles(uploadPath)

  const documentRow = page.getByTestId('document-row').filter({ hasText: documentName }).first()
  await expect(documentRow).toBeVisible()

  const starButton = documentRow.getByTestId('document-star-button')
  await starButton.click()
  await expect(starButton).toHaveAttribute('aria-pressed', 'true')
  await starButton.click()
  await expect(starButton).toHaveAttribute('aria-pressed', 'false')

  await documentRow.getByTestId('document-delete-button').click()
  await expect(page.getByText('Delete this document?')).toBeVisible()
  await page.getByTestId('documents-confirm-delete').click()
  await expect(documentRow).toHaveCount(0)

  await businessContext.close()
})

test('client portal invite flow prevents accidental account takeover in the same browser tab set', async ({ browser }) => {
  const businessContext = await createBusinessContext(browser)
  const businessPage = await businessContext.newPage()

  await openBusinessWorkspace(businessPage)
  const invitedEmail = buildInvitedEmail()
  const signupUrl = await createInviteFromInbox(businessPage, invitedEmail)

  const inviteTab = await businessContext.newPage()
  await inviteTab.goto(signupUrl, { waitUntil: 'domcontentloaded' })

  await expect(inviteTab.getByText(new RegExp(`Signed in as\\s+${businessEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'))).toBeVisible()
  await expect(inviteTab.getByRole('button', { name: /Use a different account/i })).toBeVisible()
  await expect(inviteTab.getByRole('button', { name: /Create account and open portal/i })).toBeDisabled()

  await businessPage.bringToFront()
  await expectBusinessUser(businessPage)
  await expect(businessPage).toHaveURL(/\/business\/dashboard/)

  await businessContext.close()
})

test('invited client signs up without verification and business session stays isolated', async ({ browser }) => {
  const businessContext = await createBusinessContext(browser)
  const businessPage = await businessContext.newPage()

  await openBusinessWorkspace(businessPage)
  const invitedEmail = buildInvitedEmail()
  const signupUrl = await createInviteFromInbox(businessPage, invitedEmail)

  const clientContext = await browser.newContext()
  const clientPage = await clientContext.newPage()
  await completeInvitedSignup(clientPage, signupUrl, invitedEmail)

  await businessPage.bringToFront()
  await expectBusinessUser(businessPage)
  await openWorkspaceSection(businessPage, 'messages')

  await clientContext.close()
  await businessContext.close()
})
