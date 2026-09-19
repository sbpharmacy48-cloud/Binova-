import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import QRCode from 'qrcode'
import { toast } from 'react-hot-toast'
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Check,
  Clipboard,
  CloudUpload,
  Copy,
  FileImage,
  Home,
  LoaderCircle,
  UserRound,
  WalletCards,
  WalletMinimal,
  X,
} from 'lucide-react'
import { fetchDepositHistory, fetchDepositNotificationCount, fetchDepositWallet, getDepositSession, submitDeposit, subscribeDeposit, uploadDepositProof } from '../../services/wallet/deposit'
import { fetchCurrentWallet } from '../../services/wallet/wallet'
import { supabase } from '../../services/supabase/client'
import './DepositPage.css'

const depositSchema = z.object({
  amount: z.coerce.number({ invalid_type_error: 'Enter a deposit amount' }).positive('Amount must be greater than zero'),
  transactionHash: z.string().trim().min(12, 'Enter the transaction hash'),
})

const navItems = [
  { label: 'Home', path: '/dashboard', icon: Home },
  { label: 'Invest', path: '/investment', icon: WalletMinimal },
  { label: 'Deposit', path: '/deposit', icon: WalletCards },
  { label: 'Wallet', path: '/wallet', icon: WalletMinimal },
  { label: 'Profile', path: '/profile', icon: UserRound },
]

function formatDate(date) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date))
}

function DepositBrand() {
  return <div className="deposit-brand"><img src="/binova-mark.svg" alt="BINOVA logo" /><div><strong>BINOVA</strong><span>Invest today. Build a brighter tomorrow.</span></div></div>
}

function StatusPill({ status }) {
  return <span className={`deposit-status status-${status}`}>{status}</span>
}

function WalletPreview({ wallet, qrDataUrl, loadError }) {
  const [copied, setCopied] = useState(false)
  const copyAddress = async () => {
    if (!wallet?.address) return
    await navigator.clipboard?.writeText(wallet.address)
    setCopied(true)
    toast.success('Address copied successfully')
    window.setTimeout(() => setCopied(false), 1600)
  }

  return <>
    <section className="deposit-card address-card">
      <div className="step-heading"><span>2</span><div><h2>Deposit address</h2><p>Send only USDT via BEP20 (BSC) to the address below.</p></div><span className="network-chip">USDT · BEP20</span></div>
      {wallet?.address ? <div className="address-layout">{qrDataUrl ? <div className="qr-frame"><img src={qrDataUrl} alt="Deposit wallet QR code" /></div> : <div className="qr-frame" aria-label="Deposit wallet QR code is unavailable"><WalletCards size={28} /></div>}<div className="address-details"><span className="field-caption">Wallet address</span><div className="wallet-address"><span>{wallet.address}</span><button onClick={copyAddress} aria-label="Copy wallet address">{copied ? <Check size={17} /> : <Copy size={17} />}</button></div><div className="deposit-address-meta"><span>{wallet.symbol} · {wallet.network}</span><span>Minimum {wallet.minimum_deposit} {wallet.symbol}</span><span>{wallet.confirmation_time}</span></div><button className="copy-address" onClick={copyAddress}>{copied ? <Check size={17} /> : <Copy size={17} />} {copied ? 'Address copied' : 'Copy address'}</button></div></div> : <div className="wallet-empty"><WalletCards size={22} /><span>{loadError ? 'Unable to load the deposit wallet. Check the console for the Supabase error.' : 'No active BEP20 wallet is currently configured. Please contact support.'}</span></div>}
      <div className="deposit-warning"><AlertTriangle size={21} /><div><strong>Important notice</strong><p>Only send USDT using BEP20 (BSC). Other networks or tokens may permanently lose funds.</p></div></div>
    </section>
  </>
}

function DepositPage() {
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const [wallet, setWallet] = useState(null)
  const [history, setHistory] = useState([])
  const [currentWallet, setCurrentWallet] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [loadingWallet, setLoadingWallet] = useState(true)
  const [walletLoadError, setWalletLoadError] = useState(false)
  const [pageError, setPageError] = useState('')
  const [proof, setProof] = useState(null)
  const [proofPreview, setProofPreview] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { register, handleSubmit, setError, setValue, formState: { errors } } = useForm({ resolver: zodResolver(depositSchema), defaultValues: { amount: '', transactionHash: '' } })

  useEffect(() => {
    let active = true
    async function loadDepositData() {
      try {
        setWalletLoadError(false)
        const walletData = await fetchDepositWallet()
        if (!active) return
        setWallet(walletData)
        if (walletData?.address) {
          try {
            setQrDataUrl(await QRCode.toDataURL(walletData.address, { width: 220, margin: 1, color: { dark: '#11151c', light: '#ffffff' } }))
          } catch {
            setQrDataUrl('')
          }
        }

        const [historyResult, balanceResult, notificationResult] = await Promise.allSettled([
          fetchDepositHistory(),
          fetchCurrentWallet(),
          fetchDepositNotificationCount(),
        ])
        if (!active) return
        if (historyResult.status === 'fulfilled') setHistory(historyResult.value)
        if (balanceResult.status === 'fulfilled') setCurrentWallet(balanceResult.value)
        if (notificationResult.status === 'fulfilled') setUnreadCount(notificationResult.value)
      } catch (error) {
        console.error('[Deposit] Failed to load deposit page data.', error)
        if (active) {
          setWalletLoadError(true)
          setPageError(error.code === 'PGRST205' ? 'wallet_addresses table is missing. Run the updated Supabase SQL first.' : (error.message || 'Unable to load deposit details.'))
        }
      } finally {
        if (active) setLoadingWallet(false)
      }
    }
    const timer = window.setTimeout(loadDepositData, 0)
    let unsubscribe
    try { unsubscribe = subscribeDeposit(loadDepositData) } catch { unsubscribe = undefined }
    return () => { active = false; window.clearTimeout(timer); unsubscribe?.() }
  }, [])

  function selectProof(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) return toast.error('Use a PNG, JPG, or JPEG image')
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be smaller than 5MB')
    setProof(file)
    setProofPreview(URL.createObjectURL(file))
  }

  function removeProof() {
    if (proofPreview) URL.revokeObjectURL(proofPreview)
    setProof(null)
    setProofPreview('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onSubmit(values) {
    if (!wallet?.address) return toast.error('Deposit wallet is not available yet')
    if (Number(values.amount) < Number(wallet.minimum_deposit || 0)) return setError('amount', { message: `Minimum deposit is ${wallet.minimum_deposit} USDT` })
    setSubmitting(true)
    try {
      console.log('[Deposit] Session before submit', await supabase?.auth.getSession())
      await getDepositSession()
      const screenshotUrl = proof ? await uploadDepositProof(proof) : null
      await submitDeposit({ amount: values.amount, transactionHash: values.transactionHash, walletAddress: wallet.address, screenshotUrl })
      toast.success('Deposit submitted for review')
      navigate('/wallet')
    } catch (error) {
      console.error('[Deposit] Submission failed.', error)
      const message = error.message || 'Unable to submit deposit'
      if (message === 'SESSION_EXPIRED' || message.toLowerCase().includes('auth session') || message.toLowerCase().includes('authentication')) toast.error('Your session has expired. Please sign in again.')
      else if (message.toLowerCase().includes('transaction_hash')) setError('transactionHash', { message: 'This transaction hash has already been submitted' })
      else toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="deposit-shell">
    <header className="deposit-navbar"><button className="deposit-back" onClick={() => navigate(-1)} aria-label="Go back"><ArrowLeft size={20} /></button><DepositBrand /><button className="deposit-notification" onClick={() => navigate('/notifications')} aria-label="Notifications"><Bell size={19} />{unreadCount > 0 && <i>{unreadCount}</i>}</button></header>
    <section className="deposit-intro page-enter"><p className="deposit-overline">FUND YOUR JOURNEY</p><h1>Deposit <em>funds.</em></h1><p>Securely add USDT to your Binova wallet and keep your portfolio moving.</p></section>
    <section className="available-balance"><div className="balance-glow" /><div className="balance-label"><WalletCards size={18} /><span>Available balance</span><small>USDT</small></div><strong>${Number(currentWallet?.main_balance || 0).toFixed(2)}</strong><span className="balance-sub">≈ {Number(currentWallet?.main_balance || 0).toFixed(2)} USDT</span><div className="balance-chart"><i /><i /><i /><i /><i /><i /><i /></div></section>
    {pageError && <div className="deposit-inline-error"><AlertTriangle size={16} />{pageError}</div>}
    <section className="deposit-card network-card"><div className="step-heading"><span>1</span><div><h2>Select network</h2><p>Choose the network you will use for transfer.</p></div></div><div className="selected-network"><span className="usdt-icon">₮</span><div><strong>USDT (BEP20)</strong><span>Binance Smart Chain</span></div><span className="selected-check"><Check size={14} /></span><span className="network-chip">BEP20 (BSC)</span></div><div className="network-warning"><AlertTriangle size={15} /><span>Only send USDT using the BEP20 network.</span></div></section>
    {loadingWallet ? <div className="deposit-card wallet-loading"><div /><div /><div /></div> : <WalletPreview wallet={wallet} qrDataUrl={qrDataUrl} loadError={walletLoadError} />}
    <section className="deposit-card details-card"><div className="step-heading"><span>3</span><div><h2>Enter deposit details</h2><p>After completing the transfer, add the receipt details below.</p></div></div><form onSubmit={handleSubmit(onSubmit)}><div className="deposit-fields"><label><span>Amount (USDT)</span><div className="deposit-input"><input type="number" min={wallet?.minimum_deposit || 0} step="0.01" placeholder="0.00" {...register('amount')} /><b>USDT</b></div>{errors.amount && <small>{errors.amount.message}</small>}</label><label><span>Transaction hash (TXID)</span><div className="deposit-input"><input placeholder="Paste transaction hash" {...register('transactionHash')} /><button type="button" onClick={async () => { const text = await navigator.clipboard?.readText(); if (text) setValue('transactionHash', text, { shouldValidate: true }) }} aria-label="Paste transaction hash"><Clipboard size={16} /></button></div>{errors.transactionHash && <small>{errors.transactionHash.message}</small>}</label></div><div className="proof-title"><div><h3>Payment proof <span>(optional)</span></h3><p>Upload a screenshot for faster verification.</p></div><FileImage size={19} /></div><div className={`proof-upload ${proofPreview ? 'has-proof' : ''}`} role="button" tabIndex="0" onClick={() => fileRef.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileRef.current?.click() }}>{proofPreview ? <><img src={proofPreview} alt="Payment proof preview" /><span><Check size={17} /> Proof attached</span><button type="button" className="remove-proof" onClick={(event) => { event.stopPropagation(); removeProof() }} aria-label="Remove proof"><X size={16} /></button></> : <><CloudUpload size={26} /><strong>Tap to upload screenshot</strong><span>PNG, JPG, JPEG · Max 5MB</span></>}<input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={selectProof} /></div><div className="submit-notice"><span>Minimum {wallet?.minimum_deposit || 0} USDT</span><span>{wallet?.confirmation_time || 'Review time unavailable'}</span></div><button className="submit-deposit" type="submit" disabled={submitting || loadingWallet}>{submitting ? <><LoaderCircle className="spin" size={18} /> Submitting securely...</> : <>Submit deposit <ArrowLeft size={18} className="submit-arrow" /></>}</button></form></section>
    <section className="notice-card"><div className="notice-icon"><AlertTriangle size={19} /></div><div><h2>Before you send</h2><p>Deposits are reviewed after network confirmation. Make sure the amount and network match exactly.</p><div className="notice-points"><span><Check size={12} /> Minimum 10 USDT</span><span><Check size={12} /> BEP20 confirmations</span><span><Check size={12} /> Secure review process</span></div></div></section>
    <section className="history-section"><div className="history-heading"><div><p className="deposit-overline">YOUR ACTIVITY</p><h2>Recent deposits</h2></div><Link to="/transactions">See all</Link></div>{history.length ? <div className="history-list">{history.map((item) => <article className="history-card" key={item.id}><span className="history-icon"><ArrowLeft size={16} /></span><div><strong>+{Number(item.amount).toFixed(2)} {item.currency}</strong><span>{item.network || 'BEP20'} · {formatDate(item.created_at)}</span><small>TXID {item.transaction_hash?.slice(0, 10)}...</small></div><StatusPill status={item.status} /></article>)}</div> : <div className="history-empty"><WalletCards size={18} /><span>Your deposit history will appear here.</span></div>}</section>
    <nav className="bottom-navigation deposit-nav">{navItems.map(({ label, path, icon: Icon }) => <Link key={label} to={path} className={`nav-item ${label === 'Deposit' ? 'active' : ''}`}><span><Icon size={19} /></span><small>{label}</small></Link>)}</nav>
  </main>
}

export { DepositPage }
