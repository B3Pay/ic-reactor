import { createFileRoute, Link } from "@tanstack/react-router"
import type { ReactElement } from "react"
import {
  startLedgerReads,
  startMinterReads,
} from "../components/home/featured.ts"
import { FeaturedLedger } from "../components/home/FeaturedLedger.tsx"
import { OpenCanister } from "../components/home/OpenCanister.tsx"
import { RouteError } from "../components/RouteError.tsx"
import { REGISTRY } from "../lib/registry.ts"

const FEATURED = REGISTRY.filter((entry) => entry.featured === true)

export const Route = createFileRoute("/")({
  // Starts the featured cards' reads and returns at once: the cards stream
  // in as each read lands. Typed modules only, never a server function (the
  // StackBlitz preview renders this page where server functions cannot
  // run), and nothing here can throw.
  loader: ({ context: { reactor, queryClient } }) => {
    for (const entry of FEATURED) {
      if (entry.kind === "ckbtc-minter") {
        startMinterReads(reactor, queryClient, entry.id)
      } else {
        startLedgerReads(reactor, queryClient, entry.id)
      }
    }
  },
  head: () => ({
    meta: [
      { title: "Canister Studio" },
      {
        name: "description",
        content:
          "Automatic forms and safe calls for any Internet Computer canister, with live mainnet data rendered on the server.",
      },
    ],
  }),
  errorComponent: (props) => (
    <RouteError {...props} title="The home page failed" />
  ),
  component: HomePage,
})

const POINTS = [
  "Typed canisters come from committed .did files; any other canister is read live from its certified metadata, and labelled loudly when it is not.",
  "Reads are keyed by caller and argument bytes, server-rendered, and hydrated without a second request.",
  "Writes need a signed-in sender, are never retried blindly, and re-send only through a deduplicated offer.",
] as const

const FEATURES = [
  {
    to: "/canister/$canisterId",
    params: { canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai" },
    title: "A form for every method",
    text: "Any canister's live, certified interface becomes a form per method: records, variants, options, vectors and blobs, with the exact Candid bytes before anything is sent.",
    cta: "Open NNS governance",
  },
  {
    to: "/wallet",
    title: "Typed wallet",
    text: "Hand-written flows over generated types: a caller-scoped balance, a typed transfer form, a confirm step, and the safe re-send after an unknown outcome.",
    cta: "Open the wallet",
  },
  {
    to: "/safety",
    title: "Safety lab",
    text: "Lost replies, traps, 429s, a caller switching mid-flight: every rule ic-reactor enforces, run against an in-memory replica in your browser.",
    cta: "Run the scenarios",
  },
  {
    to: "/playground",
    title: "Playground",
    text: "Paste a .did, compile it in the browser, get forms, a TypeScript module, a projection, and a compatibility check against a live canister.",
    cta: "Paste a .did",
  },
  {
    to: "/history",
    title: "History and shared links",
    text: "Every call is kept in this browser with its exact argument bytes. A shared query link renders its result on the server.",
    cta: "See your calls",
  },
] as const

function HomePage(): ReactElement {
  return (
    <div className="page home">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="stack-lg home-hero-text">
          <div className="stack-sm">
            <p className="home-eyebrow">ic-reactor 4 + candid-core</p>
            <h1 id="home-title" className="page-title home-title">
              Call any Internet Computer canister, safely.
            </h1>
            <p className="lead">
              Automatic forms for every method, from typed modules generated at
              build time or from a live canister’s certified interface. Every
              write shows its sender, target and exact bytes first; every
              failure says whether it may have executed.
            </p>
          </div>
          <div className="page-actions">
            <Link
              to="/canister/$canisterId"
              params={{ canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai" }}
              className="btn btn-primary btn-lg"
            >
              Explore the ICP ledger
            </Link>
            <Link to="/safety" className="btn btn-lg">
              See the safety rules
            </Link>
          </div>
          <ul className="list-plain stack-sm home-points">
            {POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
        <OpenCanister />
      </section>

      <section className="section" aria-labelledby="featured-title">
        <div className="section-header">
          <h2 id="featured-title" className="section-title">
            Typed canisters
          </h2>
          <p className="text-sm muted">
            Live from mainnet, rendered on the server and hydrated without a
            second read.
          </p>
        </div>
        <div className="grid home-featured-grid">
          {FEATURED.map((entry) => (
            <FeaturedLedger key={entry.id} entry={entry} />
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="features-title">
        <h2 id="features-title" className="section-title">
          What is in the studio
        </h2>
        <ul className="list-plain grid home-features">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="card home-feature">
              <div className="card-body">
                <h3 className="card-title">{feature.title}</h3>
                <p className="text-sm muted grow">{feature.text}</p>
                {"params" in feature ? (
                  <Link
                    to={feature.to}
                    params={feature.params}
                    className="home-feature-link"
                  >
                    {feature.cta} →
                  </Link>
                ) : (
                  <Link to={feature.to} className="home-feature-link">
                    {feature.cta} →
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
