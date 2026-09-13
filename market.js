(() => {
  "use strict";

  /*
   * LIVE MARKET BRIDGE
   *
   * This file deliberately does NOT create a second market engine.
   * The existing wallet UI already contains the market/order-book logic.
   * This file starts that logic only AFTER index.html has finished declaring
   * all of its variables/functions.
   *
   * Real sources used by the existing engine:
   *   - Coinbase spot prices / WebSocket
   *   - Frankfurter USD/CAD FX
   *
   * No fake/generated prices are inserted.
   */

  // The existing index.html expects this helper when rendering volume.
  // Define it before the live market fetch is started.
  if (typeof window.formatVolume !== "function") {
    window.formatVolume = function formatVolume(value) {
      const n = Number(value);

      if (!Number.isFinite(n)) {
        return "—";
      }

      if (n >= 1e9) {
        return "$" + (n / 1e9).toFixed(2) + "B";
      }

      if (n >= 1e6) {
        return "$" + (n / 1e6).toFixed(2) + "M";
      }

      if (n >= 1e3) {
        return "$" + (n / 1e3).toFixed(2) + "K";
      }

      return "$" + n.toFixed(2);
    };
  }

  function setConnectionLabel(text, live) {
    const ids = [
      "marketStatus",
      "liveMarketStatus",
      "marketConnectionStatus"
    ];

    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;

      el.textContent = text;
      el.classList.toggle("live", !!live);
      el.classList.toggle("offline", !live);
    }

    document.documentElement.dataset.marketStatus =
      live ? "live" : "offline";
  }

  function fail(message, error) {
    setConnectionLabel("OFFLINE", false);

    console.error(
      "[LIVE MARKET]",
      message,
      error || ""
    );
  }

  async function start() {
    try {
      console.log(
        "[LIVE MARKET] Starting after page initialization..."
      );

      setConnectionLabel(
        "CONNECTING…",
        false
      );

      /*
       * Existing engine functions are now fully initialized because this
       * script is loaded immediately before </body>.
       */

      if (
        typeof window.startLiveMarketEngine ===
        "function"
      ) {
        try {
          window.startLiveMarketEngine();
        } catch (error) {
          console.error(
            "[LIVE MARKET] WebSocket engine failed:",
            error
          );
        }
      }

      if (
        typeof window.fetchLiveUsdCadRate ===
        "function"
      ) {
        await window.fetchLiveUsdCadRate();
      }

      if (
        typeof window.fetchLiveMarketPrices ===
        "function"
      ) {
        const ok =
          await window.fetchLiveMarketPrices();

        if (ok === false) {
          fail(
            "The live price request did not return valid market data."
          );
          return;
        }
      } else {
        fail(
          "The wallet market engine was not found."
        );
        return;
      }

      /*
       * If the WebSocket engine updates the document status itself,
       * leave that status alone. Otherwise mark it live after a
       * successful real price fetch.
       */
      if (
        document.documentElement.dataset.marketStatus !==
        "live"
      ) {
        setConnectionLabel(
          "LIVE",
          true
        );
      }

      console.log(
        "[LIVE MARKET] Live market startup complete."
      );

    } catch (error) {
      fail(
        "Live market startup failed.",
        error
      );
    }
  }

  /*
   * Give the browser one task turn after all inline scripts have executed.
   * This avoids the initialization-order problem that caused the earlier
   * exchangeRatesInUSD/activeCoin errors.
   */
  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      () => setTimeout(start, 0),
      { once: true }
    );
  } else {
    setTimeout(start, 0);
  }

})();
