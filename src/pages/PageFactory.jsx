import { PagePlaceholder } from '../components/common/PagePlaceholder'
import { useCallback, useEffect, useState } from 'react'
import { fetchPageData, subscribePage } from '../services/app/pages'

export function FoundationPage({ page, title, description }) {
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const load = useCallback(async () => { try { const result = await fetchPageData(page); setState({ loading: false, error: '', data: result.data }) } catch (error) { setState({ loading: false, error: error.message || 'Unable to load this page', data: null }) } }, [page])
  useEffect(() => { const timer = window.setTimeout(load, 0); let unsubscribe; try { unsubscribe = subscribePage(page, load) } catch { unsubscribe = undefined } return () => { window.clearTimeout(timer); unsubscribe?.() } }, [page, load])
  return <PagePlaceholder title={title} description={description} loading={state.loading} error={state.error} hasData={Boolean(state.data)} onRetry={load} />
}
