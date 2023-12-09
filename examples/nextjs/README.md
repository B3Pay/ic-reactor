# InternetComputer - Rust + Next.js Template

This is a template for creating a Next.js app with a Rust backend that can be deployed to the Internet Computer.

![Alt text](public/demo.png)

## Getting Started

1. Install the [DFINITY Canister SDK](https://sdk.dfinity.org/docs/quickstart/local-quickstart.html)
2. Install [Node.js](https://nodejs.org/en/download/)
3. Install [Rust](https://www.rust-lang.org/tools/install)

## Running Locally

Installing dependencies:

1. Run `yarn install:all` or `npm run install:all`
   it will run the following commands:

   Install Node.js dependencies:

- Run `yarn install` or `npm install`

  For extract candid definition from canister WASM:

- Run `yarn candid:install` or `npm run candid:install`

  For transforming Wasm canisters running on the Internet Computer:

- Run `yarn wasm:install` or `npm run wasm:install`

Running Local Internet Computer:

2. Run `yarn dfx:start` or `npm run dfx:start`

Deploying to the Local Internet Computer:

3.1 Run `yarn deploy` or `npm run deploy`
3.2 Run `yarn identity:deploy` or `npm run identity:deploy`

Running Next.js app:

4. Run `yarn dev` or `npm run dev`
5. Open http://localhost:3000 in your browser

## Deploying to the Internet Computer

1. Run `yarn deploy --network=ic` to deploy the canisters to the Internet Computer

## Notes

- The Rust code is located in the `backend` directory
- The Next.js code is located in the `src` directory
- The canister configuration is located in the `dfx.json` file

## Resources

- [DFINITY Canister SDK](https://sdk.dfinity.org/docs/quickstart/local-quickstart.html)
- [Rust](https://www.rust-lang.org/)
- [Next.js](https://nextjs.org/)
- [ic-wasm](https://github.com/dfinity/ic-wasm)
- [candid-extractor](https://github.com/dfinity/cdk-rs/tree/main/src/candid-extractor)
- [ReActor](https://github.com/B3Pay/re-actor)
