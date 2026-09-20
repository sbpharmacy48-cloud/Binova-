import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  CircleDollarSign,
  Globe2,
  Headphones,
  LockKeyhole,
  Menu,
  PanelTop,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  UsersRound,
  WalletCards,
  X,
  Zap,
} from 'lucide-react'
import { fetchInvestmentPlans, fetchLandingStats } from '../../services/investment/plans'
import './LandingPage.css'

const planIcons = { 'circle-dollar-sign': CircleDollarSign, 'trending-up': TrendingUp, 'bar-chart-3': BarChart3, 'wallet-cards': WalletCards, sparkles: Sparkles }
const statIcons = { users: UsersRound, deposits: WalletCards, withdrawals: ArrowUpRight, countries: Globe2 }

const features = [
  { icon: Zap, title: 'Fast deposits', copy: 'Fund your account in moments with clear, guided flows.' },
  { icon: LockKeyhole, title: 'Secure wallet', copy: 'Protection is built into every balance and transaction.' },
  { icon: Headphones, title: '24/7 support', copy: 'A real support path when you need a second opinion.' },
  { icon: BarChart3, title: 'Clear progress', copy: 'Follow your capital with transparent, readable updates.' },
]

const faqs = [
  { question: 'What is Binova?', answer: 'Binova is a focused crypto investment experience that helps you explore structured plans, monitor progress, and manage your wallet from one calm interface.' },
  { question: 'Are the displayed returns guaranteed?', answer: 'No. All examples are illustrative estimates, not promises. Crypto assets carry risk and every plan should be reviewed against your own goals.' },
  { question: 'How do I get started?', answer: 'Create an account, complete the required verification, fund your wallet, and choose a plan that matches your time horizon and risk comfort.' },
  { question: 'Can I withdraw at any time?', answer: 'Withdrawal availability depends on the plan terms and account status. The future withdrawal flow will always show the relevant conditions before confirmation.' },
]

const reveal = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
}

function AnimatedNumber({ value, prefix = '', suffix = '', decimals = 0 }) {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    let frame
    const started = performance.now()
    const duration = 1500
    const animate = (time) => {
      const progress = Math.min((time - started) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(value * eased)
      if (progress < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return <>{prefix}{current.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</>
}

function BrandMark({ compact = false }) {
  return <span className={compact ? 'brand-mark compact' : 'brand-mark'} aria-hidden="true"><span>B</span></span>
}

function SectionHeading({ eyebrow, title, copy }) {
  return (
    <div className="section-heading">
      <p className="landing-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {copy && <p>{copy}</p>}
    </div>
  )
}

function HeroIllustration() {
  return (
    <div className="hero-illustration" aria-label="Binova crypto investment landscape" role="img">
      <img src="/landing.png" alt="" className="hero-background-image" />
      <div className="hero-background-overlay" />
    </div>
  )
}

function Header() {
  const [open, setOpen] = useState(false)
  return (
    <header className="landing-header">
      <Link to="/" className="landing-brand" aria-label="Binova home"><BrandMark /><strong>binova</strong></Link>
      <nav className={open ? 'landing-nav open' : 'landing-nav'} aria-label="Landing page navigation">
        <a href="#plans" onClick={() => setOpen(false)}>Plans</a>
        <a href="#security" onClick={() => setOpen(false)}>Security</a>
        <a href="#faq" onClick={() => setOpen(false)}>FAQ</a>
      </nav>
      <div className="header-actions">
        <button className="icon-button language-button" type="button" aria-label="Change language">EN</button>
        <button className="menu-button" type="button" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>{open ? <X size={19} /> : <Menu size={19} />}</button>
        <Link className="header-login" to="/login">Log in</Link>
        <Link className="header-register" to="/register">Join Binova</Link>
      </div>
    </header>
  )
}

function Stats() {
  const { data: stats = [] } = useQuery({ queryKey: ['landing-stats'], queryFn: fetchLandingStats, staleTime: 60_000 })
  return <motion.section className="stats-section" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }}>
    {stats.map(({ key, value, suffix = '', prefix = '', label, decimals = 0 }) => { const Icon = statIcons[key] || Sparkles; return <div className="stat-item" key={key}><Icon size={16} /><strong><AnimatedNumber value={Number(value) || 0} prefix={prefix} suffix={suffix} decimals={decimals} /></strong><span>{label}</span></div> })}
  </motion.section>
}
// this is a comment to test the code completion feature.
function PlanCard({ plan }) {
  const Icon = plan.icon
  return <motion.article className={`plan-card accent-${plan.accent}${plan.featured ? ' featured' : plan.recommended ? ' recommended' : ''}`} whileHover={{ y: -5 }} transition={{ duration: 0.2 }}>
    {plan.recommended && <span className="plan-badge">Best starting point</span>}
    {plan.featured && <span className="plan-badge gold-badge">Premium allocation</span>}
    <div className="plan-top"><div className="plan-icon"><Icon size={20} /></div><span className="risk"><span />{plan.risk} risk</span></div>
    <h3>{plan.name}</h3>
    <p className="plan-caption">A considered structure for a clear investment horizon.</p>
    <div className="plan-return"><strong>{plan.returnLabel ?? 'Pending'}</strong><span>{plan.returnLabel ? 'estimated return\nper term' : 'configured in admin\npanel'}</span></div>
    <div className="plan-progress" aria-label={`${plan.name} plan availability`}><span /></div>
    <dl className="plan-details"><div><dt>Deposit range</dt><dd>{plan.min.toLocaleString()} - {plan.max.toLocaleString()} USDT</dd></div><div><dt>Duration</dt><dd>{plan.duration}</dd></div></dl>
    <Link to="/register" className="plan-action">Invest now <ArrowRight size={16} /></Link>
  </motion.article>
}

function InvestmentPlans() {
  const { data: remotePlans = [], isLoading, isError } = useQuery({
    queryKey: ['investment-plans'],
    queryFn: fetchInvestmentPlans,
    staleTime: 60_000,
  })

  const plans = remotePlans.map((plan, index) => ({ ...plan, min: Number(plan.minimum_deposit), max: Number(plan.maximum_deposit), duration: `${plan.duration_days} Days`, risk: plan.risk_level, accent: ['silver', 'teal', 'blue', 'violet', 'gold'][index % 5], icon: planIcons[plan.icon] || Sparkles, returnLabel: plan.return_label || (plan.estimated_return != null ? `${plan.estimated_return}%` : null), recommended: Boolean(plan.badge), featured: index === remotePlans.length - 1 }))

  return <section className="plans-section" id="plans"><SectionHeading eyebrow="Invest with intention" title="A plan for your pace." copy="Five clear horizons with terms managed from the Binova admin panel. Returns are estimates supplied by the platform, never promises." /><div className="plans-status" role="status">{isLoading ? 'Loading current plan terms...' : isError ? 'Plan terms are temporarily unavailable.' : 'Plan terms are managed securely in Supabase.'}</div><div className="plans-list">{plans.map((plan) => <PlanCard plan={plan} key={plan.slug} />)}</div></section>
}

function Calculator() {
  const { data: plans = [] } = useQuery({ queryKey: ['calculator-plans'], queryFn: fetchInvestmentPlans, staleTime: 60_000 })
  const minimum = Number(plans[0]?.minimum_deposit || 0)
  const maximum = Number(plans[plans.length - 1]?.maximum_deposit || 0)
  const [amount, setAmount] = useState(null)
  const [rate, setRate] = useState(null)
  const selectedAmount = amount ?? minimum
  const selectedRate = rate ?? Number(plans[0]?.daily_profit_percentage || 0)
  const estimate = selectedAmount * (selectedRate / 100)
  return <motion.section className="calculator-card" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}>
    <div className="calculator-copy"><p className="landing-eyebrow">Plan your next move</p><h2>See the shape of your investment.</h2><p>Use an example amount to explore how time and plan selection can change the picture.</p></div>
    <div className="calculator-control"><div className="control-label"><span>Investment amount</span><strong>${selectedAmount.toLocaleString()}</strong></div><input aria-label="Investment amount" type="range" min={minimum} max={maximum} step="1" value={selectedAmount} onChange={(event) => setAmount(Number(event.target.value))} /><div className="range-labels"><span>${minimum.toLocaleString()}</span><span>${maximum.toLocaleString()}</span></div></div>
    <div className="rate-picker"><span>Plan term</span>{plans.slice(0, 3).map((plan) => { const option = Number(plan.daily_profit_percentage || 0); return <button key={plan.slug} className={selectedRate === option ? 'selected' : ''} type="button" onClick={() => setRate(option)}>{option}%</button> })}</div>
    <div className="estimate-box"><span>Illustrative estimated return</span><strong>+${estimate.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong><small>Example only. Crypto assets involve risk.</small></div>
  </motion.section>
}

function Features() {
  return <section className="features-section"><SectionHeading eyebrow="Made for momentum" title="A calmer way to move through crypto." copy="The details that make a financial product feel dependable are the details we obsess over." /><div className="feature-grid">{features.map(({ icon: Icon, title, copy }) => <motion.article className="feature-card" key={title} variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }}><div className="feature-icon"><Icon size={19} /></div><h3>{title}</h3><p>{copy}</p></motion.article>)}</div></section>
}

function Security() {
  return <motion.section className="security-section" id="security" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}><div className="security-shield"><ShieldCheck size={48} strokeWidth={1.2} /><span /></div><div><p className="landing-eyebrow">Security by design</p><h2>Confidence, built into every step.</h2><p>Protected accounts, encrypted wallet infrastructure, and transaction visibility help you stay in control.</p><div className="security-points"><span><BadgeCheck size={15} /> Protected accounts</span><span><BadgeCheck size={15} /> Encrypted wallet</span><span><BadgeCheck size={15} /> Clear activity</span></div></div></motion.section>
}

function HowItWorks() {
  const steps = ['Create account', 'Deposit funds', 'Choose investment', 'Track progress', 'Withdraw']
  return <section className="steps-section"><SectionHeading eyebrow="From curious to confident" title="Five clear steps. No unnecessary noise." /><div className="steps-list">{steps.map((step, index) => <motion.div className="step-item" key={step} variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }}><span className="step-number">0{index + 1}</span><strong>{step}</strong>{index < steps.length - 1 && <ArrowDownLeft className="step-arrow" size={17} />}</motion.div>)}</div></section>
}

function Testimonials() {
  const quotes = [
    { name: 'Maya R.', country: 'Lisbon, PT', quote: 'The first platform that made crypto feel considered instead of chaotic.', initials: 'MR' },
    { name: 'Daniel K.', country: 'Toronto, CA', quote: 'I can see what is happening with my money without digging through noise.', initials: 'DK' },
  ]
  return <section className="testimonials-section"><SectionHeading eyebrow="A growing circle" title="Trust is earned in the small moments." /><div className="testimonial-list">{quotes.map((quote) => <article className="testimonial-card" key={quote.name}><div className="testimonial-head"><span className="avatar">{quote.initials}</span><div><strong>{quote.name}</strong><span>{quote.country}</span></div><div className="stars" aria-label="5 out of 5 stars">{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={12} fill="currentColor" />)}</div></div><p>“{quote.quote}”</p></article>)}</div></section>
}

function FAQ() {
  const [open, setOpen] = useState(0)
  return <section className="faq-section" id="faq"><SectionHeading eyebrow="Good questions" title="Clarity before commitment." /><div className="faq-list">{faqs.map((faq, index) => <div className={open === index ? 'faq-item open' : 'faq-item'} key={faq.question}><button type="button" onClick={() => setOpen(open === index ? -1 : index)} aria-expanded={open === index}><span>{faq.question}</span>{open === index ? <X size={17} /> : <Plus size={17} />}</button>{open === index && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.25 }}>{faq.answer}</motion.p>}</div>)}</div></section>
}

function LandingFooter() {
  return <footer className="landing-footer"><div className="footer-brand"><Link to="/" className="landing-brand"><BrandMark compact /><strong>binova</strong></Link><p>Crypto, with clarity.</p></div><div className="footer-links"><div><span>Explore</span><a href="#plans">Investment plans</a><a href="#security">Security</a><a href="#faq">FAQ</a></div><div><span>Company</span><Link to="/help">Support</Link><a href="#">Privacy</a><a href="#">Terms</a></div></div><div className="footer-bottom"><span>© 2026 Binova</span><span><PanelTop size={13} /> Built for the next move</span></div></footer>
}

export function LandingPage() {
  return <div className="landing-page">
    <Header />
    <main>
      <section className="hero-section">
        <div className="splash-orb" />
        <motion.div className="hero-copy" initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }}>
          <motion.div className="splash-line" variants={reveal}><span className="pulse-dot" />The new standard for considered crypto</motion.div>
          <motion.h1 variants={reveal}>Build your <span>next move</span> with clarity.</motion.h1>
          <motion.p variants={reveal}>A premium investment experience for people who want their crypto journey to feel as intentional as their goals.</motion.p>
          <motion.div className="hero-actions" variants={reveal}><Link to="/register" className="primary-action">Start investing <ArrowRight size={17} /></Link><a href="#plans" className="secondary-action">Explore plans</a></motion.div>
          <motion.div className="trust-row" variants={reveal}><span><ShieldCheck size={15} /> Secure by design</span><span><Globe2 size={15} /> 42 countries</span></motion.div>
        </motion.div>
        <motion.div className="hero-art-wrap" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.25, ease: 'easeOut' }}><HeroIllustration /></motion.div>
      </section>
      <Stats />
      <InvestmentPlans />
      <Calculator />
      <Features />
      <Security />
      <HowItWorks />
      <Testimonials />
      <FAQ />
      <motion.section className="final-cta" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.4 }}><div className="cta-lines" /><p className="landing-eyebrow">Your next move starts here</p><h2>Ready to make crypto feel more considered?</h2><Link to="/register" className="primary-action">Create your account <ArrowRight size={17} /></Link><small>No pressure. Just a clearer place to begin.</small></motion.section>
    </main>
    <LandingFooter />
  </div>
}
