import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, BarChart3, ChevronRight, CircleDollarSign, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import { liveMarketQueryOptions } from '../../services/market/market'
import './LiveMarketWidget.css'

function formatPrice(value) {
  const number = Number(value || 0)
  if (number >= 1000) return `$${number.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (number >= 1) return `$${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `$${number.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`
}

function formatCompact(value) {
  return `$${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(Number(value || 0))}`
}

function formatPercent(value) {
  const number = Number(value || 0)
  return `${number >= 0 ? '+' : ''}${number.toFixed(2)}%`
}

function MarketSkeleton() {
  return <div className="market-widget-scroll market-skeleton-list">{Array.from({ length: 3 }, (_, index) => <div className="market-skeleton-card" key={index}><span /><div><i /><b /></div><em /><small /></div>)}</div>
}

function MarketCard({ coin }) {
  const change = Number(coin.price_change_percentage_24h_in_currency ?? coin.price_change_percentage_24h ?? 0)
  const positive = change >= 0
  const ChangeIcon = positive ? TrendingUp : TrendingDown
  return <motion.article className="live-market-card" layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -3 }}>
    <div className="live-market-card-head"><img src={coin.image} alt={`${coin.name} logo`} /><div className="live-market-name"><strong>{coin.name}</strong><span>{coin.symbol.toUpperCase()}</span></div><span className={`live-market-change ${positive ? 'positive' : 'negative'}`}><ChangeIcon size={12} />{formatPercent(change)}</span></div>
    <div className="live-market-price"><AnimatePresence mode="wait"><motion.strong key={coin.current_price} initial={{ opacity: .35, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}>{formatPrice(coin.current_price)}</motion.strong></AnimatePresence><span>USD</span></div>
    <div className="live-market-metrics"><div><span>24H high</span><strong>{formatPrice(coin.high_24h)}</strong></div><div><span>24H low</span><strong>{formatPrice(coin.low_24h)}</strong></div><div><span>Market cap</span><strong>{formatCompact(coin.market_cap)}</strong></div><div><span>Volume</span><strong>{formatCompact(coin.total_volume)}</strong></div></div>
    <div className="live-market-footer"><span><Activity size={12} /> Live market</span><span>{new Date(coin.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
  </motion.article>
}

function LiveMarketWidget() {
  const { data: markets = [], isLoading, isError, refetch, isFetching } = useQuery(liveMarketQueryOptions)
  return <section className="section-block market-section"><div className="section-heading"><div><p className="overline">MARKET PULSE</p><h2>Live prices</h2></div><button className="text-button" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh live market prices">{isFetching ? <RefreshCw className="market-refresh-spin" size={14} /> : <BarChart3 size={14} />} Live market <ChevronRight size={14} /></button></div>{isLoading ? <MarketSkeleton /> : isError ? <div className="market-unavailable"><CircleDollarSign size={21} /><strong>Market data temporarily unavailable</strong><button onClick={() => refetch()}>Try again</button></div> : <div className="market-widget-scroll">{markets.map((coin) => <MarketCard key={coin.id} coin={coin} />)}</div>}</section>
}

export { LiveMarketWidget }
