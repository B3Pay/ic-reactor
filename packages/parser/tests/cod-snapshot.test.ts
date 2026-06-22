import * as parser from "../dist/nodejs"
import { describe, expect, it } from "vitest"

describe("COD Rust renderer snapshots", () => {
  it("generates a default service contract", () => {
    const candid = `
      type Account = record {
        owner : principal;
        subaccount : opt blob;
      };

      type TransferResult = variant {
        Ok : nat;
        Err : text;
      };

      service : {
        icrc1_balance_of : (Account) -> (nat) query;
        icrc1_transfer : (Account) -> (TransferResult);
      }
    `

    expect(parser.didToCod(candid)).toMatchSnapshot()
  })

  it("generates metadata from docs and validation tags", () => {
    const candid = `
      /// Account that receives tokens.
      type Account = record {
        /// Owner principal.
        owner : principal;

        /// Contact email.
        /// @format email Invalid email address
        email : text;
      };

      /// Ledger service.
      service : {
        /// Return an account balance.
        balance : (Account) -> (nat) query;
      }
    `

    expect(parser.didToCod(candid)).toMatchSnapshot()
  })

  it("generates quoted names tuples and multi-return methods", () => {
    const candid = `
      type Coordinates = record { float64; float64 };
      type Status = variant {
        Ready;
        Err : text;
      };

      service : {
        "icrc-1-name" : () -> (text) query;
        default : (nat8) -> ();
        locate : (text) -> (Coordinates, Status) query;
      }
    `

    expect(parser.didToCod(candid)).toMatchSnapshot()
  })

  it("generates Zod-style string format helpers", () => {
    const candid = `
      type StringFormats = record {
        /// @format email
        email : text;
        /// @format uuid
        uuid : text;
        /// @format guid
        guid : text;
        /// @format url
        url : text;
        /// @format httpUrl
        http_url : text;
        /// @format hostname
        hostname : text;
        /// @format e164
        phone : text;
        /// @format emoji
        emoji : text;
        /// @format base64
        base64 : text;
        /// @format base64url
        base64url : text;
        /// @format hex
        hex : text;
        /// @format jwt
        jwt : text;
        /// @format nanoid
        nanoid : text;
        /// @format cuid
        cuid : text;
        /// @format cuid2
        cuid2 : text;
        /// @format ulid
        ulid : text;
      };

      service : {}
    `

    expect(parser.didToCod(candid)).toMatchSnapshot()
  })

  it("generates Zod-style ISO namespace helpers", () => {
    const candid = `
      type IsoFormats = record {
        /// @format date-time
        created_at : text;
        /// @format datetime
        updated_at : text;
        /// @format date
        day : text;
        /// @format time
        starts_at : text;
        /// @format duration
        length : text;
      };

      service : {}
    `

    expect(parser.didToCod(candid)).toMatchSnapshot()
  })

  it("generates hash network and compatibility format helpers", () => {
    const candid = `
      type MoreFormats = record {
        /// @format ipv4
        ipv4 : text;
        /// @format ipv6
        ipv6 : text;
        /// @format cidrv4
        cidrv4 : text;
        /// @format cidrv6
        cidrv6 : text;
        /// @format mac
        mac : text;
        /// @format md5
        md5 : text;
        /// @format sha1
        sha1 : text;
        /// @format sha256
        sha256 : text;
        /// @format sha384
        sha384 : text;
        /// @format sha512
        sha512 : text;
        /// @format uri
        uri : text;
        /// @format httpsUrl
        https_url : text;
      };

      service : {}
    `

    expect(parser.didToCod(candid)).toMatchSnapshot()
  })

  it("generates custom format metadata instead of dynamic helpers", () => {
    const candid = `
      type Profile = record {
        /// @format slug Invalid slug
        slug : text;
        /// @format email
        email : text;
      };

      service : {}
    `

    expect(
      parser.didToCod(candid, {
        customJSDocFormatTypes: {
          slug: {
            regex: "^[a-z0-9-]+$",
            errorMessage: "Configured slug error",
          },
          email: {
            regex: "^[^@]+@[^@]+$",
          },
        },
      })
    ).toMatchSnapshot()
  })

  it("generates regex helpers for pattern validators", () => {
    const candid = `
      type Profile = record {
        /// Slug used in URLs.
        /// @pattern ^[a-z0-9-]+$
        slug : text;

        /// @pattern ^[A-Z]{3}$
        code : text;
      };

      service : {}
    `

    expect(parser.didToCod(candid)).toMatchSnapshot()
  })
})
