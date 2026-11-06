import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'

describe('Daylog', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the daily entry form', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '데이로그' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('예: 귀리 스무디, 닭가슴살 샐러드')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '오늘 기록 저장하기' })).toBeInTheDocument()
  })

  it('saves a food entry and shows it in history', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByPlaceholderText('예: 귀리 스무디, 닭가슴살 샐러드'), '귀리 스무디')
    await user.click(screen.getByRole('button', { name: '오늘 기록 저장하기' }))

    expect(screen.getByRole('status')).toHaveTextContent('기록이 저장되었습니다')
    await user.click(screen.getByRole('button', { name: /기록 1/ }))
    expect(screen.getByText('귀리 스무디')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('daylog.entries.v1') ?? '[]')).toHaveLength(1)
  })

  it('shows the empty insights state before enough records exist', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '분석' }))
    expect(screen.getByText(/최소 3일 이상의 기록이 필요합니다/)).toBeInTheDocument()
  })

  it('creates fourteen demo entries for pattern exploration', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^기록/ }))
    await user.click(screen.getByRole('button', { name: '14일 데모 데이터 만들기' }))

    const stored = JSON.parse(localStorage.getItem('daylog.entries.v1') ?? '[]')
    expect(stored).toHaveLength(14)
    expect(screen.getByRole('button', { name: '데모 데이터 삭제' })).toBeInTheDocument()
  })

  it('shows concrete pattern metrics after demo data is added', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^기록/ }))
    await user.click(screen.getByRole('button', { name: '14일 데모 데이터 만들기' }))
    await user.click(screen.getByRole('button', { name: '분석' }))

    expect(screen.getByText('평균 수면')).toBeInTheDocument()
    expect(screen.getByText('좋은 기분일 건강')).toBeInTheDocument()
    expect(screen.getByText(/충동 구매로 기록한 소비가/)).toBeInTheDocument()
  })
})
