```javascript
(() => {
  "use strict";

  /*
   * MARKET.JS
   *
   * 1. Gets the latest real Coinbase price.
   * 2. Uses that as the starting price.
   * 3. Simulates small market movement afterward.
   *
   * IMPORTANT:
   * Only the initial price is real exchange data.
   * Prices after that are simulated.
   */

  const COINS = {
    BTC: {
      product: "BTC-USD",
      name: "Bitcoin"
    },

    ETH: {
      product: "ETH-USD",
      name: "Ethereum"
    },

    SOL: {
      product: "SOL-USD",
      name: "Solana"
    }
  };

  const prices = {
    BTC: null,
    ETH: null,
    SOL: null
  };

  const realPrices = {
    BTC: null,
    ETH: null,
    SOL: null
  };

  const changes = {
    BTC: 0,
    ETH: 0,
    SOL: 0
  };

  let activeCoin = "BTC";

  let usdCad = 1.35;

  let started = false;

  /*
   * ---------------------------------------------------------
   * HELPERS
   * ---------------------------------------------------------
   */

  function num(value) {
    const n = Number(value);

    return Number.isFinite(n)
      ? n
      : null;
  }

  function money(value) {
    const n = num(value);

    if (n === null) {
      return "—";
    }

    return "$" + n.toLocaleString("en-CA", {
      minimumFractionDigits: n < 100 ? 2 : 0,
      maximumFractionDigits: n < 100 ? 2 : 2
    });
  }

  function setText(ids, value) {
    for (const id of ids) {
      const element =
        document.getElementById(id);

      if (element) {
        element.textContent = value;
      }
    }
  }

  function getCadPrice(coin) {
    if (
      prices[coin] === null
    ) {
      return null;
    }

    return prices[coin] * usdCad;
  }

  /*
   * ---------------------------------------------------------
   * STATUS
   * ---------------------------------------------------------
   */

  function setStatus(text, live) {
    const ids = [
      "marketStatus",
      "liveMarketStatus",
      "marketConnectionStatus"
    ];

    for (const id of ids) {
      const element =
        document.getElementById(id);

      if (!element) {
        continue;
      }

      element.textContent = text;

      element.classList.toggle(
        "live",
        live
      );

      element.classList.toggle(
        "offline",
        !live
      );
    }

    document.documentElement.dataset.marketStatus =
      live ? "live" : "offline";
  }

  /*
   * ---------------------------------------------------------
   * REAL PRICE
   * ---------------------------------------------------------
   */

  async function getRealPrice(coin) {
    const product =
      COINS[coin].product;

    const url =
      "https://api.exchange.coinbase.com/products/" +
      product +
      "/ticker?_=" +
      Date.now();

    try {
      const response =
        await fetch(
          url,
          {
            cache: "no-store"
          }
        );

      if (!response.ok) {
        throw new Error(
          "Coinbase HTTP " +
          response.status
        );
      }

      const data =
        await response.json();

      const price =
        num(data.price);

      if (
        price === null ||
        price <= 0
      ) {
        throw new Error(
          "Coinbase returned an invalid price"
        );
      }

      realPrices[coin] =
        price;

      prices[coin] =
        price;

      console.log(
        "[MARKET] Real " +
        coin +
        " price:",
        price
      );

      return price;

    } catch (error) {
      console.error(
        "[MARKET] Could not get real " +
        coin +
        " price:",
        error
      );

      return null;
    }
  }

  /*
   * ---------------------------------------------------------
   * USD/CAD
   * ---------------------------------------------------------
   */

  async function getUsdCad() {
    try {
      const response =
        await fetch(
          "https://api.frankfurter.dev/v2/rate/usd/cad?_=" +
          Date.now(),
          {
            cache: "no-store"
          }
        );

      if (!response.ok) {
        throw new Error(
          "FX HTTP " +
          response.status
        );
      }

      const data =
        await response.json();

      const rate =
        num(data.rate);

      if (
        rate !== null &&
        rate > 0
      ) {
        usdCad = rate;

        console.log(
          "[MARKET] USD/CAD:",
          usdCad
        );
      }

    } catch (error) {
      /*
       * If FX fails, use the last/default rate.
       * Crypto prices are still obtained in USD.
       */

      console.warn(
        "[MARKET] USD/CAD unavailable. Using:",
        usdCad
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * RENDER
   * ---------------------------------------------------------
   */

  function renderCoin(coin) {
    const usd =
      prices[coin];

    const cad =
      getCadPrice(coin);

    if (
      usd === null ||
      cad === null
    ) {
      return;
    }

    const percent =
      changes[coin];

    /*
     * Main price.
     */

    if (
      coin === activeCoin
    ) {
      setText(
        [
          "mciPrice",
          "marketPrice",
          "livePrice"
        ],
        money(cad)
      );

      setText(
        [
          "mciChange",
          "tickerChange" + coin,
          coin + "Change",
          coin.toLowerCase() + "Change"
        ],
        (
          percent >= 0
            ? "+"
            : ""
        ) +
        percent.toFixed(2) +
        "%"
      );

      setText(
        [
          "mciPct"
        ],
        (
          percent >= 0
            ? "+"
            : ""
        ) +
        percent.toFixed(2) +
        "%"
      );

      setText(
        [
          "obMidPrice"
        ],
        money(cad)
      );
    }

    /*
     * Coin cards.
     */

    setText(
      [
        "tickerPrice" + coin,
        coin + "Price",
        coin.toLowerCase() + "Price"
      ],
      money(cad)
    );

    setText(
      [
        "tickerChange" + coin,
        coin + "Change",
        coin.toLowerCase() + "Change"
      ],
      (
        percent >= 0
          ? "+"
          : ""
      ) +
      percent.toFixed(2) +
      "%"
    );

    /*
     * Compatibility with your existing page.
     */

    if (
      window.marketPrices &&
      typeof window.marketPrices ===
        "object"
    ) {
      if (
        !window.marketPrices[coin]
      ) {
        window.marketPrices[coin] = {};
      }

      window.marketPrices[coin].usdPrice =
        usd;

      window.marketPrices[coin].price =
        cad;

      window.marketPrices[coin].changePct =
        percent;
    }
  }

  function renderAll() {
    for (
      const coin of
      Object.keys(COINS)
    ) {
      renderCoin(coin);
    }
  }

  /*
   * ---------------------------------------------------------
   * SIMULATION
   * ---------------------------------------------------------
   */

  function simulateCoin(coin) {
    const current =
      prices[coin];

    const real =
      realPrices[coin];

    if (
      current === null ||
      real === null
    ) {
      return;
    }

    /*
     * Small random movement.
     *
     * Most ticks move only a tiny amount.
     * Occasionally there is a slightly larger move.
     */

    const random =
      Math.random();

    let movement;

    if (random < 0.80) {
      movement =
        (
          Math.random() -
          0.5
        ) * 0.0012;

    } else if (random < 0.97) {
      movement =
        (
          Math.random() -
          0.5
        ) * 0.003;

    } else {
      movement =
        (
          Math.random() -
          0.5
        ) * 0.006;
    }

    let next =
      current *
      (1 + movement);

    /*
     * Keep the simulation from drifting endlessly
     * away from the real starting price.
     *
     * It can move naturally, but gradually gets pulled
     * back toward the real starting price.
     */

    const distance =
      (
        next -
        real
      ) /
      real;

    if (
      Math.abs(distance) >
      0.05
    ) {
      next =
        next -
        (
          next -
          real
        ) *
        0.02;
    }

    if (
      next <= 0
    ) {
      next =
        current;
    }

    prices[coin] =
      next;

    /*
     * Calculate simulated percentage change
     * from the REAL starting price.
     */

    changes[coin] =
      (
        (
          next -
          real
        ) /
        real
      ) *
      100;

    renderCoin(
      coin
    );
  }

  function simulateTick() {
    for (
      const coin of
      Object.keys(COINS)
    ) {
      simulateCoin(
        coin
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * SELECT COIN
   * ---------------------------------------------------------
   */

  function selectCoin(coin) {
    if (
      !COINS[coin]
    ) {
      return;
    }

    activeCoin =
      coin;

    renderAll();

    console.log(
      "[MARKET] Active coin:",
      coin
    );
  }

  /*
   * ---------------------------------------------------------
   * PUBLIC API
   * ---------------------------------------------------------
   */

  window.LiveMarket = {
    selectCoin,

    getPrice(coin) {
      return getCadPrice(
        coin
      );
    },

    getUsdPrice(coin) {
      return prices[coin];
    },

    getRealStartingPrice(coin) {
      return realPrices[coin];
    },

    getUsdCad() {
      return usdCad;
    },

    isSimulated() {
      return true;
    }
  };

  /*
   * ---------------------------------------------------------
   * START
   * ---------------------------------------------------------
   */

  async function start() {
    if (started) {
      return;
    }

    started = true;

    console.log(
      "[MARKET] Starting..."
    );

    setStatus(
      "LOADING…",
      false
    );

    /*
     * Get FX and real prices.
     */

    await getUsdCad();

    const results =
      await Promise.all(
        Object.keys(COINS)
          .map(
            coin =>
              getRealPrice(
                coin
              )
          )
      );

    /*
     * Make sure at least one real price
     * was obtained.
     */

    const gotRealPrice =
      results.some(
        price =>
          price !== null
      );

    if (!gotRealPrice) {
      setStatus(
        "OFFLINE",
        false
      );

      console.error(
        "[MARKET] No real starting prices could be obtained."
      );

      return;
    }

    /*
     * Render the real starting prices.
     */

    renderAll();

    /*
     * Explicitly tell the user that movement is simulated.
     */

    setStatus(
      "SIMULATED",
      true
    );

    console.log(
      "[MARKET] Real starting prices loaded."
    );

    console.log(
      "[MARKET] Prices are now simulated from those real prices."
    );

    /*
     * Random market movement.
     *
     * Every 1–3 seconds.
     */

    function nextTick() {
      simulateTick();

      const delay =
        1000 +
        Math.random() *
        2000;

      setTimeout(
        nextTick,
        delay
      );
    }

    nextTick();

    /*
     * Re-fetch real starting prices every 10 minutes.
     *
     * This gives the simulation a fresh real anchor
     * without needing a WebSocket.
     */

    setInterval(
      async () => {
        console.log(
          "[MARKET] Refreshing real anchor prices..."
        );

        await getUsdCad();

        for (
          const coin of
          Object.keys(COINS)
        ) {
          const price =
            await getRealPrice(
              coin
            );

          if (
            price !== null
          ) {
            /*
             * Reset that coin's simulation
             * to the newly fetched real price.
             */

            changes[coin] =
              0;
          }
        }

        renderAll();

        setStatus(
          "SIMULATED",
          true
        );

      },
      10 * 60 * 1000
    );
  }

  /*
   * Wait until the page is ready.
   */

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      {
        once: true
      }
    );
  } else {
    start();
  }

})();
```
