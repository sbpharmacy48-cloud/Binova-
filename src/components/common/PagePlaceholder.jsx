import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

export function PagePlaceholder({ eyebrow = 'Binova foundation', title, description, loading, error, onRetry }) {
  return (
    <motion.section
      className="page-placeholder"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <div className="placeholder-mark" aria-hidden="true"><Sparkles size={18} /></div>
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="placeholder-copy">{description}</p>
      {loading ? <span className="status-pill">Loading live data...</span> : error ? <button className="status-pill" type="button" onClick={onRetry}>{error} · Retry</button> : <span className="status-pill">Connected to Supabase</span>}
    </motion.section>
  )
}
