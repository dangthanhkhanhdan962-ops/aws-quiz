import { useState, useEffect } from 'react'
import './App.css'
import { generateClient } from 'aws-amplify/data'
import outputs from '../amplify_outputs.json'

const PROXY_URL =
  outputs.custom?.anthropicProxyUrl ||
  import.meta.env.VITE_ANTHROPIC_PROXY_URL ||
  ''

const client = generateClient()

function getUserId() {
  let id = localStorage.getItem('awsQuizUserId')
  if (!id) {
    id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    localStorage.setItem('awsQuizUserId', id)
  }
  return id
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── Theme ─────────────────────────────────────────────────────
const C = {
  bg: '#0D0D0D',
  surface: '#141414',
  surfaceAlt: '#1A1A1A',
  border: 'rgba(0,188,212,0.14)',
  borderActive: '#00BCD4',
  accent: '#00BCD4',
  accentDim: 'rgba(0,188,212,0.12)',
  accentGlow: '0 0 24px rgba(0,188,212,0.18)',
  text: '#F0F0F0',
  muted: '#666',
  success: '#00E676',
  warn: '#FFD600',
  danger: '#FF4D4D',
}

const LEVELS = [
  { id: 'beginner',     label: 'Beginner',          badge: 'LV 1', desc: 'EC2, S3, IAM cơ bản' },
  { id: 'practitioner', label: 'Cloud Practitioner', badge: 'LV 2', desc: 'Kiến trúc well-architected' },
  { id: 'saa',          label: 'SAA Associate',      badge: 'LV 3', desc: 'Multi-tier, HA, cost opt' },
]

const ARCH_COLORS = 'compute=#FF9900, storage=#16A34A, database=#2563EB, networking=#8B5CF6, security=#DC2626, messaging=#E59400'
const ARCH_EXAMPLE = `"architecture":{"tiers":[{"label":"Edge","services":[{"id":"cf","name":"CloudFront","color":"#8B5CF6"}]},{"label":"Compute","services":[{"id":"asg","name":"EC2 Auto Scaling","color":"#FF9900"}]},{"label":"Data","services":[{"id":"rds","name":"RDS Multi-AZ","color":"#2563EB"},{"id":"s3","name":"S3","color":"#16A34A"}]}],"connections":[{"from":"cf","to":"asg"},{"from":"asg","to":"rds"},{"from":"asg","to":"s3"}]}`

// ── System prompts ────────────────────────────────────────────
function examSysPrompt(lvl) {
  return `You are an AWS Solutions Architect exam question generator. Create a realistic exam-style question for level: ${lvl}.
Return ONLY valid JSON — no markdown fences, no extra text.
{"company":"...","scenario":"2-3 sentences with real numbers","question":"Which solution BEST meets the requirements?","options":{"A":"...","B":"...","C":"...","D":"..."},"hints":["hint about KEY constraint","hint about relevant service category","hint about specific feature"],"correct":"B","explanation":"B is correct because... A is incorrect because... C is incorrect because... D is incorrect because...","${ARCH_EXAMPLE}}
Architecture = CORRECT solution. ${ARCH_COLORS}`
}

function designSysPrompt(lvl) {
  return `You are an AWS Solutions Architect trainer. Create a real-world architecture design challenge for level: ${lvl}.
Return ONLY valid JSON — no markdown fences, no extra text.
{"company":"...","scenario":"3-4 sentences with specific requirements and numbers","question":"Design an AWS architecture that meets these requirements.",${ARCH_EXAMPLE}}
Architecture = ideal solution. ${ARCH_COLORS}`
}

function gradeSysPrompt(question, userAnswer) {
  return `You are an AWS instructor grading a student's architecture design.
Scenario: ${question.scenario}
Standard solution: ${JSON.stringify(question.architecture)}
Student's answer: "${userAnswer}"
Parse the student's answer, extract AWS services and connections, evaluate their design.
Return ONLY valid JSON — no markdown fences.
{"score":7,"correct":["specific correct point","..."],"improve":["specific gap","..."],"solution":"2-3 sentence description of standard solution","userArchitecture":{"tiers":[{"label":"tier","services":[{"id":"uid","name":"Service","color":"#hex"}]}],"connections":[{"from":"id1","to":"id2"}]}}
If no services mentioned: score=0, single node {"id":"none","name":"(không đề cập)","color":"#444"}.
${ARCH_COLORS}`
}

function stripFences(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
}

// ── Components ────────────────────────────────────────────────
function Chip({ children, color }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
      background: `${color}18`, color, border: `1px solid ${color}40`,
    }}>
      {children}
    </span>
  )
}

function ArchDiagram({ arch, blurred }) {
  if (!arch?.tiers?.length) return null
  const W = 480, BOX_W = 110, BOX_H = 38, GAP_X = 12, TIER_GAP = 58, PAD_Y = 14
  const pos = {}
  let totalH = PAD_Y
  arch.tiers.forEach(tier => {
    const n = tier.services.length
    const rowW = n * BOX_W + (n - 1) * GAP_X
    const x0 = (W - rowW) / 2
    tier.services.forEach((svc, si) => {
      pos[svc.id] = {
        x: x0 + si * (BOX_W + GAP_X), y: totalH,
        cx: x0 + si * (BOX_W + GAP_X) + BOX_W / 2, cy: totalH + BOX_H / 2,
      }
    })
    totalH += BOX_H + TIER_GAP
  })
  const svgH = totalH - TIER_GAP + PAD_Y
  return (
    <svg viewBox={`0 0 ${W} ${svgH}`} width="100%" style={{ display: 'block' }}>
      <defs>
        <marker id="arr" markerWidth="7" markerHeight="6" refX="6" refY="3" orient="auto">
          <polygon points="0 0,7 3,0 6" fill={blurred ? '#2A2A2A' : '#555'} />
        </marker>
      </defs>
      {!blurred && arch.tiers.map((tier, ti) => {
        const p = pos[tier.services[0]?.id]
        return p ? <text key={ti} x={6} y={p.cy} dominantBaseline="central" fill={C.muted} fontSize="9" fontFamily="Inter,sans-serif">{tier.label}</text> : null
      })}
      {arch.connections?.map((c, i) => {
        const f = pos[c.from], t = pos[c.to]
        if (!f || !t) return null
        const sameTier = Math.abs(f.cy - t.cy) < BOX_H
        return <line key={i} x1={sameTier ? f.x + BOX_W : f.cx} y1={sameTier ? f.cy : f.y + BOX_H} x2={sameTier ? t.x : t.cx} y2={sameTier ? t.cy : t.y} stroke={blurred ? '#252525' : '#444'} strokeWidth="1.5" strokeDasharray={blurred ? '4,4' : undefined} markerEnd="url(#arr)" />
      })}
      {arch.tiers.flatMap(tier => tier.services.map(svc => {
        const p = pos[svc.id]
        if (!p) return null
        return (
          <g key={svc.id}>
            <rect x={p.x} y={p.y} width={BOX_W} height={BOX_H} rx="8" fill={blurred ? '#1C1C1C' : `${svc.color || C.accent}20`} stroke={blurred ? '#2A2A2A' : (svc.color || C.accent)} strokeWidth="1.5" />
            {blurred
              ? <rect x={p.x + 14} y={p.cy - 4} width={BOX_W - 28} height={7} rx="3" fill="#2A2A2A" />
              : <text x={p.cx} y={p.cy} textAnchor="middle" dominantBaseline="central" fill="#F0F0F0" fontSize="10" fontWeight="500" fontFamily="Inter,sans-serif">{(svc.name || '').length > 16 ? svc.name.slice(0, 15) + '…' : svc.name}</text>
            }
          </g>
        )
      }))}
    </svg>
  )
}

function DiagramCard({ title, arch, blurred = false }) {
  return (
    <div style={{ background: C.surfaceAlt, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <div style={{ padding: '8px 14px', borderBottom: `1px solid ${C.border}`, fontSize: '0.72rem', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</div>
      <div style={{ padding: '10px 12px 8px', ...(blurred && { filter: 'blur(3px)', userSelect: 'none', pointerEvents: 'none' }) }}>
        <ArchDiagram arch={arch} blurred={blurred} />
      </div>
    </div>
  )
}

function FeedbackList({ items, type }) {
  if (!items?.length) return null
  const isGood = type === 'correct'
  const color = isGood ? C.success : C.danger
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {isGood ? '✓ Điểm đúng' : '✗ Cần cải thiện'}
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ padding: '8px 12px', borderRadius: 10, marginBottom: 5, background: `${color}08`, border: `1px solid ${color}20`, fontSize: '0.88rem', lineHeight: 1.6 }}>
          <span style={{ color, marginRight: 8 }}>{isGood ? '✓' : '✗'}</span>{item}
        </div>
      ))}
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────
export default function App() {
  const [mode,          setMode]          = useState('exam')   // 'exam' | 'design' | 'history'
  const [level,         setLevel]         = useState(null)
  const [question,      setQuestion]      = useState(null)
  const [loading,       setLoading]       = useState(false)
  // exam
  const [activeTab,     setActiveTab]     = useState('question')
  const [selectedOpt,   setSelectedOpt]   = useState(null)
  const [submitted,     setSubmitted]     = useState(false)
  const [unlockedHints, setUnlockedHints] = useState(0)
  const [score,         setScore]         = useState(10)
  // design
  const [userAnswer,    setUserAnswer]    = useState('')
  const [designResult,  setDesignResult]  = useState(null)
  const [grading,       setGrading]       = useState(false)
  // history
  const [history,       setHistory]       = useState([])
  const [histLoading,   setHistLoading]   = useState(false)

  useEffect(() => {
    if (mode === 'history') loadHistory()
  }, [mode])

  // ── DataStore helpers ──
  async function saveSession(fields) {
    try {
      await client.models.QuizSession.create({
        userId: getUserId(),
        ...fields,
      })
    } catch (err) {
      console.warn('[saveSession]', err)
    }
  }

  async function loadHistory() {
    setHistLoading(true)
    try {
      const userId = getUserId()
      const { data: rows } = await client.models.QuizSession.list({
        filter: { userId: { eq: userId } },
      })
      const sorted = [...(rows || [])]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10)
      setHistory(sorted)
    } catch (err) {
      console.warn('[loadHistory]', err)
      setHistory([])
    }
    setHistLoading(false)
  }

  // ── State helpers ──
  function resetQuestionState() {
    setQuestion(null); setSelectedOpt(null); setSubmitted(false)
    setUnlockedHints(0); setScore(10); setActiveTab('question')
    setUserAnswer(''); setDesignResult(null)
  }

  function switchMode(m) {
    setMode(m)
    setLevel(null)
    resetQuestionState()
  }

  async function callProxy(body) {
    if (!PROXY_URL) throw new Error('Lambda URL chưa được cấu hình. Chạy ampx sandbox trước.')
    console.log('[proxy]', PROXY_URL)
    const res = await fetch(PROXY_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) { const t = await res.text(); throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`) }
    return res.json()
  }

  async function genQuestion(lvl) {
    setLoading(true); resetQuestionState(); setLevel(lvl)
    try {
      const data = await callProxy({
        model: 'claude-sonnet-4-6', max_tokens: 2000,
        system: mode === 'exam' ? examSysPrompt(lvl) : designSysPrompt(lvl),
        messages: [{ role: 'user', content: `Tạo câu hỏi AWS ${lvl}` }],
      })
      const raw = data.content?.[0]?.text ?? ''
      try { setQuestion(JSON.parse(stripFences(raw))) }
      catch { setQuestion({ scenario: `Lỗi parse JSON:\n${raw.slice(0, 300)}`, options: {}, hints: [], correct: null }) }
    } catch (err) {
      setQuestion({ scenario: `Lỗi: ${err.message}`, options: {}, hints: [], correct: null })
    }
    setLoading(false)
  }

  // ── Exam actions ──
  function unlockHint(i) {
    if (i >= unlockedHints) { setUnlockedHints(i + 1); setScore(s => Math.max(0, s - 1)) }
  }

  function submitAnswer() {
    if (!selectedOpt || submitted) return
    const isCorrect = selectedOpt === question.correct
    const finalScore = isCorrect ? score : Math.max(0, score - 3)
    setSubmitted(true)
    if (!isCorrect) setScore(Math.max(0, score - 3))
    setActiveTab('answer')
    saveSession({
      level, mode: 'exam', company: question.company,
      scenario: (question.scenario || '').slice(0, 500),
      answer: selectedOpt, score: finalScore,
      feedback: JSON.stringify({ isCorrect, unlockedHints, explanation: (question.explanation || '').slice(0, 400) }).slice(0, 1000),
    })
  }

  // ── Design actions ──
  async function submitDesign() {
    if (!userAnswer.trim() || grading) return
    setGrading(true)
    let result
    try {
      const data = await callProxy({
        model: 'claude-sonnet-4-6', max_tokens: 2000,
        system: gradeSysPrompt(question, userAnswer),
        messages: [{ role: 'user', content: 'Chấm bài thiết kế này' }],
      })
      const raw = data.content?.[0]?.text ?? ''
      try { result = JSON.parse(stripFences(raw)) }
      catch { result = { score: 0, correct: [], improve: [`Lỗi parse: ${raw.slice(0, 200)}`], solution: '', userArchitecture: null } }
    } catch (err) {
      result = { score: 0, correct: [], improve: [`Lỗi: ${err.message}`], solution: '', userArchitecture: null }
    }
    setDesignResult(result)
    setGrading(false)
    saveSession({
      level, mode: 'design', company: question.company,
      scenario: (question.scenario || '').slice(0, 500),
      answer: userAnswer.slice(0, 500), score: result.score,
      feedback: JSON.stringify({ correct: result.correct, improve: result.improve, solution: result.solution }).slice(0, 1000),
    })
  }

  // ── Derived ──
  const curLevel    = LEVELS.find(l => l.id === level)
  const isCorrect   = submitted && selectedOpt === question?.correct
  const designScore = designResult?.score ?? 0
  const dispScore   = mode === 'exam' ? score : designScore
  const scoreColor  = dispScore >= 7 ? C.success : dispScore >= 5 ? C.warn : C.danger
  const hintsLabel  = unlockedHints > 0 ? `Gợi ý (${unlockedHints}/3)` : 'Gợi ý'

  const MODES = [
    { id: 'exam',    icon: '⚡', label: 'Thi thử',     desc: 'Trắc nghiệm A/B/C/D' },
    { id: 'design',  icon: '✏️', label: 'Tự thiết kế', desc: 'Mô tả kiến trúc tự do' },
    { id: 'history', icon: '📋', label: 'Lịch sử',     desc: '10 bài làm gần nhất' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>

        {/* ── Header ── */}
        <header style={{ textAlign: 'center', padding: '2rem 0 1.5rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.accentDim, border: `1px solid ${C.border}`, borderRadius: 40, padding: '4px 14px 4px 10px', marginBottom: 16 }}>
            <span style={{ fontSize: 16 }}>☁</span>
            <span style={{ fontSize: 11, color: C.accent, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>AWS Architecture Training</span>
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 'clamp(1.8rem, 6vw, 2.6rem)', fontWeight: 800, letterSpacing: '-0.03em', background: `linear-gradient(135deg, #fff 30%, ${C.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            AWS Quiz
          </h1>
          <p style={{ color: C.muted, fontSize: '0.9rem', margin: 0 }}>Luyện tập thiết kế kiến trúc cloud theo cấp độ</p>
        </header>

        {/* ── Mode toggle ── */}
        <div style={{ display: 'flex', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 5, gap: 4, marginBottom: 20 }}>
          {MODES.map(m => {
            const active = mode === m.id
            return (
              <button key={m.id} onClick={() => switchMode(m.id)} style={{
                flex: 1, padding: '10px 8px', border: 'none', borderRadius: 10,
                background: active ? C.accent : 'transparent',
                color: active ? '#000' : C.muted,
                cursor: 'pointer', transition: 'all 0.2s', outline: 'none',
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{m.icon} {m.label}</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: 2 }}>{m.desc}</div>
              </button>
            )
          })}
        </div>

        {/* ════════════════════════════════════════
            HISTORY MODE
        ════════════════════════════════════════ */}
        {mode === 'history' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>10 bài làm gần nhất</span>
              <button onClick={loadHistory} style={{ padding: '4px 14px', fontSize: '0.8rem', background: C.accentDim, color: C.accent, border: `1px solid ${C.border}`, borderRadius: 20, cursor: 'pointer' }}>
                {histLoading ? '...' : '↻ Tải lại'}
              </button>
            </div>

            {histLoading && (
              <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                <div className="spin" style={{ width: 32, height: 32, border: `3px solid ${C.border}`, borderTop: `3px solid ${C.accent}`, borderRadius: '50%', margin: '0 auto 10px' }} />
                <p style={{ color: C.muted, fontSize: '0.85rem' }}>Đang tải...</p>
              </div>
            )}

            {!histLoading && history.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', background: C.surface, borderRadius: 20, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
                <p style={{ color: C.muted, fontSize: '0.9rem', margin: 0 }}>Chưa có bài làm nào. Hãy thử <strong style={{ color: C.accent }}>Thi thử</strong> hoặc <strong style={{ color: C.accent }}>Tự thiết kế</strong>!</p>
              </div>
            )}

            {!histLoading && history.map((s, i) => {
              const sc = s.score ?? 0
              const scColor = sc >= 7 ? C.success : sc >= 5 ? C.warn : C.danger
              const lvl = LEVELS.find(l => l.id === s.level)
              let fb = null
              try { fb = JSON.parse(s.feedback || '{}') } catch { /* */ }
              return (
                <div key={s.id || i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, marginBottom: 10, overflow: 'hidden' }}>
                  {/* Row 1: badges + score + date */}
                  <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: `1px solid ${C.border}`, background: C.accentDim }}>
                    <Chip color={s.mode === 'exam' ? C.accent : C.warn}>{s.mode === 'exam' ? '⚡ Thi thử' : '✏️ Tự thiết kế'}</Chip>
                    {lvl && <Chip color={C.muted}>{lvl.badge}</Chip>}
                    <div style={{ flex: 1 }} />
                    <span style={{ fontWeight: 800, fontSize: '1.1rem', color: scColor }}>{sc}<span style={{ fontSize: 11, fontWeight: 400, color: C.muted }}>/10</span></span>
                    <span style={{ fontSize: '0.75rem', color: C.muted }}>{fmtDate(s.createdAt)}</span>
                  </div>
                  {/* Row 2: company + scenario */}
                  <div style={{ padding: '10px 14px' }}>
                    {s.company && <div style={{ fontSize: '0.8rem', fontWeight: 600, color: C.accent, marginBottom: 4 }}>🏢 {s.company}</div>}
                    <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#AAA', lineHeight: 1.5 }}>
                      {(s.scenario || '').length > 120 ? s.scenario.slice(0, 120) + '…' : s.scenario}
                    </p>
                    {/* exam: show answer + result */}
                    {s.mode === 'exam' && s.answer && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Chip color={fb?.isCorrect ? C.success : C.danger}>
                          {fb?.isCorrect ? `✓ Đáp án ${s.answer}` : `✗ Đáp án ${s.answer}`}
                        </Chip>
                        {(fb?.unlockedHints > 0) && <Chip color={C.muted}>{fb.unlockedHints} gợi ý</Chip>}
                      </div>
                    )}
                    {/* design: show score breakdown */}
                    {s.mode === 'design' && fb?.correct?.length > 0 && (
                      <div style={{ fontSize: '0.8rem', color: C.muted }}>
                        <span style={{ color: C.success }}>✓ {fb.correct.length} điểm đúng</span>
                        {fb.improve?.length > 0 && <span style={{ color: C.danger }}> · ✗ {fb.improve.length} cần cải thiện</span>}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Level selector (exam + design) ── */}
        {mode !== 'history' && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, flex: 1, minWidth: 0 }}>
              {LEVELS.map(l => {
                const active = level === l.id
                return (
                  <button key={l.id} onClick={() => genQuestion(l.id)} style={{
                    background: active ? C.accentDim : C.surface,
                    border: `1.5px solid ${active ? C.borderActive : C.border}`,
                    borderRadius: 14, padding: '0.9rem', cursor: 'pointer', textAlign: 'left',
                    boxShadow: active ? C.accentGlow : 'none', transition: 'all 0.2s', outline: 'none',
                  }}>
                    <Chip color={active ? C.accent : C.muted}>{l.badge}</Chip>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: active ? C.accent : C.text, margin: '6px 0 2px' }}>{l.label}</div>
                    <div style={{ fontSize: '0.75rem', color: C.muted }}>{l.desc}</div>
                  </button>
                )
              })}
            </div>
            {(submitted || designResult) && (
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, background: `${scoreColor}10`, border: `1px solid ${scoreColor}30`, borderRadius: 14, padding: '10px 16px' }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{dispScore}</span>
                <span style={{ fontSize: 13, color: C.muted }}>/10</span>
              </div>
            )}
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '3rem 0' }}>
            <div className="spin" style={{ width: 36, height: 36, border: `3px solid ${C.border}`, borderTop: `3px solid ${C.accent}`, borderRadius: '50%', margin: '0 auto 12px' }} />
            <p style={{ color: C.muted, fontSize: '0.9rem' }}>Đang tạo câu hỏi...</p>
          </div>
        )}

        {/* ════════════════════════════════════════
            EXAM MODE
        ════════════════════════════════════════ */}
        {mode === 'exam' && question && !loading && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 32px rgba(0,0,0,0.4)' }}>
            <div style={{ padding: '0.85rem 1.25rem', borderBottom: `1px solid ${C.border}`, background: C.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>🏢</span>
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: C.accent }}>{question.company || curLevel?.label}</span>
              </div>
              <Chip color={C.muted}>{curLevel?.badge} — {curLevel?.label}</Chip>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
              {[{ id: 'question', label: 'Đề bài' }, { id: 'hints', label: hintsLabel }, { id: 'answer', label: 'Đáp án', locked: !submitted }].map(tab => (
                <button key={tab.id} onClick={() => !tab.locked && setActiveTab(tab.id)} style={{
                  flex: 1, padding: '0.7rem 0.25rem', background: 'transparent',
                  color: tab.locked ? '#2E2E2E' : activeTab === tab.id ? C.accent : C.muted,
                  fontWeight: activeTab === tab.id ? 600 : 400, fontSize: '0.85rem', border: 'none',
                  cursor: tab.locked ? 'not-allowed' : 'pointer',
                  borderBottom: activeTab === tab.id ? `2px solid ${C.accent}` : '2px solid transparent',
                  marginBottom: -1, transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                }}>
                  {tab.label}{tab.locked && <span style={{ fontSize: 10 }}>🔒</span>}
                </button>
              ))}
            </div>

            {/* Tab: Đề bài */}
            {activeTab === 'question' && (
              <div style={{ padding: '1.25rem' }}>
                <p style={{ lineHeight: 1.75, fontSize: '0.95rem', margin: '0 0 1rem', color: '#DDD' }}>{question.scenario}</p>
                {question.question && <p style={{ fontWeight: 600, color: C.text, margin: '0 0 1rem', fontSize: '0.95rem', borderLeft: `3px solid ${C.accent}`, paddingLeft: 12 }}>{question.question}</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(question.options || {}).map(([key, val]) => {
                    const sel = selectedOpt === key
                    const correct = submitted && key === question.correct
                    const wrong = submitted && sel && key !== question.correct
                    return (
                      <label key={key} onClick={() => !submitted && setSelectedOpt(key)} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 11, padding: '10px 14px', borderRadius: 12,
                        background: correct ? 'rgba(0,230,118,0.08)' : wrong ? 'rgba(255,77,77,0.08)' : sel ? C.accentDim : C.surfaceAlt,
                        border: `1.5px solid ${correct ? C.success : wrong ? C.danger : sel ? C.accent : C.border}`,
                        cursor: submitted ? 'default' : 'pointer', transition: 'all 0.15s',
                      }}>
                        <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', marginTop: 1, background: correct ? C.success : wrong ? C.danger : sel ? C.accent : '#2A2A2A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: (sel || correct || wrong) ? '#000' : C.muted }}>
                          {key}
                        </span>
                        <span style={{ fontSize: '0.88rem', lineHeight: 1.65, color: correct ? C.success : wrong ? C.danger : sel ? C.accent : C.text }}>{val}</span>
                      </label>
                    )
                  })}
                </div>
                {!submitted && (
                  <button onClick={submitAnswer} disabled={!selectedOpt} style={{ marginTop: 14, width: '100%', padding: '0.75rem', background: selectedOpt ? `linear-gradient(135deg, ${C.accent}, #0097A7)` : 'rgba(255,255,255,0.04)', color: selectedOpt ? '#000' : '#333', fontWeight: 700, fontSize: '0.9rem', border: 'none', borderRadius: 12, cursor: selectedOpt ? 'pointer' : 'not-allowed', boxShadow: selectedOpt ? '0 4px 16px rgba(0,188,212,0.3)' : 'none', transition: 'all 0.2s' }}>
                    Nộp đáp án →
                  </button>
                )}
              </div>
            )}

            {/* Tab: Gợi ý */}
            {activeTab === 'hints' && (
              <div style={{ padding: '1.25rem' }}>
                {question.architecture && <DiagramCard title="Sơ đồ kiến trúc — ẩn" arch={question.architecture} blurred />}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: question.architecture ? 14 : 0 }}>
                  {(question.hints || []).map((hint, i) => {
                    const open = i < unlockedHints, next = i === unlockedHints
                    return (
                      <div key={i} style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${open ? 'rgba(0,188,212,0.25)' : C.border}`, background: open ? 'rgba(0,188,212,0.05)' : C.surfaceAlt }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: open ? C.accent : '#444' }}>{open ? '💡' : '🔒'} Gợi ý {i + 1}</span>
                          {next && <button onClick={() => unlockHint(i)} style={{ padding: '3px 12px', fontSize: '0.75rem', fontWeight: 600, background: C.accentDim, color: C.accent, border: `1px solid ${C.border}`, borderRadius: 20, cursor: 'pointer' }}>Mở (−1 điểm)</button>}
                        </div>
                        <div style={{ padding: '0 14px 11px', filter: open ? 'none' : 'blur(5px)', fontSize: '0.88rem', lineHeight: 1.65, color: open ? '#CCC' : '#444', userSelect: open ? 'auto' : 'none', transition: 'filter 0.3s' }}>{hint}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tab: Đáp án */}
            {activeTab === 'answer' && submitted && (
              <div style={{ padding: '1.25rem' }}>
                <div style={{ padding: '12px 16px', borderRadius: 12, marginBottom: 16, background: isCorrect ? 'rgba(0,230,118,0.08)' : 'rgba(255,77,77,0.08)', border: `1px solid ${isCorrect ? C.success : C.danger}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 22 }}>{isCorrect ? '✅' : '❌'}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: isCorrect ? C.success : C.danger }}>{isCorrect ? 'Chính xác!' : `Sai rồi — Đáp án đúng: ${question.correct}`}</div>
                    <div style={{ fontSize: '0.8rem', color: C.muted, marginTop: 3 }}>Điểm: <strong style={{ color: scoreColor }}>{score}/10</strong>{unlockedHints > 0 && <span> · {unlockedHints} gợi ý</span>}</div>
                  </div>
                </div>
                {question.architecture && <DiagramCard title="⚡ Kiến trúc chuẩn" arch={question.architecture} />}
                {question.explanation && (
                  <div style={{ background: C.surfaceAlt, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden', margin: '12px 0 16px' }}>
                    <div style={{ padding: '8px 14px', borderBottom: `1px solid ${C.border}`, fontSize: '0.72rem', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>📝 Giải thích</div>
                    <p style={{ margin: 0, padding: '1rem', fontSize: '0.88rem', lineHeight: 1.75, color: '#CCC' }}>{question.explanation}</p>
                  </div>
                )}
                <button onClick={() => genQuestion(level)} style={{ width: '100%', padding: '0.75rem', background: `linear-gradient(135deg, ${C.accent}, #0097A7)`, color: '#000', fontWeight: 700, fontSize: '0.9rem', border: 'none', borderRadius: 12, cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,188,212,0.3)' }}>
                  Câu tiếp theo →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════
            DESIGN MODE
        ════════════════════════════════════════ */}
        {mode === 'design' && question && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 32px rgba(0,0,0,0.4)' }}>
              <div style={{ padding: '0.85rem 1.25rem', borderBottom: `1px solid ${C.border}`, background: C.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>🏢</span>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: C.accent }}>{question.company || curLevel?.label}</span>
                </div>
                <Chip color={C.muted}>{curLevel?.badge} — {curLevel?.label}</Chip>
              </div>
              <div style={{ padding: '1.25rem' }}>
                <p style={{ lineHeight: 1.75, fontSize: '0.95rem', margin: '0 0 1rem', color: '#DDD' }}>{question.scenario}</p>
                {question.question && <p style={{ fontWeight: 600, color: C.text, margin: 0, fontSize: '0.95rem', borderLeft: `3px solid ${C.accent}`, paddingLeft: 12 }}>{question.question}</p>}
              </div>
            </div>

            {!designResult && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: '1.25rem', boxShadow: '0 4px 32px rgba(0,0,0,0.4)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: C.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>✏️ Mô tả kiến trúc của bạn</div>
                <textarea value={userAnswer} onChange={e => setUserAnswer(e.target.value)}
                  placeholder="Ví dụ: Dùng CloudFront phía trước để cache static assets. Backend là EC2 Auto Scaling Group đằng sau ALB..."
                  rows={6} style={{ width: '100%', boxSizing: 'border-box', background: C.surfaceAlt, color: C.text, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: '1rem', fontSize: '0.9rem', lineHeight: 1.65, resize: 'vertical', outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.2s' }}
                  onFocus={e => (e.target.style.borderColor = C.accent)}
                  onBlur={e => (e.target.style.borderColor = C.border)} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <span style={{ fontSize: '0.78rem', color: C.muted }}>{userAnswer.length} ký tự</span>
                  <button onClick={submitDesign} disabled={!userAnswer.trim() || grading} style={{ padding: '0.7rem 1.8rem', background: userAnswer.trim() && !grading ? `linear-gradient(135deg, ${C.accent}, #0097A7)` : 'rgba(255,255,255,0.04)', color: userAnswer.trim() && !grading ? '#000' : '#333', fontWeight: 700, fontSize: '0.9rem', border: 'none', borderRadius: 12, cursor: userAnswer.trim() && !grading ? 'pointer' : 'not-allowed', boxShadow: userAnswer.trim() && !grading ? '0 4px 16px rgba(0,188,212,0.3)' : 'none', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s' }}>
                    {grading && <span className="spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(0,0,0,0.3)', borderTop: '2px solid #000', borderRadius: '50%' }} />}
                    {grading ? 'Đang chấm...' : 'Nộp bài →'}
                  </button>
                </div>
              </div>
            )}

            {designResult && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 32px rgba(0,0,0,0.4)' }}>
                <div style={{ padding: '1rem 1.25rem', borderBottom: `1px solid ${C.border}`, background: C.accentDim, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ flexShrink: 0, background: `${scoreColor}18`, border: `1.5px solid ${scoreColor}40`, borderRadius: 12, padding: '8px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{designScore}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>/10</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: C.text, marginBottom: 3 }}>{designScore >= 8 ? '🏆 Xuất sắc!' : designScore >= 6 ? '👍 Tốt!' : designScore >= 4 ? '📚 Cần bổ sung' : '🔍 Xem kiến trúc chuẩn'}</div>
                    <div style={{ fontSize: '0.82rem', color: C.muted }}>{designResult.solution}</div>
                  </div>
                </div>
                <div style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
                    <DiagramCard title="🧑‍💻 Kiến trúc của bạn" arch={designResult.userArchitecture} />
                    <DiagramCard title="⚡ Kiến trúc chuẩn" arch={question.architecture} />
                  </div>
                  <FeedbackList items={designResult.correct} type="correct" />
                  <FeedbackList items={designResult.improve} type="improve" />
                  <button onClick={() => genQuestion(level)} style={{ width: '100%', padding: '0.75rem', background: `linear-gradient(135deg, ${C.accent}, #0097A7)`, color: '#000', fontWeight: 700, fontSize: '0.9rem', border: 'none', borderRadius: 12, cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,188,212,0.3)', marginTop: 4 }}>
                    Câu tiếp theo →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
