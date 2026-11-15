import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, ArrowDownRight, ArrowUpRight, Check, ChevronRight, CircleCheck, CircleHelp, ClipboardCheck, ClipboardList, Dumbbell, Heart, LayoutDashboard, LoaderCircle, Moon, Orbit, Plus, RadioTower, Network, Settings2, ShieldCheck, Sparkles, Stethoscope, TriangleAlert, UserRound, X } from 'lucide-react'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './styles.css'
import './telemetry.css'
import { MissionTimeline } from './ui'
import MissionHero from './MissionHero'
import TelemetryCards from './TelemetryCards'
import TelemetryBay from './TelemetryBay'
import { linkTo, navigate, routeHref, ROUTES, useRoute, type Route } from './router'
import CrewMap from './CrewMap'
import { CompletionChart, MetricChart, WellbeingChart } from './charts'
import AuthGate from './Auth'
import { api, formatTime, type Crew, type DialogName, type Mission, type Overview } from './data'
import { RecordDialog } from './RecordDialog'
const publicDemo = import.meta.env.MODE === 'space-apps'
const CompanionView = React.lazy(() => import('./CompanionView'))

type Measurement = Overview['measurements'][number]
function App(){
  const [data,setData]=useState<Overview|null>(null),[mission,setMission]=useState<Mission|null>(null),[crew,setCrew]=useState<Crew[]>([]),[selected,setSelected]=useState(1)
  const [ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[modal,setModal]=useState(''),[notice,setNotice]=useState(''),[range,setRange]=useState(14)
  const [relayOutage,setRelayOutage]=useState(false)
  const [showAllEvents,setShowAllEvents]=useState(false)
  // hero entrance: plays once per page visit, as soon as mission data (or an error) arrives
  const [briefingIn,setBriefingIn]=useState(false)
  const route=useRoute()
  useEffect(()=>{if(briefingIn)return;if(mission||error){setBriefingIn(true);return}const t=setTimeout(()=>setBriefingIn(true),1500);return()=>clearTimeout(t)},[mission,error,briefingIn])
  async function load(id=selected){
    try {const members=await api<Crew[]>('/crew');setCrew(members);if(!members.length){setData(null);setError('No crew records granted. Ask the local operator for an explicit capability.');return}if(!members.some(c=>c.id===id)){setSelected(members[0].id);return}const [overview,meta,status]=await Promise.all([api<Overview>(`/crew/${id}/overview`),api<Mission>('/mission'),api<{ready:boolean}>('/readiness')]);setData(overview);setCrew(members);setMission(meta);setReady(status.ready);setError('')}
    catch(e){setReady(false);setError((e as Error).message)}
  }
  useEffect(()=>{load(selected)},[selected])
  useEffect(()=>{const timer=setInterval(()=>{api<{ready:boolean}>('/readiness').then(s=>setReady(s.ready)).catch(()=>setReady(false))},15000);return()=>clearInterval(timer)},[])
  const latest=data?.measurements.at(-1),lastCheckin=data?.checkins.at(-1),baseline=data?.baselines||{}
  const chart=data?.measurements.slice(-range).map(m=>({...m,day:`${m.mission_day}`,baseline:baseline.heart_rate}))||[]
  const events=[...(data?.encounters.map(e=>({...e,type:'Encounter'}))||[]),...(data?.checkins.map(c=>({id:c.id,title:'Daily wellness check-in',notes:`Wellness ${c.wellness}/5 · Fatigue ${c.fatigue}/5 · ${c.symptoms}`,recorded_at:c.recorded_at,mission_day:c.mission_day,type:'Check-in'}))||[])].sort((a,b)=>b.recorded_at.localeCompare(a.recorded_at)).slice(0,showAllEvents?undefined:5)
  const navItems:[Route,typeof LayoutDashboard,string][]=[['/',LayoutDashboard,'Overview'],['/crew',UserRound,'Crew'],['/trends',Activity,'Trends'],['/history',ClipboardList,'Log'],['/crew-map',Network,'Crew map']]
  const crewBar=<section className="crew-bar"><div className="crew-id"><span className="crew-avatar" aria-hidden="true">{data?.crew.name.split(' ').map(s=>s[0]).join('')||'AM'}</span><div><div className="profile-title"><h2>{data?.crew.name||'Loading crew profile'}</h2><span className="tag">FICTIONAL CREW</span></div><p>{data?.crew.role||'—'} <span className="separator">/</span> LUNA-01 <span className="separator">/</span> Individual monitoring</p></div></div><div className="profile-actions"><select aria-label="Select crew" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{crew.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="text-button" onClick={()=>setModal('newcrew')}>Add crew</button><button className="secondary" onClick={()=>setModal('profile')}>Edit profile <ChevronRight size={14}/></button></div></section>
  const kpiStrip=<TelemetryCards measurements={data?.measurements||[]} baselines={baseline} range={route==='/'?14:range}/>
  const wellbeingReadout=lastCheckin?<dl className="readout"><div><dt>Overall wellness</dt><dd className="num">{lastCheckin.wellness}<small> / 5</small></dd></div><div><dt>Mood</dt><dd className="num">{lastCheckin.mood}<small> / 5</small></dd></div><div><dt>Fatigue</dt><dd className="num">{lastCheckin.fatigue}<small> / 5</small></dd></div><div className="span-2"><dt>Reported symptoms</dt><dd className="text">{lastCheckin.symptoms}</dd></div><div><dt>Latest check-in</dt><dd className="num text">{formatTime(lastCheckin.recorded_at)}</dd></div></dl>:<div className="empty">No check-ins yet.</div>
  const rangeToggle=<div className="segmented" role="group" aria-label="Observation range"><button className={range===7?'selected':''} onClick={()=>setRange(7)}>7D</button><button className={range===14?'selected':''} onClick={()=>setRange(14)}>14D</button></div>
  const pageHead=(title:string,description:string,tools?:React.ReactNode)=><header className="page-head"><div><p className="eyebrow">LUNA-01 · {data?.crew.name||'Crew'}</p><h1>{title}</h1><p>{description}</p></div>{tools&&<div className="page-head-tools">{tools}</div>}</header>
  const rail=<aside className="ws-rail" aria-label="Status and briefings">
    <section className="rail-section"><h3 className="micro">Demonstration indicators</h3>{data?.demo_indicators.length?<ul className="indicator-list">{data.demo_indicators.map(i=><li key={i}><TriangleAlert size={14}/>{i}</li>)}</ul>:<p className="status-ok"><CircleCheck size={14}/>No configured demonstration rules triggered.</p>}<button className="text-button" onClick={()=>setModal('rules')}>View configurable rules <ChevronRight size={12}/></button><small>Simulation only · not a clinical risk assessment</small></section>
    <section className="rail-section"><h3 className="micro">Medical reference companion</h3><p>{publicDemo ? 'Browse reviewed NASA passages in a deterministic educational demo.' : 'Explore NASA reference passages with a local model. Research demonstration only.'}</p><button className="secondary wide" onClick={()=>navigate('/companion')}><span><Sparkles size={15}/> Open medical companion</span><ChevronRight size={15}/></button><small>No diagnosis or prescribing. Clinical review pending.</small></section>
    <section className="rail-section" aria-label="Lunar mission context"><h3 className="micro">Mission briefing</h3><h4>LUNA-01 - Fictional lunar south-pole landing</h4><p>Preparation days -6 to -1: Earth baselines. Day 0: launch. Days 1-3: transit microgravity. Day 4: landing. Days 5-8: short-duration surface check-ins in lunar one-sixth gravity.</p><p>General NASA spaceflight evidence does not establish bone or muscle deterioration during this short visit.</p><div className="earth-link"><div className="earth-link-heading"><RadioTower size={20} aria-hidden="true"/><div><h4>Earth connectivity</h4><p role="status" className={'relay-status'+(relayOutage?' is-outage':'')}>{relayOutage?'Simulated offline':'Online · simulated'}</p></div></div><label className="relay-switch"><input className="switch-input" type="checkbox" checked={relayOutage} aria-describedby="earth-link-help" onChange={e=>setRelayOutage(e.target.checked)}/><span className="switch-label">Simulate an Earth-link blackout</span></label><p id="earth-link-help">Turn on to show Earth communications as unavailable. This demonstration changes the displayed link state; it does not disconnect your device, delay requests, test a real connection, or send messages.</p><small>Local monitoring, memory and references remain available while your VIGIL service is reachable. On a local installation, no internet connection is required. Resets on reload.</small></div>{!mission?.name.startsWith('LUNA-01')&&<p>Existing records belong to a previous scenario. Use a fresh LUNA-01 demonstration database; records have not been relabelled.</p>}</section>
    <section className="rail-section"><h3 className="micro">Bone and muscle</h3><div className="activity-readout"><Dumbbell size={26} aria-hidden="true"/><div><strong className="num">{latest?.exercise_minutes??'—'} <small>min</small></strong><span>Recorded exercise</span></div><b className="num">{latest ? `${latest.exercise_completion}%` : '—'}<small>completion</small></b></div><progress className="activity-progress" max={100} value={latest?.exercise_completion??0} aria-label="Exercise session completion"/><details className="activity-boundaries"><summary>Monitoring limits and privacy</summary><h4>Bone and muscle - descriptive synthetic monitoring</h4><p>Recorded exercise: {latest?.exercise_minutes??'Not recorded'} minutes; session completion: {latest?.exercise_completion??'Not recorded'}%. These are activity observations, not bone density or muscle mass measurements.</p><p>No bone-density change, muscle loss, disease probability or medical fitness is inferred. New bone/muscle measurement features require separate review.</p><p>Private reproductive-health notes remain available only through the existing explicitly granted category/purpose API. They are not shared with companion modes. No reproductive condition is inferred.</p></details></section>
    </aside>
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href={routeHref('/')} onClick={linkTo('/')}><span className="brand-symbol"><Orbit size={20}/></span><span>VIGIL<small>MISSION HEALTH SYSTEMS</small></span></a><div className="mission-tag"><span className="dot"/> LUNA-01 <span>LUNAR SURFACE</span></div><p className="nav-caption">WORKSPACE</p><nav aria-label="Workspace">{navItems.map(([to,Icon,short])=><a key={to} href={routeHref(to)} onClick={linkTo(to)} className={route===to?'active':undefined} aria-current={route===to?'page':undefined}><Icon size={17}/><span className="nav-text">{ROUTES[to]}</span><span className="nav-short">{short}</span></a>)}<a href={routeHref('/companion')} onClick={linkTo('/companion')} className={route==='/companion'?'active':undefined} aria-current={route==='/companion'?'page':undefined}><Sparkles size={17}/><span className="nav-text">Medical companion</span><span className="nav-short">Companion</span><span className="soon">LOCAL</span></a></nav><div className="sidebar-bottom"><button onClick={()=>setModal('mission')}><Settings2 size={16}/><span className="nav-text">Mission settings</span><span className="nav-short">Settings</span></button><button onClick={()=>setModal('about')}><CircleHelp size={16}/><span className="nav-text">About this demo</span><span className="nav-short">About</span></button><div className="local-box"><ShieldCheck size={18}/><div>Local-first by design<small>No cloud services required</small></div></div><div className="version">VIGIL / FOUNDATION 01 <span>v0.1</span></div></div></aside>
    <main><header className="topbar"><div className="crumbs"><span className="muted">Workspace</span><ChevronRight size={13}/><span>{ROUTES[route]}</span></div><div className="topbar-right"><span className="met" title="Mission elapsed time"><span>MET</span><strong>DAY {mission?String(mission.mission_day).padStart(3,'0'):'---'}</strong></span><span className="top-divider"/><span className={'connection '+(ready?'':'unavailable')}><span className="dot"/>{ready?'LOCAL SYSTEM ONLINE':'SYSTEM UNAVAILABLE'}</span></div></header>
    <div className={'page route-'+route.slice(1)} key={route}><div className="synthetic-banner"><ShieldCheck size={15}/><strong>SYNTHETIC MISSION DATA</strong><span>Fictional crew and simulated measurements. For demonstration only.</span><span className="banner-end">{publicDemo ? 'PUBLIC DEMO · CHANGES RESET ON RELOAD' : 'OFFLINE CAPABLE'}</span></div>
    {error&&<div className="error" role="alert">{error} <button onClick={()=>load()}>Retry connection</button></div>}{notice&&<div className="toast" role="status"><Check size={16}/>{notice}</div>}
    {route==='/'&&<>
    <MissionHero mission={mission} entered={briefingIn} action={<button className="brief-action" onClick={()=>setModal('checkin')} disabled={!data}><Plus size={16}/> Daily check-in</button>}/>
    <section className={'mission-plan'+(mission&&!mission.name.startsWith('LUNA-01')?' is-empty':'')} aria-label="LUNA-01 mission plan">{mission?.name.startsWith('LUNA-01')&&<MissionTimeline day={mission.mission_day}/>}</section>
    {crewBar}
    <div className="workspace"><div className="ws-main">
    <section className="ws-section" aria-labelledby="snapshot-h"><div className="section-head"><div><h3 id="snapshot-h" className="micro">Physiological snapshot</h3><p>Latest observation against personal baselines</p></div><div className="section-tools"><a className="text-button" href={routeHref('/trends')} onClick={linkTo('/trends')}>Open trends <ChevronRight size={14}/></a></div></div>{kpiStrip}</section>
    <section className="ws-section" aria-labelledby="today-h"><div className="section-head"><div><h3 id="today-h" className="micro">Daily wellbeing</h3><p>Latest self-reported check-in</p></div><div className="section-tools"><a className="text-button" href={routeHref('/crew')} onClick={linkTo('/crew')}>Open crew health <ChevronRight size={14}/></a></div></div>{wellbeingReadout}</section>
    <TelemetryBay key={selected} latest={latest}/>
    </div>{rail}</div></>}
    {route==='/crew'&&<>
    {pageHead('Crew health','Self-reported wellbeing and exercise completion for the selected crew member.',<button className="primary" onClick={()=>setModal('checkin')} disabled={!data}><Plus size={16}/> Daily check-in</button>)}
    {crewBar}
    <section className="ws-section page-section" aria-labelledby="wellbeing-h"><div className="section-head"><div><h3 id="wellbeing-h" className="micro">Daily wellbeing</h3><p>Self-reported · synthetic crew · latest {range} records</p></div><div className="section-tools">{rangeToggle}</div></div>
    {wellbeingReadout}
    <div className="viz-grid"><WellbeingChart data={(data?.checkins.slice(-range)||[]).map(c=>({...c,day:`${c.mission_day}`}))} fatigueReview={data?.demo_rules.fatigue_review_score}/><CompletionChart data={chart}/></div>
    <p className="ws-foot">Fatigue: 1 = low, 5 = high. Mood / wellness: 1 = low, 5 = high.</p></section></>}
    {route==='/trends'&&<>
    {pageHead('Physiological trends','Individual longitudinal view against personal baselines and configurable demonstration rules.',<button className="primary" onClick={()=>setModal('measurement')} disabled={!data}><Plus size={16}/> Log measurements</button>)}
    {crewBar}
    <section className="ws-section page-section" aria-labelledby="telemetry-h"><div className="section-head"><div><h3 id="telemetry-h" className="micro">Physiological telemetry</h3><p>Latest {range} observations</p></div><div className="section-tools">{rangeToggle}</div></div>
    {kpiStrip}
    <div className="viz-grid"><MetricChart title="Resting heart rate" unit="bpm" field="heart_rate" data={chart} baseline={baseline.heart_rate} decimals={0}/><MetricChart title="Heart rate variability" unit="ms" field="hrv" data={chart} baseline={baseline.hrv} decimals={0}/><MetricChart title="Sleep duration" unit="h" field="sleep_hours" data={chart} baseline={baseline.sleep_hours} threshold={baseline.sleep_hours&&data?{value:Math.round(baseline.sleep_hours*data.demo_rules.sleep_baseline_fraction*100)/100,label:`Demo sleep indicator · below ${Math.round(baseline.sleep_hours*data.demo_rules.sleep_baseline_fraction*100)/100} h`}:undefined}/><MetricChart title="Exercise duration" unit="min" field="exercise_minutes" data={chart} baseline={baseline.exercise_minutes} decimals={0}/></div>
    <p className="ws-foot">Simulated observations · no clinical interpretation. Dashed lines are personal baselines and configurable demonstration rules, not clinical thresholds.</p></section></>}
    {route==='/history'&&<>
    {pageHead('Event history','Synthetic encounters and daily check-ins, newest first.',<button className="primary" onClick={()=>setModal('encounter')} disabled={!data}><Plus size={16}/> Add event</button>)}
    {crewBar}
    <section className="ws-section page-section" aria-labelledby="history-h"><div className="section-head"><div><h3 id="history-h" className="micro">Clinical event history</h3><p>{showAllEvents?'All recorded events':'Five most recent events'}</p></div></div>
    {events.length?<table className="log-table"><thead><tr><th scope="col">Day</th><th scope="col">Recorded</th><th scope="col">Type</th><th scope="col">Event</th></tr></thead><tbody>{events.map(e=><tr key={e.type+e.id} className={e.type==='Encounter'?'is-encounter':'is-checkin'}><td className="num" data-label="Day">{e.mission_day}</td><td className="num" data-label="Recorded">{formatTime(e.recorded_at)}</td><td data-label="Type"><span className="type-chip">{e.type==='Encounter'?<Stethoscope size={13}/>:<ClipboardCheck size={13}/>}{e.type}</span></td><td data-label="Event"><strong>{e.title}</strong><span>{e.notes}</span></td></tr>)}</tbody></table>:<div className="empty">No events recorded.</div>}
    <button className="text-button history-toggle" onClick={()=>setShowAllEvents(!showAllEvents)}>{showAllEvents?'Show recent events':'View complete event history'} <ChevronRight size={13}/></button></section></>}
    {route==='/crew-map'&&<CrewMap mission={mission}/>}
    <footer><span><Orbit size={14}/> VIGIL <span className="muted">Vital Intelligence and Guidance for Interplanetary Life</span></span><span>ALL DATA SYNTHETIC <span className="footer-dot">·</span> STORED LOCALLY</span></footer></div></main>
    {route==='/companion'&&<React.Suspense fallback={<section className="companion-view" aria-label="Medical companion"/>}><CompanionView key={selected} crewId={selected} onClose={()=>navigate('/')}/></React.Suspense>}
    {modal&&<RecordDialog name={modal as DialogName} mission={mission} overview={data} onDismiss={()=>setModal('')}
      onSaved={(message,member)=>{setModal('');if(member)setSelected(member.id);setNotice(member?'Crew member added. Viewing requires a crew access grant.':message);setTimeout(()=>setNotice(''),4000);load(member?.id)}}/>}
  </div>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode>{publicDemo ? <App/> : <AuthGate><App/></AuthGate>}</React.StrictMode>)
