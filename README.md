# Voice Insights Dashboard

Build a web application called "Voice of Customer Copilot".

It is an AI-powered product management tool that helps Product Managers turn large volumes of customer reviews into evidence-backed product insights.

The core product experience must be a desktop-first two-panel dashboard:

LEFT PANEL:

"Customer Voice"

- Show actual customer reviews

- Search and filter reviews

- Scrollable review feed

- Each review should display available metadata such as date, rating, source, etc.

- Never fabricate missing review metadata

RIGHT PANEL:

"AI Insights"

- Overview KPI cards

- Top Pain Points

- Emerging Trends

- Potential Churn Signals

- AI-assisted Prioritization

- Potential Product Opportunities

The most important interaction is:

AI insight → supporting customer reviews.

When a PM clicks a pain point on the right, the left panel should filter to the actual reviews supporting that insight.

When a PM clicks a review on the left, show which AI insights that review contributes to.

The visual style should be modern, clean, professional B2B SaaS / AI product analytics. Avoid excessive gradients, excessive rounded cards, childish AI visuals, or generic chatbot styling.

The application should launch with a "Zomato Reviews" demo dataset selected by default.

There should also be a "+ Add Dataset" button in the header for uploading additional datasets later.

Create the initial application structure and dashboard UI first. Do not use fake metrics or fake customer reviews. Use clearly marked placeholders only where real data has not yet been connected.

Do not build authentication, billing, team collaboration, notifications, or other non-essential enterprise features.

Focus on making the main dashboard feel like a serious PM decision-support product.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://voice-of-customer-copilot.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9d8fb09f-cedf-4b39-ab03-b27fc016f4da).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
