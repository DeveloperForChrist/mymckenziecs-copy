# Migration Guide: MyMckenzie-2 to MyMckenzie-NextJS2

## Overview

This document outlines the migration from the static HTML/CSS/JS application (MyMckenzie-2) to a modern Next.js framework (MyMckenzie-NextJS2).

## Architecture Changes

### Before (MyMckenzie-2)
- **Type**: Static HTML/CSS/JS application
- **Server**: Separate Express.js server (`server/index.cjs`)
- **Routing**: Multiple HTML files with manual navigation
- **State**: DOM manipulation with vanilla JavaScript
- **Styling**: Custom CSS files
- **Build**: No build process

### After (MyMckenzie-NextJS2)
- **Type**: Next.js 14+ with App Router
- **Server**: Integrated Next.js API routes
- **Routing**: File-based routing with React components
- **State**: React state management with hooks
- **Styling**: Tailwind CSS utility classes
- **Build**: Next.js optimized production build

## File Structure Mapping

### Pages
| Old (MyMckenzie-2) | New (MyMckenzie-NextJS2) |
|-------------------|-------------------------|
| `index.html` | `src/app/page.tsx` |
| `auth/signin.html` | `src/app/auth/signin/page.tsx` |
| `auth/user-signup.html` | `src/app/auth/signup/page.tsx` |
| `dashboard/user-dashboard.html` | `src/app/dashboard/page.tsx` |
| `dashboard/my-cases.html` | `src/app/dashboard/my-cases/page.tsx` |
| `dashboard/documents.html` | `src/app/dashboard/documents/page.tsx` |
| `dashboard/my-drafts.html` | `src/app/dashboard/my-drafts/page.tsx` |
| `dashboard/my-calendar.html` | `src/app/dashboard/calendar/page.tsx` |
| `chatbot/chatbot.html` | `src/app/chatbot/page.tsx` |
| `pricing.html` | `src/app/pricing/page.tsx` |
| `settings/settings.html` | `src/app/settings/page.tsx` |

### JavaScript Components
| Old | New |
|-----|-----|
| `assets/js/navbar.js` | `src/components/Navbar.tsx` |
| `assets/js/signin.js` | `src/components/auth/SignInForm.tsx` |
| `assets/js/user-signup.js` | `src/components/auth/SignUpForm.tsx` |
| `assets/js/user-dashboard.js` | `src/components/dashboard/DashboardLayout.tsx` |

### Server/API
| Old | New |
|-----|-----|
| `server/index.cjs` (signup endpoint) | `src/app/api/auth/signup/route.ts` |
| `server/index.cjs` (signin endpoint) | `src/app/api/auth/signin/route.ts` |
| `server/routes/analysis.js` | `src/app/api/chat/route.ts` |

### Configuration/Utilities
| Old | New |
|-----|-----|
| N/A (CDN) | `src/lib/supabase.ts` |
| `functions/openai-service.js` | `src/lib/openai.ts` |
| N/A | `src/lib/gemini.ts` |
| N/A | `src/lib/stripe.ts` |
| `serviceAccountKey.json` | N/A (Supabase handles auth server-side) |

## Key Implementation Differences

### 1. Authentication

**Old Approach:**
```javascript
// assets/js/signin.js
const auth = getAuth();
signInWithEmailAndPassword(auth, email, password)
  .then(() => window.location.href = '/dashboard/user-dashboard.html');
```

**New Approach:**
```typescript
// src/components/auth/SignInForm.tsx
const response = await fetch('/api/auth/signin', {
  method: 'POST',
  body: JSON.stringify({ email, password })
});
router.push('/dashboard');
```

### 2. Routing

**Old Approach:**
```html
<a href="dashboard/user-dashboard.html">Dashboard</a>
```

**New Approach:**
```tsx
import Link from 'next/link'
<Link href="/dashboard">Dashboard</Link>
```

### 3. Styling

**Old Approach:**
```html
<link rel="stylesheet" href="assets/css/style.css">
<div class="hero-section">...</div>
```

**New Approach:**
```tsx
<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
  ...
</div>
```

### 4. State Management

**Old Approach:**
```javascript
// DOM manipulation
document.getElementById('message').textContent = 'Hello';
```

**New Approach:**
```tsx
// React state
const [message, setMessage] = useState('');
<div>{message}</div>
```

## Migration Checklist

### Phase 1: Setup ✅
- [x] Create Next.js project structure
- [x] Set up TypeScript configuration
- [x] Configure Tailwind CSS
- [x] Set up environment variables
- [x] Create package.json with dependencies

### Phase 2: Pages ✅
- [x] Convert home page (index.html)
- [x] Convert auth pages (signin, signup)
- [x] Convert dashboard pages
- [x] Convert chatbot page
- [x] Convert pricing page
- [x] Convert settings page

### Phase 3: Components ✅
- [x] Create Navbar component
- [x] Create auth form components
- [x] Create dashboard layout
- [x] Create chat interface

### Phase 4: API Routes ✅
- [x] Create auth API routes
- [x] Create chat API route
- [x] Set up API structure

### Phase 5: Integrations ✅
- [x] Configure Supabase client
- [x] Configure Stripe
- [x] Configure OpenAI
- [x] Configure Google Gemini

### Phase 6: TODO (Requires your input)
- [ ] Add actual Supabase credentials to `.env.local`
- [ ] Implement Supabase Auth in API routes
- [ ] Implement actual OpenAI/Gemini chat logic
- [ ] Set up Stripe payment flows
- [ ] Implement document upload functionality
- [ ] Implement case management CRUD operations
- [ ] Set up Firestore security rules
- [ ] Test all authentication flows
- [ ] Test all API endpoints
- [ ] Deploy to production

## Environment Variables Required

Copy from MyMckenzie-2 or create new:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# From MyMckenzie-2 .env (if exists)
OPENAI_API_KEY=...
STRIPE_SECRET_KEY=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
```

## Testing Steps

1. **Install dependencies**:
   ```bash
   cd ~/mymckenzie-nextjs2
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your credentials
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```

4. **Test each page**:
   - [ ] Home page: http://localhost:3000
   - [ ] Sign up: http://localhost:3000/auth/signup
   - [ ] Sign in: http://localhost:3000/auth/signin
   - [ ] Dashboard: http://localhost:3000/dashboard
   - [ ] Chatbot: http://localhost:3000/chatbot
   - [ ] Pricing: http://localhost:3000/pricing
   - [ ] Settings: http://localhost:3000/settings

5. **Test API routes**:
   - [ ] POST /api/auth/signup
   - [ ] POST /api/auth/signin
   - [ ] POST /api/chat

## Benefits of Migration

1. **Performance**: Server-side rendering, automatic code splitting
2. **SEO**: Better search engine optimization
3. **Developer Experience**: Hot reload, TypeScript, better tooling
4. **Scalability**: Easy to add new features and pages
5. **Maintainability**: Component-based architecture
6. **Modern Stack**: Latest React patterns and best practices
7. **Type Safety**: TypeScript prevents runtime errors
8. **Build Optimization**: Automatic image optimization, minification

## Potential Issues & Solutions

### Issue: TypeScript Errors
**Solution**: Run `npm install` first, then TypeScript will work properly

### Issue: Firebase Not Initialized
**Solution**: Make sure all Firebase environment variables are set in `.env.local`

### Issue: API Routes Not Working
**Solution**: Check that the server is running and environment variables are loaded

### Issue: Styling Differences
**Solution**: Adjust Tailwind classes to match original design if needed

## Next Steps

1. Install dependencies: `npm install`
2. Configure environment variables
3. Test locally: `npm run dev`
4. Implement remaining integrations
5. Deploy to Vercel or your preferred platform

## Support

For questions about the migration, refer to:
- Next.js documentation: https://nextjs.org/docs
- Tailwind CSS: https://tailwindcss.com/docs
- Firebase: https://firebase.google.com/docs

---

**Migration Status**: ✅ Structure Complete - Integration TODOs Remaining
