import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CompositionEvent } from 'react'
import { romanizeHangul, type InputAnalysis } from '../utils/hangul'

interface TypingInputProps {
  target: string
  value: string
  analysis: InputAnalysis
  disabled: boolean
  timerStarted: boolean
  onValueChange: (value: string, isComposing: boolean) => string
  onCompositionCommit: (value: string) => string
  onSubmitAttempt: (value: string) => void
}

export const TypingInput = forwardRef<HTMLInputElement, TypingInputProps>(function TypingInput(
  { target, value, analysis, disabled, timerStarted, onValueChange, onCompositionCommit, onSubmitAttempt }, ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const composingRef = useRef(false)
  const compositionSettleFrameRef = useRef<number | null>(null)
  const compositionSettlePendingRef = useRef(false)
  const [isComposing, setIsComposing] = useState(false)
  useImperativeHandle(ref, () => inputRef.current!, [])
  useEffect(() => {
    if (!isComposing && !compositionSettlePendingRef.current && inputRef.current && inputRef.current.value !== value) inputRef.current.value = value
  }, [isComposing, target, value])
  useEffect(() => () => {
    if (compositionSettleFrameRef.current !== null) cancelAnimationFrame(compositionSettleFrameRef.current)
  }, [])
  const targetLength = analysis.targetCharacters.length
  const displayCharacters = Array.from(
    { length: Math.max(targetLength, analysis.inputCharacters.length) },
    (_, index) => analysis.inputCharacters[index] ?? analysis.targetCharacters[index] ?? '',
  )
  const lengthClass = targetLength > 14 ? 'target-word--very-long' : targetLength > 7 ? 'target-word--long' : ''
  const handleCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false
    setIsComposing(false)
    compositionSettlePendingRef.current = true
    if (compositionSettleFrameRef.current !== null) cancelAnimationFrame(compositionSettleFrameRef.current)
    const input = event.currentTarget
    // Some browsers emit the final input event after compositionend. Read the
    // field after that event so a just-finished final consonant is not lost.
    compositionSettleFrameRef.current = requestAnimationFrame(() => {
      compositionSettlePendingRef.current = false
      compositionSettleFrameRef.current = null
      if (!input.isConnected) return
      const acceptedValue = onCompositionCommit(input.value)
      if (input.value !== acceptedValue) input.value = acceptedValue
    })
  }
  return <section className={`typing-panel ${analysis.isWrong ? 'typing-panel--wrong' : ''}`}>
    <p className="typing-kicker">다음 대여소 이름을 입력하세요</p>
    <label className="sr-only" htmlFor="station-input">대여소 이름 입력</label>
    <div className="typing-entry">
      <div className={`target-word ${lengthClass}`} aria-label={`입력할 글자: ${target}`}>
        {displayCharacters.map((character, index) => {
          const matched = index < analysis.validPrefixLength
          const entered = index < analysis.inputCharacters.length
          const wrong = entered && !matched && analysis.isWrong
          const composing = entered && !matched && !analysis.isWrong
          const cursor = !analysis.isWrong && index === analysis.inputCharacters.length
          return <span key={`${index}-${analysis.targetCharacters[index] ?? 'extra'}`}
            className={`${matched ? 'is-correct' : wrong ? 'is-wrong' : composing ? 'is-composing' : ''} ${cursor ? 'is-cursor' : ''}`}>
            {character}
          </span>
        })}
      </div>
      <div className="typing-romanization" aria-hidden="true">{romanizeHangul(target)}</div>
      <input ref={inputRef} id="station-input" className="typing-input" defaultValue={value} disabled={disabled}
        autoComplete="off" autoCorrect="off" spellCheck={false} inputMode="text"
        onChange={(event) => {
          if (compositionSettlePendingRef.current) return
          const composing = composingRef.current || (event.nativeEvent as InputEvent).isComposing
          const acceptedValue = onValueChange(event.target.value, composing)
          if (!composing && event.currentTarget.value !== acceptedValue) event.currentTarget.value = acceptedValue
        }}
        onCompositionStart={() => {
          if (compositionSettleFrameRef.current !== null) cancelAnimationFrame(compositionSettleFrameRef.current)
          compositionSettleFrameRef.current = null
          compositionSettlePendingRef.current = false
          composingRef.current = true
          setIsComposing(true)
        }}
        onCompositionUpdate={(event) => onValueChange(event.currentTarget.value, true)}
        onCompositionEnd={handleCompositionEnd}
        onKeyDown={(event) => {
          const compositionInProgress = composingRef.current || isComposing || event.nativeEvent.isComposing || event.keyCode === 229
          if (event.key === ' ') {
            if (compositionInProgress) return
            event.preventDefault()
            onSubmitAttempt(event.currentTarget.value)
            return
          }
          if (event.key === 'Enter') {
            if (compositionInProgress) return
            event.preventDefault()
            onSubmitAttempt(event.currentTarget.value)
          }
        }} />
    </div>
    <div className={`input-feedback ${analysis.isWrong ? 'input-feedback--wrong' : ''}`} aria-live="polite">
      {analysis.isWrong ? '✕ 다른 글자가 있어요. 지우고 다시 입력하세요.' : !timerStarted ? '첫 글자를 입력하면 시간이 시작됩니다.' : ''}
    </div>
  </section>
})
