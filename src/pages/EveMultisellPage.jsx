import { useEffect, useMemo, useState } from 'react';
import './EveMultisellPage.css';

const ESI_BASE = 'https://esi.evetech.net/latest';
const JITA_STATION = 60003760;
const JITA_REGION = 10000002;
const AMARR_STATION = 60008494;
const AMARR_REGION = 10000043;
const GAP_AGE_CUTOFF_DAYS = 7;

const STATIONS = [
  {
    stationId: 60003760,
    regionId: 10000002,
    short: 'Jita',
    label: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
  },
  {
    stationId: 60008494,
    regionId: 10000043,
    short: 'Amarr',
    label: 'Amarr VIII (Oris) - Emperor Family Academy',
  },
  {
    stationId: 60011866,
    regionId: 10000032,
    short: 'Dodixie',
    label: 'Dodixie IX - Moon 20 - Federation Navy Assembly Plant',
  },
  {
    stationId: 60004588,
    regionId: 10000030,
    short: 'Rens',
    label: 'Rens VI - Moon 8 - Brutor Tribe Treasury',
  },
  {
    stationId: 60005686,
    regionId: 10000042,
    short: 'Hek',
    label: 'Hek VIII - Moon 12 - Boundless Creation Factory',
  },
  {
    stationId: 60015148,
    regionId: 11000031,
    short: 'Thera',
    label: 'Thera XII - The Sanctuary Institute of Paleocybernetics',
  },
];

function parseEveExport(text) {
  const items = [];
  text
    .trim()
    .split('\n')
    .forEach((line, idx) => {
      const parts = line.split('\t');
      if (parts.length < 2) return;
      const typeId = parseInt(parts[0], 10);
      if (Number.isNaN(typeId) || typeId <= 0) return;
      const name = (parts[1] || '').trim();
      const qty = parseInt(parts[2], 10) || 1;
      if (name) items.push({ id: `${typeId}-${idx}`, typeId, name, qty });
    });
  return items;
}

function orderAgeDays(issuedStr) {
  if (!issuedStr) return null;
  return (Date.now() - new Date(issuedStr).getTime()) / 86400000;
}

function formatAge(days) {
  if (days === null) return null;
  if (days < 1) return '<1d';
  if (days < 30) return `${Math.floor(days)}d`;
  return `${Math.floor(days / 30)}mo`;
}

function getTickSize(price) {
  if (!price || price <= 0) return 1;
  return Math.pow(10, Math.max(0, Math.floor(Math.log10(price)) - 3));
}

function formatISK(val) {
  if (val == null || Number.isNaN(val)) return '—';
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatISKCompact(val) {
  if (val == null || Number.isNaN(val)) return '—';
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(2)}K`;
  return val.toFixed(2);
}

function effectivePrice(result) {
  const ov = result.override;
  if (ov !== null && ov !== '' && !Number.isNaN(parseFloat(ov))) return parseFloat(ov);
  return result.newPrice;
}

function flagSeverity(result) {
  if (result.flags.some((f) => f.type === 'err')) return 2;
  if (result.flags.some((f) => f.type === 'warn')) return 1;
  return 0;
}

async function fetchOrders(regionId, typeId, orderType = 'sell') {
  try {
    let all = [];
    let page = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(
        `${ESI_BASE}/markets/${regionId}/orders/?order_type=${orderType}&type_id=${typeId}&page=${page}&datasource=tranquility`,
      );
      if (!res.ok) break;
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) break;
      all = all.concat(data);
      if (page >= parseInt(res.headers.get('x-pages') || '1', 10)) break;
      page += 1;
    }
    return all;
  } catch {
    return [];
  }
}

async function getStationOrders(typeId, stationId, regionId) {
  const [sells, buys] = await Promise.all([
    fetchOrders(regionId, typeId, 'sell'),
    fetchOrders(regionId, typeId, 'buy'),
  ]);

  const stationSells = sells
    .filter((order) => order.location_id === stationId)
    .sort((a, b) => a.price - b.price);
  const stationBuys = buys
    .filter((order) => order.location_id === stationId)
    .sort((a, b) => b.price - a.price);

  return {
    lowestSell: stationSells[0]?.price ?? null,
    lowestSellIssued: stationSells[0]?.issued ?? null,
    secondLowest: stationSells[1]?.price ?? null,
    secondLowestIssued: stationSells[1]?.issued ?? null,
    highestBuy: stationBuys[0]?.price ?? null,
  };
}

async function getFallbackPrice(typeId, excludeStationId) {
  const jitaOrders = await fetchOrders(JITA_REGION, typeId, 'sell');
  const jitaStation = jitaOrders
    .filter((order) => order.location_id === JITA_STATION)
    .sort((a, b) => a.price - b.price);
  if (jitaStation.length) return { price: jitaStation[0].price, source: 'Jita' };

  if (excludeStationId !== AMARR_STATION) {
    const amarrOrders = await fetchOrders(AMARR_REGION, typeId, 'sell');
    const amarrStation = amarrOrders
      .filter((order) => order.location_id === AMARR_STATION)
      .sort((a, b) => a.price - b.price);
    if (amarrStation.length) return { price: amarrStation[0].price, source: 'Amarr' };
  }

  return { price: null, source: null };
}

export default function EveMultisellPage() {
  const [stationId, setStationId] = useState('');
  const [buyFromStationId, setBuyFromStationId] = useState('');
  const [inputText, setInputText] = useState('');
  const [results, setResults] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchIndex, setFetchIndex] = useState(0);
  const [fetchingName, setFetchingName] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [sortCol, setSortCol] = useState('name');
  const [sortDir, setSortDir] = useState(1);
  const [settings, setSettings] = useState({
    undercutTicks: 1,
    markupPct: 25,
    gapThreshold: 5,
    buyBuffer: 3,
  });

  const parsedItems = useMemo(() => (inputText.trim() ? parseEveExport(inputText) : []), [inputText]);

  const selectedStation = useMemo(
    () => STATIONS.find((station) => station.stationId === parseInt(stationId, 10)) ?? null,
    [stationId],
  );

  const buyFromStation = useMemo(
    () => STATIONS.find((station) => station.stationId === parseInt(buyFromStationId, 10)) ?? null,
    [buyFromStationId],
  );

  const sortedResults = useMemo(() => {
    const colMap = {
      name: (row) => row.name,
      qty: (row) => row.qty,
      lowest: (row) => row.lowestSell ?? -Infinity,
      lowestage: (row) => row.lowestSellAgeDays ?? Infinity,
      second: (row) => row.secondLowest ?? -Infinity,
      secondage: (row) => row.secondLowestAgeDays ?? Infinity,
      buy: (row) => row.highestBuy ?? -Infinity,
      newprice: (row) => effectivePrice(row) ?? -Infinity,
      totalisk: (row) => (effectivePrice(row) ?? 0) * row.qty,
      flags: (row) => flagSeverity(row),
    };

    return [...results].sort((a, b) => {
      const av = colMap[sortCol]?.(a) ?? 0;
      const bv = colMap[sortCol]?.(b) ?? 0;
      if (av < bv) return -sortDir;
      if (av > bv) return sortDir;
      return 0;
    });
  }, [results, sortCol, sortDir]);

  const copyText = useMemo(
    () =>
      sortedResults
        .filter((result) => effectivePrice(result) !== null)
        .map((result) => `${result.name}\t${formatISK(effectivePrice(result))}`)
        .join('\n'),
    [sortedResults],
  );

  const stats = useMemo(() => {
    const warnings = results.filter((row) => row.flags.some((flag) => flag.type === 'warn')).length;
    const errors = results.filter((row) => row.flags.some((flag) => flag.type === 'err')).length;
    const fallbacks = results.filter((row) => row.fallback).length;
    const totalVal = results.reduce((sum, row) => {
      const price = effectivePrice(row);
      return sum + (price ? price * row.qty : 0);
    }, 0);
    const skipped = results.filter((row) => effectivePrice(row) === null).length;
    return { warnings, errors, fallbacks, totalVal, skipped };
  }, [results]);

  useEffect(() => {
    if (!showToast) return undefined;
    const timer = setTimeout(() => setShowToast(false), 2000);
    return () => clearTimeout(timer);
  }, [showToast]);

  const hasItems = parsedItems.length > 0;
  const canFetch = hasItems && !!selectedStation && !isFetching;

  async function fetchAllPrices() {
    if (!selectedStation) return;

    setIsFetching(true);
    setResults([]);
    setFetchIndex(0);
    setFetchingName('');

    const nextResults = [];
    for (let i = 0; i < parsedItems.length; i += 1) {
      const item = parsedItems[i];
      setFetchIndex(i + 1);
      setFetchingName(item.name);

      const result = {
        ...item,
        lowestSell: null,
        lowestSellAgeDays: null,
        secondLowest: null,
        secondLowestAgeDays: null,
        highestBuy: null,
        newPrice: null,
        buyFromLowest: null,
        source: selectedStation.short,
        fallback: false,
        flags: [],
        override: null,
      };

      try {
        const market = await getStationOrders(item.typeId, selectedStation.stationId, selectedStation.regionId);
        let priceSource = market.lowestSell;
        let sourceLabel = selectedStation.short;

        if (priceSource === null) {
          const fallback = await getFallbackPrice(item.typeId, selectedStation.stationId);
          if (fallback.price !== null) {
            priceSource = fallback.price * (1 + settings.markupPct / 100);
            sourceLabel = `${fallback.source} +${Math.round(settings.markupPct)}%`;
            result.fallback = true;
            result.flags.push({ type: 'info', text: sourceLabel });
          } else {
            result.flags.push({ type: 'err', text: 'No Data' });
          }
        }

        const tick = getTickSize(priceSource);
        let newPrice =
          priceSource !== null ? Math.max(0.01, priceSource - settings.undercutTicks * tick) : null;

        if (newPrice !== null && market.highestBuy !== null) {
          const floor = market.highestBuy * (1 + settings.buyBuffer / 100);
          if (newPrice <= market.highestBuy) {
            newPrice = floor + tick;
            result.flags.push({ type: 'err', text: 'Buy Floor' });
          } else if (newPrice < floor) {
            newPrice = floor + tick;
            result.flags.push({ type: 'warn', text: 'Near Buy' });
          }
        }

        result.lowestSell = market.lowestSell;
        result.lowestSellAgeDays = orderAgeDays(market.lowestSellIssued);
        result.secondLowest = market.secondLowest;
        result.secondLowestAgeDays = orderAgeDays(market.secondLowestIssued);
        result.highestBuy = market.highestBuy;
        result.newPrice = newPrice;
        result.source = sourceLabel;

        if (buyFromStation && buyFromStation.stationId !== selectedStation.stationId) {
          const buyFromMarket = await getStationOrders(
            item.typeId,
            buyFromStation.stationId,
            buyFromStation.regionId,
          );
          result.buyFromLowest = buyFromMarket.lowestSell;
          if (
            buyFromMarket.lowestSell !== null &&
            newPrice !== null &&
            newPrice < buyFromMarket.lowestSell
          ) {
            result.flags.push({ type: 'warn', text: `Below ${buyFromStation.short}` });
          }
        }

        if (market.lowestSell && market.secondLowest) {
          const age2 = result.secondLowestAgeDays;
          const stale = age2 !== null && age2 > GAP_AGE_CUTOFF_DAYS;
          if (!stale) {
            const gap = market.secondLowest - market.lowestSell;
            const gapPct = (gap / market.lowestSell) * 100;
            if (gapPct > settings.gapThreshold) {
              result.flags.push({ type: 'warn', text: `Gap ${gapPct.toFixed(1)}%` });
            }
          }
        }
      } catch {
        result.flags.push({ type: 'err', text: 'Error' });
      }

      nextResults.push(result);
      setResults([...nextResults]);
    }

    setIsFetching(false);
  }

  function clearExport() {
    setInputText('');
    setResults([]);
    setIsFetching(false);
    setFetchIndex(0);
    setFetchingName('');
  }

  function resetApp() {
    setInputText('');
    setResults([]);
    setStationId('');
    setBuyFromStationId('');
    setShowSettings(false);
    setIsFetching(false);
    setFetchIndex(0);
    setFetchingName('');
    setSortCol('name');
    setSortDir(1);
  }

  function updateOverride(id, value) {
    setResults((prev) => prev.map((row) => (row.id === id ? { ...row, override: value || null } : row)));
  }

  function onSort(column) {
    if (sortCol === column) {
      setSortDir((prev) => prev * -1);
      return;
    }
    setSortCol(column);
    setSortDir(1);
  }

  async function copyAll() {
    await navigator.clipboard.writeText(copyText);
    setShowToast(true);
  }

  function ageBadge(days) {
    if (days === null) return <span className="ms-muted">—</span>;
    const label = formatAge(days);
    const className = days > 30 ? 'ms-age-stale' : days > 7 ? 'ms-age-mid' : 'ms-age-fresh';
    return <span className={`ms-age-badge ${className}`}>{label}</span>;
  }

  return (
    <div className="ms-page-shell">
      <div className="ms-app">
        <header className="ms-header">
          <div className="ms-logo">
            <div className="ms-logo-icon" />
            <div>
              <div className="ms-logo-text">Multi Sell</div>
              <span className="ms-logo-sub">Pricing Terminal</span>
              <span className="ms-logo-sub ms-logo-sub-fine">by RedSquared · Claude AI</span>
            </div>
          </div>

          <div className="ms-sep" />

          <div className="ms-station-wrap">
            <span className="ms-label">Selling At</span>
            <select value={stationId} onChange={(event) => setStationId(event.target.value)}>
              <option value="">— Select Station —</option>
              {STATIONS.map((station) => (
                <option key={station.stationId} value={station.stationId}>
                  {station.label}
                </option>
              ))}
            </select>
          </div>

          <div className="ms-sep" />

          <div className="ms-buyfrom-wrap">
            <span className="ms-label">
              Bought From <span className="ms-optional">(optional)</span>
            </span>
            <select
              className={buyFromStationId ? 'active' : ''}
              value={buyFromStationId}
              onChange={(event) => setBuyFromStationId(event.target.value)}
            >
              <option value="">— None —</option>
              {STATIONS.map((station) => (
                <option key={station.stationId} value={station.stationId}>
                  {station.label}
                </option>
              ))}
            </select>
          </div>

          <div className="ms-header-actions">
            <button type="button" className="ms-btn ms-btn-ghost" onClick={resetApp}>
              Reset
            </button>
            <button
              type="button"
              className="ms-btn ms-btn-ghost"
              onClick={() => setShowSettings((prev) => !prev)}
              style={showSettings ? { color: 'var(--ms-gold)' } : undefined}
            >
              Settings
            </button>
            <button type="button" className="ms-btn ms-btn-primary" disabled={!canFetch} onClick={fetchAllPrices}>
              Fetch Prices
            </button>
          </div>
        </header>

        {showSettings && (
          <div className="ms-settings-bar">
            <div className="ms-setting-item">
              <span className="ms-setting-label">Undercut Ticks</span>
              <input
                type="number"
                min="1"
                max="20"
                value={settings.undercutTicks}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, undercutTicks: parseInt(event.target.value || '1', 10) }))
                }
              />
            </div>

            <div className="ms-sep ms-sep-small" />

            <div className="ms-setting-item">
              <span className="ms-setting-label">Markup %</span>
              <input
                type="number"
                min="0"
                max="200"
                step="5"
                value={settings.markupPct}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, markupPct: parseInt(event.target.value || '25', 10) }))
                }
              />
            </div>

            <div className="ms-sep ms-sep-small" />

            <div className="ms-setting-item">
              <span className="ms-setting-label">Gap Threshold %</span>
              <input
                type="number"
                min="1"
                max="100"
                value={settings.gapThreshold}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, gapThreshold: parseInt(event.target.value || '5', 10) }))
                }
              />
            </div>

            <div className="ms-sep ms-sep-small" />

            <div className="ms-setting-item">
              <span className="ms-setting-label">Buy Floor Buffer %</span>
              <input
                type="number"
                min="0"
                max="50"
                step="1"
                value={settings.buyBuffer}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, buyBuffer: parseInt(event.target.value || '3', 10) }))
                }
              />
            </div>
          </div>
        )}

        <div className="ms-main">
          <div className="ms-panel">
            <div className="ms-section-header">
              <div className="ms-section-title">EVE Multi Sell Export</div>
            </div>

            <div className="ms-paste-area">
              <textarea
                value={inputText}
                onChange={(event) => setInputText(event.target.value)}
                placeholder={
                  'Paste your EVE Multi Sell export here...\n\nIn EVE: Select items → Right-click → Sell Items → Export button → paste here.'
                }
              />

              <div className="ms-paste-hint">
                <h4>How to export</h4>
                <ol>
                  <li>Select items to sell in EVE</li>
                  <li>Right-click → Sell Items (n)</li>
                  <li>Click Export in the sell window</li>
                  <li>Paste the result here</li>
                  <li>Select your station above</li>
                  <li>Click Fetch Prices</li>
                  <li>Copy output → Import Prices… in EVE</li>
                </ol>
              </div>
            </div>

            <div className="ms-paste-actions">
              <div className="ms-item-count">
                {!inputText.trim()
                  ? 'Paste export to begin'
                  : parsedItems.length > 0
                    ? `${parsedItems.length} item${parsedItems.length !== 1 ? 's' : ''} parsed`
                    : 'No valid items found — check format'}
              </div>

              <button type="button" className="ms-btn ms-btn-ghost" onClick={clearExport}>
                Clear
              </button>
            </div>
          </div>

          {isFetching && (
            <div className="ms-status-bar">
              <span className="ms-status-text">Fetching: {fetchingName || 'market data...'}</span>
              <div className="ms-progress-track">
                <div
                  className="ms-progress-fill"
                  style={{ width: `${parsedItems.length ? (fetchIndex / parsedItems.length) * 100 : 0}%` }}
                />
              </div>
              <span className="ms-progress-count">
                {fetchIndex} / {parsedItems.length}
              </span>
            </div>
          )}

          {(isFetching || results.length > 0) && (
            <div className="ms-panel">
              <div className="ms-section-header ms-section-header-gap">
                <div className="ms-section-title">Calculated Prices</div>
                {results.length > 0 && (
                  <div className="ms-results-stats">
                    <div className="ms-stat">
                      <span className="ms-stat-label">Items</span>
                      <span className="ms-stat-val">{results.length}</span>
                    </div>
                    <div className="ms-stat">
                      <span className="ms-stat-label">Total ISK</span>
                      <span className="ms-stat-val">{formatISKCompact(stats.totalVal)}</span>
                    </div>
                    <div className="ms-stat">
                      <span className="ms-stat-label">Warnings</span>
                      <span className={`ms-stat-val ${stats.warnings ? 'warn' : 'ok'}`}>{stats.warnings}</span>
                    </div>
                    <div className="ms-stat">
                      <span className="ms-stat-label">No Data</span>
                      <span className={`ms-stat-val ${stats.errors ? 'err' : 'ok'}`}>{stats.errors}</span>
                    </div>
                    <div className="ms-stat">
                      <span className="ms-stat-label">Fallback</span>
                      <span className={`ms-stat-val ${stats.fallbacks ? 'warn' : 'ok'}`}>{stats.fallbacks}</span>
                    </div>
                  </div>
                )}

                <button type="button" className="ms-btn ms-btn-ghost" onClick={fetchAllPrices} disabled={!canFetch}>
                  Re-fetch
                </button>
              </div>

              <div className="ms-table-wrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        ['name', 'Item Name'],
                        ['qty', 'Qty'],
                        ['lowest', 'Lowest Sell'],
                        ['lowestage', 'Age'],
                        ['second', '2nd Lowest'],
                        ['secondage', 'Age'],
                        ['buy', 'Highest Buy'],
                        ['newprice', 'Your Price'],
                        ['totalisk', 'Total ISK'],
                        ['override', 'Override'],
                        ['flags', 'Flags'],
                      ].map(([key, label]) => (
                        <th
                          key={key}
                          className={sortCol === key ? 'sorted' : ''}
                          style={{
                            textAlign:
                              key === 'name'
                                ? 'left'
                                : key === 'lowestage' || key === 'secondage' || key === 'override' || key === 'flags'
                                  ? 'center'
                                  : 'right',
                            cursor: key === 'override' ? 'default' : 'pointer',
                          }}
                          onClick={key === 'override' ? undefined : () => onSort(key)}
                        >
                          {label} {key !== 'override' && <span className="ms-sort-arrow">{sortCol === key ? (sortDir === 1 ? '↑' : '↓') : '↕'}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isFetching &&
                      !results.length &&
                      parsedItems.map((item) => (
                        <tr key={item.id}>
                          <td className="ms-td-name">{item.name}</td>
                          <td className="ms-td-num">{item.qty.toLocaleString()}</td>
                          <td className="ms-shimmer" colSpan={9}>
                            loading...
                          </td>
                        </tr>
                      ))}

                    {sortedResults.map((row) => {
                      const price = effectivePrice(row);
                      const total = price !== null ? price * row.qty : null;
                      const danger = row.flags.some((flag) => flag.text.includes('Buy Floor'));
                      return (
                        <tr key={row.id} className={danger ? 'ms-row-danger' : ''}>
                          <td className="ms-td-name" title={row.name}>
                            <a href={`https://evetycoon.com/market/${row.typeId}`} target="_blank" rel="noreferrer">
                              {row.name}
                            </a>
                          </td>
                          <td className="ms-td-num">{row.qty.toLocaleString()}</td>
                          <td className="ms-td-low">{row.lowestSell !== null ? formatISK(row.lowestSell) : '—'}</td>
                          <td className="ms-td-center">{ageBadge(row.lowestSellAgeDays)}</td>
                          <td className="ms-td-num">{row.secondLowest !== null ? formatISK(row.secondLowest) : '—'}</td>
                          <td className="ms-td-center">{ageBadge(row.secondLowestAgeDays)}</td>
                          <td className="ms-td-buy">{row.highestBuy !== null ? formatISK(row.highestBuy) : '—'}</td>
                          <td className="ms-td-price">{price !== null ? formatISK(price) : '—'}</td>
                          <td className="ms-td-isk" title={total !== null ? formatISK(total) : ''}>
                            {total !== null ? formatISKCompact(total) : '—'}
                          </td>
                          <td className="ms-td-center">
                            <input
                              className="ms-override-input"
                              placeholder="override..."
                              value={row.override ?? ''}
                              onChange={(event) => updateOverride(row.id, event.target.value.trim())}
                            />
                          </td>
                          <td className="ms-td-center">
                            {!row.flags.length ? (
                              <span className="ms-flag ms-flag-ok">OK</span>
                            ) : (
                              row.flags.map((flag) => (
                                <span key={`${row.id}-${flag.type}-${flag.text}`} className={`ms-flag ms-flag-${flag.type}`}>
                                  {flag.text}
                                </span>
                              ))
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className="ms-panel">
              <div className="ms-section-header">
                <div className="ms-section-title">EVE Import — Ready to Paste</div>
              </div>
              <div className="ms-copy-output">{copyText}</div>
              <div className="ms-copy-actions">
                <span className="ms-copy-info">
                  {results.length - stats.skipped} items ready
                  {stats.skipped ? ` · ${stats.skipped} skipped (no data)` : ''}
                </span>
                <button type="button" className="ms-btn ms-btn-success" onClick={copyAll}>
                  Copy All
                </button>
              </div>
            </div>
          )}
        </div>

        {showToast && <div className="ms-toast">Copied to clipboard.</div>}
      </div>
    </div>
  );
}
