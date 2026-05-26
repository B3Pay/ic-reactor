# Next.js App Router (Hydration-Safe Pattern)

This project provides a clean template demonstrating how to use `@ic-reactor` features and **TanStack Query** correctly inside **Next.js 14 App Router** dapps.

## The App Router Challenge on the Internet Computer

When using Web3 frameworks on RSC-enabled frameworks like Next.js App Router, directly creating client/actor instances in global scope or inside server pages triggers major **Hydration Mismatches** and crashes on mount. This template isolates the state initialization cleanly inside client trees so your application compiles and runs seamlessly on both Server and Client environments.

## Local Development

### 1. Prerequisite: Local Replica

Start your local Internet Computer replica and deploy the todo canister:

```bash
# In another terminal or separate window:
dfx start --background --clean
dfx deploy
```

_(Alternatively, run `dfx deps deploy internet_identity` if configuring local login)_

### 2. Run the Next.js App

Install the packages and run the dev server of this example:

```bash
cd examples/nextjs-app-router
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) inside your web browser.
