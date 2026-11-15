import { Activity, ClipboardPlus, Heart, MessageCircle, Pill } from 'lucide-react'

export const supportModes = {
  doctor: { label: 'Doctor support', description: 'Explore recorded observations and prepare questions for a human medical lead.', icon: Activity },
  nurse: { label: 'Nurse support', description: 'Review recorded measurements and explore optional wellness check-ins.', icon: ClipboardPlus },
  pharmacist: { label: 'Pharmacist support', description: 'Record a question for a human reviewer. Medication recommendations are outside this mode.', icon: Pill },
  psychologist: { label: 'Psychologist support', description: 'Explore optional reflection on isolation. Therapy and mental-health assessment are outside this mode.', icon: Heart },
}

export type SupportMode = keyof typeof supportModes

export function SupportPortrait({ mode, active = false }: { mode: SupportMode; active?: boolean }) {
  const { icon: Emblem } = supportModes[mode]
  return <div className={`support-portrait portrait-${mode} ${active ? 'portrait-active' : ''}`} aria-hidden="true">
    <div className="portrait-orbit" />
    <div className="portrait-figure">
      <div className="portrait-aerial" />
      <div className="portrait-head">
        <div className="portrait-visor"><i /><i /></div>
      </div>
      <div className="portrait-body"><Emblem size={20} strokeWidth={1.8} /></div>
      <div className="portrait-hand"><MessageCircle size={12} /></div>
    </div>
  </div>
}
