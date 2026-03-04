# MyMcKenzieCS Next.js 2

A modern Next.js 14+ implementation of the MyMcKenzieCS legal assistance platform, converted from the static HTML/CSS/JS application (MyMcKenzieCS-2).

## 🚀 Features

- **Next.js 14+ App Router**: Modern React framework with server-side rendering
- **TypeScript**: Full type safety throughout the application
- **Tailwind CSS**: Utility-first CSS framework for responsive design
 
- **Stripe Payments**: Subscription and payment processing
- **AI Chatbot**: Integration with OpenAI and Google Gemini for legal assistance
- **Case Management**: Track and manage legal cases
- **Document Upload**: Upload and manage legal documents
- **Responsive Design**: Mobile-first approach with responsive layouts

## 📁 Project Structure

```
mymckenzie-nextjs2/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── api/               # API routes
│   │   │   ├── auth/          # Authentication endpoints
│   │   │   └── chat/          # Chatbot endpoints
│   │   ├── auth/              # Auth pages (signin, signup)
│   │   ├── dashboard/         # Dashboard pages
│   │   ├── chatbot/           # Chatbot interface
│   │   ├── pricing/           # Pricing page
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Home page
│   │   └── globals.css        # Global styles
│   ├── components/            # React components
│   │   ├── auth/              # Auth-related components
│   │   ├── chatbot/           # Chat interface components
│   │   ├── dashboard/         # Dashboard components
│   │   └── Navbar.tsx         # Navigation component
│   ├── lib/                   # Utility libraries
 
│   │   ├── stripe.ts          # Stripe integration
│   │   ├── openai.ts          # OpenAI integration
│   │   └── gemini.ts          # Google Gemini integration
│   └── types/                 # TypeScript type definitions
├── public/                    # Static assets
├── .env.example              # Environment variables template
├── next.config.js            # Next.js configuration
├── tailwind.config.js        # Tailwind CSS configuration
├── tsconfig.json             # TypeScript configuration
└── package.json              # Dependencies and scripts
```

## 🛠️ Installation

### Prerequisites

- Node.js 18+ 
- npm or yarn
 
- Stripe account (for payments)
- OpenAI API key (for chatbot)

### Setup Steps

1. **Clone or navigate to the project**:
   ```bash
   cd ~/mymckenzie-nextjs2
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and fill in your credentials:
   ```env
   

   

   # Stripe
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_publishable_key
   STRIPE_SECRET_KEY=your_secret_key
   STRIPE_WEBHOOK_SECRET=your_webhook_secret

   # OpenAI
   OPENAI_API_KEY=your_openai_api_key

   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```

5. **Open your browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

### Adding New Pages

Create a new folder in `src/app/` with a `page.tsx` file:

```tsx
// src/app/my-page/page.tsx
export default function MyPage() {
  return <div>My New Page</div>
}
```

### Adding New API Routes

Create a new folder in `src/app/api/` with a `route.ts` file:

```tsx
// src/app/api/my-endpoint/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  return NextResponse.json({ message: 'Hello' })
}
```

 
2. Enable Authentication (Email/Password)
3. Create a Firestore database
4. Enable Cloud Storage
 
6. Update Firestore security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /cases/{caseId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 💳 Stripe Setup

1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Get your API keys from the Stripe Dashboard
3. Create products and pricing plans
   - You can generate/update the billing passes defined in the dashboard via `npm run stripe:sync-passes`. The script uses `STRIPE_SECRET_KEY` (and optional `STRIPE_PASS_CURRENCY`) to seed Products + Prices for every pass in `src/data/pass-definitions.json`.
4. Set up webhook endpoints for subscription events

## 🤖 AI Integration

### OpenAI

The app uses OpenAI's GPT-4 for the chatbot. Configure in `src/lib/openai.ts`.

### Google Gemini

Alternative AI provider using Google's Gemini Pro. Configure in `src/lib/gemini.ts`.

## OpenAI Model Fallback & Usage Logging

- The app uses the model specified in `OPENAI_CHAT_MODEL` in your `.env.local`. If not set, it will fallback to `gpt-4o`, then `gpt-4`, then `gpt-3.5-turbo`.
- All OpenAI API usage and errors are logged to `data/logs/openai-usage.log.jsonl`.
- Admins can view recent OpenAI usage in the Admin Panel under the "OpenAI Usage" tab.
- **Security:** Never expose your OpenAI API keys in client-side code or public files. All OpenAI calls are server-side only.

## 📦 Migration from MyMcKenzieCS-2

This project is a complete rewrite of the original MyMcKenzieCS-2 static application with the following improvements:

### Key Changes

1. **Framework**: Static HTML → Next.js 14 with App Router
2. **Language**: JavaScript → TypeScript
3. **Styling**: Custom CSS → Tailwind CSS
4. **Routing**: Multi-page HTML → Next.js file-based routing
5. **State Management**: DOM manipulation → React state management
6. **API**: Express server → Next.js API routes
7. **Build System**: None → Next.js built-in bundler

### Feature Parity

All features from MyMcKenzieCS-2 have been migrated:

- ✅ User authentication (signup, signin, password reset)
- ✅ Dashboard with case management
- ✅ Document upload and management
- ✅ AI chatbot interface
- ✅ Calendar and scheduling
- ✅ Draft management
- ✅ Billing and payments
- ✅ Settings page

### TODO: Implementation Needed

The following integrations need to be completed with your actual credentials:

 
2. **OpenAI/Gemini Chat**: Update chat endpoint in `src/app/api/chat/route.ts`
3. **Stripe Payments**: Implement payment flows and webhooks
 
5. **Case Management**: Implement CRUD operations with Firestore

## 🚢 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy

### Other Platforms

The app can be deployed to any platform that supports Next.js:
- Netlify
- AWS Amplify
- Railway
- Render
- Self-hosted with Node.js

## 🔒 Security Notes

- Never commit `.env.local` or any file containing secrets
- Use environment variables for all API keys
- Implement proper authentication checks on API routes
- Set up Firestore security rules
- Enable rate limiting on API endpoints
- Validate all user inputs
- Use HTTPS in production

## 📝 License

This project is proprietary. All rights reserved.

## 🤝 Contributing

This is a private project. If you have access and want to contribute:

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## 📧 Support

For questions or issues, please contact the development team.

---

**Note**: This is a Next.js conversion of the MyMcKenzieCS-2 webapp. Make sure to complete the integration setup in the lib files and API routes before deploying to production.
