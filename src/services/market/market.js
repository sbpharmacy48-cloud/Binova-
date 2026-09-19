const COINGECKO_MARKETS_URL = 'https://api.coingecko.com/api/v3/coins/markets'
const supportedCoins = ['bitcoin', 'ethereum', 'binancecoin', 'solana', 'ripple', 'the-open-network', 'dogecoin', 'tron', 'tether', 'usd-coin']

export async function fetchLiveMarkets() {
  const params = new URLSearchParams({
    vs_currency: 'usd',
    ids: supportedCoins.join(','),
    order: 'market_cap_desc',
    per_page: String(supportedCoins.length),
    page: '1',
    sparkline: 'false',
    price_change_percentage: '24h',
  })
  const response = await fetch(`${COINGECKO_MARKETS_URL}?${params}`)
  if (!response.ok) throw new Error('Market data temporarily unavailable')
  const data = await response.json()
  if (!Array.isArray(data) || data.length === 0) throw new Error('Market data temporarily unavailable')
  const byId = new Map(data.map((coin) => [coin.id, coin]))
  const ordered = supportedCoins.map((id) => byId.get(id)).filter(Boolean)
  if (ordered.length !== supportedCoins.length) throw new Error('Market data temporarily unavailable')
  return ordered
}

export const liveMarketQueryOptions = {
  queryKey: ['live-crypto-markets', supportedCoins.join(',')],
  queryFn: fetchLiveMarkets,
  staleTime: 30_000,
  gcTime: 5 * 60_000,
  refetchInterval: 30_000,
  refetchIntervalInBackground: false,
  retry: 1,
}
