import { useEffect, useRef, useState } from 'react'

// The autosave indicator's label for each state — shared by the detail pages.
export const SAVE_LABEL = { saving: 'Saving…', unsaved: 'Unsaved…', error: 'Save failed', saved: 'Saved' }

// Persist-on-change scheduler: the app has no Save button — an edit is scheduled
// via schedule(value) and committed by save(value) after `delay` ms of quiet.
// Load doesn't schedule, so the just-fetched state is never re-saved. Overlapping
// edits coalesce (the newest pending value wins); a pending edit is flushed on
// unmount so the last <delay> ms aren't lost when navigating away.
export function useAutosave(save, delay = 800) {
  const [state, setState] = useState('saved') // saved | unsaved | saving | error
  const saveRef = useRef(save)
  saveRef.current = save
  const timer = useRef(null)
  const savingRef = useRef(false)
  const pendingRef = useRef(undefined) // undefined = nothing pending

  async function flush() {
    if (savingRef.current || pendingRef.current === undefined) return
    savingRef.current = true
    setState('saving')
    try {
      while (pendingRef.current !== undefined) {
        const v = pendingRef.current
        pendingRef.current = undefined
        await saveRef.current(v)
      }
      setState('saved')
    } catch (err) {
      // Keep a trace — a bare 'error' state hides which write failed (an expired
      // token vs a validation reject), unlike the other writes that surface errorMessage.
      console.error('autosave failed:', err)
      setState('error')
    } finally {
      savingRef.current = false
    }
  }

  function schedule(value) {
    pendingRef.current = value
    setState((s) => (s === 'saving' ? s : 'unsaved'))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, delay)
  }

  // Flush a pending edit when leaving (fire-and-forget — the component is gone).
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (!savingRef.current && pendingRef.current !== undefined) {
        // Fire-and-forget — the component is gone. Log a reject (e.g. the record
        // was just deleted) so it isn't a silent unhandled rejection.
        Promise.resolve()
          .then(() => saveRef.current(pendingRef.current))
          .catch((err) => console.warn('autosave flush-on-unmount failed:', err))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { state, schedule, flush }
}
