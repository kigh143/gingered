import { useState, type FormEvent } from 'react'
import { fmtMoney } from '../lib/calc'
import { useAppData } from '../lib/context'
import { saveSettings } from '../lib/data'

export default function SettingsPage() {
  const { currency } = useAppData()
  const [value, setValue] = useState(currency)
  const [saved, setSaved] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    await saveSettings({ currency: value.trim() })
    setSaved(true)
  }

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
      </div>
      <form className="card narrow" onSubmit={submit}>
        <label className="field">
          <span>Currency label</span>
          <input
            value={value}
            placeholder="e.g. UGX, $, KES"
            onChange={(e) => {
              setValue(e.target.value)
              setSaved(false)
            }}
          />
          <small className="muted">Shown in front of every price. Example: {fmtMoney(12500, value.trim())}</small>
        </label>
        <div className="row">
          <button className="btn primary">Save</button>
          {saved && <span className="muted">Saved</span>}
        </div>
      </form>
    </>
  )
}
