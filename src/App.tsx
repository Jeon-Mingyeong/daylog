import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type Spending = {
  item: string
  amount: number
  category: string
  purpose: string
  necessary: boolean
}

type Entry = {
  id: string
  date: string
  food: string
  sleepTime: string
  wakeTime: string
  mood: string
  health: number
  note: string
  spending: Spending | null
}

const storageKey = 'daylog.entries.v1'
const demoStorageKey = 'daylog.demo.v1'
const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

type PredictionResult = {
  impulse_probability: number
  level: string
  source: string
  suggestion: string
}

type TrainingResult = {
  trained: boolean
  training_rows: number
  estimated_accuracy: number
}
const moods = [
  { name: '아주 좋음', icon: '☀️' },
  { name: '좋음', icon: '😊' },
  { name: '보통', icon: '😐' },
  { name: '불안함', icon: '😟' },
  { name: '나쁨', icon: '😔' },
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

function loadEntries(): Entry[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as Entry[]
  } catch {
    return []
  }
}

function createDemoEntries(): Entry[] {
  const foods = [
    '귀리 스무디와 요거트',
    '닭가슴살 샐러드',
    '비빔밥과 과일',
    '연어 덮밥과 스무디',
    '토스트와 바나나',
    '두부 김치찌개',
  ]
  const moods = ['좋음', '아주 좋음', '보통', '좋음', '아주 좋음', '불안함', '보통']
  const spending = [
    { item: '유산균 스무디', amount: 6800, category: '식비', purpose: '아침 식사 대용', necessary: true },
    { item: '온라인 티셔츠', amount: 39000, category: '쇼핑', purpose: '기분 전환용 충동 구매', necessary: false },
    { item: '헬스용 요거트', amount: 12500, category: '식비', purpose: '식단 관리에 필요', necessary: true },
    { item: '충전용 책', amount: 18000, category: '문화', purpose: '관심 분야 독서', necessary: true },
    { item: '세일 운동화', amount: 78000, category: '쇼핑', purpose: '예전부터 필요했던 운동화', necessary: true },
    { item: '디저트와 커피', amount: 14500, category: '식비', purpose: '지친 오후 기분 전환', necessary: false },
    { item: '채소 도시락', amount: 9200, category: '식비', purpose: '점심 식사', necessary: true },
  ]

  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - index)
    const spendingIndex = index % spending.length
    const hasSpending = index % 3 !== 2

    return {
      id: `demo-${index}-${date.getTime()}`,
      date: date.toISOString().slice(0, 10),
      food: foods[index % foods.length],
      sleepTime: index % 4 === 0 ? '00:30' : index % 4 === 1 ? '23:45' : '22:50',
      wakeTime: index % 4 === 0 ? '07:45' : '07:00',
      mood: moods[index % moods.length],
      health: 5 + (index % 5),
      note: index % 4 === 0 ? '늦게 잠들었지만 오전에는 집중이 잘됐다.' : '',
      spending: hasSpending
        ? {
            ...spending[spendingIndex],
            necessary: index % 7 === 1 ? false : spending[spendingIndex].necessary,
          }
        : null,
    }
  })
}

async function postJson(path: string, body?: unknown, method: 'GET' | 'POST' = 'POST') {
  if (!apiBaseUrl || typeof fetch === 'undefined') return null
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error(detail?.detail?.message ?? `API request failed: ${response.status}`)
  }
  return response.json()
}

function sleepHours(entry: Pick<Entry, 'sleepTime' | 'wakeTime'>) {
  const [sleepHour, sleepMinute] = entry.sleepTime.split(':').map(Number)
  const [wakeHour, wakeMinute] = entry.wakeTime.split(':').map(Number)
  let minutes = wakeHour * 60 + wakeMinute - (sleepHour * 60 + sleepMinute)
  if (minutes < 0) minutes += 24 * 60
  return minutes / 60
}

function toApiEntry(entry: Entry) {
  return {
    id: entry.id,
    date: entry.date,
    food: entry.food,
    sleepTime: entry.sleepTime,
    wakeTime: entry.wakeTime,
    mood: entry.mood,
    health: entry.health,
    category: entry.spending?.category ?? null,
    amount: entry.spending?.amount ?? 0,
    necessary: entry.spending?.necessary ?? null,
    purpose: entry.spending?.purpose ?? null,
  }
}

function App() {
  const [entries, setEntries] = useState<Entry[]>(loadEntries)
  const [activeTab, setActiveTab] = useState<'today' | 'history' | 'insights'>('today')
  const [showSpending, setShowSpending] = useState(false)
  const [saved, setSaved] = useState(false)

  const [date, setDate] = useState(today())
  const [food, setFood] = useState('')
  const [sleepTime, setSleepTime] = useState('23:00')
  const [wakeTime, setWakeTime] = useState('07:00')
  const [mood, setMood] = useState('좋음')
  const [health, setHealth] = useState(7)
  const [note, setNote] = useState('')
  const [item, setItem] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('식비')
  const [purpose, setPurpose] = useState('')
  const [necessary, setNecessary] = useState(true)
  const [prediction, setPrediction] = useState<PredictionResult | null>(null)
  const [predictionError, setPredictionError] = useState('')
  const [trainingResult, setTrainingResult] = useState<TrainingResult | null>(null)
  const [trainingError, setTrainingError] = useState('')

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(entries))
  }, [entries])

  const insights = useMemo(() => {
    if (entries.length === 0) {
      return {
        totalSpent: 0,
        unnecessaryCount: 0,
        positiveCount: 0,
        averageHealth: 0,
        averageSleep: 0,
        positiveHealth: 0,
        otherHealth: 0,
        impulsiveSpent: 0,
        topCategory: '없음',
      }
    }

    const spendingEntries = entries.filter((entry) => entry.spending)
    const positiveEntries = entries.filter((entry) => ['아주 좋음', '좋음'].includes(entry.mood))
    const otherEntries = entries.filter((entry) => !['아주 좋음', '좋음'].includes(entry.mood))
    const averageHealthFor = (items: Entry[]) =>
      items.length === 0 ? 0 : items.reduce((sum, entry) => sum + entry.health, 0) / items.length
    const sleepMinutes = entries.map((entry) => {
      const [sleepHour, sleepMinute] = entry.sleepTime.split(':').map(Number)
      const [wakeHour, wakeMinute] = entry.wakeTime.split(':').map(Number)
      let total = (wakeHour * 60 + wakeMinute) - (sleepHour * 60 + sleepMinute)
      if (total < 0) total += 24 * 60
      return total
    })
    const averageSleepMinutes = sleepMinutes.reduce((sum, minutes) => sum + minutes, 0) / sleepMinutes.length
    const impulsive = spendingEntries.filter((entry) => !entry.spending?.necessary)
    const categoryTotals = spendingEntries.reduce<Record<string, number>>((totals, entry) => {
      const categoryName = entry.spending?.category ?? '기타'
      totals[categoryName] = (totals[categoryName] ?? 0) + (entry.spending?.amount ?? 0)
      return totals
    }, {})
    const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '없음'

    return {
      totalSpent: spendingEntries.reduce((sum, entry) => sum + (entry.spending?.amount ?? 0), 0),
      unnecessaryCount: spendingEntries.filter((entry) => !entry.spending?.necessary).length,
      positiveCount: positiveEntries.length,
      averageHealth: entries.reduce((sum, entry) => sum + entry.health, 0) / entries.length,
      averageSleep: averageSleepMinutes / 60,
      positiveHealth: averageHealthFor(positiveEntries),
      otherHealth: averageHealthFor(otherEntries),
      impulsiveSpent: impulsive.reduce((sum, entry) => sum + (entry.spending?.amount ?? 0), 0),
      topCategory,
    }
  }, [entries])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!food.trim()) return

    const entry: Entry = {
      id: crypto.randomUUID(),
      date,
      food: food.trim(),
      sleepTime,
      wakeTime,
      mood,
      health,
      note: note.trim(),
      spending: showSpending && item.trim()
        ? {
            item: item.trim(),
            amount: Number(amount) || 0,
            category,
            purpose: purpose.trim(),
            necessary,
          }
        : null,
    }

    setEntries((current) => [entry, ...current])
    setPrediction(null)
    setPredictionError('')

    try {
      await postJson('/api/entries', toApiEntry(entry))
      if (entry.spending) {
        const result = await postJson('/api/predict/impulse', {
          mood: entry.mood,
          health: entry.health,
          sleep_hours: sleepHours(entry),
          category: entry.spending.category,
          amount: entry.spending.amount,
        }) as PredictionResult | null
        setPrediction(result)
      }
    } catch (error) {
      setPredictionError(error instanceof Error ? error.message : 'ML 서버에 연결할 수 없습니다.')
    }

    setFood('')
    setNote('')
    setItem('')
    setAmount('')
    setPurpose('')
    setShowSpending(false)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2200)
  }

  function deleteEntry(id: string) {
    setEntries((current) => current.filter((entry) => entry.id !== id))
  }

  function addDemoEntries() {
    const demos = createDemoEntries()
    setEntries((current) => {
      const withoutDemos = current.filter((entry) => !entry.id.startsWith('demo-'))
      return [...demos, ...withoutDemos]
    })
    void Promise.all(demos.map((entry) => postJson('/api/entries', toApiEntry(entry)).catch(() => null)))
    localStorage.setItem(demoStorageKey, 'true')
    setActiveTab('history')
  }

  function removeDemoEntries() {
    setEntries((current) => current.filter((entry) => !entry.id.startsWith('demo-')))
    localStorage.removeItem(demoStorageKey)
  }

  async function trainPersonalModel() {
    setTrainingResult(null)
    setTrainingError('')
    try {
      await Promise.all(entries.map((entry) => postJson('/api/entries', toApiEntry(entry)).catch(() => null)))
      const result = await postJson('/api/train') as TrainingResult | null
      if (result) setTrainingResult(result)
    } catch (error) {
      setTrainingError(error instanceof Error ? error.message : '모델을 학습할 수 없습니다.')
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">나의 생활 기록</p>
          <h1>데이로그</h1>
        </div>
        <button className="avatar" type="button" aria-label="내 정보">나</button>
      </header>

      <nav className="tabs" aria-label="기록 메뉴">
        <button className={activeTab === 'today' ? 'active' : ''} onClick={() => setActiveTab('today')}>오늘 기록</button>
        <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>기록 {entries.length}</button>
        <button className={activeTab === 'insights' ? 'active' : ''} onClick={() => setActiveTab('insights')}>분석</button>
      </nav>

      {activeTab === 'today' && (
        <form className="content" onSubmit={handleSubmit}>
          <section className="date-row">
            <label>
              <span>날짜</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
          </section>

          <section className="card">
            <div className="card-heading">
              <span className="section-icon peach">🍽️</span>
              <div><h2>오늘 먹은 것</h2><p>식사와 간식, 음료를 기록하세요</p></div>
            </div>
            <input
              className="wide-input"
              value={food}
              onChange={(event) => setFood(event.target.value)}
              placeholder="예: 귀리 스무디, 닭가슴살 샐러드"
              required
            />
          </section>

          <section className="card">
            <div className="card-heading">
              <span className="section-icon blue">🌙</span>
              <div><h2>수면</h2><p>취침 시간과 기상 시간을 기록하세요</p></div>
            </div>
            <div className="time-grid">
              <label><span>취침</span><input type="time" value={sleepTime} onChange={(event) => setSleepTime(event.target.value)} /></label>
              <span className="time-arrow">→</span>
              <label><span>기상</span><input type="time" value={wakeTime} onChange={(event) => setWakeTime(event.target.value)} /></label>
            </div>
          </section>

          <section className="card">
            <div className="card-heading">
              <span className="section-icon lavender">✨</span>
              <div><h2>오늘의 상태</h2><p>지금 가장 가까운 느낌을 선택하세요</p></div>
            </div>
            <div className="mood-grid">
              {moods.map((option) => (
                <button
                  key={option.name}
                  type="button"
                  className={mood === option.name ? 'selected' : ''}
                  onClick={() => setMood(option.name)}
                >
                  <span>{option.icon}</span>
                  <small>{option.name}</small>
                </button>
              ))}
            </div>
            <label className="range-label">
              <span>건강 상태 <strong>{health}/10</strong></span>
              <input type="range" min="1" max="10" value={health} onChange={(event) => setHealth(Number(event.target.value))} />
            </label>
          </section>

          <section className="card">
            <div className="card-heading spending-heading">
              <span className="section-icon mint">💳</span>
              <div><h2>오늘의 소비</h2><p>필요했던 소비와 충동구매를 기록하세요</p></div>
              <label className="switch">
                <input type="checkbox" checked={showSpending} onChange={(event) => setShowSpending(event.target.checked)} />
                <span />
              </label>
            </div>
            {showSpending && (
              <div className="spending-form">
                <label><span>항목</span><input value={item} onChange={(event) => setItem(event.target.value)} placeholder="예: 스무디, 옷" /></label>
                <label><span>금액</span><input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0원" /></label>
                <label><span>카테고리</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option>식비</option><option>쇼핑</option><option>교통</option><option>문화</option><option>생활</option><option>기타</option></select></label>
                <label className="purpose"><span>왜 구매했나요?</span><input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="예: 기분 전환 / 실제로 필요함 / 습관적 구매" /></label>
                <div className="necessary-buttons">
                  <button type="button" className={necessary ? 'selected' : ''} onClick={() => setNecessary(true)}>필요한 소비</button>
                  <button type="button" className={!necessary ? 'selected impulse' : ''} onClick={() => setNecessary(false)}>충동 구매</button>
                </div>
              </div>
            )}
          </section>

          <section className="card">
            <label className="note-label">
              <span>메모</span>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="오늘의 특별한 점이나 생각을 남겨보세요" />
            </label>
          </section>

          <button className="save-button" type="submit">오늘 기록 저장하기</button>
          {saved && <p className="saved-toast" role="status">기록이 저장되었습니다</p>}
          {prediction && (
            <section className={`prediction-card ${prediction.level === '높음' ? 'high-risk' : ''}`}>
              <div><span>🤖</span><strong>충동 구매 위험: {prediction.level}</strong></div>
              <p>{Math.round(prediction.impulse_probability * 100)}% · {prediction.suggestion}</p>
            </section>
          )}
          {predictionError && <p className="api-note">{predictionError}</p>}
        </form>
      )}

      {activeTab === 'history' && (
        <section className="content">
          <div className="section-title"><p>최근 기록</p><h2>나의 하루들</h2></div>
          <div className="demo-actions">
            <button type="button" onClick={addDemoEntries}>14일 데모 데이터 만들기</button>
            {entries.some((entry) => entry.id.startsWith('demo-')) && (
              <button type="button" onClick={removeDemoEntries}>데모 데이터 삭제</button>
            )}
          </div>
          {entries.length === 0 ? (
            <div className="empty-state"><span>🌱</span><h2>아직 기록이 없어요</h2><p>오늘의 하루를 첫 번째 기록으로 남겨보세요.</p><button onClick={() => setActiveTab('today')}>기록 시작하기</button></div>
          ) : entries.map((entry) => (
            <article className="history-card" key={entry.id}>
              <div className="history-date"><strong>{entry.date}</strong><button type="button" onClick={() => deleteEntry(entry.id)} aria-label="기록 삭제">삭제</button></div>
              <div className="history-grid">
                <div><span>🍽️</span><p><small>식사</small>{entry.food}</p></div>
                <div><span>🌙</span><p><small>수면</small>{entry.sleepTime} → {entry.wakeTime}</p></div>
                <div><span>✨</span><p><small>기분 · 건강</small>{entry.mood} · {entry.health}/10</p></div>
                {entry.spending && <div><span>💳</span><p><small>{entry.spending.category}</small>{entry.spending.item} · {entry.spending.amount.toLocaleString()}원</p></div>}
              </div>
              {entry.note && <p className="history-note">{entry.note}</p>}
            </article>
          ))}
        </section>
      )}

      {activeTab === 'insights' && (
        <section className="content">
          <div className="section-title"><p>내 패턴</p><h2>데이로그 분석</h2></div>
          <div className="stat-grid">
            <article><span>📊</span><small>누적 기록</small><strong>{entries.length}일</strong></article>
            <article><span>💚</span><small>평균 건강</small><strong>{insights.averageHealth.toFixed(1)} / 10</strong></article>
            <article><span>💳</span><small>기록된 소비</small><strong>{insights.totalSpent.toLocaleString()}원</strong></article>
          </div>
          {entries.length >= 3 && (
            <div className="stat-grid pattern-grid">
              <article><span>🌙</span><small>평균 수면</small><strong>{insights.averageSleep.toFixed(1)}시간</strong></article>
              <article><span>😊</span><small>좋은 기분일 건강</small><strong>{insights.positiveHealth.toFixed(1)} / 10</strong></article>
              <article><span>🧾</span><small>가장 큰 소비</small><strong>{insights.topCategory}</strong></article>
            </div>
          )}
          <div className="insight-card">
            <span className="insight-icon">🔍</span>
            <div>
              <h2>지금 읽을 수 있는 패턴</h2>
              <p>{entries.length < 3
                ? '분석의 정확도를 높이려면 최소 3일 이상의 기록이 필요합니다.'
                : `좋은 기분을 기록한 날은 ${insights.positiveCount}일이고, 그날의 평균 건강 점수는 ${insights.positiveHealth.toFixed(1)}점입니다. 다른 기분의 건강 점수는 ${insights.otherHealth.toFixed(1)}점입니다. 평균 수면은 ${insights.averageSleep.toFixed(1)}시간입니다.`}</p>
            </div>
          </div>
          <div className="insight-card warm">
            <span className="insight-icon">🛍️</span>
            <div>
              <h2>충동 구매 체크</h2>
              <p>{insights.unnecessaryCount === 0
                ? '아직 충동 구매로 표시된 소비 기록이 없습니다.'
                : `충동 구매로 기록한 소비가 ${insights.unnecessaryCount}건이며 합계는 ${insights.impulsiveSpent.toLocaleString()}원입니다. 가장 많이 기록된 소비 카테고리는 '${insights.topCategory}'입니다.`}</p>
            </div>
          </div>
          <div className="insight-card model-card">
            <span className="insight-icon">🧠</span>
            <div>
              <h2>나만의 예측 모델</h2>
              <p>기록을 Python ML 서버로 보내 개인 Logistic Regression 모델을 학습합니다.</p>
              <button type="button" className="train-button" onClick={() => void trainPersonalModel()}>
                개인 모델 학습하기
              </button>
              {trainingResult && (
                <p className="model-result">
                  학습 완료 · {trainingResult.training_rows}개 기록 · 추정 정확도 {Math.round(trainingResult.estimated_accuracy * 100)}%
                </p>
              )}
              {trainingError && <p className="api-note">{trainingError}</p>}
            </div>
          </div>
          <p className="privacy-note">🔒 기록은 이 기기의 브라우저에 저장되며, ML API 연결 시 분석을 위해 서버로 동기화될 수 있습니다.</p>
        </section>
      )}
    </main>
  )
}

export default App
