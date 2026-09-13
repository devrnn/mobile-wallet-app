(() => {
    "use strict";

    /*
     * REAL-TIME CRYPTO MARKET
     *
     * Source:
     * Coinbase Exchange WebSocket
     *
     * Currencies:
     * BTC/USD
     * ETH/USD
     * SOL/USD
     *
     * CAD display:
     * Coinbase USD price × live USD/CAD rate
     *
     * No generated prices.
     * No fake order book.
     */

    const MARKET = {
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

    let activeCoin = "BTC";
    let usdCad = null;

    const prices = {
        BTC: null,
        ETH: null,
        SOL: null
    };

    const stats = {
        BTC: {},
        ETH: {},
        SOL: {}
    };

    const books = {
        BTC: {
            bids: new Map(),
            asks: new Map()
        },
        ETH: {
            bids: new Map(),
            asks: new Map()
        },
        SOL: {
            bids: new Map(),
            asks: new Map()
        }
    };

    let socket = null;
    let reconnectTimer = null;
    let reconnectAttempt = 0;

    const WS_URL =
        "wss://ws-feed.exchange.coinbase.com";

    const FX_URL =
        "https://api.frankfurter.dev/v2/rate/usd/cad";

    const REST_BASE =
        "https://api.exchange.coinbase.com";

    /*
     * ---------------------------------------------------------
     * BASIC HELPERS
     * ---------------------------------------------------------
     */

    function number(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function cad(value) {
        const n = number(value);

        if (n === null || usdCad === null) {
            return null;
        }

        return n * usdCad;
    }

    function money(value) {
        const n = number(value);

        if (n === null) {
            return "—";
        }

        return "$" + n.toLocaleString("en-CA", {
            minimumFractionDigits: n < 100 ? 2 : 0,
            maximumFractionDigits: n < 100 ? 2 : 2
        });
    }

    function amount(value) {
        const n = number(value);

        if (n === null) {
            return "—";
        }

        return n.toLocaleString("en-US", {
            maximumFractionDigits: 6
        });
    }

    function setText(ids, value) {
        for (const id of ids) {
            const el = document.getElementById(id);

            if (el) {
                el.textContent = value;
            }
        }
    }

    /*
     * ---------------------------------------------------------
     * STATUS
     * ---------------------------------------------------------
     */

    function status(text, live = false) {
        const elements = [
            document.getElementById("marketStatus"),
            document.getElementById("liveMarketStatus"),
            document.getElementById("marketConnectionStatus")
        ];

        for (const el of elements) {
            if (!el) continue;

            el.textContent = text;
            el.classList.toggle("live", live);
            el.classList.toggle("offline", !live);
        }

        document.documentElement.dataset.marketStatus =
            live ? "live" : "offline";
    }

    /*
     * ---------------------------------------------------------
     * USD/CAD
     * ---------------------------------------------------------
     */

    async function updateFx() {
        try {
            const response = await fetch(
                `${FX_URL}?_=${Date.now()}`,
                {
                    cache: "no-store"
                }
            );

            if (!response.ok) {
                throw new Error(
                    `USD/CAD HTTP ${response.status}`
                );
            }

            const data = await response.json();

            const rate = number(data.rate);

            if (!rate || rate <= 0) {
                throw new Error(
                    "Invalid USD/CAD rate"
                );
            }

            usdCad = rate;

            renderEverything();

            console.log(
                "[MARKET] USD/CAD:",
                usdCad
            );

        } catch (error) {
            console.error(
                "[MARKET] USD/CAD failed:",
                error
            );
        }
    }

    /*
     * ---------------------------------------------------------
     * 24-HOUR STATS
     * ---------------------------------------------------------
     */

    async function updateStats(coin) {
        const product =
            MARKET[coin].product;

        try {
            const response = await fetch(
                `${REST_BASE}/products/${product}/stats?_=${Date.now()}`,
                {
                    cache: "no-store"
                }
            );

            if (!response.ok) {
                throw new Error(
                    `Stats HTTP ${response.status}`
                );
            }

            const data =
                await response.json();

            const last = number(data.last);
            const open = number(data.open);
            const high = number(data.high);
            const low = number(data.low);
            const volume = number(data.volume);

            if (!last) {
                return;
            }

            stats[coin] = {
                open,
                high,
                low,
                volume,
                change:
                    open !== null
                        ? last - open
                        : null,
                changePct:
                    open
                        ? ((last - open) / open) * 100
                        : null
            };

            renderCoin(coin);

        } catch (error) {
            console.error(
                `[MARKET] ${coin} stats failed:`,
                error
            );
        }
    }

    /*
     * ---------------------------------------------------------
     * WEBSOCKET
     * ---------------------------------------------------------
     */

    function connect() {
        if (
            socket &&
            (
                socket.readyState ===
                    WebSocket.OPEN ||
                socket.readyState ===
                    WebSocket.CONNECTING
            )
        ) {
            return;
        }

        status("CONNECTING…", false);

        console.log(
            "[MARKET] Connecting to Coinbase WebSocket..."
        );

        try {
            socket =
                new WebSocket(WS_URL);
        } catch (error) {
            console.error(
                "[MARKET] WebSocket creation failed:",
                error
            );

            reconnect();
            return;
        }

        socket.addEventListener(
            "open",
            onOpen
        );

        socket.addEventListener(
            "message",
            onMessage
        );

        socket.addEventListener(
            "error",
            onError
        );

        socket.addEventListener(
            "close",
            onClose
        );
    }

    function onOpen() {
        reconnectAttempt = 0;

        status("LIVE", true);

        const message = {
            type: "subscribe",

            product_ids: [
                "BTC-USD",
                "ETH-USD",
                "SOL-USD"
            ],

            channels: [
                "ticker",
                "level2",
                "matches"
            ]
        };

        socket.send(
            JSON.stringify(message)
        );

        console.log(
            "[MARKET] WebSocket LIVE"
        );
    }

    function onError(error) {
        console.error(
            "[MARKET] WebSocket error:",
            error
        );
    }

    function onClose() {
        status(
            "RECONNECTING…",
            false
        );

        console.warn(
            "[MARKET] WebSocket closed"
        );

        reconnect();
    }

    function reconnect() {
        if (reconnectTimer) {
            return;
        }

        const delay =
            Math.min(
                30000,
                1000 *
                    Math.pow(
                        2,
                        reconnectAttempt
                    )
            );

        reconnectAttempt++;

        reconnectTimer =
            setTimeout(() => {
                reconnectTimer = null;
                connect();
            }, delay);
    }

    /*
     * ---------------------------------------------------------
     * WEBSOCKET MESSAGE PROCESSING
     * ---------------------------------------------------------
     */

    function onMessage(event) {
        let data;

        try {
            data =
                JSON.parse(event.data);
        } catch {
            return;
        }

        if (
            data.type === "ticker"
        ) {
            handleTicker(data);
            return;
        }

        if (
            data.type === "snapshot"
        ) {
            handleSnapshot(data);
            return;
        }

        if (
            data.type === "l2update"
        ) {
            handleLevel2(data);
            return;
        }

        if (
            data.type === "match" ||
            data.type === "last_match"
        ) {
            handleTrade(data);
        }
    }

    /*
     * ---------------------------------------------------------
     * TICKER
     * ---------------------------------------------------------
     */

    function handleTicker(data) {
        const coin =
            coinFromProduct(
                data.product_id
            );

        if (!coin) {
            return;
        }

        const price =
            number(data.price);

        if (!price || price <= 0) {
            return;
        }

        const previous =
            prices[coin];

        prices[coin] =
            price;

        if (
            previous !== null &&
            previous !== price
        ) {
            renderCoin(
                coin,
                price > previous
                    ? "up"
                    : "down"
            );
        } else {
            renderCoin(coin);
        }

        /*
         * If your existing app exposes
         * marketPrices, keep it synchronized.
         */

        if (
            window.marketPrices &&
            typeof window.marketPrices ===
                "object"
        ) {
            if (!window.marketPrices[coin]) {
                window.marketPrices[coin] = {};
            }

            window.marketPrices[coin].usdPrice =
                price;

            window.marketPrices[coin].price =
                cad(price);

            if (
                stats[coin].changePct !==
                undefined
            ) {
                window.marketPrices[
                    coin
                ].changePct =
                    stats[coin].changePct;
            }
        }
    }

    /*
     * ---------------------------------------------------------
     * ORDER BOOK SNAPSHOT
     * ---------------------------------------------------------
     */

    function handleSnapshot(data) {
        const coin =
            coinFromProduct(
                data.product_id
            );

        if (!coin) {
            return;
        }

        const book =
            books[coin];

        book.bids.clear();
        book.asks.clear();

        for (
            const level
            of data.bids || []
        ) {
            if (level.length < 2) {
                continue;
            }

            const price =
                number(level[0]);

            const size =
                number(level[1]);

            if (
                price &&
                size &&
                size > 0
            ) {
                book.bids.set(
                    price,
                    size
                );
            }
        }

        for (
            const level
            of data.asks || []
        ) {
            if (level.length < 2) {
                continue;
            }

            const price =
                number(level[0]);

            const size =
                number(level[1]);

            if (
                price &&
                size &&
                size > 0
            ) {
                book.asks.set(
                    price,
                    size
                );
            }
        }

        if (coin === activeCoin) {
            renderOrderBook();
        }
    }

    /*
     * ---------------------------------------------------------
     * ORDER BOOK UPDATE
     * ---------------------------------------------------------
     */

    function handleLevel2(data) {
        const coin =
            coinFromProduct(
                data.product_id
            );

        if (!coin) {
            return;
        }

        const book =
            books[coin];

        for (
            const change
            of data.changes || []
        ) {
            if (change.length < 3) {
                continue;
            }

            const side =
                change[0];

            const price =
                number(change[1]);

            const size =
                number(change[2]);

            if (!price) {
                continue;
            }

            const map =
                side === "buy"
                    ? book.bids
                    : book.asks;

            if (!size || size <= 0) {
                map.delete(price);
            } else {
                map.set(
                    price,
                    size
                );
            }
        }

        if (coin === activeCoin) {
            renderOrderBook();
        }
    }

    /*
     * ---------------------------------------------------------
     * RECENT TRADES
     * ---------------------------------------------------------
     */

    const recentTrades = [];

    function handleTrade(data) {
        const coin =
            coinFromProduct(
                data.product_id
            );

        if (!coin) {
            return;
        }

        const price =
            number(data.price);

        const size =
            number(data.size);

        if (!price || !size) {
            return;
        }

        recentTrades.unshift({
            coin,
            price,
            size,
            side:
                data.side === "sell"
                    ? "sell"
                    : "buy",
            time:
                data.time
                    ? new Date(data.time)
                    : new Date()
        });

        if (
            recentTrades.length >
            100
        ) {
            recentTrades.pop();
        }

        if (coin === activeCoin) {
            renderTrades();
        }
    }

    /*
     * ---------------------------------------------------------
     * COIN HELPERS
     * ---------------------------------------------------------
     */

    function coinFromProduct(
        product
    ) {
        for (
            const coin of
            Object.keys(MARKET)
        ) {
            if (
                MARKET[coin].product ===
                product
            ) {
                return coin;
            }
        }

        return null;
    }

    /*
     * ---------------------------------------------------------
     * RENDER COIN
     * ---------------------------------------------------------
     */

    function renderCoin(
        coin,
        direction = null
    ) {
        const usd =
            prices[coin];

        const cadPrice =
            cad(usd);

        if (
            coin === activeCoin
        ) {
            setText(
                [
                    "mciPrice",
                    "marketPrice",
                    "livePrice"
                ],
                money(cadPrice)
            );

            const stat =
                stats[coin];

            setText(
                ["statOpen"],
                money(cad(stat.open))
            );

            setText(
                ["statHigh"],
                money(cad(stat.high))
            );

            setText(
                ["statLow"],
                money(cad(stat.low))
            );

            const volume =
                stat.volume;

            setText(
                ["statVol"],
                formatVolume(
                    cad(volume)
                )
            );

            const change =
                cad(stat.change);

            const pct =
                stat.changePct;

            setText(
                ["mciChange"],
                change === null
                    ? "—"
                    : `${change >= 0 ? "+" : ""}${money(Math.abs(change))}`
            );

            setText(
                ["mciPct"],
                pct === null
                    ? "—"
                    : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`
            );

            setText(
                ["obMidPrice"],
                money(cadPrice)
            );

            if (
                direction &&
                document.getElementById(
                    "mciPrice"
                )
            ) {
                const el =
                    document.getElementById(
                        "mciPrice"
                    );

                el.classList.remove(
                    "market-tick-up",
                    "market-tick-down"
                );

                void el.offsetWidth;

                el.classList.add(
                    direction === "up"
                        ? "market-tick-up"
                        : "market-tick-down"
                );
            }
        }

        updateTicker(
            coin,
            cadPrice,
            stats[coin]
        );
    }

    /*
     * ---------------------------------------------------------
     * TICKER CARDS
     * ---------------------------------------------------------
     */

    function updateTicker(
        coin,
        price,
        stat
    ) {
        setText(
            [
                `tickerPrice${coin}`,
                `${coin}Price`,
                `${coin.toLowerCase()}Price`
            ],
            money(price)
        );

        if (
            stat &&
            stat.changePct !==
                undefined
        ) {
            setText(
                [
                    `tickerChange${coin}`,
                    `${coin}Change`,
                    `${coin.toLowerCase()}Change`
                ],
                stat.changePct === null
                    ? "—"
                    : `${stat.changePct >= 0 ? "+" : ""}${stat.changePct.toFixed(2)}%`
            );
        }
    }

    /*
     * ---------------------------------------------------------
     * ORDER BOOK RENDER
     * ---------------------------------------------------------
     */

    function renderOrderBook() {
        const book =
            books[activeCoin];

        const asks =
            [...book.asks.entries()]
                .sort(
                    (a, b) =>
                        a[0] - b[0]
                )
                .slice(
                    0,
                    8
                );

        const bids =
            [...book.bids.entries()]
                .sort(
                    (a, b) =>
                        b[0] - a[0]
                )
                .slice(
                    0,
                    8
                );

        const asksEl =
            document.getElementById(
                "obAsks"
            );

        const bidsEl =
            document.getElementById(
                "obBids"
            );

        if (asksEl) {
            asksEl.innerHTML =
                asks
                    .map(
                        ([price, size]) =>
                            orderRow(
                                "ask",
                                price,
                                size
                            )
                    )
                    .join("");
        }

        if (bidsEl) {
            bidsEl.innerHTML =
                bids
                    .map(
                        ([price, size]) =>
                            orderRow(
                                "bid",
                                price,
                                size
                            )
                    )
                    .join("");
        }

        const bestAsk =
            asks.length
                ? asks[0][0]
                : null;

        const bestBid =
            bids.length
                ? bids[0][0]
                : null;

        const spread =
            bestAsk !== null &&
            bestBid !== null
                ? bestAsk - bestBid
                : null;

        setText(
            ["obSpread"],
            spread === null
                ? "Spread: —"
                : `Spread: ${money(cad(spread))}`
        );
    }

    function orderRow(
        side,
        usdPrice,
        size
    ) {
        const price =
            cad(usdPrice);

        return `
            <div class="ob-row ${side}">
                <div class="ob-price">
                    ${money(price)}
                </div>

                <div class="ob-size">
                    ${amount(size)}
                </div>

                <div class="ob-total">
                    ${money(
                        cad(
                            usdPrice *
                            size
                        )
                    )}
                </div>
            </div>
        `;
    }

    /*
     * ---------------------------------------------------------
     * TRADES RENDER
     * ---------------------------------------------------------
     */

    function renderTrades() {
        const el =
            document.getElementById(
                "recentTradesList"
            );

        if (!el) {
            return;
        }

        el.innerHTML =
            recentTrades
                .filter(
                    trade =>
                        trade.coin ===
                        activeCoin
                )
                .slice(
                    0,
                    12
                )
                .map(
                    trade => `
                        <div class="rt-row">
                            <div class="rt-price ${trade.side}">
                                ${money(
                                    cad(
                                        trade.price
                                    )
                                )}
                            </div>

                            <div class="rt-size">
                                ${amount(
                                    trade.size
                                )}
                            </div>

                            <div class="rt-time">
                                ${trade.time.toLocaleTimeString()}
                            </div>
                        </div>
                    `
                )
                .join("");
    }

    /*
     * ---------------------------------------------------------
     * EVERYTHING
     * ---------------------------------------------------------
     */

    function renderEverything() {
        for (
            const coin of
            Object.keys(MARKET)
        ) {
            renderCoin(coin);
        }

        renderOrderBook();
        renderTrades();

        /*
         * Keep common calculator
         * functions in your existing app
         * synchronized if they exist.
         */

        if (
            typeof window.updateMacTotal ===
            "function"
        ) {
            window.updateMacTotal();
        }
    }

    /*
     * ---------------------------------------------------------
     * PUBLIC API
     * ---------------------------------------------------------
     */

    window.LiveMarket = {
        selectCoin(coin) {
            if (
                !MARKET[coin]
            ) {
                return;
            }

            activeCoin = coin;

            renderEverything();

            console.log(
                "[MARKET] Selected:",
                coin
            );
        },

        getPrice(coin) {
            return cad(
                prices[coin]
            );
        },

        getUsdPrice(coin) {
            return prices[coin];
        },

        getUsdCad() {
            return usdCad;
        },

        getStats(coin) {
            return stats[coin];
        },

        reconnect() {
            if (socket) {
                try {
                    socket.close();
                } catch {}
            }

            connect();
        }
    };

    /*
     * ---------------------------------------------------------
     * START
     * ---------------------------------------------------------
     */

    async function start() {
        console.log(
            "[MARKET] Starting real market..."
        );

        status(
            "CONNECTING…",
            false
        );

        await updateFx();

        for (
            const coin of
            Object.keys(MARKET)
        ) {
            updateStats(coin);
        }

        connect();

        /*
         * FX isn't a WebSocket feed.
         * Refresh it every 5 minutes.
         */

        setInterval(
            updateFx,
            5 * 60 * 1000
        );

        /*
         * Refresh 24h stats every minute.
         */

        setInterval(() => {
            for (
                const coin of
                Object.keys(MARKET)
            ) {
                updateStats(coin);
            }
        }, 60 * 1000);
    }

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
